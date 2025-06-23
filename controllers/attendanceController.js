const { Attendance, User } = require("../models");
const { Sequelize } = require("sequelize");

// --- Helper Functions ---

// Format date to 'YYYY-MM-DD' in UTC
const formatDate = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d) ? date : d.toISOString().split("T")[0];
};

// Format time to 'HH:MM:SS' in UTC
const formatTime = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d) ? date : d.toTimeString().split(" ")[0];
};

// Format total hours (e.g., "4h 30m")
const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

const getAllUsersTodaysAttendance = async (req, res) => {
  try {
    // Get date from query params or default to today
    const selectedDate =
      req.query.date || new Date().toISOString().split("T")[0];

    // Find all attendance records for the selected date
    const attendanceRecords = await Attendance.findAll({
      where: {
        date: selectedDate,
      },
      include: [
        {
          model: User,
          attributes: ["id", "fullName", "email"],
          as: "user",
        },
      ],
      attributes: ["id", "date", "clockIn", "clockOut", "status"],
      order: [["user", "fullName", "ASC"]],
    });

    // Format the response
    const formattedRecords = attendanceRecords.map((record) => ({
      id: record.id,
      userId: record.userId,
      fullName: record.user?.fullName || "Unknown",
      email: record.user?.email || "",
      date: record.date,
      clockIn: record.clockIn ? formatTime(record.clockIn) : null,
      clockOut: record.clockOut ? formatTime(record.clockOut) : null,
      status: record.status || "absent",
    }));

    return res.status(200).json({
      success: true,
      date: selectedDate,
      count: formattedRecords.length,
      data: formattedRecords,
    });
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

    const formatted = records.map((record) => ({
      id: record.id,
      userId: record.userId,
      fullName: record.user?.fullName || "N/A",
      email: record.user?.email || "N/A",
      date: record.date, // Return as stored in the database
      clockIn: record.clockIn ? new Date(record.clockIn).toISOString() : null,
      clockOut: record.clockOut
        ? new Date(record.clockOut).toISOString()
        : null,
      totalHours: record.totalHours,
      formattedHours: record.totalHours ? formatHours(record.totalHours) : null,
      status: record.status || "present",
    }));

    return res.status(200).json({ success: true, attendance: formatted });
  } catch (error) {
    console.error("getAllAttendance error:", error);
    return res.status(500).json({
      message: "Failed to fetch attendance",
      error: error.message,
    });
  }
};

// Get today's attendance for the authenticated user
const getTodaysAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const attendance = await Attendance.findOne({
      where: {
        userId,
        date: today
      },
      include: [
        {
          model: User,
          attributes: ['id', 'fullName', 'email'],
          as: 'user',
        },
      ],
      attributes: ['id', 'date', 'clockIn', 'clockOut', 'status', 'totalHours'],
    });

    if (!attendance) {
      return res.status(200).json({
        success: true,
        date: today,
        clockIn: null,
        clockOut: null,
        totalHours: 0,
        formattedHours: '0h 0m',
        status: 'absent',
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email
        }
      });
    }

    // Calculate hours if not already calculated
    let totalHours = attendance.totalHours;
    if (!totalHours && attendance.clockIn && attendance.clockOut) {
      const msWorked = new Date(attendance.clockOut) - new Date(attendance.clockIn);
      totalHours = msWorked / (1000 * 60 * 60); // Convert to hours
    }

    return res.status(200).json({
      success: true,
      id: attendance.id,
      date: attendance.date,
      clockIn: attendance.clockIn ? formatTime(attendance.clockIn) : null,
      clockOut: attendance.clockOut ? formatTime(attendance.clockOut) : null,
      totalHours: totalHours || 0,
      formattedHours: totalHours ? formatHours(totalHours) : '0h 0m',
      status: attendance.status || 'present',
      user: {
        id: attendance.user?.id || req.user.id,
        fullName: attendance.user?.fullName || req.user.fullName,
        email: attendance.user?.email || req.user.email
      }
    });
  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

// Get weekly attendance for the authenticated user
const getWeeklyAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6); // Last 7 days including today

    // Format dates for query
    const formatDateForQuery = (date) => date.toISOString().split('T')[0];
    
    // Generate all dates in the range to include days with no attendance
    const allDates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(formatDateForQuery(new Date(currentDate)));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get attendance records for the date range
    const attendanceRecords = await Attendance.findAll({
      where: {
        userId,
        date: {
          [Sequelize.Op.between]: [formatDateForQuery(startDate), formatDateForQuery(endDate)]
        }
      },
      order: [['date', 'ASC']],
      attributes: ['id', 'date', 'clockIn', 'clockOut', 'status', 'totalHours'],
    });

    // Create a map of date to attendance for easy lookup
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.date, record);
    });

    // Generate response with all dates in range
    const weeklyData = allDates.map(date => {
      const attendance = attendanceMap.get(date);
      
      if (!attendance) {
        return {
          date,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
          status: 'absent',
          clockIn: null,
          clockOut: null,
          totalHours: 0,
          formattedHours: '0h 0m'
        };
      }

      // Calculate hours if not already calculated
      let totalHours = attendance.totalHours;
      if (!totalHours && attendance.clockIn && attendance.clockOut) {
        const msWorked = new Date(attendance.clockOut) - new Date(attendance.clockIn);
        totalHours = msWorked / (1000 * 60 * 60);
      }

      return {
        id: attendance.id,
        date: attendance.date,
        day: new Date(attendance.date).toLocaleDateString('en-US', { weekday: 'short' }),
        status: attendance.status || 'present',
        clockIn: attendance.clockIn ? formatTime(attendance.clockIn) : null,
        clockOut: attendance.clockOut ? formatTime(attendance.clockOut) : null,
        totalHours: totalHours || 0,
        formattedHours: totalHours ? formatHours(totalHours) : '0h 0m'
      };
    });

    // Calculate weekly summary
    const summary = {
      totalDays: weeklyData.length,
      presentDays: weeklyData.filter(d => d.status === 'present').length,
      absentDays: weeklyData.filter(d => d.status === 'absent').length,
      totalHours: weeklyData.reduce((sum, day) => sum + (day.totalHours || 0), 0).toFixed(2)
    };
    summary.formattedTotalHours = formatHours(summary.totalHours);

    return res.status(200).json({
      success: true,
      startDate: formatDateForQuery(startDate),
      endDate: formatDateForQuery(endDate),
      summary,
      data: weeklyData
    });

  } catch (error) {
    console.error("Error fetching weekly attendance:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching weekly attendance",
      error: error.message,
    });
  }
};

module.exports = {
  clockIn,
  clockOut,
  getAllAttendance,
  getAllUsersTodaysAttendance,
  getTodaysAttendance,
  getWeeklyAttendance,
};
