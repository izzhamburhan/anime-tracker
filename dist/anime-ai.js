const ORT_VERSION = '1.23.2';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ORT_MODULE = `${ORT_BASE}ort.webgpu.min.mjs`;
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/Kazuhito00/AnimeGANv2-ONNX-Sample@1597c3ad45b2db87e1ac4944ee62cfdb30d0670d/model/face_paint_512_v2_0.onnx';
const INPUT_SIZE = 512;

export class AnimeAI {
  constructor() {
    this.status = 'idle';
    this.backend = '';
    this.session = null;
    this.ort = null;
    this.error = null;
    this.latency = 0;
    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = INPUT_SIZE;
    this.outputCanvas.height = INPUT_SIZE;
    this.outputContext = this.outputCanvas.getContext('2d');
    this.inputCanvas = document.createElement('canvas');
    this.inputCanvas.width = INPUT_SIZE;
    this.inputCanvas.height = INPUT_SIZE;
    this.inputContext = this.inputCanvas.getContext('2d', { willReadFrequently: true });
  }

  async load() {
    if (this.status === 'ready') return this;
    if (this.loading) return this.loading;

    this.status = 'loading';
    this.loading = this.createSession();
    try {
      await this.loading;
      this.status = 'ready';
      return this;
    } catch (error) {
      this.status = 'error';
      this.error = error;
      throw error;
    } finally {
      this.loading = null;
    }
  }

  async createSession() {
    this.ort = await import(ORT_MODULE);
    this.ort.env.wasm.wasmPaths = ORT_BASE;
    this.ort.env.wasm.numThreads = 1;

    if (navigator.gpu) {
      try {
        this.session = await this.ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all'
        });
        this.backend = 'WebGPU';
        return;
      } catch (error) {
        console.warn('WebGPU Anime AI unavailable, falling back to WASM.', error);
      }
    }

    await this.createWasmSession();
  }

  async createWasmSession() {
    this.session = await this.ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    this.backend = 'WASM';
  }

  async infer(sourceCanvas, rect) {
    if (this.status !== 'ready') throw new Error('Anime AI is not ready.');

    this.inputContext.drawImage(
      sourceCanvas,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, INPUT_SIZE, INPUT_SIZE
    );
    const pixels = this.inputContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const plane = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(plane * 3);

    for (let pixel = 0; pixel < plane; pixel += 1) {
      const source = pixel * 4;
      input[pixel] = pixels[source] / 127.5 - 1;
      input[plane + pixel] = pixels[source + 1] / 127.5 - 1;
      input[plane * 2 + pixel] = pixels[source + 2] / 127.5 - 1;
    }

    const started = performance.now();
    const tensor = new this.ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    let result;
    try {
      result = await this.session.run({ [this.session.inputNames[0]]: tensor });
    } catch (error) {
      if (this.backend !== 'WebGPU') throw error;
      console.warn('WebGPU inference failed, retrying with WASM.', error);
      await this.createWasmSession();
      result = await this.session.run({ [this.session.inputNames[0]]: tensor });
    }
    const output = result[this.session.outputNames[0]];
    const rgba = new Uint8ClampedArray(plane * 4);

    for (let pixel = 0; pixel < plane; pixel += 1) {
      const target = pixel * 4;
      rgba[target] = Math.max(0, Math.min(255, (output.data[pixel] * .5 + .5) * 255));
      rgba[target + 1] = Math.max(0, Math.min(255, (output.data[plane + pixel] * .5 + .5) * 255));
      rgba[target + 2] = Math.max(0, Math.min(255, (output.data[plane * 2 + pixel] * .5 + .5) * 255));
      rgba[target + 3] = 255;
    }

    this.outputContext.putImageData(new ImageData(rgba, INPUT_SIZE, INPUT_SIZE), 0, 0);
    this.latency = Math.round(performance.now() - started);
    return this.outputCanvas;
  }
}

export const animeModelInfo = {
  name: 'AnimeGANv2 Face Portrait v2',
  source: 'https://github.com/Kazuhito00/AnimeGANv2-ONNX-Sample',
  inputSize: INPUT_SIZE
};
