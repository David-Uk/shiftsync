import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Location from '@/models/Location';
import User from '@/models/User';

// GET location by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const location = await Location.findById(params.id)
      .populate('manager', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role');
    
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('Error fetching location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch location' },
      { status: 500 }
    );
  }
}

// PUT update location (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { address, city, timezone, manager, updatedBy } = body;
    
    // Verify updater is admin
    if (updatedBy) {
      const updater = await User.findById(updatedBy);
      if (!updater || updater.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Only admins can update locations' },
          { status: 403 }
        );
      }
    }
    
    // If manager is being updated, validate the new manager
    if (manager) {
      const managerUser = await User.findById(manager);
      if (!managerUser || (managerUser.role !== 'manager' && managerUser.role !== 'admin')) {
        return NextResponse.json(
          { success: false, error: 'Invalid manager assignment' },
          { status: 400 }
        );
      }
    }
    
    const location = await Location.findById(params.id);
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    // Update fields
    if (address) location.address = address;
    if (city) location.city = city;
    if (timezone) location.timezone = timezone;
    if (manager) location.manager = manager;
    
    await location.save();
    
    // Populate the response
    await location.populate('manager', 'firstName lastName email role');
    await location.populate('createdBy', 'firstName lastName email role');
    
    return NextResponse.json({
      success: true,
      data: location
    });
  } catch (error: unknown) {
    console.error('Error updating location:', error);
    
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Location with this address already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to update location' },
      { status: 500 }
    );
  }
}

// DELETE location (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const deletedBy = searchParams.get('deletedBy');
    
    // Verify deleter is admin
    if (deletedBy) {
      const deleter = await User.findById(deletedBy);
      if (!deleter || deleter.role !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'Only admins can delete locations' },
          { status: 403 }
        );
      }
    }
    
    const location = await Location.findById(params.id);
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    await Location.findByIdAndDelete(params.id);
    
    return NextResponse.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete location' },
      { status: 500 }
    );
  }
}
