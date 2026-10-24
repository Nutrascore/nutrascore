import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import {
	createSession,
	clearSession,
	getAuthUser,
	hashPassword,
	normalizeEmail,
	requireCsrf,
	setCsrfCookie,
	validEmail,
	validPassword,
	verifyPassword,
} from '../auth.js';

interface CredentialsBody {
	name?: string;
	email?: string;
	password?: string;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateKey(email: string, ip: string): string {
	return `${ip}:${email}`;
}

function isRateLimited(key: string): boolean {
	const current = attempts.get(key);
	if (!current || current.resetAt <= Date.now()) {
		attempts.delete(key);
		return false;
	}
	return current.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
	const current = attempts.get(key);
	if (!current || current.resetAt <= Date.now()) {
		attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
		return;
	}
	current.count += 1;
}

function clearFailures(key: string): void {
	attempts.delete(key);
}

const authRoutes: FastifyPluginAsync = async (app) => {
	app.get('/csrf', async (_request, reply) => ({
		csrfToken: setCsrfCookie(reply),
	}));

	app.post<{ Body: CredentialsBody }>('/register', async (request, reply) => {
		if (!requireCsrf(request, reply)) return;
		const name = request.body.name?.trim() ?? '';
		const email = normalizeEmail(request.body.email ?? '');
		const password = request.body.password ?? '';
		if (name.length < 2 || name.length > 120) {
			return reply.status(400).send({ error: 'INVALID_NAME', message: 'Name must be between 2 and 120 characters.' });
		}
		if (!validEmail(email)) {
			return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
		}
		if (!validPassword(password)) {
			return reply.status(400).send({ error: 'INVALID_PASSWORD', message: 'Password must be between 8 and 128 characters.' });
		}
		try {
			const user = await pool.query(
				`INSERT INTO "Users" (id, name, email, password_hash)
				 VALUES ($1, $2, $3, $4)
				 RETURNING id, name, email, role`,
				[randomUUID(), name, email, await hashPassword(password)],
			);
			await createSession(reply, user.rows[0].id);
			return reply.status(201).send({ user: user.rows[0] });
		} catch (error) {
			if ((error as { code?: string }).code === '23505') {
				return reply.status(409).send({ error: 'EMAIL_IN_USE', message: 'An account with that email already exists.' });
			}
			throw error;
		}
	});

	app.post<{ Body: CredentialsBody }>('/login', async (request, reply) => {
		if (!requireCsrf(request, reply)) return;
		const email = normalizeEmail(request.body.email ?? '');
		const password = request.body.password ?? '';
		const key = rateKey(email, request.ip);
		if (isRateLimited(key)) {
			return reply.status(429).send({ error: 'LOGIN_RATE_LIMITED', message: 'Too many login attempts. Try again later.' });
		}
		const result = await pool.query(
			`SELECT id, name, email, role, password_hash FROM "Users" WHERE email = $1 LIMIT 1`,
			[email],
		);
		const account = result.rows[0];
		if (!account || !(await verifyPassword(password, account.password_hash))) {
			recordFailure(key);
			return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
		}
		clearFailures(key);
		await createSession(reply, account.id);
		return { user: { id: account.id, name: account.name, email: account.email, role: account.role } };
	});

	app.post('/logout', async (request, reply) => {
		if (!requireCsrf(request, reply)) return;
		await clearSession(request, reply);
		return { ok: true };
	});

	app.get('/me', async (request) => ({
		user: await getAuthUser(request),
	}));
};

export default authRoutes;
