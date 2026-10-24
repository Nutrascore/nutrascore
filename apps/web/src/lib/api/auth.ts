import { apiFetch, clearCsrfToken } from './client';
import type { AuthUser } from './types';

export async function getCurrentUser(): Promise<AuthUser | null> {
	const result = await apiFetch<{ user: AuthUser | null }>('/api/auth/me');
	return result.user;
}

export async function register(name: string, email: string, password: string): Promise<AuthUser> {
	const result = await apiFetch<{ user: AuthUser }>('/api/auth/register', {
		method: 'POST',
		body: JSON.stringify({ name, email, password })
	});
	return result.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
	const result = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password })
	});
	return result.user;
}

export async function logout(): Promise<void> {
	await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
	clearCsrfToken();
}
