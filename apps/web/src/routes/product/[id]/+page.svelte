<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getProduct, type Product } from '$lib/api';
	import { compareStore } from '$lib/stores/compareStore';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';
	import { convertNutritionValue, type NutritionDisplayBasis } from '$lib/utils/nutritionDisplay';

	let product = $state<Product | null>(null);
	let loading = $state(true);
	let error = $state('');
	let actionError = $state('');
	let nutritionMode = $state<NutritionDisplayBasis>('per100g');

	let productId = $derived(page.params.id);
	let isSelectedForCompare = $derived(product ? $compareStore.includes(product.id) : false);
	const nutritionRows = [
		{ label: 'Energy', key: 'kcalPer100g', unit: ' kcal' },
		{ label: 'Protein', key: 'proteinG', unit: ' g' },
		{ label: 'Carbohydrates', key: 'carbohydratesG', unit: ' g' },
		{ label: 'Total fat', key: 'fatG', unit: ' g' },
		{ label: 'Total sugars', key: 'sugarsG', unit: ' g' },
		{ label: 'Salt', key: 'saltG', unit: ' g' },
		{ label: 'Saturated fat', key: 'saturatedFatG', unit: ' g' },
		{ label: 'Trans fat', key: 'transFatG', unit: ' g' },
		{ label: 'Fibre', key: 'fibreG', unit: ' g' },
		{ label: 'Sodium', key: 'sodiumMg', unit: ' mg' },
		{ label: 'Cholesterol', key: 'cholesterolMg', unit: ' mg' },
		{ label: 'Calcium', key: 'calciumMg', unit: ' mg' },
		{ label: 'Iron', key: 'ironMg', unit: ' mg' },
		{ label: 'Vitamins', key: 'vitamins', unit: '', text: true }
	] as const;

	function formatPrice(value: number | null): string {
		if (value === null || !Number.isFinite(value) || value < 0) return 'Price unavailable';
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR',
			maximumFractionDigits: 2
		}).format(value);
	}

	function servingDescription(): string {
		const nutrition = product?.nutrition;
		if (!nutrition || nutrition.servingSize === null || nutrition.servingUnit === null) {
			return 'unavailable';
		}
		const size = Number(nutrition.servingSize);
		if (!Number.isFinite(size) || size <= 0) return 'unavailable';
		return `${formatNutritionValue(size)} ${nutrition.servingUnit}`;
	}

	function hasConvertibleServingSize(): boolean {
		const nutrition = product?.nutrition;
		if (!nutrition || nutrition.servingUnit?.trim().toLowerCase() !== 'g') return false;
		const size = Number(nutrition.servingSize);
		return Number.isFinite(size) && size > 0;
	}

	function displayNutritionValue(
		key: (typeof nutritionRows)[number]['key'],
		unit: string,
		isText = false
	): string {
		const nutrition = product?.nutrition;
		if (!nutrition) return 'N/A';
		const value = nutrition[key];
		if (nutrition.basis === 'unknown') {
			return formatNutritionValue(value, unit);
		}
		if (isText) {
			return nutrition.basis === nutritionMode ? formatNutritionValue(value) : 'N/A';
		}
		const converted = convertNutritionValue(
			value,
			nutrition.basis,
			nutritionMode,
			nutrition.servingSize,
			nutrition.servingUnit
		);
		if (converted === null) return 'N/A';
		return formatNutritionValue(Number(converted.toFixed(2)), unit);
	}

	async function loadProduct() {
		loading = true;
		error = '';
		product = null;

		if (!productId) {
			error = 'Product not found.';
			loading = false;
			return;
		}

		try {
			product = await getProduct(productId);
		} catch (err) {
			console.error(err);

			error = err instanceof Error ? err.message : 'Unable to load product.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void productId;

		loadProduct();
	});

	function addToCompare() {
		if (!product) return;

		if (isSelectedForCompare) {
			compareStore.removeProduct(product.id);
		} else {
			compareStore.addProduct(product.id);
		}
	}
</script>

<svelte:head>
	<title>
		{product ? `${product.name} — NutraScore` : 'Product — NutraScore'}
	</title>
</svelte:head>

