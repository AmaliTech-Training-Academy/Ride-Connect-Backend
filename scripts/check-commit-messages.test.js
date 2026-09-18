const { isGrandfatheredBranch } = require('./check-branch-name');
const {
  GRANDFATHERED_THROUGH,
  checkCommitMessages,
  clampRange,
  defaultRange,
  selectsInput,
} = require('./check-commit-messages');

/** History where the cutoff sits between `old` and `new`. */
const ancestorOf = (ancestor, descendant) => {
  const order = ['old', GRANDFATHERED_THROUGH, 'new', 'HEAD'];

  return order.indexOf(ancestor) <= order.indexOf(descendant);
};

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

describe('clampRange', () => {
  it('starts at the cutoff when the range reaches back past it', () => {
    expect(clampRange(['--from', 'old', '--to', 'HEAD'], ancestorOf)).toEqual([
      '--from',
      GRANDFATHERED_THROUGH,
      '--to',
      'HEAD',
    ]);
  });

  it('rewrites the inline form the same way', () => {
    expect(clampRange(['--from=old', '--to=HEAD', '--verbose'], ancestorOf)).toEqual([
      `--from=${GRANDFATHERED_THROUGH}`,
      '--to=HEAD',
      '--verbose',
    ]);
  });

  it('leaves a range that already starts after the cutoff alone', () => {
    const argv = ['--from', 'new', '--to', 'HEAD'];

    expect(clampRange(argv, ancestorOf)).toBe(argv);
  });

  it('leaves a range whose history does not contain the cutoff alone', () => {
    const argv = ['--from', 'old', '--to', GRANDFATHERED_THROUGH];

    expect(clampRange(argv, () => false)).toBe(argv);
  });

  it('leaves the commit-msg hook alone', () => {
    const argv = ['--edit', 'COMMIT_EDITMSG'];

    expect(clampRange(argv, ancestorOf)).toBe(argv);
  });
});

describe('defaultRange with grandfathered history', () => {
  it('starts at the cutoff when the merge base predates it', () => {
    expect(defaultRange(() => 'old', ancestorOf)).toEqual([
      '--from',
      GRANDFATHERED_THROUGH,
      '--to',
      'HEAD',
    ]);
  });
});

describe('checkCommitMessages with an explicit range', () => {
  it('lints the clamped range and says why', () => {
    const write = jest.fn();
    const lint = jest.fn(() => 0);

    checkCommitMessages({
      branch: 'feat/t1-project-scaffold',
      argv: ['--from', 'old', '--to', 'HEAD'],
      write,
      runCommitlint: lint,
      clampRange: (argv) => clampRange(argv, ancestorOf),
    });

    expect(lint).toHaveBeenCalledWith(['--from', GRANDFATHERED_THROUGH, '--to', 'HEAD']);
    expect(write).toHaveBeenCalledWith(
      `Commits through ${GRANDFATHERED_THROUGH.slice(0, 7)} predate commitlint; linting from there.`,
    );
  });

  it('stays quiet when nothing is grandfathered out', () => {
    const write = jest.fn();
    const lint = jest.fn(() => 1);

    expect(
      checkCommitMessages({
        branch: 'feat/t1-project-scaffold',
        argv: ['--from', 'new', '--to', 'HEAD'],
        write,
        runCommitlint: lint,
        clampRange: (argv) => clampRange(argv, ancestorOf),
      }),
    ).toBe(1);
    expect(write).not.toHaveBeenCalled();
  });
});
