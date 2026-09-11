// @ts-check
const { execFileSync } = require('node:child_process');

/** Long-lived remotes: main (prod), develop (dev), testing. */
const LONG_LIVED_BRANCHES = new Set(['main', 'develop', 'testing']);

/** Created before branch naming was enforced. Do not add new names here. */
const GRANDFATHERED_BRANCHES = new Set(['chore/initial-boilerplate-setup']);

/** `feat/<us-id>-short-desc` — us-id is US1–US7 or T1–T10. */
const FEATURE_BRANCH = /^feat\/(?:us[1-7]|t(?:[1-9]|10))-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Hotfix branches: `fix/<short-desc>` off main (prod). */
const HOTFIX_BRANCH = /^fix\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {string} branch
 * @returns {boolean}
 */
function isAllowedBranchName(branch) {
  return (
    LONG_LIVED_BRANCHES.has(branch) ||
    GRANDFATHERED_BRANCHES.has(branch) ||
    FEATURE_BRANCH.test(branch) ||
    HOTFIX_BRANCH.test(branch)
  );
}

/**
 * @returns {string}
 */
function resolveBranchName() {
  const fromCi = process.env.GITHUB_HEAD_REF;
  if (fromCi) {
    return fromCi;
  }

  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

/**
 * @param {string} branch
 * @returns {string}
 */
function formatRejection(branch) {
  return [
    `Invalid branch name: "${branch}"`,
    '',
    'PR_RULES.md requires:',
    '  feat/<us-id>-short-desc   e.g. feat/us1-register-work-email',
    '  fix/<short-desc>          e.g. fix/expired-jwt',
    '  long-lived: main (prod), develop (dev), testing',
    '',
    'us-id is a user story (us1–us7) or task (t1–t10). Use lowercase kebab-case.',
  ].join('\n');
}

/**
 * @param {{ branch?: string, write?: (message: string) => void }} [options]
 * @returns {number}
 */
function checkBranchName(options = {}) {
  const write = options.write ?? ((message) => console.error(message));
  const branch = options.branch ?? resolveBranchName();

  if (branch === 'HEAD') {
    write('Skipping branch name check in detached HEAD state.');
    return 0;
  }

  if (isAllowedBranchName(branch)) {
    return 0;
  }

  write(formatRejection(branch));
  return 1;
}

function main() {
  process.exitCode = checkBranchName();
}

module.exports = {
  checkBranchName,
  isAllowedBranchName,
};

if (require.main === module) {
  main();
}
