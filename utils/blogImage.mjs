export function getBlogImageSrcset(imagePath) {
  if (!imagePath?.startsWith('/images/') || !imagePath.endsWith('.webp')) return undefined;

  const cardImagePath = imagePath.replace(/\.webp$/, '-640.webp');
  return `${cardImagePath} 640w, ${imagePath} 1024w`;
}
