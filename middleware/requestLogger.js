// Never log queries, authorization headers, bodies or URL credentials.
module.exports = logger => (req, res, next) => {
  let pathname = '[invalid-path]';
  try { pathname = new URL(req.originalUrl || req.url, 'http://request.invalid').pathname.replace(/[\r\n\u0000-\u001f\u007f]/g, ''); } catch (_) { /* No raw URL fallback. */ }
  const method = /^[A-Z]+$/.test(req.method) ? req.method : 'UNKNOWN';
  logger.info(`${method} ${pathname}`);
  next();
};
