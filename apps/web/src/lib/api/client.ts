function normalizeApiOrigin(value: string): string {
	return value.replace(/\/+$/, '').replace(/\/api$/, '');
}

const API_URL = normalizeApiOrigin(import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000');
let csrfToken: string | null = null;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const headers = new Headers(options?.headers);
	if (
		options?.body !== undefined &&
		!(options.body instanceof FormData) &&
		!headers.has('Content-Type')
	) {
		headers.set('Content-Type', 'application/json');
	}
	if (options?.method && options.method !== 'GET') {
		headers.set('X-CSRF-Token', await getCsrfToken());
	}
	const response = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers
	});

	if (!response.ok) {
		let message = `API request failed with status ${response.status}.`;
		try {
			const error = (await response.json()) as { message?: string; error?: string };
			if (error.message) message = error.message;
			else if (error.error) message = error.error;
		} catch {
			// Keep the status-based message when the server did not return JSON.
		}
		throw new Error(message);
	}

	return response.json() as Promise<T>;
}

export async function getCsrfToken(): Promise<string> {
	if (csrfToken) return csrfToken;
	const response = await fetch(`${API_URL}/api/auth/csrf`, { credentials: 'include' });
	if (!response.ok) throw new Error('Unable to initialize secure session.');
	const data = (await response.json()) as { csrfToken: string };
	csrfToken = data.csrfToken;
	return csrfToken;
}

export function clearCsrfToken() {
	csrfToken = null;
}
