const { checkBranchName, isAllowedBranchName } = require('./check-branch-name');

describe('isAllowedBranchName', () => {
  it.each(['main', 'develop', 'testing'])('accepts long-lived branch %s', (branch) => {
    expect(isAllowedBranchName(branch)).toBe(true);
  });

  it.each([
    'feat/us1-register-work-email',
    'feat/us7-in-app-notifications',
    'feat/t1-project-scaffold',
    'feat/t9-join-request-tests',
    'feat/t10-ci-pipeline',
  ])('accepts feature branch %s', (branch) => {
    expect(isAllowedBranchName(branch)).toBe(true);
  });

  it.each(['fix/expired-jwt', 'fix/hotfix', 'fix/auth-token-expiry'])(
    'accepts hotfix branch %s',
    (branch) => {
      expect(isAllowedBranchName(branch)).toBe(true);
    },
  );

  it('accepts the grandfathered pre-rules branch', () => {
    expect(isAllowedBranchName('chore/initial-boilerplate-setup')).toBe(true);
  });

  it.each([
    'chore/another-setup',
    'feat/RID-1-authentication-and-db-setup',
    'feat/us1',
    'feat/us8-out-of-range',
    'feat/t11-out-of-range',
    'feat/US1-Register-Email',
    'feature/us1-register-work-email',
    'fix/Expired-JWT',
    'fix/',
    'prod',
    'dev',
    'main-backup',
  ])('rejects %s', (branch) => {
    expect(isAllowedBranchName(branch)).toBe(false);
  });
});

describe('checkBranchName', () => {
  it('returns 0 for an allowed branch', () => {
    const write = jest.fn();

    expect(checkBranchName({ branch: 'feat/us1-register-work-email', write })).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('returns 1 and prints the rule for a rejected branch', () => {
    const write = jest.fn();

    expect(checkBranchName({ branch: 'chore/another-setup', write })).toBe(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('Invalid branch name: "chore/another-setup"');
    expect(write.mock.calls[0][0]).toContain('feat/<us-id>-short-desc');
    expect(write.mock.calls[0][0]).toContain('main (prod), develop (dev), testing');
  });

  it('skips detached HEAD so rebases are not blocked', () => {
    const write = jest.fn();

    expect(checkBranchName({ branch: 'HEAD', write })).toBe(0);
    expect(write).toHaveBeenCalledWith('Skipping branch name check in detached HEAD state.');
  });

  it('uses GITHUB_HEAD_REF when no branch is passed', () => {
    const previous = process.env.GITHUB_HEAD_REF;
    process.env.GITHUB_HEAD_REF = 'feat/t1-project-scaffold';
    const write = jest.fn();

    try {
      expect(checkBranchName({ write })).toBe(0);
      expect(write).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.GITHUB_HEAD_REF;
      } else {
        process.env.GITHUB_HEAD_REF = previous;
      }
    }
  });
});
