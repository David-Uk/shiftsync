import { verifyAuth } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { createNotificationForEvent } from "@/lib/notificationMiddleware";
import Schedule from "@/models/Schedule";
import Staff from "@/models/Staff";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user!;
    const { id } = await params;

    console.log("Publish endpoint called with ID:", id);
    console.log("ID type:", typeof id);
    console.log("ID length:", id.length);

    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log("Invalid ObjectId format for ID:", id);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid schedule ID",
          message: `Invalid schedule ID format: ${id}`,
        },
        { status: 400 },
      );
    }

    // Helper logic to get staff record
    let staff = await Staff.findOne({ user: user._id });
    if (!staff && (user.role === "staff" || user.role === "manager")) {
      staff = new Staff({
        user: user._id,
        designation:
          user.designation ||
          (user.role === "manager" ? "Manager" : "Staff Member"),
        status: "active",
      });
      await staff.save();
    }

    if (!staff) {
      return NextResponse.json(
        {
          success: false,
          error: "Staff record not found",
          message: "Staff record not found",
        },
        { status: 404 },
      );
    }

    // Fetch the schedule to be published
    const schedule = await Schedule.findById(id);

    if (!schedule) {
      return NextResponse.json(
        {
          success: false,
          error: "Schedule not found",
          message: "Schedule not found",
        },
        { status: 404 },
      );
    }

    // Check authorization:
    // - Staff can only publish their own schedules
    // - Managers and admins can publish any schedule
    if (user.role === "staff") {
      // For staff users, verify the schedule belongs to them
      const scheduleStaffId = schedule.staff.toString();
      const userStaffId = staff._id.toString();

      if (scheduleStaffId !== userStaffId) {
        return NextResponse.json(
          {
            success: false,
            error: "You are not authorized to publish this schedule",
            message: "Unauthorized",
          },
          { status: 403 },
        );
      }
    } else if (user.role !== "manager" && user.role !== "admin") {
      // Only staff, managers, and admins can publish schedules
      return NextResponse.json(
        {
          success: false,
          error: "You do not have permission to publish schedules",
          message: "Forbidden",
        },
        { status: 403 },
      );
    }

    if (schedule.isPublished) {
      return NextResponse.json(
        {
          success: false,
          error: "Schedule is already published",
          message: "Schedule is already published",
        },
        { status: 400 },
      );
    }

    schedule.isPublished = true;
    await schedule.save();

    // Populate to get the staff user ID
    await schedule.populate("staff", "user");
    const staffUserId = (schedule.staff as any).user.toString();

    // Create notification for the staff member about their published schedule
    await createNotificationForEvent(
      request,
      "schedule_published",
      {
        scheduleId: schedule._id.toString(),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isOneOff: schedule.isOneOff,
      },
      [staffUserId],
    );

    return NextResponse.json({
      success: true,
      message: "Schedule published successfully",
      schedule,
    });
  } catch (error: any) {
    console.error("Error publishing schedule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to publish schedule",
        message: error.message || "Failed to publish schedule",
      },
      { status: 500 },
    );
  }
}
