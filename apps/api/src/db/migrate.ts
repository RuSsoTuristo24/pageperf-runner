import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Database } from './drizzle.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDir, '../../drizzle');

export async function runMigrations(db: Database): Promise<void>
{
	await migrate(db, { migrationsFolder });
}
