import Schedule from "@/models/Schedule";
import ShiftSchedule from "@/models/ShiftSchedule";
import Staff from "@/models/Staff";
import User from "@/models/User";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    await mongoose.connect(process.env.MONGODB_URL!);
    const user = await User.findById(decoded.userId);

    if (!user || (user.role !== "manager" && user.role !== "admin")) {
      return null;
    }

    return user;
  } catch {
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

    await mongoose.connect(process.env.MONGODB_URL!);

    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const workDaysStr = searchParams.get("workDays");

    // Validate required parameters
    if (!location || !startTime || !endTime || !workDaysStr) {
      return NextResponse.json(
        {
          success: false,
          error: "Location, startTime, endTime, and workDays are required",
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

    const shiftStartMinutes = getTimeOfDay(startTime);
    const shiftEndMinutes = getTimeOfDay(endTime);

    // Fetch all staff members
    const allStaff = await Staff.find({ status: "active" })
      .populate("user", "firstName lastName email role")
      .sort({ "user.firstName": 1 });

    // Filter staff that have schedules fitting the shift time/days
    const availableStaff = [];

    for (const staff of allStaff) {
      // Get staff's schedules
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
            // The shift should fall completely within the schedule window
            if (
              shiftStartMinutes < scheduleStartMinutes ||
              shiftEndMinutes > scheduleEndMinutes
            ) {
              schedulesFitTimeSlot = false;
              break;
            }
          }
        }
      }

      // Check if staff is already assigned to another shift at this location
      const existingShiftAssignments = await ShiftSchedule.findOne({
        assignedStaff: staff._id,
        location: location,
        isActive: true,
      });

      // Check if staff is assigned to shifts at other locations
      const otherLocationAssignments = await ShiftSchedule.findOne({
        assignedStaff: staff._id,
        location: { $ne: location },
        isActive: true,
      });

      if (
        hasScheduleOnWorkDays &&
        schedulesFitTimeSlot &&
        !existingShiftAssignments &&
        !otherLocationAssignments
      ) {
        availableStaff.push(staff);
      }
    }

    return NextResponse.json({
      success: true,
      data: availableStaff,
      count: availableStaff.length,
    });
  } catch (error: unknown) {
    console.error("Error fetching available staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch available staff" },
      { status: 500 },
    );
  }
}
