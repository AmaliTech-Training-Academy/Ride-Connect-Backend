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

/** Written before commitlint ran; exempt through this commit only. Never move it forward. */
const GRANDFATHERED_THROUGH = '1bdd4de4631aecc2d22bac28a0027b9514896e02';

/** Flags naming the commit a range starts after. */
const FROM_FLAGS = ['-f', '--from'];

/** Flags naming the commit a range ends at. */
const TO_FLAGS = ['-t', '--to'];

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
 * @param {string} ancestor
 * @param {string} descendant
 * @returns {boolean}
 */
function isAncestor(ancestor, descendant) {
  return (
    spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    }).status === 0
  );
}

/**
 * Where linting a range should really start: the cutoff when the range reaches back past
 * it, the caller's own start otherwise.
 *
 * @param {string} from
 * @param {string} to
 * @param {(ancestor: string, descendant: string) => boolean} [ancestorOf]
 * @returns {string}
 */
function enforcedStart(from, to, ancestorOf = isAncestor) {
  if (!ancestorOf(from, GRANDFATHERED_THROUGH) || !ancestorOf(GRANDFATHERED_THROUGH, to)) {
    return from;
  }

  return GRANDFATHERED_THROUGH;
}

/**
 * @param {string[]} argv
 * @param {string[]} flags
 * @returns {{ value: string, index: number, prefix: string } | null}
 */
function findFlag(argv, flags) {
  for (let index = 0; index < argv.length; index += 1) {
    if (flags.includes(argv[index]) && index + 1 < argv.length) {
      return { value: argv[index + 1], index: index + 1, prefix: '' };
    }

    const inline = flags.find((flag) => argv[index].startsWith(`${flag}=`));

    if (inline) {
      return {
        value: argv[index].slice(inline.length + 1),
        index,
        prefix: `${inline}=`,
      };
    }
  }

  return null;
}

/**
 * @param {string[]} argv
 * @param {(ancestor: string, descendant: string) => boolean} [ancestorOf]
 * @returns {string[]}
 */
function clampRange(argv, ancestorOf = isAncestor) {
  const from = findFlag(argv, FROM_FLAGS);

  if (!from) {
    return argv;
  }

  const start = enforcedStart(from.value, findFlag(argv, TO_FLAGS)?.value ?? 'HEAD', ancestorOf);

  if (start === from.value) {
    return argv;
  }

  const clamped = [...argv];
  clamped[from.index] = `${from.prefix}${start}`;

  return clamped;
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
 * @param {(ancestor: string, descendant: string) => boolean} [ancestorOf]
 * @returns {string[]}
 */
function defaultRange(mergeBase = resolveMergeBase, ancestorOf = isAncestor) {
  for (const base of DEFAULT_BASES) {
    const found = mergeBase(base);

    if (found) {
      return ['--from', enforcedStart(found, 'HEAD', ancestorOf), '--to', 'HEAD'];
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
 *   clampRange?: (argv: string[]) => string[],
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
    const clamped = (options.clampRange ?? clampRange)(argv);

    if (clamped !== argv) {
      write(
        `Commits through ${GRANDFATHERED_THROUGH.slice(0, 7)} predate commitlint; linting from there.`
      );
    }

    return lint(clamped);
  }

  const range = (options.defaultRange ?? defaultRange)();

  write(`No commit range given; linting ${range.join(' ')}.`);

  return lint([...range, ...argv]);
}

function main() {
  process.exitCode = checkCommitMessages();
}

module.exports = {
  GRANDFATHERED_THROUGH,
  checkCommitMessages,
  clampRange,
  defaultRange,
  enforcedStart,
  selectsInput,
};

if (require.main === module) {
  main();
}
