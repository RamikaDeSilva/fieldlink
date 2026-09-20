import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * QVAC rejects a relative `cacheDirectory`, but the repo config must stay
 * machine-independent. Resolve it against the config file and hand the SDK a
 * generated absolute copy inside the (gitignored) cache directory.
 */
export function ensureQvacConfig(startDir = process.cwd()): string | null {
  // The bare worker can take well over the SDK's 30s default on a cold start.
  process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= '120000';

  const configPath = findConfigFile(startDir);
  if (!configPath) return null;

  const raw = readConfig(configPath);
  const cacheDirectory = cacheDirFromConfig(configPath, raw);

  mkdirSync(cacheDirectory, { recursive: true });
  const runtimePath = join(cacheDirectory, 'qvac.runtime.json');
  writeFileSync(runtimePath, JSON.stringify({ ...raw, cacheDirectory }, null, 2));
  process.env.QVAC_CONFIG_PATH = runtimePath;
  return runtimePath;
}

export function resolveQvacCacheDir(startDir = process.cwd()): string | null {
  const configPath = findConfigFile(startDir);
  return configPath ? cacheDirFromConfig(configPath, readConfig(configPath)) : null;
}

function readConfig(configPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
}

function cacheDirFromConfig(configPath: string, raw: Record<string, unknown>): string {
  const configured = typeof raw.cacheDirectory === 'string' ? raw.cacheDirectory : '.qvac';
  return isAbsolute(configured) ? configured : resolve(dirname(configPath), configured);
}

/**
 * Locate an already-downloaded GGUF. Downloads land as `<hash>_<fileName>`, and
 * a cancelled one leaves a truncated file behind under the same name, so verify
 * the magic bytes rather than trusting the name. Loading this path directly
 * skips the p2p registry, which can stall for minutes before the HTTP fallback
 * is even attempted.
 */
export function findCachedModel(fileName: string, startDir = process.cwd()): string | null {
  const cacheDirectory = resolveQvacCacheDir(startDir);
  if (!cacheDirectory) return null;

  try {
    const candidates = readdirSync(cacheDirectory)
      .filter((entry) => entry === fileName || entry.endsWith(`_${fileName}`))
      .map((entry) => join(cacheDirectory, entry))
      .filter(isCompleteGguf);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

function isCompleteGguf(path: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const header = Buffer.alloc(4);
    readSync(fd, header, 0, 4, 0);
    return header.toString('ascii') === 'GGUF';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'qvac.config.json');
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}
