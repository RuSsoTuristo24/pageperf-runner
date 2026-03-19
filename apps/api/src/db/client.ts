export function createDatabaseConfig()
{
	return {
		databaseUrl: process.env.DATABASE_URL ?? '',
	};
}
