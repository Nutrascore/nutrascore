<script lang="ts">
	import { goto } from '$app/navigation';
	import { compareStore } from '$lib/stores/compareStore';
	import { products } from '$lib/data/products';

	let selectedProductIds = $derived($compareStore);

	let selectedProducts = $derived(
		selectedProductIds
			.map((id) => products.find((product) => product.id === id))
			.filter((product) => product !== undefined)
	);

	let firstProduct = $derived(selectedProducts[0]);
	let secondProduct = $derived(selectedProducts[1]);

	function addProduct() {
		goto('/discover');
	}

	function removeProduct(productId: string) {
		compareStore.removeProduct(productId);
	}
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
					{#if firstProduct.image}
						<img src={firstProduct.image} alt={firstProduct.name} />
					{:else}
						<span>No Image</span>
					{/if}
				</div>

				<div class="product-info">
					<span class="category">{firstProduct.category}</span>
					<h2>{firstProduct.name}</h2>
					<p>{firstProduct.brand}</p>
				</div>

				<button
					type="button"
					class="change-product"
					onclick={() => removeProduct(firstProduct.id)}
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
					{#if secondProduct.image}
						<img src={secondProduct.image} alt={secondProduct.name} />
					{:else}
						<span>No Image</span>
					{/if}
				</div>

				<div class="product-info">
					<span class="category">{secondProduct.category}</span>
					<h2>{secondProduct.name}</h2>
					<p>{secondProduct.brand}</p>
				</div>

				<button
					type="button"
					class="change-product"
					onclick={() => removeProduct(secondProduct.id)}
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

	{#if firstProduct && secondProduct}
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
					<span>{firstProduct.nutrition.calories}</span>
					<span>{secondProduct.nutrition.calories}</span>
				</div>

				<div class="nutrition-row">
					<span>Protein</span>
					<span>{firstProduct.nutrition.protein}</span>
					<span>{secondProduct.nutrition.protein}</span>
				</div>

				<div class="nutrition-row">
					<span>Carbohydrates</span>
					<span>{firstProduct.nutrition.carbohydrates}</span>
					<span>{secondProduct.nutrition.carbohydrates}</span>
				</div>

				<div class="nutrition-row">
					<span>Fat</span>
					<span>{firstProduct.nutrition.fat}</span>
					<span>{secondProduct.nutrition.fat}</span>
				</div>

				<div class="nutrition-row">
					<span>Sugar</span>
					<span>{firstProduct.nutrition.sugar}</span>
					<span>{secondProduct.nutrition.sugar}</span>
				</div>

				<div class="nutrition-row">
					<span>Salt</span>
					<span>{firstProduct.nutrition.salt}</span>
					<span>{secondProduct.nutrition.salt}</span>
				</div>
			</div>
		</section>

		<section class="comparison-section">
			<h2>Ingredients</h2>

			<div class="ingredients-comparison">
				<div>
					<p>{firstProduct.ingredients}</p>
				</div>

				<div>
					<p>{secondProduct.ingredients}</p>
				</div>
			</div>
		</section>

		<section class="comparison-section">
			<h2>Labels</h2>

			<div class="labels-comparison">
				<div>

					<div class="labels">
						{#each firstProduct.labels as label}
							<span>{label}</span>
						{/each}
					</div>
				</div>

				<div>

					<div class="labels">
						{#each secondProduct.labels as label}
							<span>{label}</span>
						{/each}
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

	.comparison-hint {
		text-align: center;
		color: #666;
		margin-bottom: 50px;
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

	.change-product:hover {
		background: #f5f5f5;
		border-color: #ccc;
	}
</style>