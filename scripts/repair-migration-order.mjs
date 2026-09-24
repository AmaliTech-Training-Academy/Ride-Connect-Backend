#!/usr/bin/env node
//
// Applies migrations that drizzle's migrator will otherwise skip forever.
//
//   node --env-file=.env scripts/repair-migration-order.mjs --dry-run
//   node --env-file=.env scripts/repair-migration-order.mjs
//   node --env-file=.env scripts/repair-migration-order.mjs --database test
//
// Why this is needed
// ------------------
// drizzle decides what to apply from a single high-water mark: it reads the newest
// `created_at` from drizzle.__drizzle_migrations once, then applies any migration whose
// `when` (the journal's `folderMillis`) is greater than it. That mark is never advanced
// during the loop, so a migration whose `when` falls *below* it is invisible — it is not
// "pending", it simply never gets considered again.
//
// Two branches that each generated a migration off the same snapshot produce exactly this:
// both are numbered 0003, and whichever one is recorded first pins the mark above the other.
// Re-numbering the losing branch afterwards does not help, because the journal's `when` for
// it stays older than the mark.
//
// What this does
// --------------
// Finds migrations that are absent from the ledger *and* order before the high-water mark —
// the skipped ones — and applies them in journal order, recording each with the same hash
// and `created_at` the migrator itself would have written. The hash comes from drizzle's own
// `readMigrationFiles`, so the ledger row is byte-identical to a clean install's.
//
// Everything runs in one transaction: a failing statement rolls the whole repair back and
// leaves the database exactly as it was. Re-running is a no-op, and a healthy database
// reports nothing to do.

import fs from 'node:fs';
import path from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';
import pg from 'pg';

const MIGRATIONS_FOLDER = 'drizzle';
const MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations';

/** The journal's entries, whose `tag` is each migration's file name without the extension. */
function journal() {
  const journalPath = path.join(path.resolve(MIGRATIONS_FOLDER), 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`No meta/_journal.json under ${MIGRATIONS_FOLDER} — run this from the project root.`);
  }

  return JSON.parse(fs.readFileSync(journalPath, 'utf8')).entries;
}

/** The migration's file name, for reporting. */
function journalTag(entries, index) {
  return entries[index]?.tag ?? `entry ${index}`;
}

function parseArgs(argv) {
  const options = { database: 'dev', dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--database') {
      options.database = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveUrl(database) {
  const url = database === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `No connection string for '${database}'. Set ${database === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'}, or run with --env-file=.env.`,
    );
  }
  return url;
}

/** The migrations drizzle knows about, in journal order, with its own hashes. */
function readMigrations() {
  return readMigrationFiles({ migrationsFolder: path.resolve(MIGRATIONS_FOLDER) }).map(
    (migration, index) => ({
      index,
      when: migration.folderMillis,
      hash: migration.hash,
      statements: migration.sql.filter((statement) => statement.trim() !== ''),
    }),
  );
}

/**
 * Splits each migration into statements the same way drizzle does, so what we execute is
 * what the migrator would have executed.
 */
function summarise(statements) {
  return statements.map((statement) => {
    const line = statement.replace(/\s+/g, ' ').trim();
    return line.length > 70 ? `${line.slice(0, 70)}…` : line;
  });
}

async function repair(url, { dryRun }) {
  const migrations = readMigrations();
  const entries = journal();
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const database = new URL(url).pathname.slice(1);
    const ledger = await client.query(
      `select to_regclass($1) as present`,
      [`${MIGRATIONS_TABLE}`],
    );

    if (!ledger.rows[0].present) {
      console.log(`${database}: no ${MIGRATIONS_TABLE} table — nothing to repair (run db:migrate).`);
      return 0;
    }

    const applied = await client.query(
      `select hash, created_at from ${MIGRATIONS_TABLE} order by created_at asc`,
    );
    const appliedHashes = new Set(applied.rows.map((row) => row.hash));
    const highWater = applied.rows.length
      ? Math.max(...applied.rows.map((row) => Number(row.created_at)))
      : null;

    // Absent from the ledger, yet ordered before the mark the migrator compares against:
    // the ones it will never look at again.
    const skipped = migrations.filter(
      (migration) => !appliedHashes.has(migration.hash) && highWater !== null && migration.when < highWater,
    );

    console.log(`\n${database}`);
    console.log(`  ledger: ${applied.rows.length} applied, high-water mark ${highWater ?? '—'}`);

    if (skipped.length === 0) {
      console.log('  nothing to repair — every migration is either applied or still pending.\n');
      return 0;
    }

    console.log(`  ${skipped.length} migration(s) the migrator will skip forever:`);

    for (const migration of skipped) {
      console.log(
        `    ${journalTag(entries, migration.index)}  (when=${migration.when}, ${migration.statements.length} statement(s))`,
      );
      for (const statement of summarise(migration.statements)) {
        console.log(`      · ${statement}`);
      }
    }

    if (dryRun) {
      console.log('  dry run — nothing written.\n');
      return skipped.length;
    }

    await client.query('begin');
    try {
      for (const migration of skipped) {
        for (const statement of migration.statements) {
          await client.query(statement);
        }

        // Same hash and created_at the migrator writes, so a clean install and a repaired
        // database end up with identical ledgers.
        await client.query(
          `insert into ${MIGRATIONS_TABLE} ("hash", "created_at") values ($1, $2)`,
          [migration.hash, migration.when],
        );

        console.log(`  applied ${journalTag(entries, migration.index)} and recorded it`);
      }

      await client.query('commit');
      console.log('  repaired — committed.\n');
    } catch (error) {
      await client.query('rollback');
      console.error(`  failed, rolled back: ${error.message}\n`);
      throw error;
    }

    return skipped.length;
  } finally {
    await client.end();
  }
}

const options = parseArgs(process.argv.slice(2));
const databases = options.database === 'all' ? ['dev', 'test'] : [options.database];

for (const database of databases) {
  await repair(resolveUrl(database), options);
}
