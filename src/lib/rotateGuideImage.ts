export async function rotateGuideImage(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.height
    canvas.height = bitmap.width
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Billedet kunne ikke roteres')
    context.translate(canvas.width, 0)
    context.rotate(Math.PI / 2)
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Billedet kunne ikke gemmes')), 'image/png')
    })
  } finally {
    bitmap.close()
  }
}