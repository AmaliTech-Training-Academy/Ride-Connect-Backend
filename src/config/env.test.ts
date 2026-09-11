describe('env', () => {
  const originalPort = process.env.PORT;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDatabaseSsl = process.env.DATABASE_SSL;

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalDatabaseSsl === undefined) {
      delete process.env.DATABASE_SSL;
    } else {
      process.env.DATABASE_SSL = originalDatabaseSsl;
    }
    jest.resetModules();
  });

  it('reads PORT from the environment when set', () => {
    process.env.PORT = '4000';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.port).toBe(4000);
  });

  it('defaults to port 3000 when PORT is unset', () => {
    delete process.env.PORT;
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.port).toBe(3000);
  });

  it('reads NODE_ENV from the environment when set', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.nodeEnv).toBe('production');
  });

  it('defaults nodeEnv to "development" when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.nodeEnv).toBe('development');
  });

  it('reads DATABASE_URL from the environment when set', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.databaseUrl).toBe('postgres://user:pass@host:5432/db');
  });

  it('defaults databaseUrl to an empty string when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.databaseUrl).toBe('');
  });

  it('defaults databaseSsl to true when DATABASE_SSL is unset', () => {
    delete process.env.DATABASE_SSL;
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.databaseSsl).toBe(true);
  });

  it('disables databaseSsl only when DATABASE_SSL is exactly "false"', () => {
    process.env.DATABASE_SSL = 'false';
    jest.resetModules();

    const { env: disabled } = jest.requireActual('./env') as typeof import('./env');
    expect(disabled.databaseSsl).toBe(false);

    process.env.DATABASE_SSL = 'true';
    jest.resetModules();

    const { env: enabled } = jest.requireActual('./env') as typeof import('./env');
    expect(enabled.databaseSsl).toBe(true);
  });

  it('reads BETTER_AUTH_SECRET from the environment when set', () => {
    process.env.BETTER_AUTH_SECRET = 'shh';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.betterAuthSecret).toBe('shh');
  });

  it('reads BETTER_AUTH_URL from the environment when set', () => {
    process.env.BETTER_AUTH_URL = 'https://api.rideconnect.example';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.betterAuthUrl).toBe('https://api.rideconnect.example');
  });

  it('defaults betterAuthUrl to localhost using the configured port when unset', () => {
    delete process.env.BETTER_AUTH_URL;
    process.env.PORT = '4000';
    jest.resetModules();

    const { env } = jest.requireActual('./env') as typeof import('./env');

    expect(env.betterAuthUrl).toBe('http://localhost:4000');
  });
});
