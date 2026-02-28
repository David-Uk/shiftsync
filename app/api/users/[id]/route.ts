import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdmin } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { sanitizeUserUpdate, validateObjectId } from '@/lib/validation';
import { handleImageUpdate, validateContentType } from '@/lib/uploadMiddleware';
import NotificationService from '@/lib/notificationService';
import mongoose from 'mongoose';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);

    await connectToDatabase();
    
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.isArchived ? 'archived' : 'active',
        profileImage: user.profileImage
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

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
      await connectToDatabase();
    }
    
    // Get original user if not already fetched in multipart block
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    const originalRole = currentUser.role;

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

    // Send Notifications
    try {
      const adminId = adminCheck.user?._id as mongoose.Types.ObjectId;
      const userId = updatedUser._id as mongoose.Types.ObjectId;

      // Notify Admin
      await NotificationService.createAdminNotification({
        type: 'user_updated',
        title: 'User Profile Updated',
        message: `Admin ${adminCheck.user?.firstName} updated details for ${updatedUser.firstName} ${updatedUser.lastName}.`,
        relatedEntity: { type: 'user', id: userId },
        sender: adminId
      });

      // Notify User
      await NotificationService.createNotification({
        type: 'user_updated',
        title: 'Profile Updated',
        message: 'Your profile has been updated by an administrator.',
        recipient: userId,
        sender: adminId,
        relatedEntity: { type: 'user', id: userId }
      });

      if (sanitizedData.role && sanitizedData.role !== originalRole) {
        await NotificationService.createRoleChangeNotification(
          userId,
          originalRole,
          sanitizedData.role,
          adminId
        );
      }
    } catch (err) {
      console.error('Failed to send user update notifications:', err);
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

    // Notify about archival
    try {
      const adminId = adminCheck.user?._id as mongoose.Types.ObjectId;
      const userId = archivedUser._id as mongoose.Types.ObjectId;

      await NotificationService.createAdminNotification({
        type: 'user_archived',
        title: 'User Archived',
        message: `User ${archivedUser.firstName} ${archivedUser.lastName} has been archived.`,
        relatedEntity: { type: 'user', id: userId },
        sender: adminId,
        priority: 'medium'
      });

      await NotificationService.createNotification({
        type: 'user_archived',
        title: 'Account Archived',
        message: 'Your account has been archived by an administrator.',
        recipient: userId,
        sender: adminId,
        priority: 'high'
      });
    } catch (err) {
      console.error('Failed to send archival notifications:', err);
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
