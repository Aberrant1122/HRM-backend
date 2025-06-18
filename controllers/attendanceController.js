const { Attendance } = require("../models");

// --- Helper Functions ---

// Convert UTC Date to PKT (Asia/Karachi)
const toPKT = (date) => new Date(date.getTime() + 5 * 60 * 60 * 1000);

// Format Date to 'YYYY-MM-DD'
const formatDate = (date) => date.toISOString().slice(0, 10);

// Format Time to readable PKT time (e.g., '18:42:12')
const formatTimePKT = (date) => toPKT(date).toTimeString().slice(0, 8);

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
    const nowPKT = toPKT(nowUTC);
    const todayPKT = formatDate(nowPKT); // YYYY-MM-DD in PKT

    // Check if already clocked in
    const existing = await Attendance.findOne({
      where: { userId, date: todayPKT },
    });

    if (existing) {
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    // Save UTC to DB but use PKT date for grouping
    const attendance = await Attendance.create({
      userId,
      date: todayPKT, // Store PKT date only
      clockIn: nowUTC, // UTC time
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
    const nowPKT = toPKT(nowUTC);
    const todayPKT = formatDate(nowPKT);

    const attendance = await Attendance.findOne({
      where: { userId, date: todayPKT },
    });

    if (!attendance || attendance.clockOut) {
      return res
        .status(400)
        .json({ message: "Not clocked in or already clocked out" });
    }

    const clockInPKT = toPKT(new Date(attendance.clockIn));
    const workedMs = nowPKT - clockInPKT;
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

module.exports = { clockIn, clockOut };
