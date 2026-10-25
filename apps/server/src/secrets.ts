import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretStore } from './ddb/client.ts';

/** The DDB session cookie lives in a gitignored JSON file next to the database (ADR 0001). Never log it. */
export class FileSecretStore implements SecretStore {
  constructor(private path: string) {}

  private read(): { cobaltSession?: string } {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return {};
    }
  }

  getCobaltSession(): string | undefined {
    return this.read().cobaltSession || process.env.DDB_COBALT_SESSION || undefined;
  }

  setCobaltSession(value: string | undefined): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({ ...this.read(), cobaltSession: value }, null, 2), { mode: 0o600 });
  }
}

export class MemorySecretStore implements SecretStore {
  constructor(private value?: string) {}
  getCobaltSession() {
    return this.value;
  }
  setCobaltSession(value: string | undefined) {
    this.value = value;
  }
}
