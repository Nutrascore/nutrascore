<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { login } from '$lib/api';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function submit() {
		loading = true;
		error = '';
		try {
			await login(email, password);
			await goto(resolve('/profile'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to sign in.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Sign in — NutraScore</title></svelte:head>

<main class="auth-card">
	<h1>Sign in</h1>
	<p>Personalise your experience.</p>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<label>Email <input type="email" bind:value={email} required autocomplete="email" /></label>
		<label
			>Password <input
				type="password"
				bind:value={password}
				required
				autocomplete="current-password"
			/></label
		>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
	</form>
	<p>New here? <a href={resolve('/register')}>Create an account</a>.</p>
</main>

<style>
	.auth-card {
		max-width: 460px;
		margin: 70px auto;
		padding: 32px;
		border: 1px solid #e5e9e6;
		border-radius: 16px;
	}
	form {
		display: grid;
		gap: 18px;
		margin: 24px 0;
	}
	label {
		display: grid;
		gap: 7px;
		font-weight: 600;
	}
	input {
		padding: 12px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		font: inherit;
	}
	button {
		padding: 12px;
		border: 0;
		border-radius: 8px;
		background: #216b48;
		color: white;
		font: inherit;
		cursor: pointer;
	}
	.error {
		color: #a32626;
	}
	a {
		color: #216b48;
	}
</style>
