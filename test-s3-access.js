require('dotenv').config();
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const bucket = process.env.AWS_S3_BUCKET;

async function testS3Access() {
  console.log('Testing S3 Access...\n');
  console.log('Bucket:', bucket);
  console.log('Region:', process.env.AWS_REGION);
  console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID?.substring(0, 10) + '...\n');

  try {
    // Test 1: List objects in employees folder
    console.log('Test 1: Listing objects in employees/ folder...');
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'employees/',
      MaxKeys: 5
    });
    
    const listResult = await s3Client.send(listCommand);
    console.log(`✅ Found ${listResult.Contents?.length || 0} objects`);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      console.log('\nSample files:');
      listResult.Contents.slice(0, 3).forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
      });
      
      // Test 2: Generate signed URL for first file
      const firstFile = listResult.Contents[0];
      console.log(`\nTest 2: Generating signed URL for: ${firstFile.Key}`);
      
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: firstFile.Key
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      console.log('✅ Signed URL generated successfully!');
      console.log('URL (first 100 chars):', signedUrl.substring(0, 100) + '...');
      console.log('\nFull URL:', signedUrl);
      console.log('\n✅ Try opening this URL in your browser - it should work!');
    } else {
      console.log('⚠️  No files found in employees/ folder');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.Code);
    console.error('Error details:', error);
  }
}

testS3Access();
