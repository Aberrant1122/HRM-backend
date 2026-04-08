const { Attendance, User, Task, DailyWorkRecord, Project, UserInfo } = require("../models");
const { Sequelize, Op } = require("sequelize");
const { getPagination, getPagingData } = require("../utils/pagination");
let lastAutoMarkTime = 0;

// --- Helper Functions ---

// Format date to 'YYYY-MM-DD' in UTC
const formatDate = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d) ? date : d.toISOString().split("T")[0];
};

// Format time to 'HH:MM:SS' in local timezone (for display in tables)
const formatTimeSimple = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return date;

  // Return time in HH:MM:SS format
  // The database is configured with timezone +05:00 (PKT), so times are stored correctly
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
};

// Format time to ISO string (for frontend date parsing)
const formatTime = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return date;

  // Return ISO string for frontend to parse correctly
  return d.toISOString();
};

// Format total hours (e.g., "4h 30m")
const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

const autoMarkAbsentsForOverdueClockIns = async () => {
  // This is now handled by a cron job in utils/cronJobs.js
  // Keeping a stub for backward compatibility if needed, but not doing anything heavy here
  return;
};

const getAllUsersTodaysAttendance = async (req, res) => {
  try {
    // Get date from query params or default to today
    const selectedDate = req.query.date || new Date().toISOString().split("T")[0];

    // Get all employees and their attendance in one query if possible, 
    // but for now keeping the logic but removing the autoMark call
    const allUsers = await User.findAll({
      where: { role: 'employee' },
      attributes: ['id', 'fullName', 'email'],
      raw: true
    });

    const attendanceRecords = await Attendance.findAll({
      where: {
        date: selectedDate,
      },
      attributes: ["id", "userId", "date", "clockIn", "clockOut", "status"],
      raw: true,
    });

    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.userId, record);
    });

    const formattedRecords = allUsers.map(user => {
      const attendance = attendanceMap.get(user.id);

      return {
        id: attendance?.id || null,
        userId: user.id,
        fullName: user.fullName || "Unknown",
        email: user.email || "",
        date: selectedDate,
        clockIn: attendance?.clockIn ? formatTime(attendance.clockIn) : null,
        clockOut: attendance?.clockOut ? formatTime(attendance.clockOut) : null,
        status: attendance?.status || "absent",
      };
    });

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
  const transaction = await Attendance.sequelize.transaction();
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = formatDate(now);

    const existing = await Attendance.findOne({
      where: { userId, date: today },
      transaction
    });

    if (existing) {
      await transaction.rollback();
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    const attendance = await Attendance.create({
      userId,
      date: today,
      clockIn: now,
      status: "present",
    }, { transaction });

    await transaction.commit();

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
    if (transaction) await transaction.rollback();
    console.error(`Clock-in error for user ${req.user?.id}:`, error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- Clock Out ---
const clockOut = async (req, res) => {
  const transaction = await Attendance.sequelize.transaction();
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = formatDate(now);

    const { taskId, taskStatus, workNote, deliverableLink } = req.body;
    const numericTaskId = taskId ? Number(taskId) : null;

    // Validate request data
    const validStatuses = ["planning", "in-progress", "testing", "blocked", "completed"];
    if (taskStatus && !validStatuses.includes(taskStatus)) {
      await transaction.rollback();
      return res.status(400).json({ message: "Invalid task status" });
    }

    let attendance = await Attendance.findOne({
      where: { userId, date: today, clockOut: null },
      transaction
    });

    if (!attendance) {
      attendance = await Attendance.create({
        userId,
        date: today,
        clockIn: now,
        status: "present",
      }, { transaction });
    }

    // Verify task if provided
    if (numericTaskId) {
      const task = await Task.findOne({
        where: { id: numericTaskId, assigneeId: userId, isActive: true },
        transaction
      });
      if (!task) {
        await transaction.rollback();
        return res.status(404).json({ message: "Task not found or not assigned to you" });
      }
    }

    const clockInTime = new Date(attendance.clockIn);
    const hoursWorked = (now - clockInTime) / (1000 * 60 * 60);

    await attendance.update({
      clockOut: now,
      totalHours: hoursWorked,
    }, { transaction });

    // Process deliverables
    const deliverables = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        deliverables.push({
          filename: file.originalname,
          key: file.key,
          url: file.location || `${process.env.AWS_S3_ENDPOINT || 'https://s3.amazonaws.com'}/${process.env.AWS_S3_BUCKET}/${file.key}`,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString(),
        });
      });
    }

    const recordData = {
      userId,
      attendanceId: attendance.id,
      taskId: numericTaskId || null,
      taskStatus: taskStatus || null,
      workNote: workNote || (numericTaskId ? null : "General work - no specific task"),
      deliverableLink: deliverableLink || null,
      deliverables: deliverables.length > 0 ? deliverables : null,
      date: today,
    };

    let dailyWorkRecord = await DailyWorkRecord.findOne({
      where: { userId, attendanceId: attendance.id },
      transaction
    });

    if (dailyWorkRecord) {
      await dailyWorkRecord.update(recordData, { transaction });
    } else {
      dailyWorkRecord = await DailyWorkRecord.create(recordData, { transaction });
    }

    await transaction.commit();

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
      dailyWorkRecord
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Clock-out error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// --- Get All Attendance (Admin) ---
const getAllAttendance = async (req, res) => {
  try {
    await autoMarkAbsentsForOverdueClockIns();
    const { page, limit } = req.query;
    const { limit: l, offset } = getPagination(page, limit);

    const result = await Attendance.findAndCountAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
      attributes: ["id", "userId", "date", "clockIn", "clockOut", "totalHours", "status"],
      order: [["date", "DESC"]],
      limit: l,
      offset,
    });

    const paginatedData = getPagingData(result, page, l);

    const formatted = paginatedData.items.map((record) => ({
      id: record.id,
      userId: record.userId,
      fullName: record.user?.fullName || "N/A",
      email: record.user?.email || "N/A",
      date: record.date,
      clockIn: record.clockIn ? new Date(record.clockIn).toISOString() : null,
      clockOut: record.clockOut ? new Date(record.clockOut).toISOString() : null,
      totalHours: record.totalHours,
      formattedHours: record.totalHours ? formatHours(record.totalHours) : null,
      status: record.status || "present",
    }));

    return res.status(200).json({
      success: true,
      attendance: formatted,
      pagination: {
        totalItems: paginatedData.totalItems,
        totalPages: paginatedData.totalPages,
        currentPage: paginatedData.currentPage,
      }
    });
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
    await autoMarkAbsentsForOverdueClockIns();
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
    await autoMarkAbsentsForOverdueClockIns();
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

