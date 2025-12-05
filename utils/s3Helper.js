const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// S3 client configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
  endpoint: process.env.AWS_S3_ENDPOINT || undefined,
  forcePathStyle: String(process.env.AWS_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'
});

const bucket = process.env.AWS_S3_BUCKET;

/**
 * Generate a signed URL for an S3 object
 * @param {string} key - The S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @param {object} overrides - Optional response overrides (e.g., { contentDisposition: 'inline', contentType: 'application/pdf' })
 * @returns {Promise<string>} - The signed URL
 */
async function getSignedUrlForObject(key, expiresIn = 3600, overrides = {}) {
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is not configured');
  }

  if (!key) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(overrides?.contentDisposition && { ResponseContentDisposition: overrides.contentDisposition }),
      ...(overrides?.contentType && { ResponseContentType: overrides.contentType }),
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }
}

/**
 * Extract S3 key from a URL or path
 * @param {string} urlOrPath - The URL or path to extract key from
 * @returns {string|null} - The extracted key or null
 */
function extractS3Key(urlOrPath) {
  if (!urlOrPath) return null;

  // If it's already a key (doesn't start with http)
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath;
  }

  try {
    const url = new URL(urlOrPath);
    
    // For S3 URLs like https://bucket.s3.region.amazonaws.com/key
    if (url.hostname.includes('.s3.') || url.hostname.includes('.s3-')) {
      return url.pathname.substring(1); // Remove leading slash
    }

    // For custom endpoints
    if (url.pathname.startsWith(`/${bucket}/`)) {
      return url.pathname.substring(bucket.length + 2);
    }

    return url.pathname.substring(1);
  } catch (error) {
    console.error('Error extracting S3 key:', error);
    return null;
  }
}

module.exports = {
  getSignedUrlForObject,
  extractS3Key,
  s3Client,
  bucket
};
