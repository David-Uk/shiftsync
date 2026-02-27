import { NextRequest } from 'next/server';
import { uploadImage, validateImageFile, extractPublicIdFromUrl } from './cloudinary';

// Parse form data and handle image upload
export async function handleImageUpload(req: NextRequest): Promise<{
  fields: Record<string, string | File>;
  profileImageUrl?: string;
}> {
  try {
    const formData = await req.formData();
    const fields: Record<string, string | File> = {};
    let profileImageUrl: string | undefined;

    // Process form fields
    for (const [key, value] of formData.entries()) {
      if (key === 'profileImage' && value instanceof File) {
        // Handle image upload
        const buffer = Buffer.from(await value.arrayBuffer());
        validateImageFile(buffer, value.name);
        
        const uploadResult = await uploadImage(buffer, 'profile-images');
        profileImageUrl = uploadResult.secure_url;
      } else if (key !== 'profileImage') {
        // Handle other form fields
        fields[key] = value;
      }
    }

    return { fields, profileImageUrl };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
    throw new Error(`Image upload failed: ${errorMessage}`);
  }
}

// Handle image update (delete old image if exists, upload new one)
export async function handleImageUpdate(
  req: NextRequest,
  currentImageUrl?: string
): Promise<{
  fields: Record<string, string | File>;
  profileImageUrl?: string;
}> {
  try {
    const { fields, profileImageUrl } = await handleImageUpload(req);
    
    // If new image uploaded and old image exists, delete the old one
    if (profileImageUrl && currentImageUrl) {
      const oldPublicId = extractPublicIdFromUrl(currentImageUrl);
      if (oldPublicId) {
        try {
          const { deleteImage } = await import('./cloudinary');
          await deleteImage(oldPublicId);
        } catch (error) {
          // Log error but don't fail the operation
          console.warn('Failed to delete old profile image:', error);
        }
      }
    }
    
    return { fields, profileImageUrl };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown update error';
    throw new Error(`Image update failed: ${errorMessage}`);
  }
}

// Validate that the request has the required content type
export function validateContentType(req: NextRequest): void {
  const contentType = req.headers.get('content-type');
  
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data for file uploads');
  }
}
