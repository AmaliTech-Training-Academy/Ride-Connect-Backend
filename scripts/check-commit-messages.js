// @ts-check
const { spawnSync } = require('node:child_process');

const { isGrandfatheredBranch, resolveBranchName } = require('./check-branch-name');

/**
 * @param {string[]} argv
 * @returns {number}
 */
function runCommitlint(argv) {
  const result = spawnSync('npx', ['--no', '--', 'commitlint', ...argv], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

/**
 * @param {{
 *   branch?: string,
 *   argv?: string[],
 *   write?: (message: string) => void,
 *   runCommitlint?: (argv: string[]) => number,
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

  return lint(argv);
}

function main() {
  process.exitCode = checkCommitMessages();
}

module.exports = {
  checkCommitMessages,
};

if (require.main === module) {
  main();
}
