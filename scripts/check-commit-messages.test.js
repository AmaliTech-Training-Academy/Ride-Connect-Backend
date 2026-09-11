const { isGrandfatheredBranch } = require('./check-branch-name');
const { checkCommitMessages } = require('./check-commit-messages');

describe('isGrandfatheredBranch', () => {
  it('is true only for the pre-rules branch', () => {
    expect(isGrandfatheredBranch('chore/initial-boilerplate-setup')).toBe(true);
    expect(isGrandfatheredBranch('chore/another-setup')).toBe(false);
    expect(isGrandfatheredBranch('feat/us1-register-work-email')).toBe(false);
  });
});

describe('checkCommitMessages', () => {
  it('skips commitlint on the grandfathered branch', () => {
    const write = jest.fn();
    const lint = jest.fn(() => 1);

    expect(
      checkCommitMessages({
        branch: 'chore/initial-boilerplate-setup',
        write,
        runCommitlint: lint,
      }),
    ).toBe(0);
    expect(lint).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      'Skipping commitlint on grandfathered branch "chore/initial-boilerplate-setup".',
    );
  });

  it('runs commitlint on other branches', () => {
    const write = jest.fn();
    const lint = jest.fn(() => 0);

    expect(
      checkCommitMessages({
        branch: 'feat/us1-register-work-email',
        argv: ['--edit', 'COMMIT_EDITMSG'],
        write,
        runCommitlint: lint,
      }),
    ).toBe(0);
    expect(lint).toHaveBeenCalledWith(['--edit', 'COMMIT_EDITMSG']);
    expect(write).not.toHaveBeenCalled();
  });

  it('returns commitlint’s exit code when the branch is not grandfathered', () => {
    const lint = jest.fn(() => 1);

    expect(
      checkCommitMessages({
        branch: 'feat/us1-register-work-email',
        runCommitlint: lint,
      }),
    ).toBe(1);
  });
});
