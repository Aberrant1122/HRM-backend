// Shared by the real HTTP server and acceptance; origins remain explicit.
module.exports = function corsPolicy(env = process.env, onBlocked = () => {}) {
  const allowedOrigins = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:3001', 'http://127.0.0.1:3001', env.FRONTEND_URL,
    'https://human-resource-management-production-eeeb.up.railway.app',
    'https://human-resource-management-production-b7d0.up.railway.app',
  ].filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      onBlocked();
      callback(Object.assign(Error('Not allowed by CORS'), { statusCode: 403 }));
    },
    credentials: true,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With, Idempotency-Key',
  };
};
