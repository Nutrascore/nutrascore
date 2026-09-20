<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getProduct, type Product } from '$lib/api';
	import { compareStore } from '$lib/stores/compareStore';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';

	let product = $state<Product | null>(null);
	let loading = $state(true);
	let error = $state('');

	let productId = $derived(page.params.id);
	let isSelectedForCompare = $derived(product ? $compareStore.includes(product.id) : false);

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
				<span class="category">Product</span>

				<h1>{product.name}</h1>

				<p class="brand">
					{product.brand ?? 'Unknown brand'}
				</p>

				{#if product.barcode}
					<p class="barcode">Barcode: {product.barcode}</p>
				{/if}

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
			</div>
		</section>

		<section class="details-grid">
			<div class="details-section">
				<h2>Nutrition Information</h2>

				<p class="nutrition-note">Values per 100g</p>

				<div class="nutrition-grid">
					<div>
						<span>Calories</span>
						<strong>
							{formatNutritionValue(product.nutrition?.kcalPer100g, ' kcal')}
						</strong>
					</div>

					<div>
						<span>Protein</span>
						<strong>
							{formatNutritionValue(product.nutrition?.proteinG, ' g')}
						</strong>
					</div>

					<div>
						<span>Carbohydrates</span>
						<strong>
							{formatNutritionValue(product.nutrition?.carbohydratesG, ' g')}
						</strong>
					</div>

					<div>
						<span>Fat</span>
						<strong>
							{formatNutritionValue(product.nutrition?.fatG, ' g')}
						</strong>
					</div>

					<div>
						<span>Sugar</span>
						<strong>
							{formatNutritionValue(product.nutrition?.sugarsG, ' g')}
						</strong>
					</div>

					<div>
						<span>Salt</span>
						<strong>
							{formatNutritionValue(product.nutrition?.saltG, ' g')}
						</strong>
					</div>

					<div>
						<span>Saturated Fat</span>
						<strong>
							{formatNutritionValue(product.nutrition?.saturatedFatG, ' g')}
						</strong>
					</div>

					<div>
						<span>Fibre</span>
						<strong>
							{formatNutritionValue(product.nutrition?.fibreG, ' g')}
						</strong>
					</div>

					<div>
						<span>Trans Fat</span>
						<strong>
							{formatNutritionValue(product.nutrition?.transFatG, ' g')}
						</strong>
					</div>

					<div>
						<span>Sodium</span>
						<strong>
							{formatNutritionValue(product.nutrition?.sodiumMg, ' mg')}
						</strong>
					</div>
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

	.barcode {
		margin: -10px 0 20px;
		color: #888;
		font-size: 14px;
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
		margin-bottom: 8px;
		font-size: 22px;
	}

	.nutrition-note {
		margin: 0 0 25px;
		color: #777;
		font-size: 14px;
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
