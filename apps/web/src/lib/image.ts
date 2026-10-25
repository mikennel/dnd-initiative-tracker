/**
 * Shrink an uploaded picture to a small square JPEG data URL. It travels inside a
 * `combatant/updated` event (and to the table view), so it must stay a few KB.
 */
export async function imageToAvatar(file: Blob, size = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
