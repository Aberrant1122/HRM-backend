module.exports = {
    apps: [
        {
            name: "hrm-backend",
            script: "server.js",
            instances: "max", // Use all available CPU cores
            exec_mode: "cluster", // Enable cluster mode
            watch: false, // Disable watch for production
            max_memory_restart: "500M", // Restart if memory usage builds up
            log_date_format: "YYYY-MM-DD HH:mm Z",
            env: {
                NODE_ENV: "production",
            },
            env_development: {
                NODE_ENV: "development",
            }
        }
    ]
};
