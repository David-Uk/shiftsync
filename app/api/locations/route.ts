import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Location from '@/models/Location';
import User from '@/models/User';

// GET all locations
export async function GET(request: NextRequest) {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const city = searchParams.get('city');
    
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter: Record<string, unknown> = {};
    if (city) {
      filter.city = new RegExp(city, 'i');
    }
    
    const locations = await Location.find(filter)
      .populate('manager', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Location.countDocuments(filter);
    
    return NextResponse.json({
      success: true,
      data: locations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch locations' },
      { status: 500 }
    );
  }
}

// POST create new location (admin only)
export async function POST(request: NextRequest) {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    const body = await request.json();
    const { address, city, timezone, manager, createdBy } = body;
    
    // Validate required fields
    if (!address || !city || !timezone || !manager || !createdBy) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }
    
    // Verify creator is admin
    const creator = await User.findById(createdBy);
    if (!creator || creator.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only admins can create locations' },
        { status: 403 }
      );
    }
    
    // Verify manager exists and has appropriate role
    const managerUser = await User.findById(manager);
    if (!managerUser || (managerUser.role !== 'manager' && managerUser.role !== 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Invalid manager assignment' },
        { status: 400 }
      );
    }
    
    const location = await Location.create({
      address,
      city,
      timezone,
      manager,
      createdBy
    });
    
    // Populate the response
    await location.populate('manager', 'firstName lastName email');
    await location.populate('createdBy', 'firstName lastName email');
    
    return NextResponse.json({
      success: true,
      data: location
    }, { status: 201 });
    
  } catch (error: unknown) {
    console.error('Error creating location:', error);
    
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Location with this address already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create location' },
      { status: 500 }
    );
  }
}
