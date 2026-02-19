const { User, Attendance, LeaveRequest, Task, Project, UserInfo, LeaveType } = require('../models');
const { Op } = require('sequelize');

class DashboardController {
    async getSummary(req, res) {
        try {
            const userRole = req.user.role;
            const userId = req.user.id;
            const today = new Date().toISOString().split('T')[0];

            let summary = {
                role: userRole,
                stats: {},
                recentActivity: []
            };

            if (userRole === 'admin') {
                const [totalEmployees, attendanceData, todayLeaves, pendingLeaves, taskStats] = await Promise.all([
                    User.count({ where: { role: 'employee' } }),
                    Attendance.findAll({ where: { date: today } }),
                    LeaveRequest.count({
                        where: {
                            startDate: { [Op.lte]: today },
                            endDate: { [Op.gte]: today },
                            status: 'approved'
                        }
                    }),
                    LeaveRequest.count({ where: { status: 'pending' } }),
                    Task.findAll({
                        where: { isActive: true },
                        attributes: ['status']
                    })
                ]);

                const presentCount = attendanceData.length;
                const lateCount = attendanceData.filter(a => a.status === 'late').length;

                // Calculate avg check-in
                let avgCheckIn = '--:--';
                const checkInTimes = attendanceData
                    .filter(a => a.clockIn)
                    .map(a => {
                        const d = new Date(a.clockIn);
                        return d.getHours() * 60 + d.getMinutes();
                    });

                if (checkInTimes.length > 0) {
                    const avgMinutes = checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length;
                    const h = Math.floor(avgMinutes / 60);
                    const m = Math.floor(avgMinutes % 60);
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const h12 = h % 12 || 12;
                    avgCheckIn = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
                }

                const totalTasks = taskStats.length;
                const completedTasks = taskStats.filter(t => t.status === 'completed').length;
                const performance = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                summary.stats = {
                    totalEmployees,
                    presentToday: presentCount,
                    lateToday: lateCount,
                    avgCheckIn,
                    onLeaveToday: todayLeaves,
                    pendingLeaves,
                    performance: `${performance}%`
                };
            } else if (userRole === 'manager' || (userRole === 'employee' && req.query.view === 'manager')) {
                const [managedProjects, taskStats] = await Promise.all([
                    Project.findAll({ where: { managerId: userId, isActive: true }, attributes: ['id', 'name', 'status', 'description', 'startDate', 'endDate'] }),
                    Task.findAll({
                        include: [{
                            model: Project,
                            as: 'project',
                            where: { managerId: userId },
                            attributes: []
                        }],
                        where: { isActive: true },
                        attributes: ['status', 'dueDate']
                    })
                ]);

                const totalProjectTasks = taskStats.length;
                const completedProjectTasks = taskStats.filter(t => t.status === 'completed').length;
                const inProgressTasks = taskStats.filter(t => t.status === 'in-progress').length;
                const pendingTasks = taskStats.filter(t => t.status === 'todo' || t.status === 'pending').length;

                const overdueTasks = taskStats.filter(t =>
                    t.status !== 'completed' &&
                    t.dueDate &&
                    new Date(t.dueDate) < new Date()
                ).length;

                summary.stats = {
                    managedProjectsCount: managedProjects.length,
                    totalTasks: totalProjectTasks,
                    completedTasks: completedProjectTasks,
                    inProgressTasks,
                    pendingTasks,
                    overdueTasks,
                    activeProjects: managedProjects.filter(p => !['completed', 'cancelled'].includes(p.status?.toLowerCase?.() || p.status)).length
                };
                summary.managedProjects = managedProjects.slice(0, 3);
            } else if (userRole === 'employee') {
                const startOfWeek = new Date();
                startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
                startOfWeek.setHours(0, 0, 0, 0);

                const [myTasks, myAttendance, weeklyAttendance, leaveTypes, myLeaves] = await Promise.all([
                    Task.findAll({ where: { assigneeId: userId, isActive: true }, attributes: ['id', 'title', 'status', 'priority', 'dueDate'] }),
                    Attendance.findOne({ where: { userId, date: today } }),
                    Attendance.findAll({
                        where: {
                            userId,
                            date: { [Op.gte]: startOfWeek.toISOString().split('T')[0] }
                        }
                    }),
                    LeaveType.findAll({ where: { status: 'active' } }),
                    LeaveRequest.findAll({ where: { userId, status: 'approved' } })
                ]);

                // Calculate weekly hours
                let totalWorkMinutes = 0;
                weeklyAttendance.forEach(att => {
                    if (att.clockIn && att.clockOut) {
                        const checkIn = new Date(att.clockIn);
                        const checkOut = new Date(att.clockOut);
                        totalWorkMinutes += (checkOut - checkIn) / (1000 * 60);
                    }
                });
                const weeklyHours = (totalWorkMinutes / 60).toFixed(1);

                // Calculate leave balance
                const totalQuota = leaveTypes.reduce((acc, t) => acc + (t.annual_quota || 0), 0);
                const totalUsed = myLeaves.reduce((acc, l) => acc + (l.totalDays || 0), 0);
                const leaveBalance = Math.max(0, totalQuota - totalUsed);

                summary.stats = {
                    todoTasks: myTasks.filter(t => t.status === 'todo' || t.status === 'pending').length,
                    inProgressTasks: myTasks.filter(t => t.status === 'in-progress').length,
                    completedTasks: myTasks.filter(t => t.status === 'completed').length,
                    attendanceStatus: myAttendance ? myAttendance.status : 'not-marked',
                    upcomingLeaves: myLeaves.filter(l => new Date(l.startDate) >= new Date()).length,
                    leaveBalance,
                    weeklyHours
                };
                summary.recentTasks = myTasks.slice(0, 5);
            }

            return res.json({
                success: true,
                data: summary
            });
        } catch (error) {
            console.error('Error fetching dashboard summary:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch dashboard summary',
                error: error.message
            });
        }
    }
}

module.exports = new DashboardController();
