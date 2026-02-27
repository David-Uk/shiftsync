import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

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
