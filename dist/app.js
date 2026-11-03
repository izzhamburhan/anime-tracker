const video = document.querySelector('#camera');
const canvas = document.querySelector('#output');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
const fxCanvas = document.createElement('canvas');
const fx = fxCanvas.getContext('2d', { willReadFrequently: true });

const effects = [
  { id: 'thermal', label: 'Thermal', meta: 'THERMAL / SPECTRUM 01' },
  { id: 'ascii', label: 'ASCII', meta: 'ASCII / GLYPH 02' },
  { id: 'halftone', label: 'Halftone', meta: 'HALFTONE / PRINT 03' },
  { id: 'edge', label: 'Edge', meta: 'EDGE / CONTOUR 04' },
  { id: 'night', label: 'Night', meta: 'NIGHT / PHOSPHOR 05' },
  { id: 'duotone', label: 'Duotone', meta: 'DUOTONE / ACID 06' },
  { id: 'pixel', label: 'Pixel', meta: 'PIXEL / LOW-RES 07' },
  { id: 'clean', label: 'Clean', meta: 'CLEAN / CAMERA 00' }
];

const state = {
  active: 0, running: false, stream: null, facing: 'user', mirror: true,
  handFrame: true, intensity: .82, grain: .14, handLandmarker: null,
  handResults: null, modelStatus: 'idle', lastDetect: 0, lastVideoTime: -1,
  frameTimes: [], trackedRect: null
};

const $ = (s) => document.querySelector(s);
const effectsEl = $('#effects');
effects.forEach((effect, index) => {
  const button = document.createElement('button');
  button.className = `effect${index === 0 ? ' active' : ''}`;
  button.type = 'button';
  button.textContent = effect.label;
  button.dataset.index = index;
  button.addEventListener('click', () => setEffect(index));
  effectsEl.append(button);
});

function setEffect(index) {
  state.active = (index + effects.length) % effects.length;
  [...effectsEl.children].forEach((el, i) => el.classList.toggle('active', i === state.active));
  $('#effectMeta').textContent = effects[state.active].meta;
  effectsEl.children[state.active].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

async function startCamera() {
  $('#errorToast').hidden = true;
  $('#startButton').disabled = true;
  $('#startButton span:first-child').textContent = 'OPENING CAMERA…';
  try {
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = state.stream;
    await video.play();
    state.running = true;
    $('#intro').classList.add('hidden');
    $('#signal').classList.add('live');
    $('#trackingStatus').textContent = 'LOADING AI';
    resize();
    initHandTracking();
    requestAnimationFrame(render);
  } catch (error) {
    showError(error.name === 'NotAllowedError'
      ? 'CAMERA BLOCKED — Allow camera access in your browser settings, then try again.'
      : `CAMERA UNAVAILABLE — ${error.message}`);
    $('#startButton').disabled = false;
    $('#startButton span:first-child').textContent = 'TRY AGAIN';
  }
}

async function initHandTracking() {
  if (state.handLandmarker || state.modelStatus === 'loading') return;
  state.modelStatus = 'loading';
  try {
    const { HandLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/+esm');
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm');
    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45
    });
    state.modelStatus = 'ready';
    $('#trackingStatus').textContent = 'FRAMING';
  } catch (error) {
    console.warn('Hand tracking unavailable; using center frame.', error);
    state.modelStatus = 'fallback';
    $('#trackingStatus').textContent = 'MANUAL FRAME';
    $('#guideLabel').textContent = 'CENTER FRAME / AI OFFLINE';
  }
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  fxCanvas.width = canvas.width;
  fxCanvas.height = canvas.height;
}

function coverTransform() {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const w = vw * scale, h = vh * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h, scale };
}

function drawVideo(targetCtx) {
  const t = coverTransform();
  targetCtx.save();
  if (state.mirror && state.facing === 'user') {
    targetCtx.translate(canvas.width, 0);
    targetCtx.scale(-1, 1);
    targetCtx.drawImage(video, canvas.width - t.x - t.w, t.y, t.w, t.h);
  } else targetCtx.drawImage(video, t.x, t.y, t.w, t.h);
  targetCtx.restore();
}

function detectHands(now) {
  if (!state.handLandmarker || video.currentTime === state.lastVideoTime || now - state.lastDetect < 55) return;
  state.lastVideoTime = video.currentTime;
  state.lastDetect = now;
  try { state.handResults = state.handLandmarker.detectForVideo(video, now); } catch (error) { console.warn(error); }
}

function targetRect() {
  const fallback = { x: canvas.width * .32, y: canvas.height * .29, w: canvas.width * .36, h: canvas.height * .42 };
  if (!state.handFrame || !state.handResults?.landmarks?.length || state.handResults.landmarks.length < 2) return fallback;
  const t = coverTransform();
  const points = state.handResults.landmarks.flat();
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  points.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
  if (state.mirror && state.facing === 'user') [minX, maxX] = [1 - maxX, 1 - minX];
  const padX = Math.max(.02, (maxX - minX) * .08), padY = Math.max(.03, (maxY - minY) * .15);
  const raw = { x: t.x + (minX - padX) * t.w, y: t.y + (minY - padY) * t.h, w: (maxX - minX + padX * 2) * t.w, h: (maxY - minY + padY * 2) * t.h };
  if (!state.trackedRect) state.trackedRect = raw;
  const a = .2;
  for (const key of ['x','y','w','h']) state.trackedRect[key] += (raw[key] - state.trackedRect[key]) * a;
  return state.trackedRect;
}

