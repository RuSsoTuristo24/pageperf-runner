import { existsSync } from 'node:fs';
import path from 'node:path';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

export type AuthSessionRecord = {
  id: 'default';
  status: 'missing' | 'capturing' | 'ready' | 'failed';
  targetUrl?: string;
  updatedAt?: string;
  error?: string;
};

export class AuthSessionRepository
{
  #record: AuthSessionRecord;

  readonly #storageFilePath: string;

  readonly #stateFilePath: string;

  constructor(storageRoot: string)
  {
    this.#storageFilePath = path.join(storageRoot, 'data', 'auth', 'session.json');
    this.#stateFilePath = path.join(storageRoot, 'auth', 'default.json');
    this.#record = readJsonFileSync<AuthSessionRecord>(this.#storageFilePath, {
      id: 'default',
      status: 'missing',
    });
  }

  get(): AuthSessionRecord
  {
    if (this.#record.status === 'ready' && !existsSync(this.#stateFilePath))
    {
      this.#record = {
        id: 'default',
        status: 'missing',
      };
    }

    return { ...this.#record };
  }

  getStateFilePath(): string
  {
    return this.#stateFilePath;
  }

  save(record: AuthSessionRecord): AuthSessionRecord
  {
    this.#record = record;
    writeJsonFileSync(this.#storageFilePath, this.#record);

    return this.get();
  }
}
