require('dotenv').config();
const path = require('path');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');

// S3 client configuration (supports custom endpoint, e.g., for MinIO)
const s3 = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
  endpoint: process.env.AWS_S3_ENDPOINT || undefined,
  forcePathStyle: String(process.env.AWS_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'
});

const bucket = process.env.AWS_S3_BUCKET;
if (!bucket) {
  throw new Error('AWS_S3_BUCKET is not set');
}

const projectsPrefix = (process.env.AWS_S3_PROJECTS_PREFIX || 'projects/').replace(/^\//, '');
const employeesPrefix = (process.env.AWS_S3_EMPLOYEES_PREFIX || 'employees/').replace(/^\//, '');

function generateSafeKey(prefix, originalName) {
  const timestamp = Date.now();
  const safeOriginal = String(originalName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-150);
  const uniquePart = `${timestamp}-${Math.round(Math.random() * 1e9)}`;
  return `${prefix}${uniquePart}-${safeOriginal}`;
}

function fileFilter(req, file, cb) {
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

const projectsStorage = multerS3({
  s3,
  bucket,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  // acl: process.env.AWS_S3_ACL || 'public-read',
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key: function (req, file, cb) {
    const key = generateSafeKey(projectsPrefix, file.originalname);
    // Preserve compatibility for downstream code that expects filename
    file.filename = path.basename(key);
    cb(null, key);
  }
});

const employeesStorage = multerS3({
  s3,
  bucket,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  acl: process.env.AWS_S3_ACL || 'public-read',
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key: function (req, file, cb) {
    const key = generateSafeKey(employeesPrefix, file.originalname);
    file.filename = path.basename(key);
    cb(null, key);
  }
});

const upload = multer({
  storage: projectsStorage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }
});

const uploadEmployeeAttachments = multer({
  storage: employeesStorage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }
});

module.exports = {
  upload,
  uploadEmployeeAttachments,
  // Keep exported names for compatibility; now represent S3 prefixes
  projectsUploadDir: projectsPrefix,
  employeesUploadDir: employeesPrefix
};

