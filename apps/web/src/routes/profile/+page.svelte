<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getCurrentUser, logout, type AuthUser } from '$lib/api';

	let user = $state<AuthUser | null>(null);
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		getCurrentUser()
			.then((value) => {
				user = value;
				if (!value) void goto(resolve('/login'));
			})
			.catch((err) => {
				error = err instanceof Error ? err.message : 'Unable to load profile.';
			})
			.finally(() => (loading = false));
	});

	async function signOut() {
		await logout();
		await goto(resolve('/'));
	}
</script>

<svelte:head><title>Your profile — NutraScore</title></svelte:head>
<main class="profile">
	{#if loading}<p>Loading profile…</p>
	{:else if error}<p class="error">{error}</p>
	{:else if user}
		<h1>Your profile</h1>
		<div class="details">
			<strong>{user.name}</strong><span>{user.email}</span><span>Role: {user.role}</span>
		</div>
		<div class="actions">
			{#if user.role === 'moderator'}<a
					href={resolve('/moderator')}>Moderator dashboard</a
				>{/if}<button onclick={() => void signOut()}>Sign out</button>
		</div>
	{/if}
</main>

<style>
	.profile {
		max-width: 760px;
		margin: 70px auto;
		padding: 0 24px;
	}
	.details {
		display: grid;
		gap: 8px;
		padding: 24px;
		border: 1px solid #e5e9e6;
		border-radius: 14px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 22px;
		align-items: center;
	}
	a,
	button {
		padding: 11px 15px;
		border-radius: 8px;
		border: 1px solid #216b48;
		color: #216b48;
		background: white;
		text-decoration: none;
		font: inherit;
		cursor: pointer;
	}
	.error {
		color: #a32626;
	}
</style>
