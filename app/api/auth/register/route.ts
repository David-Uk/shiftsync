import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, password, role = 'staff' } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ 
        message: 'All required fields must be provided' 
      }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ 
        message: 'Password must be at least 6 characters long' 
      }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        message: 'Invalid email format' 
      }, { status: 400 });
    }

    await connectToDatabase();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ 
        message: 'User with this email already exists' 
      }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      isActive: true,
      isArchived: false,
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return NextResponse.json(
      {
        message: 'Registration successful',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          profileImage: user.profileImage,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: errorMessage 
    }, { status: 500 });
  }
}
