const { Attendance, User, Task, DailyWorkRecord, Project, UserInfo } = require("../models");
const { Sequelize, Op } = require("sequelize");
const { getPagination, getPagingData } = require("../utils/pagination");

// --- Helper Functions ---

// Format date to 'YYYY-MM-DD' in UTC
const formatDate = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d) ? date : d.toISOString().split("T")[0];
};

// Format time to 'HH:MM:SS' in UTC
// Format time to ISO string for frontend to handle timezone
const formatTime = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d) ? date : d.toISOString();
};

// Format total hours (e.g., "4h 30m")
const formatHours = (hours) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

const autoMarkAbsentsForOverdueClockIns = async () => {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Attendance.update(
    { status: "absent", totalHours: 0 },
    {
      where: {
        clockOut: null,
        clockIn: { [Op.lte]: threshold },
        status: { [Op.ne]: "absent" },
      },
    }
  );
};

const getAllUsersTodaysAttendance = async (req, res) => {
  try {
    await autoMarkAbsentsForOverdueClockIns();
    // Get date from query params or default to today
    const selectedDate = req.query.date || new Date().toISOString().split("T")[0];

    console.log(`Fetching attendance for date: ${selectedDate}`);

    // Get all users first
    const allUsers = await User.findAll({
      where: { role: 'employee' }, // Assuming you want only employees
      attributes: ['id', 'fullName', 'email'],
      raw: true
    });

    console.log(`Found ${allUsers.length} employees`);

    // Get all attendance records for the selected date
    const attendanceRecords = await Attendance.findAll({
      where: {
        date: selectedDate,
      },
      include: [
        {
          model: User,
          attributes: ["id", "fullName", "email"],
          as: "user",
          required: false
        },
      ],
      attributes: ["id", "userId", "date", "clockIn", "clockOut", "status"],
      raw: true,
      nest: true
    });

    console.log(`Found ${attendanceRecords.length} attendance records for ${selectedDate}`);

    // Create a map of userId to attendance record for quick lookup
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.userId, record);
      console.log(`Attendance record for user ${record.userId}: clockIn=${record.clockIn}, clockOut=${record.clockOut}, status=${record.status}`);
    });

    // Merge all users with their attendance records
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

    console.log(`Returning ${formattedRecords.length} formatted records`);

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

    console.log(`Clock-in attempt - User ID: ${userId}, Date: ${today}, Time: ${now.toISOString()}`);

    const existing = await Attendance.findOne({
      where: { userId, date: today },
    });

    if (existing) {
      console.log(`User ${userId} already clocked in for ${today}`);
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    const attendance = await Attendance.create({
      userId,
      date: today,
      clockIn: now,
      status: "present",
    });

    console.log(`Clock-in successful - Attendance ID: ${attendance.id}, User: ${userId}, Date: ${today}`);

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
    console.error(`Clock-in error for user ${req.user?.id}:`, error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- Clock Out ---
const clockOut = async (req, res) => {
  try {
    await autoMarkAbsentsForOverdueClockIns();
    const userId = req.user.id;
    const now = new Date();
    const today = formatDate(now);

    // Extract checkout form data
    const { taskId, taskStatus, workNote, deliverableLink } = req.body;
    const numericTaskId = (() => {
      if (taskId === undefined || taskId === null) return null;
      const n = Number(taskId);
      return Number.isInteger(n) && n > 0 ? n : null;
    })();

    // Validate task status
    const validStatuses = ["planning", "in-progress", "testing", "blocked", "completed"];
    if (taskStatus && !validStatuses.includes(taskStatus)) {
      return res.status(400).json({
        message: `Invalid task status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate work note length
    if (workNote && workNote.length > 120) {
      return res.status(400).json({
        message: "Work note must be 120 characters or less",
      });
    }

    // Validate deliverable link is a URL if provided
    if (deliverableLink) {
      try {
        new URL(deliverableLink);
      } catch (e) {
        return res.status(400).json({
          message: "Deliverable link must be a valid URL",
        });
      }
    }

    let attendance = await Attendance.findOne({
      where: {
        userId,
        date: today,
        clockOut: null,
      },
    });

    if (!attendance) {
      // Auto-create attendance to allow checkout without prior clock-in
      attendance = await Attendance.create({
        userId,
        date: today,
        clockIn: now,
        status: "present",
      });
    }

    // Verify task exists and is assigned to the user if provided
    if (numericTaskId) {
      const task = await Task.findOne({
        where: {
          id: numericTaskId,
          assigneeId: userId,
          isActive: true,
        },
      });
      if (!task) {
        return res.status(404).json({
          message: "Task not found or not assigned to you",
        });
      }
    }

    // Calculate hours worked
    const clockInTime = new Date(attendance.clockIn);
    const hoursWorked = (now - clockInTime) / (1000 * 60 * 60);

    // Update attendance
    await attendance.update({
      clockOut: now,
      totalHours: hoursWorked,
    });

    // Process uploaded deliverable files
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

    // Always create daily work record when checking out
    // This ensures every checkout has a corresponding work record for reporting
    console.log(`Creating daily work record for user ${userId}, attendance ${attendance.id}, date ${today}`);
    console.log(`Task details: taskId=${numericTaskId}, taskStatus=${taskStatus}, workNote=${workNote}`);

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
    let dailyWorkRecord;
    try {
      dailyWorkRecord = await DailyWorkRecord.findOne({
        where: { userId, attendanceId: attendance.id },
      });
      if (dailyWorkRecord) {
        await dailyWorkRecord.update(recordData);
      } else {
        dailyWorkRecord = await DailyWorkRecord.create(recordData);
      }
    } catch (e) {
      const name = e?.name || "";
      const message = e?.message || "Failed to record daily work";
      if (name.includes("ValidationError")) {
        return res.status(400).json({ message });
      }
      if (name.includes("UniqueConstraintError")) {
        return res.status(409).json({ message });
      }
      throw e;
    }

    console.log(`Daily work record created successfully with ID: ${dailyWorkRecord.id}`);

    // Update task status if different from current status
    // Note: The checkout taskStatus is for reporting, not necessarily the task's actual status
    // We'll keep them separate as per requirements

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
      dailyWorkRecord: {
        id: dailyWorkRecord.id,
        taskId: dailyWorkRecord.taskId,
        taskStatus: dailyWorkRecord.taskStatus,
        workNote: dailyWorkRecord.workNote,
        deliverableLink: dailyWorkRecord.deliverableLink,
        deliverables: dailyWorkRecord.deliverables || [],
      },
    });
  } catch (error) {
    console.error("Clock-out error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
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
    const restrictByManagerProjects = String(userRole || "").toLowerCase() !== "admin";

    if (date) whereClause.date = date;
    if (employeeId) whereClause.userId = parseInt(employeeId, 10);

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
          include: [
            {
              model: Project,
              as: "project",
              attributes: ["id", "name", "managerId"],
              ...(restrictByManagerProjects && { where: { managerId: req.user.id } }),
              required: false,
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

    const formattedRecords = paginatedData.items
      .filter(record => {
        if (!restrictByManagerProjects) return true;
        if (!record.task) return true;
        return record.task.project && record.task.project.managerId === req.user.id;
      })
      .map((record) => ({
        id: record.id,
        employee: {
          id: record.user?.id || 0,
          name: record.user?.fullName || "Unknown",
          email: record.user?.email || "",
        },
        date: record.date,
        checkIn: record.attendance?.clockIn ? formatTime(record.attendance.clockIn) : null,
        checkOut: record.attendance?.clockOut ? formatTime(record.attendance.clockOut) : null,
        task: record.task ? {
          id: record.task.id,
          name: record.task.title,
          status: record.task.status,
          priority: record.task.priority,
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
  getActiveTasksForCheckout,
  getDailyWorkRecords,
};
