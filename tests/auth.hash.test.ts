import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { auth } from "../src/auth/auth.config";
import { db } from "../src/db";
import { account, users } from "../src/db/schema";
import { closeDb, resetAuthTables, uniqueEmail } from "./helpers";

const PLAINTEXT_PASSWORD = "sup3r-secret-passphrase";

const SCRYPT_SALT_HASH = /^[0-9a-f]+:[0-9a-f]+$/i;

const BCRYPT_PATTERN = /^\$2[abxy]?\$\d{2}\$/;

/**
 * Signs up a user through better-auth and returns the stored credential row.
 */
async function signUpAndReadCredentialRow(email: string) {
  await auth.api.signUpEmail({
    body: { name: "Grace Hopper", email, password: PLAINTEXT_PASSWORD },
  });

  const [user] = await db.select().from(users).where(eq(users.email, email));
  expect(user).toBeDefined();

  const [credential] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, user!.id), eq(account.providerId, "credential")));

  expect(credential).toBeDefined();
  return credential!;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe("credential storage", () => {
  it("AC5: stores the password as a hash rather than the plaintext", async () => {
    const credential = await signUpAndReadCredentialRow(uniqueEmail("ac5"));

    expect(credential.password).toBeTruthy();
    const stored = credential.password!;

    expect(stored).not.toBe(PLAINTEXT_PASSWORD);
    expect(stored).not.toContain(PLAINTEXT_PASSWORD);
  });

  it("AC5: stores a scrypt salt:hash value and not a bcrypt hash", async () => {
    const credential = await signUpAndReadCredentialRow(uniqueEmail("ac5-format"));
    const stored = credential.password!;

    expect(stored).toMatch(SCRYPT_SALT_HASH);
    expect(stored).not.toMatch(BCRYPT_PATTERN);
    expect(stored.startsWith("$2b$")).toBe(false);

    const [salt, hash] = stored.split(":");
    expect(salt).toBeTruthy();
    expect(hash).toBeTruthy();
    expect(salt!.length).toBeGreaterThanOrEqual(16);
    expect(hash!.length).toBeGreaterThanOrEqual(32);
  });

  it("AC5: produces a different hash for the same password on another account", async () => {
    const first = await signUpAndReadCredentialRow(uniqueEmail("ac5-a"));
    const second = await signUpAndReadCredentialRow(uniqueEmail("ac5-b"));

    expect(first.password).not.toBe(second.password);
  });

  it("AC5: never writes the password onto the users table", async () => {
    const email = uniqueEmail("ac5-users");
    await signUpAndReadCredentialRow(email);

    const [user] = await db.select().from(users).where(eq(users.email, email));

    expect(JSON.stringify(user)).not.toContain(PLAINTEXT_PASSWORD);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password");
  });
});
