import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from './db/pool.js';

const SESSION_COOKIE = 'nutrascore_session';
const CSRF_COOKIE = 'nutrascore_csrf';
const SESSION_DAYS = 30;

export type Role = 'user' | 'moderator';

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: Role;
}

interface SessionRow extends AuthUser {
	session_id: string;
}

function cookieValue(request: FastifyRequest, name: string): string | null {
	const header = request.headers.cookie ?? '';
	const item = header.split(';').find((part) => part.trim().startsWith(`${name}=`));
	return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : null;
}

function cookieOptions(httpOnly: boolean, maxAge: number): string {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	return `Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}${httpOnly ? '; HttpOnly' : ''}`;
}

export function setCsrfCookie(reply: FastifyReply, token = randomBytes(32).toString('hex')) {
	reply.header('Set-Cookie', `${CSRF_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(false, 60 * 60 * 24)}`);
	return token;
}

export function requireCsrf(request: FastifyRequest, reply: FastifyReply): boolean {
	const cookie = cookieValue(request, CSRF_COOKIE);
	const header = request.headers['x-csrf-token'];
	if (!cookie || typeof header !== 'string' || cookie !== header) {
		reply.status(403).send({
			error: 'CSRF_REQUIRED',
			message: 'A valid CSRF token is required.',
		});
		return false;
	}
	return true;
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	await pool.query(
		`INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		[randomUUID(), userId, hashToken(token), expiresAt],
	);
	reply.header(
		'Set-Cookie',
		`${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(true, SESSION_DAYS * 24 * 60 * 60)}`,
	);
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
	const token = cookieValue(request, SESSION_COOKIE);
	if (token) {
		await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
	}
	reply.header('Set-Cookie', `${SESSION_COOKIE}=; ${cookieOptions(true, 0)}`);
}

export async function getAuthUser(request: FastifyRequest): Promise<AuthUser | null> {
	const token = cookieValue(request, SESSION_COOKIE);
	if (!token) return null;
	const result = await pool.query<SessionRow>(
		`SELECT u.id, u.name, u.email, u.role, s.id AS session_id
		 FROM user_sessions s
		 INNER JOIN "Users" u ON u.id = s.user_id
		 WHERE s.token_hash = $1 AND s.expires_at > NOW()
		 LIMIT 1`,
		[hashToken(token)],
	);
	return result.rows[0] ?? null;
}

export async function requireUser(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<AuthUser | null> {
	const user = await getAuthUser(request);
	if (!user) {
		reply.status(401).send({
			error: 'AUTH_REQUIRED',
			message: 'Please sign in to continue.',
		});
		return null;
	}
	return user;
}

export async function requireModerator(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<AuthUser | null> {
	const user = await requireUser(request, reply);
	if (!user) return null;
	if (user.role !== 'moderator') {
		reply.status(403).send({
			error: 'MODERATOR_REQUIRED',
			message: 'Moderator access is required.',
		});
		return null;
	}
	return user;
}

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validPassword(password: string): boolean {
	return password.length >= 8 && password.length <= 128;
}
