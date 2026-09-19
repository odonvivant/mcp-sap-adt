#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { systemsFileSchema, SYSTEM_MODES, type SystemsFile, type SystemEntry } from '../src/config/SystemRegistry';

/** Stream shape `promptSecret` needs from `process.stdin` - injectable so tests can drive it with
 * a simulated TTY. */
export interface SecretInput extends NodeJS.EventEmitter {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
  resume(): unknown;
}

/** Reads a line of input without echoing it to the terminal (password/passphrase prompts). Falls
 * back to a plain (readline) read when stdin isn't a TTY - e.g. piped test input, where there is
 * no terminal to leak the value onto in the first place. Never writes the collected value
 * anywhere; only `\n` is written back to the terminal once the user presses Enter.
 *
 * Relies on `rl` having been created with `terminal: false` (see `createWizardInterface`): raw
 * mode only silences the OS-level echo, not readline's own. */
export async function promptSecret(
  rl: readline.Interface,
  query: string,
  stdin: SecretInput = process.stdin,
  stdout: { write(chunk: string): unknown } = process.stdout,
): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) {
    return rl.question(query);
  }

  stdout.write(query);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  const restoreRawMode = (): void => void stdin.setRawMode?.(Boolean(wasRaw));

  return new Promise<string>((resolve) => {
    let input = '';
    // A TTY 'data' event can carry more than one character in a single chunk (paste, fast
    // typing, a laggy connection) - handle every character in the chunk individually rather
    // than treating the whole chunk as one keypress, or a pasted secret gets silently mangled.
    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\n' || char === '\r') {
          stdin.removeListener('data', onData);
          restoreRawMode();
          stdout.write('\n');
          resolve(input);
          return;
        }
        if (char === '') {
          // Ctrl+C
          restoreRawMode();
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '' || char === '\b') {
          input = input.slice(0, -1);
          continue;
        }
        input += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function promptChoice<T extends string>(
  rl: readline.Interface,
  query: string,
  choices: readonly T[],
  defaultValue: T,
): Promise<T> {
  const answer = (await rl.question(`${query} [${choices.join('/')}] (default ${defaultValue}): `)).trim();
  if (answer === '') return defaultValue;
  const match = choices.find((choice) => choice.toLowerCase() === answer.toLowerCase());
  if (!match) {
    console.log(`  Not one of ${choices.join(', ')} - using default "${defaultValue}".`);
    return defaultValue;
  }
  return match;
}

async function promptList(rl: readline.Interface, query: string): Promise<string[] | undefined> {
  const answer = (await rl.question(`${query} (comma-separated, blank to skip): `)).trim();
  if (answer === '') return undefined;
  return answer
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function promptOneSystem(rl: readline.Interface): Promise<[string, SystemEntry]> {
  const alias = (await rl.question('System alias (e.g. dev, qas, prd): ')).trim();
  const url = (await rl.question('Base URL (e.g. https://host:44300): ')).trim();
  const client = (await rl.question('SAP client (e.g. 100): ')).trim();
  const authType = await promptChoice(rl, 'Auth type', ['basic', 'cert'] as const, 'basic');

  const verifyChoice = await promptChoice(
    rl,
    'Verify TLS certificate? (answer "no" only for a dev/test system with a self-signed certificate)',
    ['yes', 'no'] as const,
    'yes',
  );
  const rejectUnauthorized = verifyChoice === 'yes' ? undefined : false;

  let auth: SystemEntry['auth'];
  if (authType === 'basic') {
    const user = (await rl.question('Username: ')).trim();
    const password = await promptSecret(rl, 'Password: ');
    auth = { type: 'basic', user, password, rejectUnauthorized };
  } else {
    const certKind = await promptChoice(rl, 'Certificate form', ['pfx', 'keypair'] as const, 'pfx');
    const passphrase = await promptSecret(rl, 'Passphrase (blank if none): ');
    if (certKind === 'pfx') {
      const pfx = (await rl.question('Path to .pfx bundle: ')).trim();
      auth = { type: 'cert', pfx, passphrase: passphrase || undefined, rejectUnauthorized };
    } else {
      const cert = (await rl.question('Path to certificate (.pem): ')).trim();
      const key = (await rl.question('Path to private key: ')).trim();
      auth = { type: 'cert', cert, key, passphrase: passphrase || undefined, rejectUnauthorized };
    }
  }

  const mode = await promptChoice(rl, 'Guardrail mode', SYSTEM_MODES, 'guarded');
  const allowPackages = await promptList(rl, 'Allowed package prefixes (e.g. Z*)');
  const denyPackages = await promptList(rl, 'Denied package prefixes');
  const allowObjectTypes = await promptList(rl, 'Allowed object types (e.g. CLAS/OC)');

  return [alias, { url, client, auth, mode, allowPackages, denyPackages, allowObjectTypes }];
}

/** Runs the interactive wizard against an already-open `readline` interface and returns the
 * collected (and schema-validated) `systems.json` content - split out from `main()` so tests can
 * drive it with a scripted stdin without touching the real filesystem/process lifecycle. */
export async function runWizard(rl: readline.Interface): Promise<SystemsFile> {
  const systems: Record<string, SystemEntry> = {};

  for (;;) {
    const [alias, entry] = await promptOneSystem(rl);
    systems[alias] = entry;

    const again = (await rl.question('Add another system? (y/N): ')).trim().toLowerCase();
    if (again !== 'y' && again !== 'yes') break;
  }

  // Validates against the exact schema SystemRegistry uses at startup, so the wizard can never
  // hand the server a file it then refuses to load (design.md D4).
  return systemsFileSchema.parse(systems);
}

/** Runs an executable directly (no shell), so arguments are passed as an argv array and can never
 * be reinterpreted as shell syntax. */
export type CommandRunner = (file: string, args: string[]) => void;

const runCommand: CommandRunner = (file, args) => {
  execFileSync(file, args, { stdio: 'pipe' });
};

/**
 * Removes inherited ACLs from `filePath` and grants full control to the current user only.
 *
 * `fs.writeFileSync`'s `mode` is a no-op on Windows, so a freshly written `systems.json` otherwise
 * inherits the parent directory's ACL - typically `BUILTIN\Users:(RX)` plus
 * `Authenticated Users:(M)`, letting any local account read the plaintext SAP password and rewrite
 * the file to repoint a system alias or relax its `mode`.
 *
 * Returns the failure message if the file could not be restricted, `undefined` on success.
 */
export function restrictToCurrentUserWin32(filePath: string, run: CommandRunner = runCommand): string | undefined {
  const { username } = os.userInfo();
  const domain = process.env.USERDOMAIN;
  const principal = domain ? `${domain}\\${username}` : username;
  try {
    run('icacls', [filePath, '/inheritance:r', '/grant:r', `${principal}:F`]);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function writeSystemsFile(filePath: string, data: SystemsFile, run: CommandRunner = runCommand): void {
  const json = JSON.stringify(data, null, 2);
  if (process.platform !== 'win32') {
    fs.writeFileSync(filePath, json, { mode: 0o600 });
    return;
  }

  fs.writeFileSync(filePath, json);
  const failure = restrictToCurrentUserWin32(filePath, run);
  if (failure) {
    console.error(
      `\n!! WARNING: could not restrict permissions on ${filePath} (${failure}).\n` +
        '!! It contains your SAP credentials in plain text and may currently be readable and\n' +
        '!! writable by every local account. Fix it manually before using this server, e.g.:\n' +
        `!!   icacls "${filePath}" /inheritance:r /grant:r "%USERDOMAIN%\\%USERNAME%":F\n`,
    );
  }
}

/** Creates the wizard's readline interface with `terminal: false`. With a terminal-mode interface,
 * readline echoes every keystroke to `output` itself - independently of the raw mode
 * `promptSecret` sets - so passwords and passphrases end up on screen. Prompts written via
 * `question()` still appear, and a real TTY still echoes ordinary (non-raw) input at the OS level.
 * Exported for testing. */
export function createWizardInterface(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): readline.Interface {
  return readline.createInterface({ input, output, terminal: false });
}

async function main(): Promise<void> {
  const rl = createWizardInterface();
  try {
    console.log('mcp-sap-adt setup - configure one or more SAP systems (see README for details).\n');
    const systems = await runWizard(rl);
    const filePath = path.resolve(process.cwd(), 'systems.json');
    writeSystemsFile(filePath, systems);
    console.log(`\nWrote ${filePath} (${Object.keys(systems).length} system(s)).`);
    console.log('Nothing entered above (including any password/passphrase) was logged or echoed back.');
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
