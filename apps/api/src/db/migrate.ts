import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

async function main(): Promise<void>
{
	const url = process.env.DATABASE_URL;
	if (!url)
	{
		console.error('DATABASE_URL required for migrations');
		process.exit(1);
	}
	const client = postgres(url, { max: 1 });
	const db = drizzle(client);
	await migrate(db, { migrationsFolder: 'apps/api/drizzle' });
	await client.end();
	console.log('migrations applied');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
