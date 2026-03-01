import { verifyAdmin, verifyAuth } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import NotificationService from "@/lib/notificationService";
import Location from "@/models/Location";
import User from "@/models/User";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// GET unassigned managers
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const city = searchParams.get("city");
    const unassigned = searchParams.get("unassigned");
    const allManagers = searchParams.get("allManagers");
    const managerId = searchParams.get("managerId");

    const skip = (page - 1) * limit;

    // Build filter
    const filter: Record<string, unknown> = {};
    if (city) {
      filter.city = new RegExp(city, "i");
    }

    // Add manager filter if provided
    if (managerId) {
      filter.manager = managerId;
    }

    let locations;
    let total;

    if (unassigned === "true") {
      // Get managers who are not assigned to any location
      const assignedManagerIds = await Location.distinct("manager");
      const unassignedManagers = await User.find({
        _id: { $nin: assignedManagerIds },
        role: { $in: ["manager", "admin"] },
        isArchived: false,
      })
        .select("firstName lastName email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await User.countDocuments({
        _id: { $nin: assignedManagerIds },
        role: { $in: ["manager", "admin"] },
        isArchived: false,
      });

      return NextResponse.json({
        success: true,
        data: unassignedManagers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } else if (allManagers === "true") {
      // Get all managers with their assignment status
      const assignedManagerIds = await Location.distinct("manager");
      const allManagersData = await User.find({
        role: { $in: ["manager", "admin"] },
        isArchived: false,
      })
        .select("firstName lastName email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Add availability status to each manager
      const assignedIdsStrings = assignedManagerIds.map((id) => id.toString());
      const managersWithStatus = allManagersData.map((manager) => {
        const managerIdStr = manager._id.toString();
        const assignments = assignedIdsStrings.filter(
          (id) => id === managerIdStr,
        );
        return {
          ...manager.toObject(),
          isAvailable: assignments.length === 0,
          assignedLocationCount: assignments.length,
        };
      });

      total = await User.countDocuments({
        role: { $in: ["manager", "admin"] },
        isArchived: false,
      });

      return NextResponse.json({
        success: true,
        data: managersWithStatus,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } else {
      // Get locations
      locations = await Location.find(filter)
        .populate("manager", "firstName lastName email")
        .populate("createdBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      total = await Location.countDocuments(filter);

      return NextResponse.json({
        success: true,
        data: locations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch locations" },
      { status: 500 },
    );
  }
}

// POST create new location (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);
    if ("error" in adminCheck) {
      return NextResponse.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status },
      );
    }

    await connectToDatabase();

    const body = await request.json();
    const { address, city, timezone, manager } = body;
    const createdBy = adminCheck.user._id;

    // Validate required fields
    if (!address || !city || !timezone || !manager || !createdBy) {
      return NextResponse.json(
        { success: false, error: "All fields are required" },
        { status: 400 },
      );
    }

    // Verify manager exists and has appropriate role
    const managerUser = await User.findById(manager);
    if (
      !managerUser ||
      (managerUser.role !== "manager" && managerUser.role !== "admin")
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid manager assignment" },
        { status: 400 },
      );
    }

    const location = await Location.create({
      address,
      city,
      timezone,
      manager,
      createdBy,
    });

    // Populate the response
    await location.populate("manager", "firstName lastName email");
    await location.populate("createdBy", "firstName lastName email");

    // Send notification to the manager
    try {
      await NotificationService.createNotification({
        type: "location_created",
        title: "New Location Assignment",
        message: `You have been assigned as a manager for the new location: ${location.address}, ${location.city}.`,
        recipient: new mongoose.Types.ObjectId(manager),
        sender: createdBy as mongoose.Types.ObjectId,
        location: location._id as mongoose.Types.ObjectId,
        relatedEntity: {
          type: "location",
          id: location._id as mongoose.Types.ObjectId,
        },
        priority: "high",
      });
    } catch (notificationError) {
      console.error(
        "Failed to send location creation notification:",
        notificationError,
      );
      // Don't fail the whole request if notification fails
    }

    return NextResponse.json(
      {
        success: true,
        data: location,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error creating location:", error);

    if (error instanceof Error && "code" in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: "Location with this address already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create location",
      },
      { status: 500 },
    );
  }
}
