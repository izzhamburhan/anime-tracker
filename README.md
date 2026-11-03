# Frame Lab

An immersive, privacy-first camera playground inspired by the supplied reference. It tracks up to two hands and turns the space between them into a live effect window.

Effects: AI Anime, Thermal, ASCII, Halftone, Edge, Night Vision, Duotone, Pixel, and clean camera.

AI Anime runs AnimeGANv2 Face Portrait v2 through ONNX Runtime Web. WebGPU is used when available, with a WASM fallback. The runtime and model are downloaded once from jsDelivr; camera frames remain in the browser and are never uploaded.

## Run locally

Camera access requires a secure origin or localhost. Serve `dist/` with any local HTTP server, for example:

```powershell
npx serve dist
```

All video processing happens in the browser. MediaPipe and ONNX runtime/model files are loaded from Google's public asset host and jsDelivr.

## Model notice

The AI Anime option uses the AnimeGANv2 Face Portrait v2 model distributed by the [AnimeGANv2 ONNX Sample](https://github.com/Kazuhito00/AnimeGANv2-ONNX-Sample). The sample repository is MIT-licensed; the upstream AnimeGANv2 project limits its model to non-commercial use unless separate authorization is obtained.
