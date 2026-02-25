// test-statum.js
import 'dotenv/config';
import aggregatorService from './src/services/aggregator.service.js';

const test = async () => {
    console.log("🚀 Testing Statum Connection...");
    const result = await aggregatorService.fetchProviderBalance();
    console.log("Result:", result);
};

test();