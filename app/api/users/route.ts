import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdmin } from '@/lib/auth';
import { sanitizeUserCreation } from '@/lib/validation';
import { handleImageUpload, validateContentType } from '@/lib/uploadMiddleware';

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
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

    await connectToDatabase();

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
      profileImage: sanitizedData.profileImage,
    });

    await newUser.save();

    return NextResponse.json(
      { message: 'User created successfully', user: { id: newUser._id, email: newUser.email, role: newUser.role, profileImage: newUser.profileImage } },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    await connectToDatabase();
    // Return all users
    const users = await User.find({}).select('-password');
    return NextResponse.json({ users }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
