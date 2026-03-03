import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    console.log("Auth header:", authHeader ? "Present" : "Missing");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Bearer token found in authorization header");
      return null;
    }

    const token = authHeader.substring(7);
    console.log("Token extracted, length:", token.length);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
      };
      console.log("Token decoded successfully, id:", decoded.id);

      await connectToDatabase();
      const user = await User.findById(decoded.id);
      console.log("User lookup result:", user ? `Found - ${user.email}` : "Not found");

      if (!user) {
        console.log("User not found in database for id:", decoded.id);
        return null;
      }

      console.log("Authentication successful for user:", user.email, "role:", user.role);
      return user;
    } catch (jwtError) {
      console.error("JWT verification failed:", jwtError instanceof Error ? jwtError.message : String(jwtError));
      return null;
    }
  } catch (error) {
    console.error("Authentication error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
export async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized: No token provided', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };
    await connectToDatabase();
    const user = await User.findById(decoded.id);

    if (!user) {
      return { error: 'Unauthorized: Invalid token', status: 401 };
    }

    if (user.isArchived) {
      return { error: 'Forbidden: User is archived', status: 403 };
    }

    return { user };
  } catch (error) {
    return { error: 'Unauthorized: Invalid token', status: 401 };
  }
}

export async function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };
    await connectToDatabase();
    const user = await User.findById(decoded.id);

    if (!user) {
      return null;
    }

    if (user.isArchived) {
      return null;
    }

    return user;
  } catch (error) {
    return null;
  }
}

export async function verifyAdmin(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth.error) {
    return auth;
  }

  if (auth.user?.role !== 'admin') {
    return { error: 'Forbidden: Requires admin privileges', status: 403 };
  }

  return { user: auth.user };
}
