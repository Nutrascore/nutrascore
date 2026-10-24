<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { register } from '$lib/api';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function submit() {
		loading = true;
		error = '';
		try {
			await register(name, email, password);
			await goto(resolve('/profile'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to create account.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Create account — NutraScore</title></svelte:head>

<main class="auth-card">
	<h1>Create account</h1>
	<p>New accounts start with standard user access.</p>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<label
			>Name <input
				bind:value={name}
				required
				minlength="2"
				maxlength="120"
				autocomplete="name"
			/></label
		>
		<label>Email <input type="email" bind:value={email} required autocomplete="email" /></label>
		<label
			>Password <input
				type="password"
				bind:value={password}
				required
				minlength="8"
				maxlength="128"
				autocomplete="new-password"
			/></label
		>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
	</form>
	<p>Already registered? <a href={resolve('/login')}>Sign in</a>.</p>
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
