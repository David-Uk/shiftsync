import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);
    
    const authHeader = request.headers.get("authorization");
    console.log('Test endpoint - Auth header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "No Bearer token" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    console.log('Test endpoint - Token length:', token.length);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string; iat: number; exp: number };
      console.log('Test endpoint - Token decoded successfully:', decoded);
      
      return NextResponse.json({
        success: true,
        message: "JWT verification successful",
        decoded: decoded
      });
    } catch (jwtError: unknown) {
      console.error('Test endpoint - JWT verification failed:', jwtError);
      const errorMessage = jwtError instanceof Error ? jwtError.message : 'Unknown JWT error';
      return NextResponse.json(
        { success: false, error: "JWT verification failed", details: errorMessage },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
