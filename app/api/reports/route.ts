import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Location from '@/models/Location';
import ShiftSchedule from '@/models/ShiftSchedule';
import Schedule from '@/models/Schedule';

// GET /api/reports - Get comprehensive reports with role-based access
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const user = auth.user!;
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'overview';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const locationId = searchParams.get('location');

    // Get user's location if they're a manager
    let userLocation = undefined;
    if (user.role === 'manager') {
      const location = await Location.findOne({ manager: user._id });
      userLocation = location?._id;
    }

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    let data = {};

    switch (reportType) {
      case 'overview':
        data = await getOverviewReport(user, userLocation, dateFilter, locationId);
        break;
      case 'users':
        data = await getUsersReport(user, userLocation, locationId);
        break;
      case 'shifts':
        data = await getShiftsReport(user, userLocation, dateFilter, locationId);
        break;
      case 'schedules':
        data = await getSchedulesReport(user, userLocation, dateFilter, locationId);
        break;
      case 'locations':
        data = await getLocationsReport(user, userLocation, locationId);
        break;
      case 'attendance':
        data = await getAttendanceReport(user, userLocation, dateFilter, locationId);
        break;
      default:
        data = await getOverviewReport(user, userLocation, dateFilter, locationId);
    }

    return NextResponse.json({
      success: true,
      data,
      userRole: user.role,
      reportType,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating reports:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getOverviewReport(user: any, userLocation: any, dateFilter: any, locationId?: string | null) {
  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  // User counts by role
  const userCounts = await User.aggregate([
    ...(locationFilter ? [{ $match: { location: locationFilter } }] : []),
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);

  // Shift counts
  const shiftCounts = await ShiftSchedule.aggregate([
    ...(dateFilter.createdAt ? [{ $match: { createdAt: dateFilter.createdAt } }] : []),
    ...(locationFilter ? [{ $match: { location: locationFilter } }] : []),
    {
      $group: {
        _id: null,
        totalShifts: { $sum: 1 },
        completedShifts: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelledShifts: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      }
    }
  ]);

  // Schedule statistics
  const scheduleStats = await Schedule.aggregate([
    ...(dateFilter.createdAt ? [{ $match: { createdAt: dateFilter.createdAt } }] : []),
    ...(locationFilter ? [{ $match: { location: locationFilter } }] : []),
    {
      $group: {
        _id: null,
        totalSchedules: { $sum: 1 },
        activeSchedules: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      }
    }
  ]);

  // Location count (admin only)
  let locationCount = 0;
  if (user.role === 'admin') {
    locationCount = await Location.countDocuments(locationFilter ? { _id: locationFilter } : {});
  }

  return {
    summary: {
      totalUsers: userCounts.reduce((sum: any, item: any) => sum + item.count, 0),
      totalShifts: shiftCounts[0]?.totalShifts || 0,
      totalSchedules: scheduleStats[0]?.totalSchedules || 0,
      totalLocations: locationCount,
    },
    userBreakdown: userCounts,
    shiftBreakdown: shiftCounts[0] || {},
    scheduleBreakdown: scheduleStats[0] || {},
  };
}

async function getUsersReport(user: any, userLocation: any, locationId?: string | null) {
  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  const users = await User.find(
    locationFilter ? { location: locationFilter } : {},
    'firstName lastName email role status createdAt location'
  ).populate('location', 'name address');

  const userStats = users.reduce((acc: any, user: any) => {
    acc.total++;
    acc.byRole[user.role] = (acc.byRole[user.role] || 0) + 1;
    acc.byStatus[user.status] = (acc.byStatus[user.status] || 0) + 1;
    return acc;
  }, { total: 0, byRole: {}, byStatus: {} });

  return {
    users,
    stats: userStats,
  };
}

async function getShiftsReport(user: any, userLocation: any, dateFilter: any, locationId?: string | null) {
  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  const matchFilter: any = {};
  if (dateFilter.createdAt) matchFilter.createdAt = dateFilter.createdAt;
  if (locationFilter) matchFilter.location = locationFilter;
  if (user.role === 'staff') matchFilter.staff = user._id;

  const shifts = await ShiftSchedule.find(matchFilter)
    .populate('staff', 'firstName lastName email')
    .populate('location', 'name address')
    .sort({ createdAt: -1 });

  const shiftStats = shifts.reduce((acc: any, shift: any) => {
    acc.total++;
    acc.byStatus[shift.status] = (acc.byStatus[shift.status] || 0) + 1;
    acc.byType[shift.shiftType] = (acc.byType[shift.shiftType] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {}, byType: {} });

  return {
    shifts,
    stats: shiftStats,
  };
}

async function getSchedulesReport(user: any, userLocation: any, dateFilter: any, locationId?: string | null) {
  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  const matchFilter: any = {};
  if (dateFilter.createdAt) matchFilter.createdAt = dateFilter.createdAt;
  if (locationFilter) matchFilter.location = locationFilter;
  if (user.role === 'staff') matchFilter.staff = user._id;

  const schedules = await Schedule.find(matchFilter)
    .populate('staff', 'firstName lastName email')
    .populate('location', 'name address')
    .sort({ createdAt: -1 });

  const scheduleStats = schedules.reduce((acc: any, schedule: any) => {
    acc.total++;
    acc.byStatus[schedule.status] = (acc.byStatus[schedule.status] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {} });

  return {
    schedules,
    stats: scheduleStats,
  };
}

async function getLocationsReport(user: any, userLocation: any, locationId?: string | null) {
  if (user.role === 'staff') {
    return { locations: [], message: 'Staff cannot access location reports' };
  }

  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  const locations = await Location.find(
    locationFilter ? { _id: locationFilter } : {}
  ).populate('manager', 'firstName lastName email');

  // Get staff count per location
  const locationStats = await Promise.all(
    locations.map(async (location: any) => {
      const staffCount = await User.countDocuments({ location: location._id });
      const shiftCount = await ShiftSchedule.countDocuments({ location: location._id });
      
      return {
        location,
        staffCount,
        shiftCount,
      };
    })
  );

  return {
    locations: locationStats,
  };
}

async function getAttendanceReport(user: any, userLocation: any, dateFilter: any, locationId?: string | null) {
  const locationFilter = user.role === 'admin' && locationId ? locationId : userLocation;
  
  const matchFilter: any = {};
  if (dateFilter.createdAt) matchFilter.createdAt = dateFilter.createdAt;
  if (locationFilter) matchFilter.location = locationFilter;
  if (user.role === 'staff') matchFilter.staff = user._id;

  const shifts = await ShiftSchedule.find(matchFilter)
    .populate('staff', 'firstName lastName email')
    .populate('location', 'name address')
    .sort({ date: -1 });

  const attendanceStats = shifts.reduce((acc: any, shift: any) => {
    acc.totalShifts++;
    if (shift.status === 'completed') {
      acc.completedShifts++;
      acc.totalHours += (shift.duration || 0);
    } else if (shift.status === 'cancelled') {
      acc.cancelledShifts++;
    }
    return acc;
  }, { totalShifts: 0, completedShifts: 0, cancelledShifts: 0, totalHours: 0 });

  return {
    attendance: shifts,
    stats: attendanceStats,
  };
}
