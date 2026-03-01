import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Staff from '@/models/Staff';
import { verifyAuth, verifyAdmin } from '@/lib/auth';
import { sanitizeUserCreation } from '@/lib/validation';
import { handleImageUpload, validateContentType } from '@/lib/uploadMiddleware';
import NotificationService from '@/lib/notificationService';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    // Check if any admin users already exist
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    let adminId: mongoose.Types.ObjectId | undefined;
    
    // If no admin exists, allow creation of first admin without authentication
    // Otherwise, require admin authentication
    if (existingAdmin) {
      const adminCheck = await verifyAdmin(req);
      if ('error' in adminCheck) {
        return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
      }
      adminId = adminCheck.user?._id as mongoose.Types.ObjectId;
    }

    // Check if this is a multipart form request (with image)
    const contentType = req.headers.get('content-type');
    let userData: Record<string, string | File>;
    let profileImageUrl: string | undefined;

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle form data with image upload
      validateContentType(req);
      const { fields, profileImageUrl: uploadedUrl } = await handleImageUpload(req);
      userData = fields;
      profileImageUrl = uploadedUrl;
    } else {
      // Handle JSON request without image
      userData = await req.json();
    }

    // Sanitize input data
    const sanitizedData = sanitizeUserCreation({
      firstName: typeof userData.firstName === 'string' ? userData.firstName : '',
      lastName: typeof userData.lastName === 'string' ? userData.lastName : '',
      email: typeof userData.email === 'string' ? userData.email : '',
      password: typeof userData.password === 'string' ? userData.password : '',
      role: typeof userData.role === 'string' ? userData.role : '',
      profileImage: profileImageUrl,
    });

    if (!sanitizedData.firstName || !sanitizedData.lastName || !sanitizedData.email || !sanitizedData.password || !sanitizedData.role) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // If no admin exists, only allow creation of an admin user
    if (!existingAdmin && sanitizedData.role !== 'admin') {
      return NextResponse.json({ 
        message: 'First user must be an admin. Please set role to "admin".' 
      }, { status: 400 });
    }

    const existingUser = await User.findOne({ email: sanitizedData.email });
    if (existingUser) {
      return NextResponse.json({ message: 'Email is already in use' }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(sanitizedData.password, salt);

    const newUser = new User({
      firstName: sanitizedData.firstName,
      lastName: sanitizedData.lastName,
      email: sanitizedData.email,
      password: hashedPassword,
      role: sanitizedData.role,
      status: 'active', // Set default status for new users
      profileImage: sanitizedData.profileImage,
    });

    await newUser.save();

    // Create staff record for staff and manager roles
    if (sanitizedData.role === 'staff' || sanitizedData.role === 'manager') {
      try {
        const existingStaff = await Staff.findOne({ user: newUser._id });
        if (!existingStaff) {
          const staffRecord = new Staff({
            user: newUser._id,
            designation: sanitizedData.role === 'manager' ? 'Manager' : 'Staff Member',
            status: 'active'
          });
          await staffRecord.save();
        }
      } catch (staffError) {
        console.error('Failed to create staff record:', staffError);
        // Continue with user creation even if staff record fails
      }
    }

    const successMessage = !existingAdmin 
      ? 'First admin user created successfully. You can now log in and create additional users.'
      : 'User created successfully';

    // Notify Admins about new user creation
    try {
      await NotificationService.createAdminNotification({
        type: 'user_created',
        title: 'New User Registered',
        message: `${newUser.firstName} ${newUser.lastName} has been registered as a ${newUser.role}.`,
        relatedEntity: { type: 'user', id: newUser._id as mongoose.Types.ObjectId },
        priority: 'medium',
        sender: adminId as mongoose.Types.ObjectId
      });
    } catch (notificationError) {
      console.error('Failed to send user creation notification:', notificationError);
    }

    return NextResponse.json(
      { 
        message: successMessage, 
        user: { 
          id: newUser._id, 
          email: newUser.email, 
          role: newUser.role, 
          status: newUser.isArchived ? 'archived' : 'active', 
          profileImage: newUser.profileImage 
        } 
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (auth.error) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    await connectToDatabase();
    
    // Get pagination parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Get search term
    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || '';

    // Build query
    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (roleFilter && roleFilter !== 'all') {
      query.role = roleFilter;
    }

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Get paginated users
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({ 
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