<main>
	{#if loading}
		<section class="status">
			<p>Loading product...</p>
		</section>
	{:else if error}
		<section class="not-found">
			<h1>Product not found</h1>

			<p>{error}</p>

			<a href={resolve('/discover')}>Back to Discover</a>
		</section>
	{:else if product}
		<section class="product-header">
			<div class="product-image">
				{#if product.imageUrl}
					<img src={product.imageUrl} alt={product.name} />
				{:else}
					<span>No Image</span>
				{/if}
			</div>

			<div class="product-summary">
				<span class="category">{product.categories[0] ?? 'Product'}</span>

				<h1>{product.name}</h1>

				<p class="brand">
					{product.brand ?? 'Unknown brand'}
				</p>

				<p class="price">
					<span>Listed price</span>
					<strong>{formatPrice(product.priceInr)}</strong>
				</p>

				<div class="labels">
					{#if product.nutriScore}
						<span>
							Nutri-Score {product.nutriScore.toUpperCase()}
						</span>
					{/if}

					{#if product.novaGroup}
						<span>
							NOVA {product.novaGroup}
						</span>
					{/if}
				</div>

				<button type="button" class="compare-button" onclick={addToCompare}>
					{isSelectedForCompare ? 'Remove from Compare' : 'Add to Compare'}
				</button>

				{#if actionError}<p class="action-error">{actionError}</p>{/if}
			</div>
		</section>

		<section class="details-grid">
			<div class="details-section">
				<h2>Nutrition Information</h2>

				<p class="nutrition-note">Serving size: {servingDescription()}</p>

				{#if product.nutrition?.basis === 'unknown'}
					<p class="nutrition-unavailable" role="status">
						Values are shown as recorded; their nutrition basis is not specified.
					</p>
				{:else}
					<div class="nutrition-toggle" role="group" aria-label="Nutrition display basis">
						<button
							type="button"
							class:active={nutritionMode === 'perServing'}
							aria-pressed={nutritionMode === 'perServing'}
							onclick={() => (nutritionMode = 'perServing')}
						>
							Per serving
						</button>
						<button
							type="button"
							class:active={nutritionMode === 'per100g'}
							aria-pressed={nutritionMode === 'per100g'}
							onclick={() => (nutritionMode = 'per100g')}
						>
							Per 100 g
						</button>
					</div>

					<p class="nutrition-note">
						{#if nutritionMode === 'perServing'}
							{#if product.nutrition?.servingSize && product.nutrition.servingUnit}
								Per serving ({servingDescription()})
							{:else}
								Per serving
							{/if}
						{:else}
							Per 100 g
						{/if}
					</p>
					{#if product.nutrition && product.nutrition.basis !== nutritionMode && !hasConvertibleServingSize()}
						<p class="nutrition-unavailable" role="status">
							{nutritionMode === 'per100g'
								? 'Per 100 g values are unavailable because a valid serving size in grams is not available. Switch to Per serving to view the original values.'
								: 'Per-serving values are unavailable because a valid serving size in grams is not available. Switch to Per 100 g to view the original values.'}
						</p>
					{/if}
				{/if}

				<div class="nutrition-grid">
					{#each nutritionRows as row (row.key)}
						<div>
							<span>{row.label}</span>
							<strong>{displayNutritionValue(row.key, row.unit, 'text' in row && row.text)}</strong>
						</div>
					{/each}
				</div>
			</div>

			<div class="details-section">
				<h2>Ingredients</h2>

				<p class="ingredients">
					{product.ingredients ?? 'Ingredients information unavailable.'}
				</p>
			</div>
		</section>
	{:else}
		<section class="not-found">
			<h1>Product not found</h1>

			<p>The product you're looking for doesn't exist.</p>

			<a href={resolve('/discover')}>Back to Discover</a>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1100px;
		margin: 60px auto;
		padding: 0 24px;
		overflow-wrap: anywhere;
	}

	.product-header {
		display: grid;
		grid-template-columns: minmax(0, 350px) minmax(0, 1fr);
		gap: 50px;
		margin-bottom: 60px;
	}

	.product-image {
		height: 350px;
		background: #f5f5f5;
		border: 1px solid #e5e5e5;
		border-radius: 16px;

		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;

		color: #888;
	}

	.product-image img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.product-summary {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
	}

	.category {
		font-size: 14px;
		color: #777;
		margin-bottom: 10px;
	}

	h1 {
		font-size: 40px;
		margin: 0 0 10px;
	}

	.brand {
		font-size: 18px;
		color: #666;
		margin: 0 0 20px;
	}

	.price {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 0 20px;
	}

	.price span {
		color: #667168;
		font-size: 13px;
	}

	.price strong {
		color: #216b48;
		font-size: 24px;
	}

	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 25px;
	}

	.labels span {
		padding: 7px 12px;
		border-radius: 20px;
		background: #f5f5f5;
		font-size: 14px;
	}

	.compare-button {
		padding: 12px 20px;
		border: none;
		border-radius: 10px;
		background: #080808;
		color: white;
		font-size: 15px;
		cursor: pointer;
	}

	.action-error {
		color: #a32626;
		font-size: 14px;
	}

	.details-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 30px;
	}

	.details-section {
		min-width: 0;
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		padding: 25px;
	}

	.details-section h2 {
		margin-top: 0;
		margin-bottom: 8px;
		font-size: 22px;
	}

	.nutrition-note {
		margin: 0 0 12px;
		color: #777;
		font-size: 14px;
	}

	.nutrition-toggle {
		display: inline-flex;
		max-width: 100%;
		margin: 4px 0 14px;
		padding: 4px;
		border: 1px solid #dbe5dd;
		border-radius: 10px;
		background: #f4f7f4;
	}

	.nutrition-toggle button {
		min-height: 38px;
		padding: 8px 14px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: #526057;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.nutrition-toggle button.active {
		background: #216b48;
		color: white;
		box-shadow: 0 1px 3px rgb(20 40 28 / 15%);
	}

	.nutrition-toggle button:focus-visible {
		outline: 3px solid #82bd98;
		outline-offset: 2px;
	}

	.nutrition-unavailable {
		margin: 0 0 18px;
		color: #8a4b12;
		font-size: 13px;
		line-height: 1.5;
	}

	.nutrition-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
	}

	.nutrition-grid div {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.nutrition-grid span {
		font-size: 14px;
		color: #666;
	}

	.nutrition-grid strong {
		font-size: 18px;
	}

	.ingredients {
		line-height: 1.7;
		color: #444;
		margin: 0;
	}

	.status,
	.not-found {
		text-align: center;
		margin-top: 100px;
	}

	.status {
		color: #666;
	}

	.not-found a {
		display: inline-block;
		margin-top: 20px;
		color: inherit;
	}

	@media (max-width: 750px) {
		main {
			padding: 0 20px;
		}

		.product-header {
			grid-template-columns: 1fr;
			gap: 30px;
		}

		.product-image {
			height: 280px;
		}

		.details-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
