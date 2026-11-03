export function applyAnimeToImage(image, width, height, intensity) {
  const source = new Uint8ClampedArray(image.data);
  const data = image.data;
  const levels = 4 + Math.round(intensity * 2);
  const step = 255 / Math.max(1, levels - 1);
  const saturation = 1.25 + intensity * .55;
  const edgeThreshold = 62 - intensity * 27;
  const luminance = (index) => source[index] * .299 + source[index + 1] * .587 + source[index + 2] * .114;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4, right = index + 4;
      const above = index - width * 4, below = index + width * 4;
      const baseLuma = luminance(index);
      const gradient = Math.abs(luminance(right) - luminance(left)) + Math.abs(luminance(below) - luminance(above));

      if (gradient > edgeThreshold) {
        const ink = Math.max(4, 22 - gradient * .12);
        data[index] = ink;
        data[index + 1] = ink;
        data[index + 2] = ink + 4;
        continue;
      }

      let red = (source[index] * 2 + source[left] + source[right] + source[above] + source[below]) / 6;
      let green = (source[index + 1] * 2 + source[left + 1] + source[right + 1] + source[above + 1] + source[below + 1]) / 6;
      let blue = (source[index + 2] * 2 + source[left + 2] + source[right + 2] + source[above + 2] + source[below + 2]) / 6;
      const tone = red * .299 + green * .587 + blue * .114;
      red = tone + (red - tone) * saturation;
      green = tone + (green - tone) * saturation;
      blue = tone + (blue - tone) * saturation;

      const shade = baseLuma < 72 ? .72 : baseLuma < 142 ? .9 : baseLuma > 218 ? 1.08 : 1;
      red = Math.min(255, Math.max(0, red * shade));
      green = Math.min(255, Math.max(0, green * shade));
      blue = Math.min(255, Math.max(0, blue * shade));
      data[index] = Math.round(red / step) * step;
      data[index + 1] = Math.round(green / step) * step;
      data[index + 2] = Math.round(blue / step) * step;
    }
  }
  return image;
}
