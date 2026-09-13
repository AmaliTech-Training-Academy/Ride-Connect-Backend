import { z } from 'zod';

import { MIN_PASSWORD_LENGTH } from '../auth/auth.config';

const email = z.email('Please provide a valid email address.');

export const registerSchema = z.object({
  name: z.string('Name is required.').trim().min(1, 'Name is required.'),
  email,
  password: z
    .string('Password is required.')
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
});

export const loginSchema = z.object({
  email,
  password: z.string('Password is required.').min(1, 'Password is required.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
