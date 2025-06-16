const { Attendance } = require("../models");

// Clock In
const clockIn = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Check if already clocked in today
    const existing = await Attendance.findOne({
      where: { userId, date: today },
    });

    if (existing) {
      return res.status(400).json({ message: "Already clocked in for today" });
    }

    const attendance = await Attendance.create({
      userId,
      date: today,
      clockIn: new Date(),
      status: "present",
    });

    return res.status(200).json({ message: "Clock-in successful", attendance });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Clock Out
const clockOut = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().slice(0, 10);

    const attendance = await Attendance.findOne({
      where: { userId, date: today },
    });

    if (!attendance || attendance.clockOut) {
      return res
        .status(400)
        .json({ message: "Not clocked in or already clocked out" });
    }

    const now = new Date();
    const workedHours = (now - new Date(attendance.clockIn)) / (1000 * 60 * 60); // in hours

    attendance.clockOut = now;
    // attendance.workingHours = parseFloat(workedHours.toFixed(2));
    attendance.totalHours = parseFloat(workedHours.toFixed(2));

    await attendance.save();

    return res
      .status(200)
      .json({ message: "Clock-out successful", attendance });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = { clockIn, clockOut };
