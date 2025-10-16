const path = require('path');
const fs = require('fs');
const multer = require('multer');

const projectsUploadDir = path.join(__dirname, '..', 'uploads', 'projects');

// Ensure upload directory exists at startup
if (!fs.existsSync(projectsUploadDir)) {
  fs.mkdirSync(projectsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, projectsUploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeOriginal}`;
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  // Allow common docs/images/PDFs; tweak as needed
  const allowed = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type')); 
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

module.exports = {
  upload,
  projectsUploadDir
};


