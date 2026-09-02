<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { products } from '$lib/data/products';

	let productId = $derived(page.params.id);

	let product = $derived(products.find((product) => product.id === productId));

	function addToCompare() {
		if (!product) return;

		console.log('Add to compare:', product.name);
	}
</script>

```svelte

<svelte:head>
	<title>
		{product ? `${product.name} — NutraScore` : 'Product — NutraScore'}
	</title>
</svelte:head>

<main>
	{#if product}
		<section class="product-header">
			<div class="product-image">
				{#if product.image}
					<img src={product.image} alt={product.name} />
				{:else}
					<span>No Image</span>
				{/if}
			</div>

			<div class="product-summary">
				<span class="category">{product.category}</span>

				<h1>{product.name}</h1>

				<p class="brand">{product.brand}</p>

				<div class="labels">
					{#each product.labels as label (label)}
						<span>{label}</span>
					{/each}
				</div>

				<button class="compare-button" onclick={addToCompare}> Add to Compare </button>
			</div>
		</section>

		<section class="details-grid">
			<div class="details-section">
				<h2>Nutrition Information</h2>

				<div class="nutrition-grid">
					<div>
						<span>Calories</span>
						<strong>{product.nutrition.calories}</strong>
					</div>

					<div>
						<span>Protein</span>
						<strong>{product.nutrition.protein}</strong>
					</div>

					<div>
						<span>Carbohydrates</span>
						<strong>{product.nutrition.carbohydrates}</strong>
					</div>

					<div>
						<span>Fat</span>
						<strong>{product.nutrition.fat}</strong>
					</div>

					<div>
						<span>Sugar</span>
						<strong>{product.nutrition.sugar}</strong>
					</div>

					<div>
						<span>Salt</span>
						<strong>{product.nutrition.salt}</strong>
					</div>
				</div>
			</div>

			<div class="details-section">
				<h2>Ingredients</h2>

				<p class="ingredients">
					{product.ingredients}
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
```

<style>
	main {
		max-width: 1100px;
		margin: 60px auto;
		padding: 0 40px;
	}

	.product-header {
		display: grid;
		grid-template-columns: 350px 1fr;
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

	.details-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 30px;
	}

	.details-section {
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		padding: 25px;
	}

	.details-section h2 {
		margin-top: 0;
		margin-bottom: 25px;
		font-size: 22px;
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

	.not-found {
		text-align: center;
		margin-top: 100px;
	}

	.not-found a {
		display: inline-block;
		margin-top: 20px;
		color: inherit;
	}
</style>
