import { describe, expect, it } from 'vitest';
import { hashPassword, normalizeEmail, validEmail, validPassword, verifyPassword } from './auth.js';

describe('authentication helpers', () => {
	it('normalizes and validates account credentials', () => {
		expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
		expect(validEmail('user@example.com')).toBe(true);
		expect(validEmail('not-an-email')).toBe(false);
		expect(validPassword('short')).toBe(false);
		expect(validPassword('correct horse battery staple')).toBe(true);
	});

	it('hashes passwords without retaining plaintext', async () => {
		const password = 'correct horse battery staple';
		const hash = await hashPassword(password);
		expect(hash).not.toBe(password);
		expect(await verifyPassword(password, hash)).toBe(true);
		expect(await verifyPassword('wrong password', hash)).toBe(false);
	});
});
