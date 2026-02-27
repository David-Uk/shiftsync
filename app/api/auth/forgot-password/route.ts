import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ 
        message: 'Email is required' 
      }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        message: 'Invalid email format' 
      }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({ email });
    
    if (!user) {
      return NextResponse.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      }, { status: 200 });
    }

    if (user.isArchived) {
      return NextResponse.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      }, { status: 200 });
    }

    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = resetTokenExpiry;
    await user.save();

    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Reset link would be: ${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`);

    return NextResponse.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    }, { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: errorMessage 
    }, { status: 500 });
  }
}
