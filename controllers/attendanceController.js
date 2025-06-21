const { Attendance, User } = require("../models");

// --- Helper Functions ---

// Format date to 'YYYY-MM-DD' in UTC
const formatDate = (date = new Date()) => {
  return date.toISOString().split("T")[0];
};

// Format time to 'HH:MM:SS' in UTC
const formatTime = (date = new Date()) => {
  return date.toTimeString().split(" ")[0];
};

// Format total hours (e.g., "4h 30m")
const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

// Get today's attendance for the authenticated user
const getTodaysAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = formatDate(new Date());

    const attendance = await Attendance.findOne({
      where: {
        userId,
        date: today,
      },
      attributes: ["date", "clockIn", "clockOut", "status"],
    });

    if (!attendance) {
      return res.status(200).json({
        date: today,
        clockIn: null,
        clockOut: null,
        status: "absent",
      });
    }

    // Format the response
    const response = {
      date: attendance.date,
      clockIn: attendance.clockIn ? formatTime(attendance.clockIn) : null,
      clockOut: attendance.clockOut ? formatTime(attendance.clockOut) : null,
      status: attendance.status || "present",
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    return res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

// --- Clock In ---
const clockIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = formatDate(now);

    const existing = await Attendance.findOne({
      where: { userId, date: today },
    });

    if (existing) {
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    const attendance = await Attendance.create({
      userId,
      date: today,
      clockIn: now,
      status: "present",
    });

    return res.status(200).json({
      message: "Clock-in successful",
      attendance: {
        id: attendance.id,
        date: today,
        clockIn: formatTime(now),
        status: attendance.status,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- Clock Out ---
const clockOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = formatDate(now);

    const attendance = await Attendance.findOne({
      where: {
        userId,
        date: today,
        clockOut: null,
      },
    });

    if (!attendance) {
      return res
        .status(400)
        .json({ message: "No active clock-in found for today" });
    }

    // Calculate hours worked
    const clockInTime = new Date(attendance.clockIn);
    const hoursWorked = (now - clockInTime) / (1000 * 60 * 60);

    await attendance.update({
      clockOut: now,
      totalHours: hoursWorked,
    });

    return res.status(200).json({
      message: "Clock-out successful",
      attendance: {
        id: attendance.id,
        date: today,
        clockIn: formatTime(attendance.clockIn),
        clockOut: formatTime(now),
        totalHours: formatHours(hoursWorked),
        status: attendance.status,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- Get All Attendance (Admin) ---
const getAllAttendance = async (req, res) => {
  try {
    const records = await Attendance.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
      order: [["date", "DESC"]],
    });

    const formatted = records.map((record) => {
      return {
        id: record.id,
        userId: record.userId,
        fullName: record.user?.fullName || "N/A",
        email: record.user?.email || "N/A",
        date: formatDate(record.date),
        clockIn: formatTimePKT(record.clockIn),
        clockOut: formatTimePKT(record.clockOut),
        totalHours: record.totalHours,
        formattedHours: record.totalHours
          ? formatHours(record.totalHours)
          : null,
        status: record.status,
      };
    });

    return res.status(200).json({ success: true, attendance: formatted });
  } catch (error) {
    console.error("getAllAttendance error:", error);
    return res.status(500).json({
      message: "Failed to fetch attendance",
      error: error.message,
    });
  }
};

module.exports = {
  clockIn,
  clockOut,
  getAllAttendance,
  getTodaysAttendance,
};
