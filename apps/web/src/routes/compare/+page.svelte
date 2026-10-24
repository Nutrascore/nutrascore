<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { compareStore } from '$lib/stores/compareStore';
	import { compareProducts, type Product } from '$lib/api';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';
	import {
		buildComparisonAnalysis,
		normalisedValue,
		formatComparisonNutrition,
		formatPriceComparison,
		type ComparisonNutrientKey
	} from '$lib/utils/compareNutrition';

	let selectedProductIds = $derived($compareStore);

	let comparisonProducts = $state<Product[]>([]);
	let loading = $state(false);
	let error = $state('');

	let comparisonRequestId = 0;
	let previousIds = '';

	function addProduct() {
		if (selectedProductIds.length >= 2) {
			showComparisonWarning();
			return;
		}
		goto(resolve('/discover'));
	}

	function removeProduct(productId: string) {
		// Invalidate any request that started before this removal.
		comparisonRequestId++;

		// Immediately remove only the selected product.
		comparisonProducts = comparisonProducts.filter((product) => product.id !== productId);

		loading = false;
		error = '';

		compareStore.removeProduct(productId);
	}

	function nutritionComparison(
		product: Product,
		other: Product,
		key: ComparisonNutrientKey,
		unit: string
	) {
		if (product.nutrition?.basis === 'unknown' && other.nutrition?.basis === 'unknown') {
			return {
				value: formatNutritionValue(product.nutrition[key], unit),
				percentage: 'N/A',
				percentageClass: 'neutral'
			};
		}

		const comparison = formatComparisonNutrition(
			normalisedValue(product, key),
			normalisedValue(other, key),
			unit
		);

		return {
			value: comparison.value,
			percentage: comparison.percentage,
			percentageClass: comparison.percentageClass
		};
	}

	let warningMessage = $state('');
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
		comparisonProducts = comparisonProducts.filter((product) => selectedIds.includes(product.id));

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
				.map((id) => result.products.find((product) => product.id === id))
				.filter((product): product is Product => Boolean(product));
		} catch (err) {
			if (requestId !== comparisonRequestId) return;

			console.error(err);

			error = err instanceof Error ? err.message : 'Unable to compare products.';
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

<main class="compare-page">
	<div class="comparison-main">
		<header class="compare-header">
			<div>
				<h1>Compare Products</h1>
				<p class="header-description">
					See how nutrition, ingredients, and price stack up side by side.
				</p>
			</div>
			<p class="selection-count" aria-live="polite">
				{selectedProductIds.length} of 2 products selected
			</p>
		</header>

		{#if warningMessage}
			<div class="comparison-warning" role="status">
				{warningMessage}
			</div>
		{/if}

		<section class="product-selection" aria-labelledby="selection-heading">
			<div class="section-heading">
				<div>
					<h2 id="selection-heading">Your products</h2>
					<p>Choose up to two products to start a comparison.</p>
				</div>
			</div>

			<div class="comparison-products">
				{#each [0, 1] as slotIndex (slotIndex)}
					{@const selectedId = selectedProductIds[slotIndex]}
					{@const product = selectedId
						? comparisonProducts.find((item) => item.id === selectedId)
						: undefined}
					<article class="product-slot" aria-label={`Product ${slotIndex + 1}`}>
						<div class="slot-heading">
							<span>Product {String(slotIndex + 1).padStart(2, '0')}</span>
							{#if selectedId}
								<button
									type="button"
									class="change-product"
									onclick={() => removeProduct(selectedId)}
								>
									Remove
								</button>
							{/if}
						</div>

						{#if product}
							<div class="selected-product">
								<div class="product-image">
									{#if product.imageUrl}
										<img src={product.imageUrl} alt={product.name} />
									{:else}
										<span>No image</span>
									{/if}
								</div>
								<div class="product-info">
									<span class="category">{product.categories[0] ?? 'Product'}</span>
									<h3>{product.name}</h3>
									<p>{product.brand ?? 'Unknown brand'}</p>
									<div class="product-serving">
										<span>Serving size</span>
										<strong>
											{#if product.nutrition?.servingSize}
												{product.nutrition.servingSize}
												{product.nutrition.servingUnit ?? ''}
											{:else}
												Not listed
											{/if}
										</strong>
									</div>
								</div>
							</div>
						{:else if selectedId}
							<div class="selected-placeholder">
								<strong>Product selected</strong>
								<span>Details will appear when both products are selected.</span>
							</div>
						{:else}
							<button type="button" class="add-product" onclick={addProduct}>
								<span class="plus" aria-hidden="true">+</span>
								<span class="add-product-title">Add a product</span>
								<span class="add-product-hint">Browse the catalog to choose a product</span>
							</button>
						{/if}
					</article>
				{/each}
			</div>
		</section>

		{#if loading}
			<p class="comparison-status" role="status">Loading comparison...</p>
		{:else if error}
			<p class="comparison-status error" role="alert">{error}</p>
		{:else if comparisonProducts.length >= 2}
			{@const priceComparison = formatPriceComparison(
				comparisonProducts[0].priceInr,
				comparisonProducts[1].priceInr
			)}
			<section class="comparison-section" aria-labelledby="nutrition-heading">
				<div class="section-heading">
					<div>
						<h2 id="nutrition-heading">Nutrition comparison</h2>
					</div>
					<p class="section-description">
						{#if comparisonProducts.every((product) => product.nutrition?.basis === 'unknown')}
							Values are shown as recorded in the dataset; its nutrition basis is unspecified, so
							percent differences are not calculated.
						{:else}
							Values are compared per 100 g. Per-serving values are normalized when a valid gram
							serving size is available; nutrients with missing or uncertain measurement bases may
							be excluded.
						{/if}
					</p>
				</div>

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
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>

					<div class="nutrition-row">
						<span>Protein</span>
						{#each comparisonProducts as product, index (product.id)}
							{@const other = comparisonProducts[index === 0 ? 1 : 0]}
							{@const comparison = nutritionComparison(product, other, 'proteinG', ' g')}
							<span>
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>

					<div class="nutrition-row">
						<span>Carbohydrates</span>
						{#each comparisonProducts as product, index (product.id)}
							{@const other = comparisonProducts[index === 0 ? 1 : 0]}
							{@const comparison = nutritionComparison(product, other, 'carbohydratesG', ' g')}
							<span>
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>

					<div class="nutrition-row">
						<span>Fat</span>
						{#each comparisonProducts as product, index (product.id)}
							{@const other = comparisonProducts[index === 0 ? 1 : 0]}
							{@const comparison = nutritionComparison(product, other, 'fatG', ' g')}
							<span>
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>

					<div class="nutrition-row">
						<span>Sugar</span>
						{#each comparisonProducts as product, index (product.id)}
							{@const other = comparisonProducts[index === 0 ? 1 : 0]}
							{@const comparison = nutritionComparison(product, other, 'sugarsG', ' g')}
							<span>
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>

					<div class="nutrition-row">
						<span>Salt</span>
						{#each comparisonProducts as product, index (product.id)}
							{@const other = comparisonProducts[index === 0 ? 1 : 0]}
							{@const comparison = nutritionComparison(product, other, 'saltG', ' g')}
							<span>
								{comparison.value} (<span class={comparison.percentageClass}
									>{comparison.percentage}</span
								>)
							</span>
						{/each}
					</div>
				</div>

				<section class="price-comparison" aria-labelledby="price-heading">
					<div class="section-heading compact-heading">
						<h3 id="price-heading">Price comparison</h3>
					</div>
					<div class="nutrition-table">
						<div class="nutrition-row nutrition-header">
							<span>Product</span>
							{#each comparisonProducts as product (product.id)}
								<span>{product.name}</span>
							{/each}
						</div>

						<div class="nutrition-row">
							<span>Product price</span>
							<span>
								{priceComparison.productAPrice} (<span
									class={priceComparison.productAPercentageClass}
									>{priceComparison.productAPercentage}</span
								>)
							</span>
							<span>
								{priceComparison.productBPrice} (<span
									class={priceComparison.productBPercentageClass}
									>{priceComparison.productBPercentage}</span
								>)
							</span>
						</div>
					</div>
				</section>
			</section>

			<section class="comparison-section" aria-labelledby="ingredients-heading">
				<div class="section-heading">
					<div>
						<h2 id="ingredients-heading">Ingredients</h2>
					</div>
				</div>
				<div class="ingredients-comparison">
					{#each comparisonProducts as product (product.id)}
						<article>
							<h3>{product.name}</h3>
							<p>{product.ingredients ?? 'Ingredients unavailable.'}</p>
						</article>
					{/each}
				</div>
			</section>

			<section class="comparison-section" aria-labelledby="analysis-heading">
				<div class="section-heading">
					<div>
						<h2 id="analysis-heading">Analysis</h2>
					</div>
				</div>
				<div class="analysis-comparison">
					{#each comparisonProducts as product, index (product.id)}
						{@const other = comparisonProducts[index === 0 ? 1 : 0]}
						<article class="analysis-card">
							<h3>{product.name}</h3>
							<p>{buildComparisonAnalysis(product, other)}</p>
						</article>
					{/each}
				</div>
			</section>
		{:else}
			<p class="comparison-status">Add products to start comparing.</p>
		{/if}
	</div>
</main>

<style>
	.compare-page {
		min-width: 0;
		padding: 48px clamp(20px, 4vw, 56px) 72px;
	}

	.comparison-main {
		width: min(100%, 1200px);
		margin: 0 auto;
		min-width: 0;
	}

	.compare-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 32px;
		margin-bottom: 34px;
	}

	.compare-header h1 {
		margin: 0;
		font-size: clamp(32px, 3.4vw, 44px);
		line-height: 1.1;
		letter-spacing: -0.04em;
	}

	.eyebrow {
		margin: 0 0 10px;
		color: #216b48;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.header-description {
		margin: 12px 0 0;
		color: #666;
		font-size: 16px;
		line-height: 1.5;
	}

	.selection-count {
		flex: 0 0 auto;
		margin: 0 0 4px;
		padding: 9px 12px;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #fff;
		color: #254332;
		font-size: 13px;
		font-weight: 600;
	}

	.comparison-warning {
		margin: -12px 0 22px;
		padding: 12px 16px;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #f2f7f3;
		color: #254332;
	}

	.product-selection {
		margin-bottom: 52px;
	}

	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 18px;
	}

	.section-heading h2,
	.section-heading h3 {
		margin: 0;
		font-size: 24px;
		line-height: 1.25;
		letter-spacing: -0.025em;
	}

	.section-heading > div > p:not(.eyebrow),
	.section-description {
		max-width: 620px;
		margin: 7px 0 0;
		color: #666;
		font-size: 14px;
		line-height: 1.55;
	}

	.comparison-products {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}

	.product-slot {
		display: flex;
		min-width: 0;
		min-height: 206px;
		flex-direction: column;
		padding: 16px;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		background: #fff;
	}

	.slot-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
		color: #657168;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.selected-product {
		display: flex;
		align-items: center;
		gap: 18px;
		flex: 1;
		min-width: 0;
	}

	.product-image {
		display: flex;
		width: 104px;
		height: 104px;
		flex: 0 0 104px;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-radius: 6px;
		background: #f2f7f3;
		color: #657168;
		font-size: 12px;
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
		color: #216b48;
		font-size: 12px;
		font-weight: 600;
	}

	.product-info h3 {
		margin: 5px 0;
		font-size: 18px;
		line-height: 1.3;
	}

	.product-info > p {
		margin: 0;
		color: #666;
		font-size: 14px;
	}

	.product-serving {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 0;
		font-size: 12px;
	}

	.product-serving span {
		color: #657168;
	}

	.product-serving strong {
		color: #254332;
		font-weight: 600;
	}

	.change-product {
		padding: 5px 9px;
		border: 1px solid #d8ded9;
		border-radius: 5px;
		background: #fff;
		color: #254332;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.change-product:hover {
		border-color: #9cbea7;
		background: #f2f7f3;
		color: #216b48;
	}

	.add-product {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px dashed #9cbea7;
		border-radius: 6px;
		background: #fff;
		color: #216b48;
		cursor: pointer;
		font: inherit;
	}

	.add-product:hover {
		border-color: #9cbea7;
		background: #f2f7f3;
	}

	.add-product:focus-visible,
	.change-product:focus-visible {
		outline: 3px solid rgb(39 118 79 / 25%);
		outline-offset: 2px;
	}

	.plus {
		display: flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: #edf6ef;
		color: #185238;
		font-size: 22px;
		line-height: 1;
	}

	.add-product-title {
		font-size: 15px;
		font-weight: 700;
	}

	.add-product-hint {
		color: #657168;
		font-size: 12px;
	}

	.selected-placeholder {
		display: flex;
		flex: 1;
		justify-content: center;
		flex-direction: column;
		gap: 6px;
		padding: 12px 4px;
	}

	.selected-placeholder strong {
		font-size: 16px;
	}

	.selected-placeholder span {
		color: #657168;
		font-size: 13px;
		line-height: 1.5;
	}

	.comparison-section {
		margin: 0 0 48px;
	}

	.comparison-section > .section-heading {
		margin-bottom: 18px;
	}

	.nutrition-table {
		min-width: 0;
		overflow: hidden;
		border: 1px solid #e5e5e5;
		border-radius: 7px;
		background: #fff;
	}

	.nutrition-row {
		display: grid;
		grid-template-columns: minmax(130px, 0.78fr) repeat(2, minmax(0, 1fr));
		gap: 16px;
		min-width: 0;
		padding: 13px 18px;
		border-bottom: 1px solid #e5e5e5;
		font-size: 14px;
	}

	.nutrition-row:last-child {
		border-bottom: 0;
	}

	.nutrition-row > span {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.nutrition-row > span:not(:first-child) {
		text-align: right;
	}

	.nutrition-header {
		background: #f2f7f3;
		font-weight: 700;
	}

	.nutrition-row .positive {
		color: #28713a !important;
		font-weight: 600;
	}

	.nutrition-row .negative {
		color: #b64035 !important;
		font-weight: 600;
	}

	.nutrition-row .neutral {
		color: inherit;
		font-weight: inherit;
	}

	.price-comparison {
		margin-top: 28px;
	}

	.compact-heading h3 {
		font-size: 18px;
	}

	.ingredients-comparison,
	.analysis-comparison {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}

	.ingredients-comparison article,
	.analysis-card {
		min-width: 0;
		padding: 18px;
		border: 1px solid #e5e5e5;
		border-radius: 7px;
		background: #fff;
		overflow-wrap: anywhere;
	}

	.ingredients-comparison h3,
	.analysis-card h3 {
		margin: 0 0 10px;
		font-size: 16px;
		line-height: 1.4;
	}

	.ingredients-comparison p,
	.analysis-card p {
		margin: 0;
		color: #666;
		font-size: 14px;
		line-height: 1.65;
	}

	.comparison-status {
		margin: 0;
		padding: 17px 18px;
		border-top: 1px solid #e5e5e5;
		color: #657168;
		font-size: 14px;
	}

	.comparison-status.error {
		color: #b00020;
	}

	@media (max-width: 750px) {
		.compare-page {
			padding: 32px 20px 48px;
		}

		.compare-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 16px;
		}

		.product-selection {
			margin-bottom: 38px;
		}

		.comparison-products,
		.ingredients-comparison,
		.analysis-comparison {
			grid-template-columns: minmax(0, 1fr);
		}

		.product-slot {
			min-height: 190px;
		}

		.nutrition-table {
			overflow-x: auto;
		}

		.nutrition-row {
			min-width: 540px;
		}

		.section-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 8px;
		}
	}

	@media (max-width: 420px) {
		.compare-page {
			padding: 28px 12px 40px;
		}

		.selected-product {
			align-items: flex-start;
			gap: 12px;
		}

		.product-image {
			width: 78px;
			height: 78px;
			flex-basis: 78px;
		}

		.product-info h3 {
			font-size: 16px;
		}
	}
</style>
