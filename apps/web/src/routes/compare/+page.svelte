<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { compareStore } from '$lib/stores/compareStore';
	import { compareProducts, type Product } from '$lib/api';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';

	let selectedProductIds = $derived($compareStore);

	let firstProduct = $state<Product | null>(null);
	let secondProduct = $state<Product | null>(null);

	let loading = $state(false);
	let error = $state('');

	function addProduct() {
		goto(resolve('/discover'));
	}

	function removeProduct(productId: string) {
		compareStore.removeProduct(productId);
	}

	async function loadComparison() {
		const ids = selectedProductIds.slice(0, 2);

		firstProduct = null;
		secondProduct = null;
		error = '';

		if (ids.length < 2) {
			return;
		}

		loading = true;

		try {
			const result = await compareProducts(ids);

			firstProduct = result.products.find((product) => product.id === ids[0]) ?? null;

			secondProduct = result.products.find((product) => product.id === ids[1]) ?? null;
		} catch (err) {
			console.error(err);

			error = err instanceof Error ? err.message : 'Unable to compare products.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void selectedProductIds;

		loadComparison();
	});
</script>

<svelte:head>
	<title>Compare Products — NutraScore</title>
</svelte:head>

<main>
	<section class="compare-header">
		<h1>Compare Products</h1>
		<p>Select two products to compare their nutrition, ingredients, and labels.</p>
	</section>

	<section class="comparison-products">
		{#if firstProduct}
			<div class="comparison-product">
				<div class="product-image">
					{#if firstProduct.imageUrl}
						<img src={firstProduct.imageUrl} alt={firstProduct.name} />
					{:else}
						<span>No Image</span>
					{/if}
				</div>

				<div class="product-info">
					<span class="category">Product</span>

					<h2>{firstProduct.name}</h2>

					<p>{firstProduct.brand ?? 'Unknown brand'}</p>
				</div>

				<button
					type="button"
					class="change-product"
					onclick={() => removeProduct(firstProduct!.id)}
				>
					Remove
				</button>
			</div>
		{:else}
			<button type="button" class="add-product" onclick={addProduct}>
				<span class="plus">+</span>
				<span>Add Product</span>
			</button>
		{/if}

		<div class="vs">VS</div>

		{#if secondProduct}
			<div class="comparison-product">
				<div class="product-image">
					{#if secondProduct.imageUrl}
						<img src={secondProduct.imageUrl} alt={secondProduct.name} />
					{:else}
						<span>No Image</span>
					{/if}
				</div>

				<div class="product-info">
					<span class="category">Product</span>

					<h2>{secondProduct.name}</h2>

					<p>{secondProduct.brand ?? 'Unknown brand'}</p>
				</div>

				<button
					type="button"
					class="change-product"
					onclick={() => removeProduct(secondProduct!.id)}
				>
					Remove
				</button>
			</div>
		{:else}
			<button type="button" class="add-product" onclick={addProduct}>
				<span class="plus">+</span>
				<span>Add Product</span>
			</button>
		{/if}
	</section>

	{#if loading}
		<p class="comparison-hint">Loading comparison...</p>
	{:else if error}
		<p class="comparison-hint error">{error}</p>
	{:else if firstProduct && secondProduct}
		<section class="comparison-section">
			<h2>Nutrition Comparison</h2>

			<div class="nutrition-table">
				<div class="nutrition-row nutrition-header">
					<span>Nutrient</span>
					<span>{firstProduct.name}</span>
					<span>{secondProduct.name}</span>
				</div>

				<div class="nutrition-row">
					<span>Calories</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.kcalPer100g, ' kcal')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.kcalPer100g, ' kcal')}</span>
				</div>

				<div class="nutrition-row">
					<span>Protein</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.proteinG, ' g')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.proteinG, ' g')}</span>
				</div>

				<div class="nutrition-row">
					<span>Carbohydrates</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.carbohydratesG, ' g')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.carbohydratesG, ' g')}</span>
				</div>

				<div class="nutrition-row">
					<span>Fat</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.fatG, ' g')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.fatG, ' g')}</span>
				</div>

				<div class="nutrition-row">
					<span>Sugar</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.sugarsG, ' g')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.sugarsG, ' g')}</span>
				</div>

				<div class="nutrition-row">
					<span>Salt</span>
					<span>{formatNutritionValue(firstProduct.nutrition?.saltG, ' g')}</span>
					<span>{formatNutritionValue(secondProduct.nutrition?.saltG, ' g')}</span>
				</div>
			</div>
		</section>

		<section class="comparison-section">
			<h2>Ingredients</h2>

			<div class="ingredients-comparison">
				<div>
					<p>{firstProduct.ingredients ?? 'Ingredients unavailable.'}</p>
				</div>

				<div>
					<p>{secondProduct.ingredients ?? 'Ingredients unavailable.'}</p>
				</div>
			</div>
		</section>

		<section class="comparison-section">
			<h2>Labels</h2>

			<div class="labels-comparison">
				<div>
					<div class="labels">
						{#if firstProduct.nutriScore}
							<span>
								Nutri-Score {firstProduct.nutriScore.toUpperCase()}
							</span>
						{/if}

						{#if firstProduct.novaGroup}
							<span>NOVA {firstProduct.novaGroup}</span>
						{/if}
					</div>
				</div>

				<div>
					<div class="labels">
						{#if secondProduct.nutriScore}
							<span>
								Nutri-Score {secondProduct.nutriScore.toUpperCase()}
							</span>
						{/if}

						{#if secondProduct.novaGroup}
							<span>NOVA {secondProduct.novaGroup}</span>
						{/if}
					</div>
				</div>
			</div>
		</section>
	{:else}
		<p class="comparison-hint">
			Add {firstProduct ? 'one more product' : 'two products'} to start comparing.
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
		grid-template-columns: 1fr auto 1fr;
		align-items: stretch;
		gap: 25px;
		margin-bottom: 30px;
	}

	.add-product {
		min-height: 220px;
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

	.vs {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		font-weight: 700;
	}

	.comparison-product {
		position: relative;
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 20px;
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
		padding-right: 10px;
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
		top: 15px;
		right: 15px;
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
		margin-bottom: 50px;
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
		grid-template-columns: 1fr 1fr 1fr;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e5e5;
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
		grid-template-columns: 1fr 1fr;
		gap: 25px;
	}

	.ingredients-comparison > div,
	.labels-comparison > div {
		padding: 20px;
		border: 1px solid #e5e5e5;
		border-radius: 16px;
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
			padding: 0 20px;
		}

		.comparison-products {
			grid-template-columns: 1fr;
		}

		.vs {
			height: 30px;
		}

		.ingredients-comparison,
		.labels-comparison {
			grid-template-columns: 1fr;
		}
	}
</style>
