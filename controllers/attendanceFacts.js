const { Op, fn, col, where: expression } = require('sequelize');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const hours = value => { const minutes = Math.round(Number(value) * 60); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };
const day = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const raw = row => ({ id: row.id, userId: row.userId, date: row.date, day: day(row.date), status: row.status || 'unknown', clockIn: row.clockIn ? new Date(row.clockIn).toISOString() : null, clockOut: row.clockOut ? new Date(row.clockOut).toISOString() : null, totalHours: row.totalHours == null ? null : Number(row.totalHours), formattedHours: row.totalHours == null ? null : hours(row.totalHours) });
const fact = (date, rows) => rows.length === 1 ? { ...raw(rows[0]), recordState: 'recorded', records: rows.map(raw) } : { date, day: day(date), id: null, clockIn: null, clockOut: null, totalHours: null, formattedHours: null, status: rows.length ? 'conflict' : 'missing', recordState: rows.length ? 'conflict' : 'missing', records: rows.map(raw) };
module.exports = ({ sequelize: db, Attendance, User }) => {
  const wrap = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Attendance report unavailable' }); }
  };
  const invalid = () => { throw Object.assign(Error('Invalid attendance report filter'), { status: 400 }); };
  const selected = query => { const date = query.date ?? new Date().toISOString().slice(0, 10); if (!validDate(date)) invalid(); return date; };
  const grouped = rows => { const map = new Map(); for (const row of rows) { const key = row.date; if (!map.has(key)) map.set(key, []); map.get(key).push(row); } return map; };
  const today = wrap(async req => {
    const date = new Date().toISOString().slice(0, 10);
    const rows = await Attendance.findAll({ where: { userId: req.user.id, date }, order: [['id', 'ASC']] });
    return { success: true, ...fact(date, rows), user: { id: req.user.id, email: req.user.email } };
  });
  const weekly = wrap(async req => {
    const end = new Date().toISOString().slice(0, 10), start = new Date(Date.parse(end) - 6 * 86400000).toISOString().slice(0, 10);
    const rows = await Attendance.findAll({ where: { userId: req.user.id, date: { [Op.between]: [start, end] } }, order: [['date', 'ASC'], ['id', 'ASC']] });
    const map = grouped(rows), data = Array.from({ length: 7 }, (_, i) => { const date = new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10); return fact(date, map.get(date) || []); });
    const total = data.reduce((sum, row) => sum + (row.totalHours || 0), 0);
    return { success: true, startDate: start, endDate: end, data, summary: { totalDays: 7, presentDays: data.filter(r => r.status === 'present').length, absentDays: data.filter(r => r.status === 'absent').length, missingDays: data.filter(r => r.recordState === 'missing').length, conflictDays: data.filter(r => r.recordState === 'conflict').length, totalHours: total.toFixed(2), formattedTotalHours: hours(total) } };
  });
  const directory = wrap(async req => db.transaction({ isolationLevel: 'REPEATABLE READ', readOnly: true }, async transaction => {
    if (Object.keys(req.query).some(k => k !== 'date')) invalid();
    const date = selected(req.query);
    const users = await User.findAll({ where: { role: 'employee' }, attributes: ['id', 'fullName', 'email'], order: [['id', 'ASC']], transaction });
    const rows = await Attendance.findAll({ where: { date }, order: [['id', 'ASC']], transaction });
    const map = new Map(); for (const row of rows) { if (!map.has(row.userId)) map.set(row.userId, []); map.get(row.userId).push(row); }
    return { success: true, date, count: users.length, data: users.map(user => ({ ...fact(date, map.get(user.id) || []), userId: user.id, fullName: user.fullName, email: user.email })) };
  }));
  const listing = global => wrap(async req => {
    const q = req.query, allowed = ['page', 'limit', 'date', 'startDate', 'endDate', 'status', 'search'];
    if (Object.keys(q).some(k => !allowed.includes(k))) invalid();
    const positive = (v, fallback, max) => { if (v === undefined) return fallback; if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || Number(v) > max) invalid(); return Number(v); };
    const page = positive(q.page, 1, 1000000), limit = positive(q.limit, 10, 100);
    const where = global ? {} : { userId: req.user.id };
    if (q.search !== undefined) {
      if (typeof q.search !== 'string' || q.search.length > 128) invalid();
      where[Op.or] = ['date', 'status'].map(name => expression(fn('LOCATE', q.search, col(name)), { [Op.gt]: 0 }));
    }
    for (const key of ['date', 'startDate', 'endDate']) if (q[key] !== undefined && !validDate(q[key])) invalid();
    if (q.date && (q.startDate || q.endDate) || q.startDate && q.endDate && q.startDate > q.endDate) invalid();
    if (q.date) where.date = q.date;
    else if (q.startDate || q.endDate) where.date = { ...(q.startDate ? { [Op.gte]: q.startDate } : {}), ...(q.endDate ? { [Op.lte]: q.endDate } : {}) };
    if (q.status !== undefined && q.status !== 'all') { if (!['present', 'absent', 'leave', 'on-leave', 'half-day'].includes(q.status)) invalid(); where.status = q.status; }
    return db.transaction({ isolationLevel: 'REPEATABLE READ', readOnly: true }, async transaction => {
      const result = await Attendance.findAndCountAll({ where, order: [['date', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit, transaction });
      const data = result.rows.map(raw);
      if (global) {
        const users = await User.findAll({ where: { id: { [Op.in]: data.map(r => r.userId) } }, attributes: ['id', 'fullName', 'email'], transaction });
        for (const row of data) { const user = users.find(u => u.id === row.userId); row.fullName = user?.fullName || ''; row.email = user?.email || ''; }
      }
      return { success: true, [global ? 'attendance' : 'data']: data, pagination: { totalItems: result.count, totalPages: Math.ceil(result.count / limit), currentPage: page } };
    });
  });
  return { today, weekly, directory, all: listing(true), history: listing(false) };
};
