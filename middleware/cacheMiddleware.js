const cache = require('memory-cache');

const cacheMiddleware = (durationInSeconds) => {
    return (req, res, next) => {
        // Skip caching in development or for non-GET requests
        if (process.env.NODE_ENV !== 'production' || req.method !== 'GET') {
            return next();
        }

        const key = '__express__' + req.originalUrl || req.url;
        const cachedBody = cache.get(key);

        if (cachedBody) {
            res.send(cachedBody);
            return;
        }

        res.sendResponse = res.send;
        res.send = (body) => {
            cache.put(key, body, durationInSeconds * 1000);
            res.sendResponse(body);
        };
        next();
    };
};

module.exports = cacheMiddleware;
