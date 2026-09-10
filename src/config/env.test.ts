describe('env', () => {
  const originalPort = process.env.PORT;

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
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
});
