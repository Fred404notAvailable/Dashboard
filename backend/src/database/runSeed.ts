import fs from 'fs';
import path from 'path';
import { query } from './db.js';

const schemaPath = path.resolve(process.cwd(), 'src/database/schema.sql');
const seedPath = path.resolve(process.cwd(), 'src/database/seed.sql');

async function run() {
  console.log('Initializing PostgreSQL database...');

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const seed = fs.readFileSync(seedPath, 'utf8');

  try {
    console.log('Running schema...');
    await query(schema);
    console.log('Schema loaded.');

    console.log('Running seed...');
    await query(seed);
    console.log('Seed data loaded successfully!');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    process.exit(0);
  }
}

run();