// Get attendance history for the authenticated user with pagination and filters
const getUserAttendanceHistory = async (req, res) => {
  try {
    await autoMarkAbsentsForOverdueClockIns();
    const userId = req.user.id;
    const { page, limit, startDate, endDate, date, status } = req.query;
    const { limit: l, offset } = getPagination(page, limit);

    const whereClause = { userId };
    if (date) {
      whereClause.date = date;
    } else if (startDate && endDate) {
      whereClause.date = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      whereClause.date = { [Op.gte]: startDate };
    } else if (endDate) {
      whereClause.date = { [Op.lte]: endDate };
    }

    if (status && status !== "all") {
      whereClause.status = status;
    }

    const result = await Attendance.findAndCountAll({
      where: whereClause,
      attributes: ["id", "userId", "date", "clockIn", "clockOut", "totalHours", "status"],
      order: [["date", "DESC"]],
      limit: l,
      offset,
    });

    const paginatedData = getPagingData(result, page, l);

    const formatted = paginatedData.items.map((record) => {
      let totalHours = record.totalHours;
      if (!totalHours && record.clockIn && record.clockOut) {
        const msWorked = new Date(record.clockOut) - new Date(record.clockIn);
        totalHours = msWorked / (1000 * 60 * 60);
      }

      return {
        id: record.id,
        date: record.date,
        day: new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' }),
        status: record.status || 'present',
        clockIn: record.clockIn ? formatTime(record.clockIn) : null,
        clockOut: record.clockOut ? formatTime(record.clockOut) : null,
        totalHours: totalHours || 0,
        formattedHours: totalHours ? formatHours(totalHours) : '0h 0m'
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        totalItems: paginatedData.totalItems,
        totalPages: paginatedData.totalPages,
        currentPage: paginatedData.currentPage,
      }
    });
  } catch (error) {
    console.error("getUserAttendanceHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance history",
      error: error.message,
    });
  }
};

// --- Get Active Tasks for Checkout Form ---
const getActiveTasksForCheckout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all assigned tasks for the user (excluding cancelled and completed)
    const tasks = await Task.findAll({
      where: {
        assigneeId: userId,
        isActive: true,
        status: {
          [Op.notIn]: ["cancelled", "completed"], // Exclude cancelled and completed tasks
        },
      },
      attributes: ["id", "title", "status", "priority"],
      include: [
        {
          model: Project,
          as: "project",
          attributes: ["id", "name"],
          required: false,
        },
      ],
      order: [
        // Show in-progress tasks first, then by priority and due date
        ["status", "ASC"], // This will group by status
        ["priority", "DESC"],
        ["dueDate", "ASC"],
      ],
    });

    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error("Error fetching active tasks:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching active tasks",
      error: error.message,
    });
  }
};

