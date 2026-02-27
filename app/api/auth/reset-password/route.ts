import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ 
        message: 'Token and password are required' 
      }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ 
        message: 'Password must be at least 6 characters long' 
      }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({ 
      passwordResetToken: token,
      passwordResetExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return NextResponse.json({ 
        message: 'Invalid or expired reset token' 
      }, { status: 400 });
    }

    if (user.isArchived) {
      return NextResponse.json({ 
        message: 'Account is locked. Please contact support' 
      }, { status: 403 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    return NextResponse.json({ 
      message: 'Password reset successful' 
    }, { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: errorMessage 
    }, { status: 500 });
  }
}
