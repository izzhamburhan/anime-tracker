# Frame Lab

An immersive, privacy-first camera playground inspired by the supplied reference. It tracks up to two hands and turns the space between them into a live effect window.

Effects: Thermal, ASCII, Halftone, Edge, Night Vision, Duotone, Pixel, and clean camera.
Effects: Thermal, ASCII, Halftone, Edge, Night Vision, Duotone, Pixel, and clean camera.

## Run locally

Camera access requires a secure origin or localhost. Serve `dist/` with any local HTTP server, for example:

```powershell
npx serve dist
```

All video processing happens in the browser. MediaPipe model/runtime files are loaded from Google's public asset host and jsDelivr.
