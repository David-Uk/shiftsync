import { getAuthenticatedUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import ShiftSchedule from "@/models/ShiftSchedule";
import Schedule from "@/models/Schedule";
import Staff from "@/models/Staff";
import Location from "@/models/Location";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const startTime = searchParams.get("startTime"); // HH:mm
    const endTime = searchParams.get("endTime");     // HH:mm
    const workDaysStr = searchParams.get("workDays");
    const designation = searchParams.get("designation");
    const locationId = searchParams.get("location");

    if (!startTime || !endTime || !workDaysStr || !designation || !locationId) {
      return NextResponse.json(
        {
          success: false,
          error: "startTime, endTime, workDays, designation, and location are required",
        },
        { status: 400 },
      );
    }

    const workDays = workDaysStr.split(",").map((d) => d.trim());
    const location = await Location.findById(locationId);
    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    const shiftTimezone = location.timezone;

    // Helper: Convert HH:mm to Date (today) in specific timezone
    const parseTimeToDate = (timeStr: string, date: Date = new Date()) => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const d = new Date(date);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    const requestedStartTime = parseTimeToDate(startTime);
    const requestedEndTime = parseTimeToDate(endTime);
    const endTimeCopy = new Date(requestedEndTime);
    if (endTimeCopy <= requestedStartTime) {
      endTimeCopy.setDate(endTimeCopy.getDate() + 1);
    }

    // Fetch all active staff with matching designation
    const allStaff = await Staff.find({
      status: "active",
      designation: { $regex: new RegExp(`^${designation}$`, "i") },
    }).populate("user", "firstName lastName").lean();

    const availableStaff = [];
    const unavailableStaff = [];

    // Fetch existing assignments for conflict and rest-period checks
    const existingShiftSchedules = await ShiftSchedule.find({
      isActive: true,
      workDays: { $in: workDays }
    }).lean();

    const existingSchedules = await Schedule.find({
      isPublished: true,
      $or: [
        { isOneOff: false, workDays: { $in: workDays } },
        { isOneOff: true }
      ]
    }).lean();

    interface StaffWithWorkHours {
      _id: string;
      user: { firstName: string; lastName: string };
      standardWorkHours?: {
        startTime: string;
        endTime: string;
        timezone: string;
      };
      designation: string;
    }

    for (const staff of allStaff as unknown as StaffWithWorkHours[]) {
      const staffIdStr = staff._id.toString();
      let isAvailable = true;
      let reason = "";
      const conflicts: Array<{
        locationName: string;
        startTime: Date;
        endTime: Date;
        workDays: string[];
      }> = [];

      // 1. Check Standard Work Hours (if defined)
      if (staff.standardWorkHours && staff.standardWorkHours.startTime) {
        // Convert staff's work hours to shift's timezone
        const staffTz = staff.standardWorkHours.timezone || 'UTC';
        
        const staffLocalStart = parseTimeToDate(staff.standardWorkHours.startTime);
        const staffLocalEnd = parseTimeToDate(staff.standardWorkHours.endTime);
        if (staffLocalEnd <= staffLocalStart) staffLocalEnd.setDate(staffLocalEnd.getDate() + 1);

        const ShiftScheduleModel = ShiftSchedule as any; // Using any for static call if TS is being difficult, but ideally we'd have the type
        const staffUtcStart = ShiftScheduleModel.toUTC(staffLocalStart, staffTz);
        const staffUtcEnd = ShiftScheduleModel.toUTC(staffLocalEnd, staffTz);
        
        const shiftLocalAvailableStart = ShiftScheduleModel.toLocalTime(staffUtcStart, shiftTimezone);
        const shiftLocalAvailableEnd = ShiftScheduleModel.toLocalTime(staffUtcEnd, shiftTimezone);

        const shiftFits = (requestedStartTime.getHours() * 60 + requestedStartTime.getMinutes()) >= (shiftLocalAvailableStart.getHours() * 60 + shiftLocalAvailableStart.getMinutes()) &&
                          (endTimeCopy.getHours() * 60 + endTimeCopy.getMinutes()) <= (shiftLocalAvailableEnd.getHours() * 60 + shiftLocalAvailableEnd.getMinutes());

        if (!shiftFits) {
          isAvailable = false;
          reason = `Work hours mismatch (${staff.standardWorkHours.startTime}-${staff.standardWorkHours.endTime} ${staffTz})`;
        }
      }

      if (!isAvailable) {
        unavailableStaff.push({ ...staff, status: "schedule_mismatch", reason });
        continue;
      }

      // 2. Check Overlaps and 10-hour Rest Rule in ShiftSchedules
      for (const schedule of existingShiftSchedules) {
        const assignedStaffStrings = schedule.assignedStaff.map(id => id.toString());
        if (assignedStaffStrings.includes(staffIdStr)) {
          const sStart = schedule.startTime;
          const sEnd = schedule.endTime;
          
          if (requestedStartTime < sEnd && endTimeCopy > sStart) {
            isAvailable = false;
            reason = "Overlapping shift assignment";
            conflicts.push({
              locationName: (schedule.location as any)?.city || "Assigned Location",
              startTime: sStart,
              endTime: sEnd,
              workDays: schedule.workDays
            });
            break;
          }

          const gapBefore = (requestedStartTime.getTime() - sEnd.getTime()) / (1000 * 60 * 60);
          const gapAfter = (sStart.getTime() - endTimeCopy.getTime()) / (1000 * 60 * 60);
          
          if ((gapBefore > 0 && gapBefore < 10) || (gapAfter > 0 && gapAfter < 10)) {
            isAvailable = false;
            reason = "10-hour rest rule violation";
            conflicts.push({
              locationName: (schedule.location as any)?.city || "Assigned Location",
              startTime: sStart,
              endTime: sEnd,
              workDays: schedule.workDays
            });
            break;
          }
        }
      }

      // 3. Check Overlaps and 10-hour Rest Rule in general Schedules
      if (isAvailable) {
        for (const schedule of existingSchedules) {
          if (schedule.staff.toString() === staffIdStr) {
            const sStart = schedule.startTime;
            const sEnd = schedule.endTime;
            
            if (requestedStartTime < sEnd && endTimeCopy > sStart) {
              isAvailable = false;
              reason = "Overlapping personal schedule";
              conflicts.push({
                locationName: "Personal Schedule",
                startTime: sStart,
                endTime: sEnd,
                workDays: schedule.workDays
              });
              break;
            }

            const gapBefore = (requestedStartTime.getTime() - sEnd.getTime()) / (1000 * 60 * 60);
            const gapAfter = (sStart.getTime() - endTimeCopy.getTime()) / (1000 * 60 * 60);
            
            if ((gapBefore > 0 && gapBefore < 10) || (gapAfter > 0 && gapAfter < 10)) {
              isAvailable = false;
              reason = "10-hour rest rule violation (Personal)";
              conflicts.push({
                locationName: "Personal Schedule",
                startTime: sStart,
                endTime: sEnd,
                workDays: schedule.workDays
              });
              break;
            }
          }
        }
      }

      if (isAvailable) {
        availableStaff.push({ ...staff, status: "available" });
      } else {
        unavailableStaff.push({ ...staff, status: "conflict", reason, conflictingAssignments: conflicts });
      }
    }

    return NextResponse.json({
      success: true,
      data: { available: availableStaff, unavailable: unavailableStaff },
      count: { available: availableStaff.length, unavailable: unavailableStaff.length },
    });
  } catch (error: unknown) {
    console.error("Error fetching available staff:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch available staff" },
      { status: 500 },
    );
  }
}
