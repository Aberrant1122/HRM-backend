require("dotenv").config();

// Common database URL configuration if provided
const dbUrlConfig = process.env.DB_URL
  ? {
      url: process.env.DB_URL,
      dialect: "mysql",
      dialectOptions:
        process.env.NODE_ENV === "production"
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            }
          : {},
    }
  : null;

module.exports = {
  development: {
    ...dbUrlConfig,
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "hrm",
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
  },
  test: {
    ...dbUrlConfig,
    username: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: process.env.TEST_DB_NAME || "hrm_test",
    host: process.env.TEST_DB_HOST || "127.0.0.1",
    port: process.env.TEST_DB_PORT || 3306,
    dialect: "mysql",
  },
  production: {
    ...dbUrlConfig,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
