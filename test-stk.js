// test-stk.js
import fs from 'fs';
import path from 'path';

// DEBUG: Let's see if the file actually exists where we think it does
const servicePath = './src/services/mpesa.auth.js';
console.log(`🔎 Checking for file at: ${path.resolve(servicePath)}`);
console.log(`❓ File exists: ${fs.existsSync(servicePath)}`);

import stkService from './src/services/stk.service.js';

const TEST_PHONE = "254708050827"; // Your number
const TEST_AMOUNT = 1.356;

stkService.initiateSTKPush(TEST_PHONE, TEST_AMOUNT)
    .then(result => console.log(result))
    .catch(err => console.error(err));