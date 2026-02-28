import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    
    if (auth.error) {
      return NextResponse.json({ 
        message: auth.error 
      }, { status: auth.status });
    }

    return NextResponse.json({ 
      message: 'Token is valid',
      user: {
        id: auth?.user?._id,
        firstName: auth?.user?.firstName,
        lastName: auth?.user?.lastName,
        email: auth?.user?.email,
        role: auth?.user?.role,
        profileImage: auth?.user?.profileImage,
      }
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: errorMessage 
    }, { status: 500 });
  }
}
