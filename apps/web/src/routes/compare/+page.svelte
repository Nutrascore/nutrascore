<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { compareStore } from '$lib/stores/compareStore';
	import { compareProducts, type Product } from '$lib/api';
	import { formatComparisonNutrition } from '$lib/utils/compareNutrition';

	let selectedProductIds = $derived($compareStore);

	let comparisonProducts = $state<Product[]>([]);
	let loading = $state(false);
	let error = $state('');

	let comparisonRequestId = 0;
	let previousIds = '';

	function addProduct() {
		goto(resolve('/discover'));
	}

	function removeProduct(productId: string) {
		// Invalidate any request that started before this removal.
		comparisonRequestId++;

		// Immediately remove only the selected product.
		comparisonProducts = comparisonProducts.filter(
			(product) => product.id !== productId
		);

		loading = false;
		error = '';

		compareStore.removeProduct(productId);
	}

	function nutritionComparison(
	product: Product,
	other: Product,
	key: keyof NonNullable<Product['nutrition']>,
	unit: string
	) {
	const value = product.nutrition?.[key];
	const otherValue = other.nutrition?.[key];

	const comparison = formatComparisonNutrition(value, otherValue, unit);

	let percentageClass = 'neutral';

	if (
		value != null &&
		otherValue != null &&
		Number.isFinite(Number(value)) &&
		Number.isFinite(Number(otherValue)) &&
		Number(otherValue) !== 0
	) {
		const percentage =
			((Number(value) - Number(otherValue)) / Math.abs(Number(otherValue))) * 100;

		if (percentage > 0) {
			percentageClass = 'positive';
		} else if (percentage < 0) {
			percentageClass = 'negative';
		}
	}

	return {
		value: comparison.value,
		percentage: comparison.percentage,
		percentageClass
	};
	}

	let warningMessage = '';
	let warningTimeout: ReturnType<typeof setTimeout>;

	function showComparisonWarning() {
	warningMessage = 'Only 2 products can be compared';

	clearTimeout(warningTimeout);

	warningTimeout = setTimeout(() => {
		warningMessage = '';
	}, 2500);
	}

	async function loadComparison(ids: string[]) {
		const requestId = ++comparisonRequestId;
		const selectedIds = [...new Set(ids)].slice(0, 2);

		error = '';

		// Preserve any already-loaded products that remain selected.
		comparisonProducts = comparisonProducts.filter((product) =>
			selectedIds.includes(product.id)
		);

		if (selectedIds.length < 2) {
			loading = false;
			return;
		}

		loading = true;

		try {
			const result = await compareProducts(selectedIds);

			// Ignore outdated responses.
			if (requestId !== comparisonRequestId) return;

			comparisonProducts = selectedIds
				.map((id) =>
					result.products.find((product) => product.id === id)
				)
				.filter((product): product is Product => Boolean(product));
		} catch (err) {
			if (requestId !== comparisonRequestId) return;

			console.error(err);

			error =
				err instanceof Error
					? err.message
					: 'Unable to compare products.';
		} finally {
			if (requestId === comparisonRequestId) {
				loading = false;
			}
		}
	}

	$effect(() => {
		const ids = [...selectedProductIds].slice(0, 2);
		const signature = ids.join(',');

		// Avoid fetching again if the selection hasn't changed.
		if (signature === previousIds) return;

		previousIds = signature;
		void loadComparison(ids);
	});
</script>

<svelte:head>
	<title>Compare Products — NutraScore</title>
</svelte:head>