// --- Get Daily Work Records (Manager/Admin) ---
const getDailyWorkRecords = async (req, res) => {
  try {
    await autoMarkAbsentsForOverdueClockIns();
    const { date, employeeId, taskStatus, page, limit } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;
    const { limit: l, offset } = getPagination(page, limit);

    const normalizeDeliverables = (d) => {
      if (!d) return [];
      if (Array.isArray(d)) return d;
      if (typeof d === "string") {
        try {
          const parsed = JSON.parse(d);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const whereClause = {};
    const isAdmin = String(userRole || "").toLowerCase() === "admin";

    if (date) whereClause.date = date;
    if (employeeId) whereClause.userId = parseInt(employeeId, 10);

    // Build query options based on role
    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
        {
          model: Task,
          as: "task",
          attributes: ["id", "title", "status", "priority", "projectId"],
          required: !isAdmin, // For managers, only include records with tasks
          include: [
            {
              model: Project,
              as: "project",
              attributes: ["id", "name", "managerId"],
              required: !isAdmin, // For managers, require project to exist
              // For managers, filter by their managed projects
              ...(!isAdmin && {
                where: {
                  managerId: userId,
                  isActive: true
                }
              }),
            }
          ]
        },
        {
          model: Attendance,
          as: "attendance",
          attributes: ["id", "clockIn", "clockOut", "totalHours"],
        },
      ],
      attributes: ["id", "userId", "attendanceId", "taskId", "taskStatus", "workNote", "deliverableLink", "deliverables", "date"],
      order: [["date", "DESC"], ["createdAt", "DESC"]],
      limit: l,
      offset,
      distinct: true, // Required when using limit with includes
    };

    const result = await DailyWorkRecord.findAndCountAll(queryOptions);
    const paginatedData = getPagingData(result, page, l);

    const formattedRecords = paginatedData.items.map((record) => ({
      id: record.id,
      employee: {
        id: record.user?.id || 0,
        name: record.user?.fullName || "Unknown",
        email: record.user?.email || "",
      },
      date: record.date,
      checkIn: record.attendance?.clockIn ? formatTimeSimple(record.attendance.clockIn) : null,
      checkOut: record.attendance?.clockOut ? formatTimeSimple(record.attendance.clockOut) : null,
      task: record.task ? {
        id: record.task.id,
        name: record.task.title,
        status: record.task.status,
        priority: record.task.priority,
        project: record.task.project ? {
          id: record.task.project.id,
          name: record.task.project.name,
        } : null,
      } : null,
      taskStatus: record.taskStatus,
      workNote: record.workNote,
      deliverableLink: record.deliverableLink,
      deliverables: normalizeDeliverables(record.deliverables),
      totalHours: record.attendance?.totalHours || 0,
      formattedHours: record.attendance?.totalHours ? formatHours(record.attendance.totalHours) : "0h 0m",
    }));

    if (taskStatus) {
      // Filtering after pagination might reduce the count per page, but is safer for ENUM filters on associations
      // Ideally this should be in where clause if taskStatus is on DailyWorkRecord directly
    }

    const { getSignedUrlForObject, extractS3Key } = require('../utils/s3Helper');
    const signUrlIfS3 = async (value) => {
      if (!value) return value;
      const key = value.startsWith('http') ? extractS3Key(value) : value;
      if (!key) return value;
      try {
        return await getSignedUrlForObject(key, 3600);
      } catch (e) {
        return value;
      }
    };

    const recordsWithSignedUrls = await Promise.all(
      formattedRecords.map(async (rec) => {
        const signedDeliverableLink = rec.deliverableLink ? await signUrlIfS3(rec.deliverableLink) : rec.deliverableLink;
        const signedFiles = await Promise.all((rec.deliverables || []).map(async (file) => {
          const source = file.key || file.url;
          return { ...file, url: source ? await signUrlIfS3(source) : file.url };
        }));
        return { ...rec, deliverableLink: signedDeliverableLink, deliverables: signedFiles };
      })
    );

    return res.status(200).json({
      success: true,
      data: recordsWithSignedUrls,
      pagination: {
        totalItems: paginatedData.totalItems,
        totalPages: paginatedData.totalPages,
        currentPage: paginatedData.currentPage,
      }
    });
  } catch (error) {
    console.error("Error fetching daily work records:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching daily work records",
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
  getUserAttendanceHistory,
  getActiveTasksForCheckout,
  getDailyWorkRecords,
};