function thermal(r, amount) {
  const image = fx.getImageData(r.x, r.y, r.w, r.h), d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] * .299 + d[i+1] * .587 + d[i+2] * .114) / 255;
    const p = Math.max(0, Math.min(1, (v - .5) * (1 + amount * 2) + .5));
    let R, G, B;
    if (p < .25) { R = 0; G = p * 4 * 110; B = 120 + p * 4 * 135; }
    else if (p < .5) { R = 0; G = 110 + (p-.25)*4*145; B = 255-(p-.25)*4*200; }
    else if (p < .75) { R = (p-.5)*4*255; G = 255; B = 55-(p-.5)*4*55; }
    else { R = 255; G = 255-(p-.75)*4*210; B = (p-.75)*4*45; }
    d[i]=R; d[i+1]=G; d[i+2]=B;
  }
  fx.putImageData(image, r.x, r.y);
}

function colorMap(r, mode) {
  const image = fx.getImageData(r.x, r.y, r.w, r.h), d = image.data;
  for (let i=0;i<d.length;i+=4) {
    const v=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)/255, c=Math.max(0,Math.min(1,(v-.5)*(1+state.intensity*2)+.5));
    if (mode==='night') { d[i]=c*25; d[i+1]=35+c*220; d[i+2]=c*70; }
    else { d[i]=30+c*210; d[i+1]=18+c*245; d[i+2]=42+(1-c)*125; }
  }
  fx.putImageData(image,r.x,r.y);
}

function edge(r) {
  const image=fx.getImageData(r.x,r.y,r.w,r.h), src=new Uint8ClampedArray(image.data), d=image.data, w=r.w;
  for(let y=1;y<r.h-1;y++) for(let x=1;x<r.w-1;x++) {
    const i=(y*w+x)*4, lum=(j)=>src[j]*.299+src[j+1]*.587+src[j+2]*.114;
    const gx=lum(i+4)-lum(i-4), gy=lum(i+w*4)-lum(i-w*4), v=Math.min(255,Math.hypot(gx,gy)*(2+state.intensity*4));
    d[i]=v*.75; d[i+1]=v; d[i+2]=v*.35;
  }
  fx.putImageData(image,r.x,r.y);
}

function pixel(r) {
  const size=Math.round(6+state.intensity*18), sw=Math.max(1,Math.round(r.w/size)), sh=Math.max(1,Math.round(r.h/size));
  const temp=document.createElement('canvas'); temp.width=sw; temp.height=sh;
  const t=temp.getContext('2d'); t.drawImage(fxCanvas,r.x,r.y,r.w,r.h,0,0,sw,sh);
  fx.imageSmoothingEnabled=false; fx.drawImage(temp,0,0,sw,sh,r.x,r.y,r.w,r.h); fx.imageSmoothingEnabled=true;
}

function ascii(r) {
  const cell=Math.max(7,Math.round(16-state.intensity*8)), cols=Math.ceil(r.w/cell), rows=Math.ceil(r.h/cell);
  const sample=document.createElement('canvas'); sample.width=cols; sample.height=rows;
  const s=sample.getContext('2d',{willReadFrequently:true}); s.drawImage(fxCanvas,r.x,r.y,r.w,r.h,0,0,cols,rows);
  const data=s.getImageData(0,0,cols,rows).data, chars=' .:-=+*#%@';
  fx.fillStyle='#10120d'; fx.fillRect(r.x,r.y,r.w,r.h); fx.font=`${cell}px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`; fx.textBaseline='top';
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) { const i=(y*cols+x)*4, v=(data[i]+data[i+1]+data[i+2])/765, ch=chars[Math.min(chars.length-1,Math.floor(v*chars.length))]; fx.fillStyle=`hsl(${70+v*80} 90% ${36+v*48}%)`; fx.fillText(ch,r.x+x*cell,r.y+y*cell); }
}

function halftone(r) {
  const cell=Math.max(8,Math.round(18-state.intensity*8)), sample=fx.getImageData(r.x,r.y,r.w,r.h);
  fx.fillStyle='#eee9dc'; fx.fillRect(r.x,r.y,r.w,r.h); fx.fillStyle='#1b1c16';
  for(let y=0;y<r.h;y+=cell) for(let x=0;x<r.w;x+=cell) { const px=Math.min(r.w-1,Math.floor(x)), py=Math.min(r.h-1,Math.floor(y)), i=(py*r.w+px)*4, v=(sample.data[i]+sample.data[i+1]+sample.data[i+2])/765; fx.beginPath(); fx.arc(r.x+x+cell/2,r.y+y+cell/2,(1-v)*cell*.52,0,Math.PI*2); fx.fill(); }
}

