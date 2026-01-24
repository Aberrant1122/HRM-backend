const path = require("path");
const result = require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
if (result.error) {
  console.log("DOTENV config failed:", result.error);
} else {
  console.log("DOTENV config loaded from:", path.resolve(__dirname, "../.env"));
}
console.log("DB_PORT from env:", process.env.DB_PORT);
console.log("DB_HOST from env:", process.env.DB_HOST);

// Skip database configuration during build phase
if (process.env.NODE_ENV === 'production' && process.argv.includes('build')) {
  module.exports = {
    development: {},
    test: {},
    production: {}
  };
  return;
}

// Resolve Railway / generic env vars
const getBoolean = (val, def = false) => {
  if (val === undefined) return def;
  const s = String(val).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
};

const DB_URL = process.env.DATABASE_URL || process.env.DB_URL || null;
const DB_SSL = getBoolean(process.env.DB_SSL, false);

// Common database URL configuration if provided
const dbUrlConfig = DB_URL
  ? {
    use_env_variable: 'DATABASE_URL',
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
  : {};

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
  production: (() => {
    if (process.env.DATABASE_URL) {
      return {
        use_env_variable: 'DATABASE_URL',
        dialect: 'mysql',
      };
    }
    // Fallback configuration for when DATABASE_URL is not available (e.g., during build)
    return {
      username: process.env.DB_USER || process.env.MYSQL_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
      database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'hrm',
      host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
      port: process.env.DB_PORT || process.env.MYSQL_PORT || 3306,
      dialect: 'mysql',
    };
  })(),
};
