import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Location from '@/models/Location';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';
import { verifyAdmin } from '@/lib/auth';
import NotificationService from '@/lib/notificationService';

// GET location by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminCheck = await verifyAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    await connectToDatabase();
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const location = await Location.findById(id)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminCheck = await verifyAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    await connectToDatabase();
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { address, city, timezone, manager } = body;
    const updatedBy = adminCheck.user?._id as mongoose.Types.ObjectId;
    
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
    
    const location = await Location.findById(id);
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    // Capture the original manager before update for comparison
    const originalManager = location.manager.toString();
    const isManagerBeingChanged = manager && manager !== originalManager;
    
    // Update fields
    if (address) location.address = address;
    if (city) location.city = city;
    if (timezone) location.timezone = timezone;
    if (manager) location.manager = manager;
    
    await location.save();
    
    // Send notifications
    try {
      if (isManagerBeingChanged) {
        // Notify the new manager
        await NotificationService.createNotification({
          type: 'location_updated',
          title: 'Managerial Role Assigned',
          message: `You have been assigned to manage the location: ${location.address}, ${location.city}.`,
          recipient: new mongoose.Types.ObjectId(manager),
          sender: updatedBy,
          location: location._id as mongoose.Types.ObjectId,
          relatedEntity: { type: 'location', id: location._id as mongoose.Types.ObjectId },
          priority: 'high'
        });

        // Notify the old manager they are no longer assigned
        await NotificationService.createNotification({
          type: 'location_updated',
          title: 'Location Assignment Changed',
          message: `You are no longer assigned as the manager for: ${location.address}, ${location.city}.`,
          recipient: new mongoose.Types.ObjectId(originalManager),
          sender: updatedBy,
          location: location._id as mongoose.Types.ObjectId,
          relatedEntity: { type: 'location', id: location._id as mongoose.Types.ObjectId },
          priority: 'medium'
        });
      } else {
        // Manager did not change, but notify current manager of any core changes
        await NotificationService.createNotification({
          type: 'location_updated',
          title: 'Location Details Updated',
          message: `Admin has updated the details for your location: ${location.address}, ${location.city}.`,
          recipient: location.manager as unknown as mongoose.Types.ObjectId,
          sender: updatedBy,
          location: location._id as mongoose.Types.ObjectId,
          relatedEntity: { type: 'location', id: location._id as mongoose.Types.ObjectId },
          priority: 'medium'
        });
      }
    } catch (notificationError) {
      console.error('Failed to send location update notifications:', notificationError);
    }
    
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminCheck = await verifyAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    await connectToDatabase();
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid location ID' },
        { status: 400 }
      );
    }
    
    const location = await Location.findById(id);
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }
    
    await Location.findByIdAndDelete(id);
    
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
