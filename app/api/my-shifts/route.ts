import { getAuthenticatedUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import ShiftSchedule from "@/models/ShiftSchedule";
import Staff from "@/models/Staff";
import { NextRequest, NextResponse } from "next/server";

// GET assigned shift schedules for staff
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const timezone = searchParams.get("timezone");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const skip = (page - 1) * limit;

    // Get staff record for this user, auto-create if missing
    let staff = await Staff.findOne({ user: user._id });
    if (!staff) {
      // Auto-create staff record if it doesn't exist
      staff = new Staff({
        user: user._id,
        designation: user.designation || (user.role === 'manager' ? 'Manager' : 'Staff Member'),
        status: 'active'
      });
      await staff.save();
    }

    // Build filter for assigned shifts
    const filter: Record<string, unknown> = {
      assignedStaff: staff._id,
      isActive: true,
    };

    // Don't show expired schedules
    filter.$or = [
      { endDate: { $exists: false } },
      { endDate: { $gte: new Date() } },
    ];

    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) {
        (filter.startDate as Record<string, unknown>)["$gte"] = new Date(
          startDate,
        );
      }
      if (endDate) {
        (filter.startDate as Record<string, unknown>)["$lte"] = new Date(
          endDate,
        );
      }
    }

    if (activeOnly) {
      filter.startTime = { $lte: new Date() };
      filter.endTime = { $gte: new Date() };
    }

    const shiftSchedules = await ShiftSchedule.find(filter)
      .populate("location", "address city timezone")
      .populate("manager", "firstName lastName email")
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limit);

    // Convert to local timezone if requested
    const processedSchedules = timezone
      ? shiftSchedules.map((schedule) => schedule.toLocalShiftSchedule())
      : shiftSchedules;

    const total = await ShiftSchedule.countDocuments(filter);

    return NextResponse.json({
      success: true,
      data: processedSchedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching assigned shifts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch assigned shifts" },
      { status: 500 },
    );
  }
}
