require("dotenv").config();

// Common database configuration
const commonConfig = {
  dialect: "mysql",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
    evict: 1000,
    handleDisconnects: true
  },
  retry: {
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/
    ],
    max: 3,
    timeout: 60000
  }
};

// Common database URL configuration if provided
const dbUrlConfig = process.env.DB_URL
  ? {
      ...commonConfig,
      url: process.env.DB_URL,
      dialectOptions: {
        ...(process.env.NODE_ENV === "production" && {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }),
        connectTimeout: 60000,
        supportBigNumbers: true,
        bigNumberStrings: false,
        dateStrings: true,
        typeCast: true
      }
    }
  : null;

const config = {
  development: {
    ...commonConfig,
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "hrm",
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || 3306,
  },
  test: {
    ...commonConfig,
    username: process.env.TEST_DB_USER || "root",
    password: process.env.TEST_DB_PASSWORD || "",
    database: process.env.TEST_DB_NAME || "hrm_test",
    host: process.env.TEST_DB_HOST || "127.0.0.1",
    port: process.env.TEST_DB_PORT || 3306,
  },
  production: {
    ...commonConfig,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialectOptions: {
      ...(process.env.NODE_ENV === 'production' && {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }),
      connectTimeout: 60000,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: true,
      typeCast: true
    }
  }
};

// Apply URL config if provided
if (dbUrlConfig) {
  Object.keys(config).forEach(env => {
    config[env] = { ...config[env], ...dbUrlConfig };
  });
}

module.exports = config;
