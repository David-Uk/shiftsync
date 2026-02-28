import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Location from '@/models/Location';
import ShiftSchedule from '@/models/ShiftSchedule';
import Staff from '@/models/Staff';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (auth.error) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    await connectToDatabase();
    const user = auth.user!; // We know user exists if auth passes

    // Base stats for all roles
    const baseStats = {
      totalShifts: 0,
      hoursThisWeek: 0,
      pendingRequests: 0,
    };

    let roleSpecificStats: Record<string, any> = {};

    if (user.role === 'admin') {
      // Admin sees all locations, users, schedules
      const [totalUsers, totalLocations, totalSchedules] = await Promise.all([
        User.countDocuments({ isArchived: false }),
        Location.countDocuments({}),
        ShiftSchedule.countDocuments({ isActive: true }),
      ]);

      const activeUsers = await User.countDocuments({ isArchived: false, role: { $in: ['staff', 'manager'] } });
      const totalStaff = await Staff.countDocuments({ status: 'active' });

      roleSpecificStats = {
        totalUsers,
        activeUsers,
        totalLocations,
        totalSchedules,
        totalStaff,
        usersByRole: await User.aggregate([
          { $match: { isArchived: false } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]),
      };
    } else if (user.role === 'manager') {
      // Manager sees their locations and staff working there
      const managedLocations = await Location.find({ manager: user._id });
      const locationIds = managedLocations.map(loc => loc._id);

      const [totalSchedules, staffAtLocations] = await Promise.all([
        ShiftSchedule.countDocuments({ 
          location: { $in: locationIds },
          isActive: true 
        }),
        Staff.countDocuments({ 
          user: { $in: await Staff.find({ status: 'active' }).distinct('user') }
        }),
      ]);

      roleSpecificStats = {
        managedLocations: managedLocations.length,
        totalSchedules,
        staffAtLocations,
        locations: managedLocations.map(loc => ({
          _id: loc._id.toString(),
          address: loc.address,
          city: loc.city,
          timezone: loc.timezone,
        })),
      };
    } else if (user.role === 'staff') {
      // Staff sees their personal stats
      const staffRecord = await Staff.findOne({ user: user._id });
      
      if (staffRecord) {
        const [assignedShifts, completedShifts] = await Promise.all([
          ShiftSchedule.countDocuments({ 
            assignedStaff: user._id,
            isActive: true 
          }),
          // This would need enhancement to track completed shifts
          ShiftSchedule.countDocuments({ 
            assignedStaff: user._id,
            isActive: true,
            endTime: { $lt: new Date() }
          }),
        ]);

        roleSpecificStats = {
          assignedShifts,
          completedShifts,
          status: staffRecord.status,
          designation: staffRecord.designation,
        };
      }
    }

    // Calculate common stats
    let totalShifts = 0;
    let hoursThisWeek = 0;

    if (user.role === 'admin') {
      totalShifts = roleSpecificStats.totalSchedules;
      // Calculate hours for all active schedules this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekSchedules = await ShiftSchedule.find({
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [
          { endDate: { $gte: weekStart } },
          { endDate: { $exists: false } }
        ]
      });

      hoursThisWeek = weekSchedules.reduce((total, schedule) => {
        const duration = schedule.endTime.getTime() - schedule.startTime.getTime();
        return total + (duration / (1000 * 60 * 60)); // Convert to hours
      }, 0);
    } else if (user.role === 'manager') {
      totalShifts = roleSpecificStats.totalSchedules;
      // Similar calculation for manager's locations
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const locationIds = roleSpecificStats.locations?.map((loc: any) => loc._id) || [];
      const weekSchedules = await ShiftSchedule.find({
        location: { $in: locationIds },
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [
          { endDate: { $gte: weekStart } },
          { endDate: { $exists: false } }
        ]
      });

      hoursThisWeek = weekSchedules.reduce((total, schedule) => {
        const duration = schedule.endTime.getTime() - schedule.startTime.getTime();
        return total + (duration / (1000 * 60 * 60));
      }, 0);
    } else {
      totalShifts = roleSpecificStats.assignedShifts || 0;
      // For staff, calculate their assigned shifts this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekSchedules = await ShiftSchedule.find({
        assignedStaff: user._id,
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [
          { endDate: { $gte: weekStart } },
          { endDate: { $exists: false } }
        ]
      });

      hoursThisWeek = weekSchedules.reduce((total, schedule) => {
        const duration = schedule.endTime.getTime() - schedule.startTime.getTime();
        return total + (duration / (1000 * 60 * 60));
      }, 0);
    }

    return NextResponse.json({
      message: 'Stats retrieved successfully',
      stats: {
        ...baseStats,
        totalShifts,
        hoursThisWeek: Math.round(hoursThisWeek * 10) / 10, // Round to 1 decimal
        pendingRequests: 0, // Would need enhancement for leave requests
        ...roleSpecificStats,
      },
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: errorMessage 
    }, { status: 500 });
  }
}
