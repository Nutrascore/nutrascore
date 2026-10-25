<script lang="ts">
	import { page } from '$app/state';
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="app-shell homepage">
	<video class="background-video" autoplay muted loop playsinline aria-hidden="true">
		<source src="/background.mp4" type="video/mp4" />
	</video>

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

	.app-shell.homepage {
	position: relative;
	isolation: isolate;
	}

	.background-video {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	z-index: -1;
	pointer-events: none;
	}

	.page-content {
		flex: 1;
	}
</style>
