import connectToDatabase from "@/lib/mongodb";
import NotificationService from "@/lib/notificationService";
import Location from "@/models/Location";
import Staff from "@/models/Staff";
import TimeEntry from "@/models/TimeEntry";
import User from "@/models/User";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Helper function to verify JWT token and get user
async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const jwt_secret = process.env.JWT_SECRET || "secret";
    const decoded = jwt.verify(token, jwt_secret) as {
      id: string;
      role: string;
    };

    await connectToDatabase();
    const user = await User.findById(decoded.id);

    if (
      !user ||
      (user.role !== "admin" &&
        user.role !== "manager" &&
        user.role !== "staff")
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// Helper function to get staff record for authenticated user
async function getUserStaffRecord(userId: string) {
  const staff = await Staff.findOne({ user: userId });
  if (!staff) {
    throw new Error("Staff record not found for this user");
  }
  return staff;
}

// POST clock out
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    await connectToDatabase();

    const body = await request.json();
    const { notes } = body;

    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());

    // Find active time entry
    const activeEntry = await TimeEntry.findOne({
      staff: staff._id,
      isActive: true,
    }).populate("schedule", "startTime endTime");

    if (!activeEntry) {
      return NextResponse.json(
        {
          success: false,
          error: "No active time entry found. Please clock in first.",
        },
        { status: 400 },
      );
    }

    // Clock out
    activeEntry.clockOut = new Date();
    activeEntry.isActive = false;

    // Calculate duration in minutes
    const duration = Math.round(
      (activeEntry.clockOut.getTime() - activeEntry.clockIn.getTime()) /
        (1000 * 60),
    );
    activeEntry.duration = duration;

    // Add notes if provided
    if (notes) {
      activeEntry.notes = notes;
    }

    await activeEntry.save();

    // Check if this should be marked as overtime based on schedule duration
    let shouldMarkAsOvertime = activeEntry.isOvertime;

    if (activeEntry.schedule && !activeEntry.isOvertime) {
      const schedule = activeEntry.schedule as unknown as {
        startTime: Date;
        endTime: Date;
        _id: mongoose.Types.ObjectId;
      };
      const scheduleDuration = Math.round(
        (schedule.endTime.getTime() - schedule.startTime.getTime()) /
          (1000 * 60),
      );

      // If worked more than 30 minutes over schedule duration, mark as overtime
      if (duration > scheduleDuration + 30) {
        shouldMarkAsOvertime = true;
        activeEntry.isOvertime = true;
        await activeEntry.save();
      }
    }

    // Populate the response
    await activeEntry.populate(
      "schedule",
      "startTime endTime workDays timezone",
    );
    await activeEntry.populate("location", "address city");

    // Send Notifications
    try {
      const staffUser = await User.findById(staff.user);
      const staffName = staffUser
        ? `${staffUser.firstName} ${staffUser.lastName}`
        : "Staff Member";
      const staffUserId = staffUser?._id as mongoose.Types.ObjectId;
      const durationHours = Math.round((duration / 60) * 100) / 100;

      // 1. Notify Admin
      await NotificationService.createAdminNotification({
        type: "clock_out",
        title: "Staff Clocked Out",
        message: `${staffName} clocked out. Duration: ${durationHours} hours.`,
        location: activeEntry.location as mongoose.Types.ObjectId,
        relatedEntity: { type: "user", id: staffUserId },
        sender: staffUserId,
      });

      // 2. Notify Location Manager
      if (activeEntry.location) {
        const locationDoc = await Location.findById(activeEntry.location);
        if (locationDoc && locationDoc.manager) {
          await NotificationService.createNotification({
            type: "clock_out",
            title: "Staff Departure",
            message: `${staffName} has just clocked out. Work duration: ${durationHours}h.`,
            recipient: locationDoc.manager as mongoose.Types.ObjectId,
            location: locationDoc._id as mongoose.Types.ObjectId,
            relatedEntity: { type: "user", id: staffUserId },
            sender: staffUserId,
          });
        }
      }
    } catch (err) {
      console.error("Failed to send clock-out notifications:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...activeEntry.toObject(),
        durationHours: Math.round((duration / 60) * 100) / 100,
        isOvertime: shouldMarkAsOvertime,
        message: shouldMarkAsOvertime
          ? "Clocked out with overtime"
          : "Clocked out successfully",
      },
    });
  } catch (error: unknown) {
    console.error("Error clocking out:", error);

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
      { success: false, error: "Failed to clock out" },
      { status: 500 },
    );
  }
}
