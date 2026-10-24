<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="app-shell">
	<Navbar />

	<div class="page-content">
		<slot />
	</div>

	<Footer />
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}

	.page-content {
		flex: 1;
	}
</style>
