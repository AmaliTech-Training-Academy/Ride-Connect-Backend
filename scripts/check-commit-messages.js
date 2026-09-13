// @ts-check
const { spawnSync } = require('node:child_process');

const { isGrandfatheredBranch, resolveBranchName } = require('./check-branch-name');

const COMMITLINT_CLI = require.resolve('@commitlint/cli/cli.js');

/**
 * Flags that already tell commitlint which messages to read. Without one of them it
 * falls back to stdin and blocks indefinitely when nothing is piped in.
 */
const INPUT_FLAGS = [
  '-e',
  '--edit',
  '-E',
  '--env',
  '-l',
  '--last',
  '-f',
  '--from',
  '--from-last-tag',
  '-t',
  '--to',
];

/** Branches a local commit range is measured against, best first. */
const DEFAULT_BASES = ['develop', 'main'];

/**
 * @param {string[]} argv
 * @returns {number}
 */
function runCommitlint(argv) {
  const result = spawnSync(process.execPath, [COMMITLINT_CLI, ...argv], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

/**
 * @param {string[]} argv
 * @returns {boolean}
 */
function selectsInput(argv) {
  return argv.some(
    (arg) =>
      INPUT_FLAGS.includes(arg) ||
      INPUT_FLAGS.some((flag) => flag.startsWith('--') && arg.startsWith(`${flag}=`))
  );
}

/**
 * @param {string} base
 * @returns {string | null}
 */
function resolveMergeBase(base) {
  const result = spawnSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' });

  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * The commits this branch adds on top of its base — the same range CI lints on the PR.
 *
 * @param {(base: string) => string | null} [mergeBase]
 * @returns {string[]}
 */
function defaultRange(mergeBase = resolveMergeBase) {
  for (const base of DEFAULT_BASES) {
    const found = mergeBase(base);

    if (found) {
      return ['--from', found, '--to', 'HEAD'];
    }
  }

  return ['--last'];
}

/**
 * @param {{
 *   branch?: string,
 *   argv?: string[],
 *   write?: (message: string) => void,
 *   runCommitlint?: (argv: string[]) => number,
 *   defaultRange?: () => string[],
 * }} [options]
 * @returns {number}
 */
function checkCommitMessages(options = {}) {
  const write = options.write ?? ((message) => console.warn(message));
  const lint = options.runCommitlint ?? runCommitlint;
  const argv = options.argv ?? process.argv.slice(2);
  const branch = options.branch ?? resolveBranchName();

  if (isGrandfatheredBranch(branch)) {
    write(`Skipping commitlint on grandfathered branch "${branch}".`);
    return 0;
  }

  if (selectsInput(argv)) {
    return lint(argv);
  }

  const range = (options.defaultRange ?? defaultRange)();

  write(`No commit range given; linting ${range.join(' ')}.`);

  return lint([...range, ...argv]);
}

function main() {
  process.exitCode = checkCommitMessages();
}

module.exports = {
  checkCommitMessages,
  defaultRange,
  selectsInput,
};

if (require.main === module) {
  main();
}
