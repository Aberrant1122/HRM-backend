const multer = require('multer');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']);
module.exports = async (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  let directory;
  const cleanup = async () => {
    if (!directory) return;
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('hrm-attendance-')) throw Error('Unexpected attendance temporary directory');
    await fs.rm(resolved, { recursive: true, force: true });
  };
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hrm-attendance-'));
    const storage = multer.diskStorage({ destination: directory, filename: (_, file, cb) => cb(null, crypto.randomUUID()) });
    const parse = multer({ storage, limits: { fileSize: 20 * 1024 * 1024, files: 10, fields: 10, fieldSize: 16000, parts: 20 }, fileFilter: (_, file, cb) => cb(allowed.has(file.mimetype) ? null : Error('Unsupported file type'), allowed.has(file.mimetype)) }).array('deliverables', 10);
    req.cleanupAttendanceFiles = cleanup;
    parse(req, res, async error => {
      if (error) { await req.cleanupAttendanceFiles(); return res.status(400).json({ message: 'Invalid attendance attachment request' }); }
      if (req.aborted) { await req.cleanupAttendanceFiles(); return; }
      next();
    });
  } catch (_) {
    await cleanup();
    res.status(503).json({ message: 'Temporary attachment storage unavailable' });
  }
};
