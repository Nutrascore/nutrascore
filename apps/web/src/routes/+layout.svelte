<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<Navbar />

<slot />

<style> :global(body) {
	margin: 0;
}</style>	

<Footer />