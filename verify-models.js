// Quick script to verify all models are loading correctly
const db = require('./models');

console.log('\n=== Model Verification ===\n');

const models = Object.keys(db).filter(k => k !== 'sequelize' && k !== 'Sequelize');

console.log('Total models loaded:', models.length);
console.log('Models:', models.join(', '));

// Check specific models
const requiredModels = [
    'PayrollAdjustment',
    'PayrollPeriod', 
    'EmployeePayroll',
    'PayrollProfile',
    'User'
];

console.log('\n=== Required Models Check ===\n');

let allPresent = true;
requiredModels.forEach(modelName => {
    const exists = db[modelName] !== undefined;
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${modelName}: ${exists ? 'LOADED' : 'MISSING'}`);
    if (!exists) allPresent = false;
});

if (allPresent) {
    console.log('\n✅ All required models are loaded successfully!\n');
    process.exit(0);
} else {
    console.log('\n❌ Some models are missing! Please check the models directory.\n');
    process.exit(1);
}
