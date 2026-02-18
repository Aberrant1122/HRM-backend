// Test script to verify the check-project-manager endpoint
const jwt = require('jsonwebtoken');

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "your_secret_key";

// Create a test token for a user
const testUserId = 1; // Change this to your test user ID
const testToken = jwt.sign(
  { id: testUserId, email: 'test@example.com', role: 'employee' },
  JWT_SECRET_KEY,
  { expiresIn: '1h' }
);

console.log('\n=== Manager Check API Test ===\n');
console.log('Test User ID:', testUserId);
console.log('Test Token:', testToken);
console.log('\nTo test the API, run this curl command:\n');
console.log(`curl -X GET http://localhost:5001/api/auth/check-project-manager \\
  -H "Authorization: Bearer ${testToken}" \\
  -H "Content-Type: application/json"`);
console.log('\n');
console.log('Or test in browser console:');
console.log(`
fetch('http://localhost:5001/api/auth/check-project-manager', {
  headers: {
    'Authorization': 'Bearer ${testToken}',
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
`);
