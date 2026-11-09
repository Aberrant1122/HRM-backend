const { Attendance, LeaveRequest, User } = require('../models');
const { Op } = require('sequelize');

exports.getAccountActivity = async (req, res) => {
  const date = req.query.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number(date.slice(0, 4)) < 1000 || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ success: false, message: 'date must be a valid YYYY-MM-DD calendar date' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const include = [{ model: User, as: 'user', attributes: [], required: true, where: require('../utils/employeeCohort').where() }];
  try {
    const [attendanceAccounts, statuses, approvedLeaveAccounts, pendingLeaveRequests] = await Promise.all([
      Attendance.count({ where: { date }, include, distinct: true, col: 'userId' }),
      Attendance.count({ where: { date }, include, distinct: true, col: 'userId', group: ['Attendance.status'] }),
      LeaveRequest.count({ where: { status: 'approved', startDate: { [Op.lte]: date }, endDate: { [Op.gte]: date } }, include, distinct: true, col: 'userId' }),
      LeaveRequest.count({ where: { status: 'pending' }, include }),
    ]);
    const recordedStatuses = { present: 0, absent: 0, 'half-day': 0, leave: 0, 'on-leave': 0, unknown: 0 };
    for (const row of statuses) {
      const key = typeof row.status === 'string' ? row.status : 'unknown';
      // Preserve stored labels, including legacy values, without imposing a policy mapping.
      Object.defineProperty(recordedStatuses, key, { value: Number(row.count), enumerable: true, configurable: true });
    }
    return res.json({ success: true, data: {
      date,
      scope: { role: 'employee', preservedHrMembership: true, accountStatuses: 'all', basis: require('../utils/employeeCohort').basis, dateBasis: 'stored-calendar-date' },
      attendance: { accountsWithRecords: attendanceAccounts, distinctAccountsByRecordedStatus: recordedStatuses },
      approvedLeaveAccounts, pendingLeaveRequests,
    } });
  } catch (error) {
    console.error('Account activity summary failed:', error.message);
    return res.status(500).json({ success: false, message: 'Account activity unavailable' });
  }
};
