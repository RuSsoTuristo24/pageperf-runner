import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from './schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabaseConfig()
{
	return {
		databaseUrl: process.env.DATABASE_URL ?? '',
	};
}

export function createDb(databaseUrl: string): Db
{
	const client = postgres(databaseUrl, { max: 5 });
	return drizzle(client, { schema });
}
