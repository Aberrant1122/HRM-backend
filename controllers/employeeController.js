const { User, UserInfo } = require("../models");

const getAllEmployeesWithUserInfo = async (req, res) => {
  try {
    const includeUserInfo = req.body.includeUserInfo !== Boolean(false);

    const queryOptions = {
      where: { role: "employee" },
      ...(includeUserInfo && {
        include: [
          {
            model: UserInfo,
            as: "userInfo",
            attributes: { exclude: ["id", "userId", "createdAt", "updatedAt"] },
          },
        ],
      }),
      attributes: { exclude: ["password", "resetToken", "resetTokenExpiry"] },
    };

    const employees = await User.findAll(queryOptions);

    return res.status(200).json({
      success: true,
      data: employees,
      meta: { includeUserInfo },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = { getAllEmployeesWithUserInfo };
