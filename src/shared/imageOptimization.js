const supportedSourceTypes = new Set(['image/jpeg', 'image/png']);

function canvasBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function optimizeImageFile(file, { maxDimension = 1920, quality = 0.82 } = {}) {
  if (!file || !supportedSourceTypes.has(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const converted = await canvasBlob(canvas, 'image/webp', quality);
    if (!converted || converted.type !== 'image/webp' || converted.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([converted], `${base}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}
