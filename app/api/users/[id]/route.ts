import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdmin } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { sanitizeUserUpdate, validateObjectId } from '@/lib/validation';
import { handleImageUpdate, validateContentType } from '@/lib/uploadMiddleware';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);

    // Check if this is a multipart form request (with image)
    const contentType = req.headers.get('content-type');
    let userData: Record<string, string | File>;
    let profileImageUrl: string | undefined;

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle form data with image upload
      validateContentType(req);
      
      // Get current user to fetch existing profile image
      await connectToDatabase();
      const currentUser = await User.findById(id);
      if (!currentUser) {
        return NextResponse.json({ message: 'User not found' }, { status: 404 });
      }
      
      const { fields, profileImageUrl: uploadedUrl } = await handleImageUpdate(req, currentUser.profileImage);
      userData = fields;
      profileImageUrl = uploadedUrl;
    } else {
      // Handle JSON request without image
      userData = await req.json();
    }

    // Sanitize input data
    const sanitizedData = sanitizeUserUpdate({
      firstName: typeof userData.firstName === 'string' ? userData.firstName : undefined,
      lastName: typeof userData.lastName === 'string' ? userData.lastName : undefined,
      email: typeof userData.email === 'string' ? userData.email : undefined,
      password: typeof userData.password === 'string' ? userData.password : undefined,
      role: typeof userData.role === 'string' ? userData.role : undefined,
      profileImage: profileImageUrl,
    });

    // Hash password if provided
    if (sanitizedData.password) {
      const salt = await bcrypt.genSalt(10);
      sanitizedData.password = await bcrypt.hash(sanitizedData.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(id, sanitizedData, { new: true }).select('-password');
    
    if (!updatedUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'User updated successfully', user: updatedUser }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);
    await connectToDatabase();

    const archivedUser = await User.findByIdAndUpdate(
      id,
      { isArchived: true },
      { new: true }
    ).select('-password');

    if (!archivedUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'User archived successfully', user: archivedUser },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
