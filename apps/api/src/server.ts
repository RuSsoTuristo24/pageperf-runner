import { createApp } from './app.js';
import { createDatabase } from './db/drizzle.js';
import { runMigrations } from './db/migrate.js';

const port = Number(process.env.PORT ?? 4310);
const databaseUrl = process.env.DATABASE_URL;
const host = process.env.DOCKER === '1' ? '0.0.0.0' : '127.0.0.1';

async function main(): Promise<void>
{
	let db;

	if (databaseUrl)
	{
		db = createDatabase(databaseUrl);
		await runMigrations(db);
		console.log('Database connected and migrations applied');
	}
	else
	{
		console.log('No DATABASE_URL — using JSON file storage');
	}

	const app = createApp({ db });
	await app.listen({ host, port });
	console.log(`Server listening on ${host}:${port}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
