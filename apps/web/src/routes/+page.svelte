<script lang="ts">
	let query = '';
	let barcodeInput: HTMLInputElement;

	function openBarcodeScanner() {
		barcodeInput.click();
	}

	function handleBarcodeImage(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		console.log('Barcode image:', file);
	}

	function discover() {
		const trimmedQuery = query.trim();

		if (!trimmedQuery) return;

		window.location.href = `/discover?q=${encodeURIComponent(trimmedQuery)}`;
	}
</script>

<svelte:head>
	<title>NutraScore — Discover Better Food</title>
</svelte:head>

<main>
	<h1>NutraScore</h1>

	<p class="subtitle">
		A platform for discovering, comparing, and understanding packaged food products in India.
	</p>

	<!-- Search Area -->
	<div class="search-area">
		<form
			class="search-bar"
			onsubmit={(event) => {
				event.preventDefault();
				discover();
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

		<button onclick={openBarcodeScanner}> Scan Barcode </button>
	</div>

	<input
		bind:this={barcodeInput}
		type="file"
		accept="image/*"
		capture="environment"
		onchange={handleBarcodeImage}
		hidden
	/>

	<section class="why-nutriscore">
		<h2>Why NutraScore?</h2>

		<p>
			Finding useful information about packaged food shouldn't require deciphering confusing labels.
		</p>

		<p>
			NutraScore brings nutrition, ingredients, additives, and other product information together in
			one place, making it easier to discover and compare the food you buy.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 1000px;
		margin: 100px auto;
		text-align: center;
		padding: 0 40px;
	}

	.subtitle {
		font-size: 20px;
		margin-bottom: 30px;
	}

	.search-area {
		display: flex;
		justify-content: center;
		gap: 12px;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 600px;
		padding: 14px 18px;

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

	.search-bar input {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		font-size: 16px;
		padding: 0;
	}

	.search-bar input::placeholder {
		color: #888;
	}

	.search-area > button {
		padding: 14px 20px;
		border: none;
		border-radius: 12px;
		cursor: pointer;
	}

	.why-nutriscore {
		margin-top: 100px;
		text-align: left;
	}

	.why-nutriscore h2 {
		font-size: 28px;
		margin-bottom: 20px;
	}

	.why-nutriscore p {
		max-width: 700px;
		margin-bottom: 12px;
		line-height: 1.6;
	}
</style>
