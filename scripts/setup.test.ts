import type * as readline from 'node:readline/promises';
import { runWizard } from './setup';
import { systemsFileSchema } from '../src/config/SystemRegistry';

const SECRET_PASSWORD = 'sup3r-Secret-Pw!';
const SECRET_PASSPHRASE = 'p4ssphrase-42';

/** A fake `readline.Interface` that answers `question()` from a pre-scripted queue, in order.
 * Avoids the real `readline`/stream timing pitfalls of piping a whole scripted transcript through
 * a real stream (line events can outrun sequential `await question()` calls) - this is a thin
 * wrapper the wizard only ever calls `.question()`/`.close()` on. */
function scriptedInterface(answers: string[]): readline.Interface {
  const queue = [...answers];
  return {
    question: jest.fn(async () => {
      if (queue.length === 0) throw new Error('scriptedInterface: ran out of scripted answers');
      return queue.shift() as string;
    }),
    close: jest.fn(),
  } as unknown as readline.Interface;
}

describe('setup wizard (scripts/setup.ts)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('produces a systems.json that validates against the SystemRegistry schema with no manual edits', async () => {
    const rl = scriptedInterface([
      'dev',
      'https://dev.example.com:44300',
      '100',
      'basic',
      'yes', // verify TLS certificate
      'devuser',
      SECRET_PASSWORD,
      'guarded',
      '', // allowPackages
      '', // denyPackages
      '', // allowObjectTypes
      'n', // add another?
    ]);

    const systems = await runWizard(rl);

    expect(() => systemsFileSchema.parse(systems)).not.toThrow();
    expect(systems.dev).toMatchObject({ url: 'https://dev.example.com:44300', client: '100', mode: 'guarded' });
  });

  it('sets rejectUnauthorized: false when the user declines TLS verification (self-signed dev cert)', async () => {
    const rl = scriptedInterface([
      'dev',
      'https://dev.example.com:44300',
      '100',
      'basic',
      'no', // verify TLS certificate
      'devuser',
      SECRET_PASSWORD,
      'guarded',
      '',
      '',
      '',
      'n',
    ]);

    const systems = await runWizard(rl);

    expect(() => systemsFileSchema.parse(systems)).not.toThrow();
    expect(systems.dev.auth).toMatchObject({ type: 'basic', rejectUnauthorized: false });
  });

  it('supports adding multiple systems in one run', async () => {
    const rl = scriptedInterface([
      'dev',
      'https://dev.example.com:44300',
      '100',
      'basic',
      'yes', // verify TLS certificate
      'devuser',
      SECRET_PASSWORD,
      'guarded',
      '',
      '',
      '',
      'y',
      'qas',
      'https://qas.example.com:44300',
      '200',
      'cert',
      'yes', // verify TLS certificate
      'pfx',
      SECRET_PASSPHRASE,
      './certs/qas.pfx',
      'read-only',
      '',
      '',
      '',
      'n',
    ]);

    const systems = await runWizard(rl);

    expect(Object.keys(systems).sort()).toEqual(['dev', 'qas']);
    expect(systems.qas.mode).toBe('read-only');
  });

  it('never logs a password or passphrase anywhere in the wizard run (no confirmation-summary leak)', async () => {
    const rl = scriptedInterface([
      'prd',
      'https://prd.example.com:44300',
      '300',
      'cert',
      'yes', // verify TLS certificate
      'keypair',
      SECRET_PASSPHRASE,
      './certs/prd.pem',
      './certs/prd.key',
      'read-only',
      '',
      '',
      '',
      'n',
    ]);

    await runWizard(rl);

    const loggedText = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(loggedText).not.toContain(SECRET_PASSPHRASE);
    expect(loggedText).not.toContain(SECRET_PASSWORD);
  });
});
