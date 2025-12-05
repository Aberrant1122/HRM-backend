const { extractS3Key } = require('./utils/s3Helper');

const testUrls = [
  'https://hrmstorage1.s3.eu-north-1.amazonaws.com/employees/1764791622259-429717463-HR_Management_System_-_Google_Chrome_12_3_2025_11_08_24_PM.png',
  'https://hrmstorage1.s3.eu-north-1.amazonaws.com/employees/1764793606913-714546021-My_stats_-_Upwork_-_Google_Chrome_11_30_2025_10_42_49_PM.png'
];

console.log('Testing S3 Key Extraction:\n');

testUrls.forEach((url, index) => {
  console.log(`Test ${index + 1}:`);
  console.log('URL:', url);
  const key = extractS3Key(url);
  console.log('Extracted Key:', key);
  console.log('');
});
