import { NextRequest, NextResponse } from 'next/server';
import mongoose, { Types } from 'mongoose';
import ShiftSchedule from '@/models/ShiftSchedule';
import Location from '@/models/Location';
import Staff from '@/models/Staff';
import User from '@/models/User';
import jwt from 'jsonwebtoken';
import NotificationService from '@/lib/notificationService';

// Helper function to verify JWT token and get user
async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    await mongoose.connect(process.env.MONGODB_URL!);
    const user = await User.findById(decoded.userId);
    
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// Helper function to get staff record for user
// async function getUserStaffRecord(userId: string) {
//   const staff = await Staff.findOne({ user: userId });
//   if (!staff) {
//     throw new Error('Staff record not found for this user');
//   }
//   return staff;
// }

// GET all shift schedules for managers
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URL!);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const location = searchParams.get('location');
    const timezone = searchParams.get('timezone');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter: Record<string, unknown> = {};
    
    // If user is manager, only show shifts for their managed locations
    if (user.role === 'manager') {
      // Get all locations managed by this manager
      const managedLocations = await Location.find({ manager: user._id });
      const managedLocationIds = managedLocations.map((loc: { _id: Types.ObjectId }) => loc._id);
      
      if (managedLocationIds.length > 0) {
        filter.location = { $in: managedLocationIds };
      } else {
        // If manager has no managed locations, return empty result
        filter.location = null;
      }
    }
    
    if (location) {
      filter.location = location;
    }
    
    if (activeOnly) {
      filter.isActive = true;
    }
    
    // Don't show expired schedules
    filter.$or = [
      { endDate: { $exists: false } },
      { endDate: { $gte: new Date() } }
    ];
    
    const shiftSchedules = await ShiftSchedule.find(filter)
      .populate('location', 'address city timezone')
      .populate('manager', 'firstName lastName email')
      .populate('assignedStaff', 'designation')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit);
    
    // Convert to local timezone if requested
    const processedSchedules = timezone 
      ? shiftSchedules.map((schedule: { toLocalShiftSchedule: () => Record<string, unknown> }) => schedule.toLocalShiftSchedule())
      : shiftSchedules;
    
    const total = await ShiftSchedule.countDocuments(filter);
    
    return NextResponse.json({
      success: true,
      data: processedSchedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching shift schedules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shift schedules' },
      { status: 500 }
    );
  }
}

// POST create new shift schedule (managers only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URL!);
    
    const body = await request.json();
    const { 
      location, 
      title, 
      description, 
      startTime, 
      endTime, 
      workDays, 
      timezone, 
      requiredSkills, 
      headcount, 
      assignedStaff,
      startDate,
      endDate 
    } = body;
    
    // Validate required fields
    if (!location || !title || !startTime || !endTime || !workDays || !Array.isArray(workDays) || workDays.length === 0 || !timezone || !headcount) {
      return NextResponse.json(
        { success: false, error: 'Location, title, start time, end time, work days, timezone, and headcount are required' },
        { status: 400 }
      );
    }
    
    // Validate workDays values
    const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const invalidDays = workDays.filter((day: string) => !validDays.includes(day));
    if (invalidDays.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid work days: ${invalidDays.join(', ')}. Use: ${validDays.join(', ')}` },
        { status: 400 }
      );
    }
    
    // For managers, automatically use their managed location if not specified
    if (user.role === 'manager' && !location) {
      // Get the first location managed by this manager
      const managedLocation = await Location.findOne({ manager: user._id });
      if (!managedLocation) {
        return NextResponse.json(
          { success: false, error: 'No managed locations found for this manager' },
          { status: 404 }
        );
      }
      
      // Use the managed location
      body.location = managedLocation._id;
    }
    
    // Validate assigned staff if provided
    if (assignedStaff && Array.isArray(assignedStaff) && assignedStaff.length > 0) {
      for (const staffId of assignedStaff) {
        const staff = await Staff.findById(staffId).populate('user', 'firstName lastName email designation');
        if (!staff) {
          return NextResponse.json(
            { success: false, error: `Staff member not found: ${staffId}` },
            { status: 404 }
          );
        }
        
        // Check if staff has required skills (basic validation for now)
        // This would need to be enhanced with actual skill matching
        
        // Check if staff work hours align with shift (basic validation)
        // This would need to be enhanced with actual work hour checking
      }
    }
    
    // Create shift schedule
    const shiftScheduleData: Record<string, unknown> = {
      location,
      manager: user._id,
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      workDays,
      timezone,
      requiredSkills: requiredSkills || [],
      headcount,
      assignedStaff: assignedStaff || [],
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined
    };
    
    const shiftSchedule = await ShiftSchedule.create(shiftScheduleData);
    
    await shiftSchedule.populate('location', 'address city timezone');
    await shiftSchedule.populate('manager', 'firstName lastName email');
    await shiftSchedule.populate('assignedStaff', 'designation');
    
    // Send Notifications
    try {
      const adminId = user._id as mongoose.Types.ObjectId;
      const shiftId = shiftSchedule._id as mongoose.Types.ObjectId;
      const locationDoc = shiftSchedule.location as any;
      const locationId = locationDoc._id as mongoose.Types.ObjectId;
      const locationAddress = locationDoc.address || 'assigned location';

      // 1. Notify Admins
      await NotificationService.createAdminNotification({
        type: 'shift_assigned',
        title: 'New Shift Schedule Created',
        message: `Manager ${user.firstName} created a new shift: "${title}" at ${locationAddress}.`,
        location: locationId,
        relatedEntity: { type: 'shift', id: shiftId },
        sender: adminId
      });

      // 2. Notify Assigned Staff
      if (assignedStaff && assignedStaff.length > 0) {
        // We need to notify the users associated with these staff records
        const staffDocs = await Staff.find({ _id: { $in: assignedStaff } }).populate('user');
        const userIds = staffDocs.map(s => {
          const staffUser = s.user as any;
          return staffUser._id as mongoose.Types.ObjectId;
        });

        await NotificationService.createBulkNotifications({
          type: 'shift_assigned',
          title: 'You Have Been Assigned to a New Shift',
          message: `You've been assigned to: ${title} at ${locationAddress}.`,
          location: locationId,
          relatedEntity: { type: 'shift', id: shiftId },
          sender: adminId,
          priority: 'high'
        }, userIds);
      }
    } catch (err) {
      console.error('Failed to send shift creation notifications:', err);
    }
    
    return NextResponse.json({
      success: true,
      data: shiftSchedule
    }, { status: 201 });
    
  } catch (error: unknown) {
    console.error('Error creating shift schedule:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Start time must be before end time') || 
          error.message.includes('End time must be after start time')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create shift schedule' },
      { status: 500 }
    );
  }
}
