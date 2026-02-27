import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

// Upload image to Cloudinary
export async function uploadImage(
  fileBuffer: Buffer,
  folder: string = 'profile-images'
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        format: 'webp', // Convert to webp for better compression
        quality: 'auto:good',
        fetch_format: 'auto',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' }, // Resize and crop
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
          return;
        }
        
        if (!result) {
          reject(new Error('Cloudinary upload returned no result'));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format || 'webp',
          width: result.width || 0,
          height: result.height || 0,
          bytes: result.bytes || 0,
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
}

// Delete image from Cloudinary
export async function deleteImage(publicId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: 'image' },
      (error) => {
        if (error) {
          reject(new Error(`Cloudinary deletion failed: ${error.message}`));
          return;
        }
        
        resolve();
      }
    );
  });
}

// Validate image file
export function validateImageFile(buffer: Buffer, filename: string): void {
  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (buffer.length > maxSize) {
    throw new Error('Image file size must be less than 5MB');
  }

  // Check file extension
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const fileExtension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error('Only JPG, PNG, GIF, and WebP images are allowed');
  }

  // Basic image signature check (magic numbers)
  const jpgSignature = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const pngSignature = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const gifSignature = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
  const webpSignature = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (!jpgSignature && !pngSignature && !gifSignature && !webpSignature) {
    throw new Error('Invalid image file format');
  }
}

// Extract public ID from Cloudinary URL
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = filename.split('.')[0];
    
    // Extract folder path if exists
    const folderStart = url.indexOf('/upload/') + 8;
    const folderEnd = url.lastIndexOf('/');
    const folder = folderEnd > folderStart ? url.substring(folderStart, folderEnd) : '';
    
    return folder ? `${folder}/${publicId}` : publicId;
  } catch {
    return null;
  }
}
