import { envSchema } from './env';

const VALID_ENV = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/ride_connect',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  TRUSTED_ORIGINS: 'http://localhost:5173',
};

const envWithout = (key: keyof typeof VALID_ENV): Record<string, string> => {
  const rest: Record<string, string> = { ...VALID_ENV };
  delete rest[key];
  return rest;
};

describe('envSchema', () => {
  it('coerces PORT to a number', () => {
    const parsed = envSchema.parse(VALID_ENV);

    expect(parsed.PORT).toBe(4000);
  });

  it('defaults PORT to 3000 when unset', () => {
    expect(envSchema.parse(envWithout('PORT')).PORT).toBe(3000);
  });

  it('rejects a non-numeric PORT', () => {
    expect(envSchema.safeParse({ ...VALID_ENV, PORT: 'http' }).success).toBe(false);
  });

  it('defaults NODE_ENV to "development" when unset', () => {
    expect(envSchema.parse(envWithout('NODE_ENV')).NODE_ENV).toBe('development');
  });

  it('rejects an unrecognised NODE_ENV', () => {
    expect(envSchema.safeParse({ ...VALID_ENV, NODE_ENV: 'staging' }).success).toBe(false);
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(envSchema.safeParse({ ...VALID_ENV, BETTER_AUTH_SECRET: 'a'.repeat(31) }).success).toBe(
      false
    );
  });

  it('rejects a BETTER_AUTH_URL that is not a URL', () => {
    expect(envSchema.safeParse({ ...VALID_ENV, BETTER_AUTH_URL: 'localhost' }).success).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(envSchema.safeParse(envWithout('DATABASE_URL')).success).toBe(false);
  });

  it('splits TRUSTED_ORIGINS on commas, trimming blanks', () => {
    const parsed = envSchema.parse({
      ...VALID_ENV,
      TRUSTED_ORIGINS: 'http://localhost:5173, https://rideconnect.app , ',
    });

    expect(parsed.TRUSTED_ORIGINS).toEqual(['http://localhost:5173', 'https://rideconnect.app']);
  });

  it('yields no trusted origins when TRUSTED_ORIGINS is unset', () => {
    expect(envSchema.parse(envWithout('TRUSTED_ORIGINS')).TRUSTED_ORIGINS).toEqual([]);
  });
});
