import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { AdtConnection, BasicAuthStrategy, CertAuthStrategy, type AdtAuth } from 'sap-adt-client';

/** A credential field's literal value, or an `"env:VAR_NAME"` reference resolved at load time. */
const secretSchema = z.string().min(1);

const basicAuthSchema = z
  .object({
    type: z.literal('basic'),
    user: z.string().min(1),
    password: secretSchema,
    /** Set `false` for a dev/test system with a self-signed certificate. Default `true`. */
    rejectUnauthorized: z.boolean().optional(),
  })
  .strict();

const certPfxAuthSchema = z
  .object({
    type: z.literal('cert'),
    pfx: z.string().min(1),
    passphrase: secretSchema.optional(),
    rejectUnauthorized: z.boolean().optional(),
  })
  .strict();

const certKeyPairAuthSchema = z
  .object({
    type: z.literal('cert'),
    cert: z.string().min(1),
    key: z.string().min(1),
    passphrase: secretSchema.optional(),
    rejectUnauthorized: z.boolean().optional(),
  })
  .strict();

const authSchema = z.union([basicAuthSchema, certPfxAuthSchema, certKeyPairAuthSchema]);

export const SYSTEM_MODES = ['read-only', 'guarded', 'open'] as const;
export type SystemMode = (typeof SYSTEM_MODES)[number];

/** A package scope rule: a literal prefix, optionally ending in one `*`. A `*` anywhere else is
 * rejected rather than accepted as a literal character - `"Z*FI"` can never match any package, so
 * silently keeping it would leave an operator believing a deny rule protects them while it does
 * nothing. */
const packagePrefixSchema = z
  .string()
  .min(1)
  .refine((value) => !value.trim().slice(0, -1).includes('*'), {
    message: '"*" is only supported as a trailing wildcard (e.g. "Z*"); it cannot appear mid-prefix',
  })
  .refine((value) => value.trim().replace(/\*$/, '').length > 0, {
    message: 'must contain a prefix before the trailing "*" - a bare "*" matches everything',
  });

const systemEntrySchema = z
  .object({
    url: z.string().url(),
    client: z.string().min(1),
    auth: authSchema,
    mode: z.enum(SYSTEM_MODES).default('guarded'),
    allowPackages: z.array(packagePrefixSchema).optional(),
    denyPackages: z.array(packagePrefixSchema).optional(),
    allowObjectTypes: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const systemsFileSchema = z.record(z.string().min(1), systemEntrySchema);

export type SystemEntry = z.infer<typeof systemEntrySchema>;
export type SystemsFile = z.infer<typeof systemsFileSchema>;

export type ResolvedAuth =
  | { type: 'basic'; user: string; password: string; rejectUnauthorized?: boolean }
  | { type: 'cert'; pfx: string; passphrase?: string; rejectUnauthorized?: boolean }
  | { type: 'cert'; cert: string; key: string; passphrase?: string; rejectUnauthorized?: boolean };

export interface ResolvedSystem {
  alias: string;
  url: string;
  client: string;
  auth: ResolvedAuth;
  mode: SystemMode;
  allowPackages?: string[];
  denyPackages?: string[];
  allowObjectTypes?: string[];
}

/** Thrown for any problem validating/resolving `systems.json` - always names the offending
 * system alias and field, per `adt-connectivity`'s "invalid entry blocks startup" requirement. */
export class SystemConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemConfigError';
  }
}

/** Thrown when no `systems.json` exists yet - distinct from `SystemConfigError` so callers can
 * greet a first-time user with setup guidance instead of a validation failure. */
export class SystemsFileMissingError extends Error {
  constructor(public readonly filePath: string) {
    super(
      `No systems configured (${filePath} not found). Run "npm run setup" to configure at least one SAP system.`,
    );
    this.name = 'SystemsFileMissingError';
  }
}

/** Thrown when a tool references a `system` alias that isn't configured. */
export class UnknownSystemError extends Error {
  constructor(alias: string, knownAliases: string[]) {
    super(
      knownAliases.length > 0
        ? `Unknown system "${alias}". Configured systems: ${knownAliases.join(', ')}.`
        : `Unknown system "${alias}". No systems are configured yet - run "npm run setup".`,
    );
    this.name = 'UnknownSystemError';
  }
}

const ENV_REF = /^env:(.+)$/;

function resolveSecret(alias: string, field: string, value: string): string {
  const match = ENV_REF.exec(value);
  if (!match) return value;
  const varName = match[1];
  const resolved = process.env[varName];
  if (resolved === undefined) {
    throw new SystemConfigError(
      `system "${alias}": environment variable "${varName}" referenced by "${field}" is not set`,
    );
  }
  return resolved;
}

