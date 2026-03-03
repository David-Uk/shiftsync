import { GET } from "@/app/api/staff/available/route";
import { NextRequest } from "next/server";
import { createMocks } from "node-mocks-http";
import * as connectToDatabase from "@/lib/mongodb";
import * as auth from "@/lib/auth";
import User from "@/models/User";
import Staff from "@/models/Staff";
import ShiftSchedule from "@/models/ShiftSchedule";

jest.mock("@/lib/mongodb");
jest.mock("@/lib/auth");

describe("GET /api/staff/available", () => {
  let req: any, res: any;

  beforeEach(() => {
    const { req: mockReq, res: mockRes } = createMocks({
      method: "GET",
      url: "http://localhost/api/staff/available?location=1&startTime=09:00&endTime=17:00&workDays=Monday,Tuesday&designation=bartender",
    });
    req = mockReq;
    res = mockRes;
  });

  it("should return 401 if user is not authenticated", async () => {
    jest.spyOn(auth, "getAuthenticatedUser").mockResolvedValue(null);

    const response = await GET(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 403 if user is not an admin or manager", async () => {
    jest
      .spyOn(auth, "getAuthenticatedUser")
      .mockResolvedValue({ _id: "1", role: "staff" });

    const response = await GET(req);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("should return available and unavailable staff", async () => {
    jest
      .spyOn(auth, "getAuthenticatedUser")
      .mockResolvedValue({ _id: "1", role: "manager" });
    jest.spyOn(connectToDatabase, "default").mockResolvedValue(undefined);
    jest.spyOn(User, "findById").mockResolvedValue({ _id: "1", role: "manager" });
    const lean = jest.fn().mockResolvedValue([
      {
        _id: "staff1",
        user: { firstName: "John", lastName: "Doe" },
        designation: "bartender",
      },
      {
        _id: "staff2",
        user: { firstName: "Jane", lastName: "Smith" },
        designation: "bartender",
      },
    ]);
    const populate = jest.fn().mockReturnValue({ lean });
    jest.spyOn(Staff, "find").mockReturnValue({ populate } as any);

    const scheduleLean = jest.fn().mockResolvedValue([
      {
        assignedStaff: ["staff2"],
        workDays: ["Monday"],
        startTime: "10:00",
        endTime: "18:00",
        location: { name: "Another Location" },
      },
    ]);
    const schedulePopulate = jest.fn().mockReturnValue({ lean: scheduleLean });
    jest.spyOn(ShiftSchedule, "find").mockReturnValue({
      populate: schedulePopulate,
    } as any);

    const response = await GET(req as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.available).toHaveLength(1);
    expect(body.data.available[0]._id).toBe("staff1");
    expect(body.data.unavailable).toHaveLength(1);
    expect(body.data.unavailable[0]._id).toBe("staff2");
  });
});
