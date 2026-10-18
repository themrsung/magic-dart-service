import { ts } from '../i18n';
import { hash, verify } from '@node-rs/argon2';

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 256;

/** OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1). `algorithm: 2` is Argon2id. */
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * Frequently breached passwords that are long enough to pass the length rule. Shorter ones are
 * already rejected by MIN_PASSWORD. Compared case-insensitively.
 */
const COMMON = new Set(
  [
    '1234567890', '12345678910', '123456789a', '1234567890a', '0123456789', '0987654321', '1111111111', '0000000000',
    '1q2w3e4r5t', '1q2w3e4r5t6y', 'q1w2e3r4t5', 'qwertyuiop', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'asdfghjkl1',
    'asdfghjkl;', 'zxcvbnm123', '1qaz2wsx3edc', 'qazwsxedc123', 'qazwsxedcrfv', 'zaq12wsxcde3', 'password12', 'password123',
    'password1234', 'password12345', 'passw0rd123', 'p@ssw0rd123', 'p@ssword123', 'iloveyou12', 'iloveyou123', 'princess123',
    'sunshine123', 'football123', 'baseball123', 'basketball', 'superman123', 'starwars123', 'whatever123', 'trustno1234',
    'letmein123', 'letmein1234', 'welcome123', 'welcome1234', 'administrator', 'admin12345', 'admin123456', 'adminadmin',
    'changeme123', 'qwer1234!@#$', 'abcd1234!@', 'abc1234567', 'abcdefghij', 'abcdefg123', 'aaaaaaaaaa', 'a123456789',
    'q123456789', 'monkey12345', 'dragon12345', 'master12345', 'michael123', 'charlie123', 'jennifer123', 'computer123',
    'internet123', 'samsung123', 'samsung1234', 'iloveyou1234', 'loveyou1234', 'asdf1234!@', 'qwer1234!@', 'qwerasdfzxcv',
    'password!@#', 'passwordpassword', 'mypassword', 'mypassword1', 'secret1234', 'magicdart1', 'magicdart123',
    '1234qwerasdf', '12341234aa', 'asdasdasd1', 'zxcvbnmasd', 'qwertyqwerty', '!@#$%^&*()', '1q2w3e4r!', 'skdlsk1234',
    'dkssudgktpdy', 'rlawlgns12', 'tjdnf1234', 'gkdlfkdl12'
  ].map((p) => p.toLowerCase())
);

/** NIST SP 800-63B style: length and a breach list, no composition rules. Returns an error message or null. */
export function passwordProblem(password: string, username = ''): string | null {
  if (password.length < MIN_PASSWORD) return ts('auth.error.passwordShort', { min: MIN_PASSWORD });
  if (password.length > MAX_PASSWORD) return ts('auth.error.passwordLong', { max: MAX_PASSWORD });
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return ts('auth.error.passwordCommon');
  if (/^(.)\1+$/.test(password)) return ts('auth.error.passwordRepeat');
  if (username && lower.includes(username.toLowerCase())) return ts('auth.error.passwordUsername');
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Spends the same time as a real check so unknown usernames are not distinguishable by timing. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummy, password);
}
