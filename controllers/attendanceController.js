const { Attendance, User } = require("../models");

// --- Helper Functions ---

// Convert any input (Date or string) to PKT safely
const toPKT = (input) => {
  const date = new Date(input);
  if (isNaN(date)) return null; // handle invalid dates
  return new Date(date.getTime() + 5 * 60 * 60 * 1000);
};

// Format Date to 'YYYY-MM-DD' in PKT
const formatDate = (input) => {
  const pkt = toPKT(input);
  return pkt ? pkt.toISOString().slice(0, 10) : null;
};

// Format Time to readable PKT time (e.g., '18:42:12')
const formatTimePKT = (input) => {
  const pkt = toPKT(input);
  return pkt ? pkt.toTimeString().slice(0, 8) : null;
};

// Format Total Hours (e.g., "4h 30m")
const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

// --- Clock In ---
const clockIn = async (req, res) => {
  try {
    const userId = req.user.userId;
    const nowUTC = new Date();
    const todayPKT = formatDate(nowUTC);

    const existing = await Attendance.findOne({
      where: { userId, date: todayPKT },
    });

    if (existing) {
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    const attendance = await Attendance.create({
      userId,
      date: todayPKT,
      clockIn: nowUTC,
      status: "present",
    });

    return res.status(200).json({
      message: "Clock-in successful",
      attendance: {
        id: attendance.id,
        date: todayPKT,
        clockIn: formatTimePKT(nowUTC),
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
    const userId = req.user.userId;
    const nowUTC = new Date();
    const todayPKT = formatDate(nowUTC);

    const attendance = await Attendance.findOne({
      where: { userId, date: todayPKT },
    });

    if (!attendance || attendance.clockOut) {
      return res
        .status(400)
        .json({ message: "Not clocked in or already clocked out" });
    }

    const workedMs = toPKT(nowUTC) - toPKT(attendance.clockIn);
    const workedHours = workedMs / (1000 * 60 * 60);

    attendance.clockOut = nowUTC;
    attendance.totalHours = parseFloat(workedHours.toFixed(2));
    await attendance.save();

    return res.status(200).json({
      message: "Clock-out successful",
      attendance: {
        id: attendance.id,
        date: todayPKT,
        clockIn: formatTimePKT(attendance.clockIn),
        clockOut: formatTimePKT(nowUTC),
        totalHours: attendance.totalHours,
        formattedHours: formatHours(attendance.totalHours),
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
};
