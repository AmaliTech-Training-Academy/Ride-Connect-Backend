const { isGrandfatheredBranch } = require('./check-branch-name');
const { checkCommitMessages, defaultRange, selectsInput } = require('./check-commit-messages');

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

describe('selectsInput', () => {
  it('recognises the flags commitlint reads messages from', () => {
    expect(selectsInput(['--edit', 'COMMIT_EDITMSG'])).toBe(true);
    expect(selectsInput(['--from=HEAD~1', '--to=HEAD'])).toBe(true);
    expect(selectsInput(['-l'])).toBe(true);
  });

  it('does not mistake other arguments for one', () => {
    expect(selectsInput([])).toBe(false);
    expect(selectsInput(['--verbose'])).toBe(false);
  });
});

describe('defaultRange', () => {
  it('measures from the first base branch that resolves', () => {
    expect(defaultRange((base) => (base === 'develop' ? 'abc123' : null))).toEqual([
      '--from',
      'abc123',
      '--to',
      'HEAD',
    ]);
  });

  it('falls back to main when develop is absent', () => {
    expect(defaultRange((base) => (base === 'main' ? 'def456' : null))).toEqual([
      '--from',
      'def456',
      '--to',
      'HEAD',
    ]);
  });

  it('falls back to the last commit when no base branch resolves', () => {
    expect(defaultRange(() => null)).toEqual(['--last']);
  });
});

describe('checkCommitMessages without a commit range', () => {
  it('lints the default range rather than blocking on stdin', () => {
    const write = jest.fn();
    const lint = jest.fn(() => 0);

    expect(
      checkCommitMessages({
        branch: 'feat/t1-project-scaffold',
        argv: [],
        write,
        runCommitlint: lint,
        defaultRange: () => ['--from', 'abc123', '--to', 'HEAD'],
      }),
    ).toBe(0);
    expect(lint).toHaveBeenCalledWith(['--from', 'abc123', '--to', 'HEAD']);
    expect(write).toHaveBeenCalledWith(
      'No commit range given; linting --from abc123 --to HEAD.',
    );
  });

  it('keeps flags the caller passed alongside the default range', () => {
    const lint = jest.fn(() => 0);

    checkCommitMessages({
      branch: 'feat/t1-project-scaffold',
      argv: ['--verbose'],
      write: jest.fn(),
      runCommitlint: lint,
      defaultRange: () => ['--last'],
    });

    expect(lint).toHaveBeenCalledWith(['--last', '--verbose']);
  });
});
