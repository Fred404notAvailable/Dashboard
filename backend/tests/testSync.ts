import dotenv from 'dotenv';
dotenv.config();

import { performSync } from '../src/services/sheetsClient.js';

async function run() {
  console.log('Testing live performSync()...');
  try {
    const result = await performSync();
    console.log('Sync Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

run();
