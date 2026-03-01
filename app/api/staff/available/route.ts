import connectToDatabase from "@/lib/mongodb";
import Schedule from "@/models/Schedule";
import ShiftSchedule from "@/models/ShiftSchedule";
import Staff from "@/models/Staff";
import User from "@/models/User";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    console.log("Auth header:", authHeader ? "Present" : "Missing");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Bearer token found");
      return null;
    }

    const token = authHeader.substring(7);
    console.log("Token length:", token.length);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };
    console.log("Token decoded, userId:", decoded.userId);

    await connectToDatabase();
    const user = await User.findById(decoded.userId);
    console.log("User found:", user ? "Yes" : "No");
    console.log("User role:", user?.role);

    if (!user) {
      console.log("User not found in database");
      return null;
    }

    // Temporarily allow all authenticated users for debugging
    console.log("User role:", user?.role, "- allowing access for debugging");

    // Original role check - uncomment after debugging
    // if (user.role !== "manager" && user.role !== "admin") {
    //   console.log('Authentication failed - user role:', user.role);
    //   return null;
    // }

    console.log("Authentication successful for role:", user?.role);
    return user;
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

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
    const location = searchParams.get("location");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const workDaysStr = searchParams.get("workDays");
    const designation = searchParams.get("designation");

    console.log("Available staff request params:", {
      location,
      startTime,
      endTime,
      workDays: workDaysStr,
      designation,
      userRole: user.role,
    });

    // Validate required parameters - location is optional now
    if (!startTime || !endTime || !workDaysStr) {
      return NextResponse.json(
        {
          success: false,
          error: "startTime, endTime, and workDays are required",
        },
        { status: 400 },
      );
    }

    const workDays = workDaysStr.split(",").map((d) => d.trim());

    // Helper function to extract time of day from time string (HH:MM format)
    const getTimeOfDay = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes; // Convert to minutes for easier comparison
    };

    // Helper function to check if two time ranges overlap
    const timeRangesOverlap = (
      start1: number,
      end1: number,
      start2: number,
      end2: number,
    ): boolean => {
      // Two ranges overlap if one starts before the other ends
      return start1 < end2 && start2 < end1;
    };

    const shiftStartMinutes = getTimeOfDay(startTime);
    const shiftEndMinutes = getTimeOfDay(endTime);

    // Fetch all staff members - filter by designation if provided
    const staffQuery: { status: string; designation?: string } = {
      status: "active",
    };
    if (designation) {
      staffQuery.designation = designation;
    }

    console.log("Staff query:", staffQuery);

    const allStaff = await Staff.find(staffQuery)
      .populate("user", "firstName lastName email role")
      .lean()
      .sort({ "user.firstName": 1 });

    console.log("Found staff count:", allStaff.length);

    // Filter staff that have schedules fitting the shift time/days
    const availableStaff = [];
    const unavailableStaff = [];

    for (const staff of allStaff) {
      // Get staff's published schedules
      const staffSchedules = await Schedule.find({
        staff: staff._id,
        isPublished: true,
      });

      // Check if staff has schedules on the required work days
      let hasScheduleOnWorkDays = false;
      let schedulesFitTimeSlot = true;

      for (const schedule of staffSchedules) {
        const scheduleWorkDays = schedule.workDays || [];

        // Check if schedule covers the required work days
        const coveringDays = workDays.filter((day) =>
          scheduleWorkDays.includes(day),
        );

        if (coveringDays.length > 0) {
          hasScheduleOnWorkDays = true;

          // For recurring schedules, check time fit
          if (!schedule.isOneOff && schedule.startTime && schedule.endTime) {
            // Extract time of day from schedule times
            const scheduleStartStr =
              schedule.startTime instanceof Date
                ? schedule.startTime.toTimeString().slice(0, 5)
                : String(schedule.startTime).padStart(5, "0");
            const scheduleEndStr =
              schedule.endTime instanceof Date
                ? schedule.endTime.toTimeString().slice(0, 5)
                : String(schedule.endTime).padStart(5, "0");

            const scheduleStartMinutes = getTimeOfDay(scheduleStartStr);
            const scheduleEndMinutes = getTimeOfDay(scheduleEndStr);

            // Check if shift time fits within schedule time window
            // Staff schedule should start before or at shift start time
            // and end after or at shift end time
            if (
              scheduleStartMinutes > shiftStartMinutes ||
              scheduleEndMinutes < shiftEndMinutes
            ) {
              schedulesFitTimeSlot = false;
              break;
            }
          }
        }
      }

      // Check if staff is assigned to shifts at any location with overlapping times
      const existingShiftAssignments = await ShiftSchedule.find({
        assignedStaff: staff._id,
        isActive: true,
        location: { $ne: location }, // Different location
      }).populate("location", "name address");

      // Check for time conflicts with other location assignments
      let hasTimeConflict = false;
      const conflictingAssignments = [];

      for (const assignment of existingShiftAssignments) {
        // Check if any of the required work days overlap with assignment days
        const dayOverlap = workDays.some((day) =>
          assignment.workDays.includes(day),
        );

        if (dayOverlap) {
          // Get assignment times
          const assignmentStartStr =
            assignment.startTime instanceof Date
              ? assignment.startTime.toTimeString().slice(0, 5)
              : String(assignment.startTime).padStart(5, "0");
          const assignmentEndStr =
            assignment.endTime instanceof Date
              ? assignment.endTime.toTimeString().slice(0, 5)
              : String(assignment.endTime).padStart(5, "0");

          const assignmentStartMinutes = getTimeOfDay(assignmentStartStr);
          const assignmentEndMinutes = getTimeOfDay(assignmentEndStr);

          // Check if time ranges overlap
          if (
            timeRangesOverlap(
              shiftStartMinutes,
              shiftEndMinutes,
              assignmentStartMinutes,
              assignmentEndMinutes,
            )
          ) {
            hasTimeConflict = true;
            const locationData = assignment.location as any;
            conflictingAssignments.push({
              locationName:
                locationData?.name || locationData?.address || "Unknown",
              startTime: assignmentStartStr,
              endTime: assignmentEndStr,
              workDays: assignment.workDays,
            });
          }
        }
      }

      // Only add to available if no conflicts and has required schedule
      if (hasScheduleOnWorkDays && schedulesFitTimeSlot && !hasTimeConflict) {
        availableStaff.push({
          ...staff,
          status: "available",
          currentAssignments: existingShiftAssignments.map((assignment) => ({
            location: assignment.location,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            workDays: assignment.workDays,
          })),
        });
      } else if (hasScheduleOnWorkDays) {
        // Staff has valid schedule but is unavailable (not conflicting with other location)
        unavailableStaff.push({
          ...staff,
          status: hasTimeConflict ? "conflict" : "schedule_mismatch",
          reason: hasTimeConflict
            ? "Assigned to another location with overlapping times"
            : "Schedule doesn't match the required shift times",
          conflictingAssignments,
          currentAssignments: existingShiftAssignments.map((assignment) => ({
            location: assignment.location,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            workDays: assignment.workDays,
          })),
        });
      }
    }

    console.log("Available staff count:", availableStaff.length);
    console.log("Available staff details count:", availableStaff.length);
    console.log("Unavailable staff count:", unavailableStaff.length);

    return NextResponse.json({
      success: true,
      data: {
        available: availableStaff,
        unavailable: unavailableStaff,
      },
      count: {
        available: availableStaff.length,
        unavailable: unavailableStaff.length,
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching available staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch available staff" },
      { status: 500 },
    );
  }
}