<main>
	<div class="comparison-main"> 
	<section class="compare-header">
		<h1>Compare Products</h1>
		<p>Select two products to compare their nutrition and ingredients.</p>
	</section>

	{#if warningMessage}
	<div class="comparison-warning" role="status">
		{warningMessage}
	</div>
	{/if}

	<section class="comparison-products">
		{#each comparisonProducts as product (product.id)}
			<div class="comparison-product">
				<div class="product-image">
					{#if product.imageUrl}
						<img src={product.imageUrl} alt={product.name} />
					{:else}
						<span>No Image</span>
					{/if}
				</div>

				<div class="product-info">
					<span class="category">
						{product.categories[0] ?? 'Product'}
					</span>

					<h2>{product.name}</h2>
					<p>{product.brand ?? 'Unknown brand'}</p>
				</div>

				<button
					type="button"
					class="change-product"
					onclick={() => removeProduct(product.id)}
				>
					Remove
				</button>
			</div>
		{/each}

		{#if selectedProductIds.length < 2}
			<button type="button" class="add-product" onclick={addProduct}>
				<span class="plus">+</span>
				<span >Add Product</span>
			</button>
		{/if}
		
		
	</section>
	</div>

	{#if loading}
		<p class="comparison-hint">Loading comparison...</p>
	{:else if error}
		<p class="comparison-hint error">{error}</p>
	{:else if comparisonProducts.length >= 2}
		<section class="comparison-section">
			<h2>Nutrition Comparison</h2>

			<div class="nutrition-table">
				<div class="nutrition-row nutrition-header">
					<span>Nutrient</span>
					{#each comparisonProducts as product (product.id)}
						<span>{product.name}</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Calories</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'kcalPer100g', ' kcal')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Protein</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'proteinG', ' g')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Carbohydrates</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'carbohydratesG', ' g')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Fat</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'fatG', ' g')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Sugar</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'sugarsG', ' g')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>

				<div class="nutrition-row">
					<span>Salt</span>
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						{@const comparison = nutritionComparison(product, other, 'saltG', ' g')}
						<span>
							{comparison.value} (<span class={comparison.percentageClass}>{comparison.percentage}</span>)
						</span>
					{/each}
				</div>
			</div>
		</section>

		<section class="comparison-section">
			<h2>Ingredients</h2>

			<div class="ingredients-comparison">
				{#each comparisonProducts as product (product.id)}
					<div>
						<p>{product.ingredients ?? 'Ingredients unavailable.'}</p>
					</div>
				{/each}
			</div>
		</section>

		<section class="comparison-section">
			<h2>Analysis</h2>

			<div class="labels-comparison">
				{#each comparisonProducts as product (product.id)}
					<div>
						<div class="labels">
							{#if product.nutriScore}
								<span>Nutri-Score {product.nutriScore.toUpperCase()}</span>
							{/if}

							{#if product.novaGroup}
								<span>NOVA {product.novaGroup}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<p class="comparison-hint">
			Add products to start comparing.
		</p>
	{/if}
</main>

<style>
	main {
		max-width: 1100px;
		margin: 60px auto;
		padding: 0 40px;
	}

	.compare-header {
		margin-bottom: 40px;
	}

	.compare-header h1 {
		margin-bottom: 10px;
	}

	.compare-header p {
		margin: 0;
		color: #666;
	}

	.comparison-products {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: stretch;
		gap: 25px;
		margin-bottom: 30px;
	}

	.add-product {
		min-height: 220px;
		min-width: 220px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		border: 2px dashed #ccc;
		border-radius: 16px;
		background: #fafafa;
		cursor: pointer;
		font-size: 16px;
		color: #555;
		
		transform: translate(75px, 20px);
		
	}

	.add-product:hover {
		border-color: #888;
		background: #f5f5f5;
	}

	.plus {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: #080808;
		color: white;
		font-size: 32px;
		font-weight: 300;
	}

	.comparison-product {
		position: relative;
		display: flex;
		align-items: center;
		gap: 20px;
		min-width: 0;
		padding: 48px 20px 20px;
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		background: white;
	}

	.product-image {
		width: 110px;
		height: 110px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f5f5f5;
		border-radius: 12px;
		overflow: hidden;
		color: #888;
		font-size: 13px;
	}

	.product-image img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.product-info {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.category {
		font-size: 12px;
		color: #777;
	}

	.product-info h2 {
		margin: 6px 0;
		font-size: 18px;
	}

	.product-info p {
		margin: 0;
		color: #666;
	}

	.change-product {
		position: absolute;
		top: 12px;
		right: 12px;
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: white;
		cursor: pointer;
		font-size: 12px;
	}

	.change-product:hover {
		background: #f5f5f5;
		border-color: #ccc;
	}

	.comparison-hint {
		text-align: center;
		color: #666;
		margin-bottom: 100px;
		margin-right: 70px;
	}

	.comparison-main {
		display: grid;
		justify-content: center;
		align-items: center;
		flex-direction: column;
	}
	.comparison-hint.error {
		color: #b00020;
	}

	.comparison-section {
		margin-bottom: 50px;
	}

	.comparison-section > h2 {
		margin-bottom: 20px;
	}

	.nutrition-table {
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		overflow: hidden;
	}

	.nutrition-row {
		display: grid;
		grid-template-columns: minmax(100px, 0.8fr) minmax(0, 1fr) minmax(0, 1fr);
		min-width: 0;
		padding: 16px 20px;
		gap: 12px;
		border-bottom: 1px solid #e5e5e5;
	}

	.nutrition-row > span {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.nutrition-row .positive {
	color: #16803c !important;
	font-weight: 600;
	}

	.nutrition-row .negative {
	color: #c62828 !important;
	font-weight: 600;
	}

	.nutrition-row .neutral {
	color: inherit;
	font-weight: inherit;
	}
	.nutrition-row:last-child {
		border-bottom: none;
	}

	.nutrition-header {
		font-weight: 600;
		background: #f5f5f5;
	}

	.ingredients-comparison,
	.labels-comparison {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 25px;
	}

	.ingredients-comparison > div,
	.labels-comparison > div {
		min-width: 0;
		padding: 20px;
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		overflow-wrap: anywhere;
	}

	.ingredients-comparison p {
		line-height: 1.6;
		color: #555;
	}

	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.labels span {
		padding: 7px 12px;
		border-radius: 20px;
		background: #f5f5f5;
		font-size: 14px;
	}

	@media (max-width: 750px) {
		main {
			margin-top: 32px;
			padding: 0 20px;
		}

		.comparison-products {
			grid-template-columns: minmax(0, 1fr);
		}

		.nutrition-table {
			overflow-x: auto;
		}

		.nutrition-row {
			min-width: 540px;
		}

		.ingredients-comparison,
		.labels-comparison {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 420px) {
		main {
			padding: 0 12px;
		}

		.comparison-product {
			gap: 12px;
			padding: 42px 12px 16px;
		}

		.product-image {
			width: 84px;
			height: 84px;
		}

		.product-info h2 {
			font-size: 16px;
		}
	}
</style>