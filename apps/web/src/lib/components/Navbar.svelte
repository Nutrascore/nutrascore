<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let query = $state('');

	function search() {
		const trimmedQuery = query.trim();

		if (trimmedQuery) {
			goto(`/discover?q=${encodeURIComponent(trimmedQuery)}`);
		} else {
			goto('/discover');
		}
	}
</script>
<nav>
	<a href="/" class="logo">
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

	<input
		bind:value={query}
		placeholder="Search for a product..."
	/>
</form>
			<button class="scan-button">Scan Barcode</button>
		</div>
	{/if}

	<div class="nav-links">
		<a href="/categories">Categories</a>
		<a href="/compare">Compare</a>
		<a href="/discover">Discover</a>
	</div>
</nav>

<style>
	nav {
		background-color: #080808;
		display: flex;
		align-items: center;
		padding: 10px 40px;
		gap: 20px;
		border-bottom: 1px solid #ddd;
		position: relative;
	}

	.logo {
		display: flex;
		align-items: center;
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

		position: absolute;
		left: 50%;
		transform: translateX(-50%);
	}

	.nav-search {
		display: flex;
		align-items: center;
		gap: 12px;

		width: 500px;
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

	.scan-button {
		padding: 10px 12px;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		white-space: nowrap;
	}

	.nav-links {
		display: flex;
		margin-left: auto;
		gap: 20px;
	}

	.nav-links a {
		color: white;
		text-decoration: none;
	}

	.nav-links a:hover {
		text-decoration: underline;
	}
</style>