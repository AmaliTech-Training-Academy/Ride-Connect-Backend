describe('env', () => {
  const originalPort = process.env.PORT;
  const originalNodeEnv = process.env.NODE_ENV;

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
    jest.resetModules();
  });

  it('reads PORT from the environment when set', async () => {
    process.env.PORT = '4000';
    jest.resetModules();

    const { env } = await import('./env');

    expect(env.port).toBe(4000);
  });

  it('defaults to port 3000 when PORT is unset', async () => {
    delete process.env.PORT;
    jest.resetModules();

    const { env } = await import('./env');

    expect(env.port).toBe(3000);
  });

  it('reads NODE_ENV from the environment when set', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('production');
  });

  it('defaults nodeEnv to "development" when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;
    jest.resetModules();

    const { env } = await import('./env');

    expect(env.nodeEnv).toBe('development');
  });
});
