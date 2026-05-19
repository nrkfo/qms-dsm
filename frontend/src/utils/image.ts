
/**
 * Compresses a base64 image string by reducing dimensions and quality.
 * @param base64 The source base64 string
 * @param maxWidth Maximum width in pixels
 * @param quality JPEG quality from 0 to 1
 * @returns A promise that resolves with the compressed base64 string
 */
export const compressImage = (base64: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onerror = (err) => reject(err);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64); // Fallback to original if canvas fails
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        // Use image/jpeg for better compression of photos
        const result = canvas.toDataURL('image/jpeg', quality);
        resolve(result);
      } catch (e) {
        console.error('Compression error:', e);
        resolve(base64); // Fallback
      }
    };
  });
};

/**
 * Compresses an image to the maximum extent (very low size, optimal readability for defect inspection)
 * @param base64 The source base64 string
 * @returns A promise that resolves with the highly compressed base64 string
 */
export const compressImageMax = (base64: string): Promise<string> => {
  return compressImage(base64, 800, 0.4);
};

