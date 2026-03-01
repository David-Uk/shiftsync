import { verifyAuth } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { createNotificationForEvent } from "@/lib/notificationMiddleware";
import Schedule from "@/models/Schedule";
import Staff from "@/models/Staff";
import User from "@/models/User";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Helper function to get staff record for authenticated user
async function getUserStaffRecord(userId: string) {
  let staff = await Staff.findOne({ user: userId });
  if (!staff) {
    // Check if user exists and has a role that requires a staff record
    const user = await User.findById(userId);
    if (user && (user.role === "staff" || user.role === "manager")) {
      staff = new Staff({
        user: userId,
        designation:
          user.designation ||
          (user.role === "manager" ? "Manager" : "Staff Member"),
        status: "active",
      });
      await staff.save();
    } else {
      throw new Error("Staff record not found for this user");
    }
  }
  return staff;
}

// GET a single schedule
export async function GET(
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
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid schedule ID" },
        { status: 400 },
      );
    }

    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());

    const schedule = await Schedule.findOne({
      _id: id,
      staff: staff._id,
    }).populate("location", "address city timezone");

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    // Convert to local timezone if requested
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get("timezone");
    const processedSchedule = timezone ? schedule.toLocalSchedule() : schedule;

    return NextResponse.json({
      success: true,
      data: processedSchedule,
    });
  } catch (error: unknown) {
    console.error("Error fetching schedule:", error);

    if (
      error instanceof Error &&
      error.message === "Staff record not found for this user"
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch schedule" },
      { status: 500 },
    );
  }
}

// PUT update a schedule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user!;
    const { id } = await params;
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid schedule ID",
          message: "Invalid schedule ID",
        },
        { status: 400 },
      );
    }

    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());

    const schedule = await Schedule.findOne({
      _id: id,
      staff: staff._id,
    });

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

    const body = await request.json();
    const {
      startTime,
      endTime,
      workDays,
      isOneOff,
      oneOffDate,
      timezone,
      notes,
    } = body;

    // Validate workDays if provided
    if (workDays && Array.isArray(workDays)) {
      const validDays = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const invalidDays = workDays.filter(
        (day: string) => !validDays.includes(day),
      );
      if (invalidDays.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid work days: ${invalidDays.join(", ")}. Use: ${validDays.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    // Update fields
    if (startTime) schedule.startTime = new Date(startTime);
    if (endTime) schedule.endTime = new Date(endTime);
    if (workDays && Array.isArray(workDays)) schedule.workDays = workDays;
    if (typeof isOneOff === "boolean") schedule.isOneOff = isOneOff;
    if (oneOffDate !== undefined)
      schedule.oneOffDate = oneOffDate ? new Date(oneOffDate) : undefined;
    if (timezone) schedule.timezone = timezone;
    if (notes !== undefined) schedule.notes = notes;

    await schedule.save();

    // Create notification for update for the staff member
    await createNotificationForEvent(
      request,
      "schedule_updated",
      {
        scheduleId: schedule._id.toString(),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      },
      [user._id.toString()],
    );

    return NextResponse.json({
      success: true,
      data: schedule,
    });
  } catch (error: unknown) {
    console.error("Error updating schedule:", error);

    if (error instanceof Error) {
      if (error.message.includes("at least 10 hours")) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 },
        );
      }

      if (
        error.message.includes("Start time must be before end time") ||
        error.message.includes("End time must be after start time")
      ) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      { success: false, error: "Failed to update schedule" },
      { status: 500 },
    );
  }
}

// DELETE a schedule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user!;
    const { id } = await params;
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid schedule ID" },
        { status: 400 },
      );
    }

    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());

    const schedule = await Schedule.findOne({
      _id: id,
      staff: staff._id,
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 },
      );
    }

    await Schedule.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error: unknown) {
    console.error("Error deleting schedule:", error);

    if (
      error instanceof Error &&
      error.message === "Staff record not found for this user"
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to delete schedule" },
      { status: 500 },
    );
  }
}
