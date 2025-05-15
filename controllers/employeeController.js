const { User, UserInfo } = require('../models'); // Import models from the main models file


const getAllEmployeesWithUserInfo = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: 'employee' },
      include: [{ model: UserInfo, as: 'userInfo' }]
    });

    return res.status(200).json({ success: true, data: employees });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = { getAllEmployeesWithUserInfo };
