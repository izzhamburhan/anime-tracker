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
  frameTimes: [], trackedPoints: null
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
    $('#guide').hidden = true;
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
      minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55
    });
    state.modelStatus = 'ready';
    $('#trackingStatus').textContent = 'FRAMING';
  } catch (error) {
    console.warn('Hand tracking unavailable; effects remain paused.', error);
    state.modelStatus = 'fallback';
    $('#trackingStatus').textContent = 'AI OFFLINE';
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
  if (!state.handLandmarker || video.currentTime === state.lastVideoTime || now - state.lastDetect < 34) return;
  state.lastVideoTime = video.currentTime;
  state.lastDetect = now;
  try { state.handResults = state.handLandmarker.detectForVideo(video, now); } catch (error) { console.warn(error); }
}

function toCanvasPoint(point) {
  const t = coverTransform();
  const x = state.mirror && state.facing === 'user' ? 1 - point.x : point.x;
  return { x: t.x + x * t.w, y: t.y + point.y * t.h };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderPolygon(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function polygonArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function polygonBounds(points) {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function smoothPoints(rawPoints) {
  if (!state.trackedPoints) state.trackedPoints = rawPoints.map((point) => ({ ...point }));
  state.trackedPoints.forEach((point, index) => {
    const target = rawPoints[index];
    const movement = distance(point, target);
    const alpha = Math.min(.72, Math.max(.3, .3 + movement / (canvas.width * .12)));
    point.x += (target.x - point.x) * alpha;
    point.y += (target.y - point.y) * alpha;
  });
  return state.trackedPoints;
}

function targetGeometry() {
  const landmarks = state.handResults?.landmarks || [];
  if (landmarks.length < 2) {
    state.trackedPoints = null;
    return { active: false, quad: null, bounds: null };
  }

  const hands = landmarks.slice(0, 2).map((hand) => ({
    landmarks: hand,
    center: toCanvasPoint(hand[9])
  })).sort((a, b) => a.center.x - b.center.x);

  const rawPoints = state.handFrame
    ? [
        toCanvasPoint(hands[0].landmarks[8]),
        toCanvasPoint(hands[0].landmarks[4]),
        toCanvasPoint(hands[1].landmarks[4]),
        toCanvasPoint(hands[1].landmarks[8])
      ]
    : [
        { x: canvas.width * .32, y: canvas.height * .29 },
        { x: canvas.width * .32, y: canvas.height * .71 },
        { x: canvas.width * .68, y: canvas.height * .71 },
        { x: canvas.width * .68, y: canvas.height * .29 }
      ];

  const tracked = smoothPoints(rawPoints);
  const quad = orderPolygon(tracked);
  const leftSpan = distance(tracked[0], tracked[1]);
  const rightSpan = distance(tracked[2], tracked[3]);
  const handGap = distance(hands[0].center, hands[1].center);
  const active = leftSpan > canvas.width * .018
    && rightSpan > canvas.width * .018
    && handGap > canvas.width * .08
    && polygonArea(quad) > canvas.width * canvas.height * .004;

  return { active, quad, bounds: polygonBounds(quad) };
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

function drawFrameGuide(quad, hands, active) {
  const dpr = canvas.width / innerWidth;
  const fallback = [
    { x: canvas.width * .34, y: canvas.height * .32 },
    { x: canvas.width * .66, y: canvas.height * .32 },
    { x: canvas.width * .66, y: canvas.height * .68 },
    { x: canvas.width * .34, y: canvas.height * .68 }
  ];
  const points = quad || fallback;
  const bracket = 30 * dpr;
  const label = active ? 'FRAME LOCKED' : hands === 1 ? 'ONE MORE HAND' : hands >= 2 ? 'OPEN THE FRAME' : 'RAISE TWO HANDS TO FRAME';
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const top = Math.min(...points.map((point) => point.y));

  ctx.save();
  ctx.strokeStyle = active ? '#d9ff45' : 'rgba(217,255,69,.56)';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2 * dpr;
  ctx.lineCap = 'square';
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const toward = (target) => {
      const length = Math.max(1, distance(point, target));
      return { x: point.x + (target.x - point.x) / length * Math.min(bracket, length * .28), y: point.y + (target.y - point.y) / length * Math.min(bracket, length * .28) };
    };
    const before = toward(previous), after = toward(next);
    ctx.beginPath();
    ctx.moveTo(before.x, before.y);
    ctx.lineTo(point.x, point.y);
    ctx.lineTo(after.x, after.y);
    ctx.stroke();
  });
  ctx.font = `${9 * dpr}px "SFMono-Regular", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, center.x, Math.max(18 * dpr, top - 10 * dpr));
  ctx.restore();
}

function updateTelemetry(now, hands, active) {
  state.frameTimes.push(now); while(state.frameTimes.length&&state.frameTimes[0]<now-1000) state.frameTimes.shift();
  $('#fps').textContent=`${state.frameTimes.length} FPS`;
  $('#handCount').textContent=`${Math.min(hands,2)}/2 HANDS`;
  if(state.modelStatus==='ready') $('#trackingStatus').textContent=active?'FRAME LOCK':hands>=2?'ALIGNING':'FRAMING';
}

function render(now) {
  if(!state.running) return;
  detectHands(now);
  drawVideo(ctx); drawVideo(fx);
  const hands=state.handResults?.landmarks?.length||0, geometry=targetGeometry();
  if(geometry.active) {
    const r=applyEffect(geometry.bounds);
    ctx.save();
    ctx.beginPath();
    geometry.quad.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha=.96;
    ctx.drawImage(fxCanvas,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
    ctx.restore();
  }
  drawFrameGuide(geometry.quad,hands,geometry.active); updateTelemetry(now,hands,geometry.active);
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
$('#flipButton').addEventListener('click',async()=>{state.facing=state.facing==='user'?'environment':'user';state.handResults=null;state.trackedPoints=null;await startCamera();});
$('#intensity').addEventListener('input',(e)=>{state.intensity=e.target.value/100;$('#intensityValue').textContent=e.target.value;});
$('#grain').addEventListener('input',(e)=>{state.grain=e.target.value/100;$('#grainValue').textContent=e.target.value;});
$('#mirror').addEventListener('change',(e)=>{state.mirror=e.target.checked;state.trackedPoints=null;});
$('#handFrame').addEventListener('change',(e)=>{state.handFrame=e.target.checked;state.trackedPoints=null;});
addEventListener('resize',resize);
addEventListener('keydown',(e)=>{if(e.key==='ArrowLeft')setEffect(state.active-1);if(e.key==='ArrowRight')setEffect(state.active+1);if(e.code==='Space'&&e.target===document.body){e.preventDefault();snapshot();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)state.frameTimes=[];});