function addGrain(r) {
  if (!state.grain) return;
  const image=fx.getImageData(r.x,r.y,r.w,r.h), d=image.data, strength=state.grain*35;
  for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*strength;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}
  fx.putImageData(image,r.x,r.y);
}

function applyEffect(rect) {
  const r={x:Math.max(0,Math.floor(rect.x)),y:Math.max(0,Math.floor(rect.y)),w:Math.max(1,Math.min(canvas.width-Math.max(0,Math.floor(rect.x)),Math.floor(rect.w))),h:Math.max(1,Math.min(canvas.height-Math.max(0,Math.floor(rect.y)),Math.floor(rect.h)))};
  const id=effects[state.active].id;
  if(id==='thermal') thermal(r,state.intensity); else if(id==='ascii') ascii(r); else if(id==='halftone') halftone(r); else if(id==='edge') edge(r); else if(id==='night'||id==='duotone') colorMap(r,id); else if(id==='pixel') pixel(r);
  if(id!=='clean'&&id!=='ascii'&&id!=='halftone') addGrain(r);
  return r;
}

function updateGuide(r, hands) {
  const guide=$('#guide'), sx=innerWidth/canvas.width, sy=innerHeight/canvas.height;
  guide.style.left=`${(r.x+r.w/2)*sx}px`; guide.style.top=`${(r.y+r.h/2)*sy}px`; guide.style.width=`${r.w*sx}px`; guide.style.height=`${r.h*sy}px`; guide.style.aspectRatio='auto';
  guide.classList.toggle('tracking',hands>=2);
  $('#guideLabel').textContent=hands>=2?'FRAME LOCKED':'RAISE TWO HANDS TO FRAME';
}

function updateTelemetry(now, hands) {
  state.frameTimes.push(now); while(state.frameTimes.length&&state.frameTimes[0]<now-1000) state.frameTimes.shift();
  $('#fps').textContent=`${state.frameTimes.length} FPS`;
  $('#handCount').textContent=`${Math.min(hands,2)}/2 HANDS`;
  if(state.modelStatus==='ready') $('#trackingStatus').textContent=hands>=2?'FRAME LOCK':'FRAMING';
}

function render(now) {
  if(!state.running) return;
  detectHands(now);
  drawVideo(ctx); drawVideo(fx);
  const hands=state.handResults?.landmarks?.length||0, rect=targetRect(), r=applyEffect(rect);
  ctx.save(); ctx.globalAlpha=.96; ctx.drawImage(fxCanvas,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h); ctx.restore();
  updateGuide(r,hands); updateTelemetry(now,hands);
  requestAnimationFrame(render);
}

function snapshot() {
  if(!state.running) return;
  const link=document.createElement('a'); link.download=`frame-lab-${new Date().toISOString().replaceAll(':','-').slice(0,19)}.jpg`; link.href=canvas.toDataURL('image/jpeg',.94); link.click();
  canvas.animate([{filter:'brightness(1)'},{filter:'brightness(2.8)'},{filter:'brightness(1)'}],{duration:220});
}

function showError(message){const toast=$('#errorToast');toast.textContent=message;toast.hidden=false;}
function toggleHidden(el, button){el.hidden=!el.hidden;button?.setAttribute('aria-expanded',String(!el.hidden));}

$('#startButton').addEventListener('click',startCamera);
$('#previousEffect').addEventListener('click',()=>setEffect(state.active-1));
$('#nextEffect').addEventListener('click',()=>setEffect(state.active+1));
$('#captureButton').addEventListener('click',snapshot);
$('#privacyButton').addEventListener('click',()=>toggleHidden($('#privacyNote'),$('#privacyButton')));
$('#settingsButton').addEventListener('click',()=>toggleHidden($('#controls'),$('#settingsButton')));
$('#closeControls').addEventListener('click',()=>toggleHidden($('#controls'),$('#settingsButton')));
$('#flipButton').addEventListener('click',async()=>{state.facing=state.facing==='user'?'environment':'user';state.handResults=null;state.trackedRect=null;await startCamera();});
$('#intensity').addEventListener('input',(e)=>{state.intensity=e.target.value/100;$('#intensityValue').textContent=e.target.value;});
$('#grain').addEventListener('input',(e)=>{state.grain=e.target.value/100;$('#grainValue').textContent=e.target.value;});
$('#mirror').addEventListener('change',(e)=>state.mirror=e.target.checked);
$('#handFrame').addEventListener('change',(e)=>{state.handFrame=e.target.checked;state.trackedRect=null;});
addEventListener('resize',resize);
addEventListener('keydown',(e)=>{if(e.key==='ArrowLeft')setEffect(state.active-1);if(e.key==='ArrowRight')setEffect(state.active+1);if(e.code==='Space'&&e.target===document.body){e.preventDefault();snapshot();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)state.frameTimes=[];});