function resolveAuth(alias: string, auth: SystemEntry['auth']): ResolvedAuth {
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      user: auth.user,
      password: resolveSecret(alias, 'auth.password', auth.password),
      rejectUnauthorized: auth.rejectUnauthorized,
    };
  }
  if ('pfx' in auth) {
    return {
      type: 'cert',
      pfx: auth.pfx,
      passphrase: auth.passphrase ? resolveSecret(alias, 'auth.passphrase', auth.passphrase) : undefined,
      rejectUnauthorized: auth.rejectUnauthorized,
    };
  }
  return {
    type: 'cert',
    cert: auth.cert,
    key: auth.key,
    passphrase: auth.passphrase ? resolveSecret(alias, 'auth.passphrase', auth.passphrase) : undefined,
    rejectUnauthorized: auth.rejectUnauthorized,
  };
}

function buildAuthStrategy(auth: ResolvedAuth): AdtAuth {
  if (auth.type === 'basic') {
    return new BasicAuthStrategy(auth.user, auth.password, auth.rejectUnauthorized ?? true);
  }
  if ('pfx' in auth) {
    return new CertAuthStrategy({
      pfxPath: auth.pfx,
      passphrase: auth.passphrase,
      rejectUnauthorized: auth.rejectUnauthorized,
    });
  }
  return new CertAuthStrategy({
    certPath: auth.cert,
    keyPath: auth.key,
    passphrase: auth.passphrase,
    rejectUnauthorized: auth.rejectUnauthorized,
  });
}

/**
 * Named registry of SAP systems loaded from `systems.json` (+ `env:`-referenced secrets),
 * Zod-validated at load time. Tool code never touches `systems.json` or `sap-adt-client`
 * directly - it resolves a `system` alias through this registry and, for the real gateway,
 * through {@link SystemRegistry.getConnection}, which caches one authenticated
 * {@link AdtConnection} per alias for the lifetime of the process.
 */
export class SystemRegistry {
  private readonly connections = new Map<string, AdtConnection>();

  private constructor(private readonly systems: Map<string, ResolvedSystem>) {}

  /** Loads and validates `systems.json` from `filePath` (default: `<cwd>/systems.json`). */
  static load(filePath: string = path.resolve(process.cwd(), 'systems.json')): SystemRegistry {
    if (!fs.existsSync(filePath)) {
      throw new SystemsFileMissingError(filePath);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (cause) {
      throw new SystemConfigError(
        `${filePath} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    return SystemRegistry.fromObject(raw);
  }

  /** Validates and builds a registry from an already-parsed object - used by `load()` and by the
   * setup wizard to validate what it's about to write before touching disk. */
  static fromObject(raw: unknown): SystemRegistry {
    const parsed = systemsFileSchema.safeParse(raw);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const alias = issue?.path[0] !== undefined ? String(issue.path[0]) : '<unknown>';
      const field = issue?.path.slice(1).join('.') || '(root)';
      throw new SystemConfigError(`system "${alias}": field "${field}" - ${issue?.message ?? 'invalid'}`);
    }

    const systems = new Map<string, ResolvedSystem>();
    for (const [alias, entry] of Object.entries(parsed.data)) {
      systems.set(alias, {
        alias,
        url: entry.url,
        client: entry.client,
        auth: resolveAuth(alias, entry.auth),
        mode: entry.mode,
        allowPackages: entry.allowPackages,
        denyPackages: entry.denyPackages,
        allowObjectTypes: entry.allowObjectTypes,
      });
    }
    return new SystemRegistry(systems);
  }

  listAliases(): string[] {
    return [...this.systems.keys()];
  }

  listSystems(): ResolvedSystem[] {
    return [...this.systems.values()];
  }

  getSystem(alias: string): ResolvedSystem {
    const system = this.systems.get(alias);
    if (!system) {
      throw new UnknownSystemError(alias, this.listAliases());
    }
    return system;
  }

  /** Returns the cached authenticated connection for `alias`, creating it on first use. Every
   * alias gets its own `AdtConnection` instance - never shared across aliases. */
  getConnection(alias: string): AdtConnection {
    const existing = this.connections.get(alias);
    if (existing) return existing;

    const system = this.getSystem(alias);
    const connection = new AdtConnection({
      baseUrl: system.url,
      client: system.client,
      auth: buildAuthStrategy(system.auth),
      // Stateful, not the 'stateless' default: an ABAP enqueue lock only survives between the
      // lock call and the write/delete that uses it inside a real server-side dialog session.
      // Stateless, every lock/write pair fails with "Resource ... is not locked (invalid lock
      // handle)" - confirmed live through this gateway, which is how this was found. One cached
      // connection per alias serves reads and writes alike, so it has to be stateful up front;
      // there is no point at which we could safely upgrade it.
      sessionMode: 'stateful',
    });
    this.connections.set(alias, connection);
    return connection;
  }
}
