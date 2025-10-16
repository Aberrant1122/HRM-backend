require("dotenv").config();

// Resolve Railway / generic env vars
const getBoolean = (val, def = false) => {
  if (val === undefined) return def;
  const s = String(val).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
};

const DB_URL = process.env.DB_URL || process.env.DATABASE_URL || null;
const DB_SSL = getBoolean(process.env.DB_SSL, false);

// Common database URL configuration if provided
const dbUrlConfig = DB_URL
  ? {
      url: DB_URL,
      dialect: "mysql",
      dialectOptions: DB_SSL
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
    username: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "hrm",
    host: process.env.DB_HOST || process.env.MYSQLHOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
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
    username: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    dialect: "mysql",
    dialectOptions: DB_SSL
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  },
};
