import connectToDatabase from "@/lib/mongodb";
import Staff from "@/models/Staff";
import TimeEntry from "@/models/TimeEntry";
import User from "@/models/User";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

// Helper function to verify JWT token and get user
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

    await connectToDatabase();
    const user = await User.findById(decoded.userId);

    if (!user || !["admin", "manager", "user"].includes(user.role)) {
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

// GET time entries for authenticated staff
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
    const activeOnly = searchParams.get("activeOnly") === "true";

    const skip = (page - 1) * limit;

    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());

    // Build filter
    const filter: Record<string, unknown> = { staff: staff._id };

    if (startDate || endDate) {
      filter.clockIn = {};
      if (startDate) {
        (filter.clockIn as Record<string, unknown>)["$gte"] = new Date(
          startDate,
        );
      }
      if (endDate) {
        (filter.clockIn as Record<string, unknown>)["$lte"] = new Date(endDate);
      }
    }

    if (activeOnly) {
      filter.isActive = true;
    }

    const timeEntries = await TimeEntry.find(filter)
      .populate("schedule", "startTime endTime workDays timezone")
      .populate("location", "address city")
      .sort({ clockIn: -1 })
      .skip(skip)
      .limit(limit);

    // Convert to local timezone if requested
    const processedEntries = timeEntries;

    const total = await TimeEntry.countDocuments(filter);

    // Get current status
    const activeEntry = await TimeEntry.findOne({
      staff: staff._id,
      isActive: true,
    }).populate("schedule", "startTime endTime");

    return NextResponse.json({
      success: true,
      data: {
        entries: processedEntries,
        currentStatus: {
          isActive: !!activeEntry,
          activeEntry: activeEntry
            ? {
                ...activeEntry.toObject(),
                clockIn: activeEntry.clockIn,
              }
            : null,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching time entries:", error);

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
      { success: false, error: "Failed to fetch time entries" },
      { status: 500 },
    );
  }
}
