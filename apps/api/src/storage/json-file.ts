import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function ensureDirectorySync(targetPath: string): void
{
	mkdirSync(targetPath, { recursive: true });
}

export function readJsonFileSync<T>(filePath: string, fallback: T): T
{
	if (!existsSync(filePath))
	{
		return fallback;
	}

	const raw = readFileSync(filePath, 'utf8');

	if (!raw.trim())
	{
		return fallback;
	}

	return JSON.parse(raw) as T;
}

export function writeJsonFileSync(filePath: string, value: unknown): void
{
	ensureDirectorySync(path.dirname(filePath));

	const tempPath = `${filePath}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
	renameSync(tempPath, filePath);
}
