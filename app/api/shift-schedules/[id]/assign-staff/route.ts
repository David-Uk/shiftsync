import { getAuthenticatedUser } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import NotificationService from "@/lib/notificationService";
import ShiftSchedule from "@/models/ShiftSchedule";
import Staff from "@/models/Staff";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid shift schedule ID" },
        { status: 400 }
      );
    }

    const { staffIds } = await request.json();

    if (!staffIds || !Array.isArray(staffIds)) {
      return NextResponse.json(
        { success: false, error: "staffIds array is required" },
        { status: 400 }
      );
    }

    const shiftSchedule = await ShiftSchedule.findById(id);
    if (!shiftSchedule) {
      return NextResponse.json(
        { success: false, error: "Shift schedule not found" },
        { status: 404 }
      );
    }

    // Check permissions
    if (
      user.role === "manager" &&
      shiftSchedule.manager.toString() !== user._id.toString()
    ) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 }
      );
    }

    // Update assigned staff
    shiftSchedule.assignedStaff = staffIds.map(sid => new mongoose.Types.ObjectId(sid));
    await shiftSchedule.save();

    // Populate the response
    await shiftSchedule.populate("location", "address city timezone");
    await shiftSchedule.populate("manager", "firstName lastName email");
    await shiftSchedule.populate("assignedStaff", "designation user");

    // Send Notifications
    try {
      const managerId = user._id as mongoose.Types.ObjectId;
      const shiftId = shiftSchedule._id as mongoose.Types.ObjectId;
      const locationDoc = shiftSchedule.location as { _id: mongoose.Types.ObjectId; address?: string };
      const locationId = locationDoc._id;
      const locationAddress = locationDoc.address || "assigned location";

      // Notify Assigned Staff
      if (staffIds.length > 0) {
        const staffDocs = await Staff.find({
          _id: { $in: staffIds },
        }).populate("user");
        
        const userIds = staffDocs
          .map((s) => {
            const staffUser = s.user as { _id: mongoose.Types.ObjectId };
            return staffUser?._id;
          })
          .filter((id): id is mongoose.Types.ObjectId => !!id);

        if (userIds.length > 0) {
          await NotificationService.createBulkNotifications(
            {
              type: "shift_assigned",
              title: "You Have Been Assigned to a Shift",
              message: `You've been assigned to: ${shiftSchedule.title} at ${locationAddress}.`,
              location: locationId,
              relatedEntity: { type: "shift", id: shiftId },
              sender: managerId,
              priority: "high",
            },
            userIds
          );
        }
      }
    } catch (err) {
      console.error("Failed to send staff assignment notifications:", err);
    }

    return NextResponse.json({
      success: true,
      data: shiftSchedule,
    });
  } catch (error: unknown) {
    console.error("Error assigning staff to shift:", error);
    return NextResponse.json(
      { success: false, error: "Failed to assign staff" },
      { status: 500 }
    );
  }
}
