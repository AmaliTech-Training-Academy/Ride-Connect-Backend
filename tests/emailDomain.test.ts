import { afterAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_EMAIL_DOMAINS,
  EMAIL_DOMAIN_NOT_ALLOWED_CODE,
  EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE,
  domainNotAllowedError,
  emailDomainOf,
  isAllowedEmailDomain,
} from '../src/auth/auth.config';
import { closeDb } from './helpers';

afterAll(async () => {
  await closeDb();
});

describe('ALLOWED_EMAIL_DOMAINS', () => {
  it('is amalitech.com and amalitechtraining.org', () => {
    expect(ALLOWED_EMAIL_DOMAINS).toEqual(['amalitech.com', 'amalitechtraining.org']);
  });
});

describe('emailDomainOf', () => {
  it('reads the domain after the last @', () => {
    expect(emailDomainOf('ada@amalitech.com')).toBe('amalitech.com');
  });

  it('lowercases and trims before reading the domain', () => {
    expect(emailDomainOf('  Ada@AmaliTech.COM  ')).toBe('amalitech.com');
  });

  it('reads a foreign domain verbatim', () => {
    expect(emailDomainOf('ada@mail.amalitech.com')).toBe('mail.amalitech.com');
  });

  it.each([
    ['a string with no @', 'amalitech.com'],
    ['an empty string', ''],
    ['only whitespace', '   '],
    ['an empty local part', '@amalitech.com'],
    ['an empty domain', 'ada@'],
    ['a second @', 'ada@evil.com@amalitech.com'],
    ['a non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s', (_label, value) => {
    expect(emailDomainOf(value)).toBeNull();
  });
});

describe('isAllowedEmailDomain', () => {
  it.each([
    ['the bare address', 'a@amalitech.com'],
    ['mixed casing', 'A@AmaliTech.COM'],
    ['surrounding whitespace', ' a@amalitech.com '],
    ['a dotted local part', 'first.last@amalitech.com'],
    ['a plus-addressed local part', 'first+rides@amalitech.com'],
    ['the training domain', 'a@amalitechtraining.org'],
    ['the training domain in mixed casing', 'A@AmaliTechTraining.ORG'],
  ])('accepts %s', (_label, email) => {
    expect(isAllowedEmailDomain(email)).toBe(true);
  });

  it.each([
    ['another provider', 'a@gmail.com'],
    ['a sibling domain', 'a@amalitech.org'],
    ['a subdomain', 'a@sub.amalitech.com'],
    ['a training subdomain', 'a@sub.amalitechtraining.org'],
    ['a suffixed look-alike', 'a@amalitech.com.evil.com'],
    ['a prefixed look-alike', 'a@evilamalitech.com'],
    ['a prefix-embedded look-alike', 'a@notamalitech.com'],
    ['a different TLD', 'a@amalitech.co'],
    ['a look-alike of the training domain', 'a@amalitechtraining.org.evil.com'],
    ['a trailing @', 'a@amalitech.com@evil.com'],
    ['a domain with no @ at all', 'amalitech.com'],
    ['an empty string', ''],
    ['only whitespace', '   '],
    ['an empty local part', '@amalitech.com'],
    ['a non-string', null],
  ])('rejects %s', (_label, email) => {
    expect(isAllowedEmailDomain(email)).toBe(false);
  });
});

describe('domainNotAllowedError', () => {
  it('is a 403 with a stable code and a message naming the allowed domains', () => {
    const error = domainNotAllowedError();

    expect(error.statusCode).toBe(403);
    expect(error.body).toEqual({
      code: EMAIL_DOMAIN_NOT_ALLOWED_CODE,
      message: EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE,
    });
    expect(EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE).toContain('@amalitech.com');
    expect(EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE).toContain('@amalitechtraining.org');
  });
});
