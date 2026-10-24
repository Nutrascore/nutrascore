<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import { getCurrentUser, logout, type AuthUser } from '$lib/api';

	let query = $state('');

	let user = $state<AuthUser | null>(null);

	$effect(() => {
		getCurrentUser()
			.then((value) => (user = value))
			.catch(() => (user = null));
	});

	async function signOut() {
		await logout();
		user = null;
	}

	function search() {
		const trimmedQuery = query.trim();

		if (trimmedQuery) {
			goto(resolve(`/discover?q=${encodeURIComponent(trimmedQuery)}`));
		} else {
			goto(resolve('/discover'));
		}
	}
</script>

<nav>
	<a href={resolve('/')} class="logo">
		<img src="/nutrascore-logo-bg.png" alt="NutraScore" />
	</a>

	{#if page.url.pathname === '/discover'}
		<div class="discover-actions">
			<form
				class="nav-search"
				onsubmit={(event) => {
					event.preventDefault();
					search();
				}}
			>
				<button type="submit" class="search-button" aria-label="Search">
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
				</button>

				<input bind:value={query} placeholder="Search for a product..." />
			</form>
		</div>
	{/if}

	<div class="nav-links">
		<a href={resolve('/compare')}>Compare</a>
		<a href={resolve('/discover')}>Discover</a>
		{#if user}
			<a href={resolve('/profile')}>Profile</a>
			<button class="nav-button" onclick={() => void signOut()}>Sign out</button>
		{:else}
			<a href={resolve('/login')}>Sign in</a>
			<a href={resolve('/register')}>Register</a>
		{/if}
	</div>
</nav>

<style>
	nav {
		background-color: #080808;
		display: flex;
		align-items: center;
		padding: 10px clamp(12px, 4vw, 40px);
		gap: 20px;
		border-bottom: 1px solid #ddd;
		position: relative;
	}

	.logo {
		display: flex;
		align-items: center;
		border-radius: 8px;
		outline: 2px solid #080808;
		outline-offset: 1px;
		transition: outline-color 160ms ease;
	}

	.logo:hover,
	.logo:focus-visible {
		outline-color: #ffffff;
	}

	.logo img {
		width: 40px;
		height: 40px;
		object-fit: contain;
	}

	.discover-actions {
		display: flex;
		align-items: center;
		gap: 12px;

		flex: 1 1 420px;
		min-width: 0;
	}

	.nav-search {
		display: flex;
		align-items: center;
		gap: 12px;

		width: min(500px, 100%);
		padding: 8px 18px;

		background: #f5f5f5;
		border: 1px solid #e5e5e5;
		border-radius: 12px;
	}

	.search-button {
		display: flex;
		align-items: center;
		padding: 0;
		border: none;
		background: transparent;
		color: #666;
		cursor: pointer;
	}

	.search-button:hover,
	.search-button:focus-visible {
		border-radius: 6px;
		outline: 2px solid #ffffff;
		outline-offset: 2px;
	}

	.nav-search input {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		font-size: 16px;
		padding: 0;
	}

	.nav-search input::placeholder {
		color: #888;
	}

	.nav-links {
		display: flex;
		flex-wrap: wrap;
		margin-left: auto;
		gap: 20px;
		min-width: 0;
	}

	.nav-links a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 10px;
		border-radius: 8px;
		color: white;
		text-decoration: none;
		outline: 2px solid #080808;
		outline-offset: 1px;
		transition: outline-color 160ms ease;
	}

	.nav-links a:hover,
	.nav-links a:focus-visible {
		outline-color: #ffffff;
	}

	.nav-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: white;
		font: inherit;
		cursor: pointer;
		outline: 2px solid #080808;
		outline-offset: 1px;
		transition: outline-color 160ms ease;
	}

	.nav-button:hover,
	.nav-button:focus-visible {
		outline-color: #ffffff;
	}

	@media (max-width: 900px) {
		nav {
			flex-wrap: wrap;
		}

		.discover-actions {
			order: 3;
			flex-basis: 100%;
		}

		.nav-search {
			flex: 1;
		}
	}

	@media (max-width: 560px) {
		nav {
			gap: 12px;
		}

		.nav-links {
			gap: 10px 14px;
			font-size: 14px;
		}

		.discover-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.nav-search {
			width: 100%;
		}
	}
</style>
