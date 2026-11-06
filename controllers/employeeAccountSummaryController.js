const { User, Department } = require('../models');

// This describes the existing account-list scope; it does not define workforce membership.
const getEmployeeAccountSummary = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const [groups, activeConfigurations] = await Promise.all([
      User.count({ where: { role: 'employee' }, group: ['status'] }),
      Department.count({ where: { isActive: true } }),
    ]);
    const counts = { total: 0, active: 0, inactive: 0, suspended: 0, unknown: 0 };
    for (const group of groups) {
      const count = Number(group.count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid aggregate count');
      const bucket = ['active', 'inactive', 'suspended'].includes(group.status) ? group.status : 'unknown';
      counts[bucket] += count;
      counts.total += count;
    }
    return res.json({
      success: true,
      data: {
        scope: { role: 'employee', filters: 'none', pagination: 'all-pages', basis: 'login-account-role' },
        counts,
        departments: { activeConfigurations },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Account summary unavailable' });
  }
};

module.exports = { getEmployeeAccountSummary };
