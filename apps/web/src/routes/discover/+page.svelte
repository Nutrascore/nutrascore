<script lang="ts">
	import { page } from '$app/state';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import { products } from '$lib/data/products';
	import { compareStore } from '$lib/stores/compareStore';

	function selectProduct(productId: string) {
		compareStore.addProduct(productId);
	}

	let filtersOpen = $state(false);

	const filters = {
		category: ['Snacks', 'Beverages', 'Instant Noodles', 'Biscuits'],
		nutrition: ['High Protein', 'Low Sugar', 'Low Calories'],
		diet: ['Vegetarian', 'Vegan']
	};

	let selectedFilters = $state({
		category: [] as string[],
		nutrition: [] as string[],
		diet: [] as string[]
	});

	function toggleFilter(
		type: 'category' | 'nutrition' | 'diet',
		value: string
	) {
		const selected = selectedFilters[type];

		if (selected.includes(value)) {
			selectedFilters[type] = selected.filter(
				(item) => item !== value
			);
		} else {
			selectedFilters[type].push(value);
		}
	}

	let searchQuery = $derived(page.url.searchParams.get('q') ?? '');

	let filteredProducts = $derived(
		products.filter((product) => {
			const normalizedQuery = searchQuery.trim().toLowerCase();

			const searchMatches =
				normalizedQuery === '' ||
				product.name.toLowerCase().includes(normalizedQuery) ||
				product.brand.toLowerCase().includes(normalizedQuery) ||
				product.category.toLowerCase().includes(normalizedQuery);

			const categoryMatches =
				selectedFilters.category.length === 0 ||
				selectedFilters.category.includes(product.category);

			const protein = parseFloat(product.nutrition.protein);
			const sugar = parseFloat(product.nutrition.sugar);
			const calories = parseFloat(product.nutrition.calories);

			const nutritionMatches =
				selectedFilters.nutrition.length === 0 ||
				selectedFilters.nutrition.every((filter) => {
					if (filter === 'High Protein') {
						return protein >= 10;
					}

					if (filter === 'Low Sugar') {
						return sugar <= 5;
					}

					if (filter === 'Low Calories') {
						return calories <= 100;
					}

					return true;
				});

			const dietMatches =
				selectedFilters.diet.length === 0 ||
				selectedFilters.diet.every((filter) => {
					if (filter === 'Vegetarian') {
						return product.labels.includes('Vegetarian');
					}

					if (filter === 'Vegan') {
						return product.labels.includes('Vegan');
					}

					return true;
				});

			return (
				searchMatches &&
				categoryMatches &&
				nutritionMatches &&
				dietMatches
			);
		})
	);
</script>

<svelte:head>
	<title>Discover Products — NutraScore</title>
</svelte:head>

<main>
	<section class="filters-section">
		<button
			type="button"
			class="filters-header"
			onclick={() => (filtersOpen = !filtersOpen)}
			aria-expanded={filtersOpen}
		>
			<span>Filters</span>

			<span class="arrow" class:rotated={filtersOpen}>
				⌄
			</span>
		</button>

		{#if filtersOpen}
			<div class="filters">
				<div class="filter-group">
					<span class="filter-label">Category</span>

					<div class="filter-options">
						{#each filters.category as category}
							<button
								type="button"
								class="filter-option"
								class:selected={selectedFilters.category.includes(category)}
								onclick={() => toggleFilter('category', category)}
							>
								{category}
							</button>
						{/each}
					</div>
				</div>

				<div class="filter-group">
					<span class="filter-label">Nutrition</span>

					<div class="filter-options">
						{#each filters.nutrition as nutrition}
							<button
								type="button"
								class="filter-option"
								class:selected={selectedFilters.nutrition.includes(nutrition)}
								onclick={() => toggleFilter('nutrition', nutrition)}
							>
								{nutrition}
							</button>
						{/each}
					</div>
				</div>

				<div class="filter-group">
					<span class="filter-label">Diet</span>

					<div class="filter-options">
						{#each filters.diet as diet}
							<button
								type="button"
								class="filter-option"
								class:selected={selectedFilters.diet.includes(diet)}
								onclick={() => toggleFilter('diet', diet)}
							>
								{diet}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</section>

	<section class="popular-products">
		<div class="section-header">
			<div>
				<h2>Popular Products</h2>
				<p>Explore some commonly searched packaged food products.</p>
			</div>

			{#if $compareStore.length > 0}
				<a href="/compare" class="compare-button">
					Compare ({$compareStore.length})
				</a>
			{/if}
		</div>

		<div class="product-grid">
			{#each filteredProducts as product}
				<ProductCard
					{product}
					selectMode={true}
					onSelect={() => selectProduct(product.id)}
				/>
			{:else}
				<p class="no-results">
					No products found matching your search and filters.
				</p>
			{/each}
		</div>
	</section>
</main>

<style>
	main {
		max-width: 1200px;
		margin: 60px auto;
		padding: 0 40px;
	}

	.filters-section {
		margin-bottom: 60px;
		border: 1px solid #e5e5e5;
		border-radius: 16px;
		background: #fafafa;
		overflow: hidden;
	}

	.filters-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border: none;
		background: transparent;
		font-size: 20px;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.arrow {
		font-size: 24px;
		transition: transform 0.2s ease;
	}

	.arrow.rotated {
		transform: rotate(180deg);
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 0 24px 24px;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.filter-label {
		font-size: 14px;
		font-weight: 600;
		color: #444;
	}

	.filter-options {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.filter-option {
		padding: 9px 16px;
		border: 1px solid #ddd;
		border-radius: 20px;
		background: white;
		cursor: pointer;
		font-size: 14px;
		transition: 0.2s;
	}

	.filter-option:hover {
		background: #f0f0f0;
		border-color: #bbb;
	}

	.filter-option.selected {
		background: #080808;
		color: white;
		border-color: #080808;
	}

	.section-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 25px;
	}

	.section-header h2 {
		margin-bottom: 6px;
	}

	.section-header p {
		color: #666;
		margin: 0;
	}

	.compare-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 10px 18px;
		border-radius: 10px;
		background: #080808;
		color: white;
		text-decoration: none;
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
	}

	.product-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 20px;
	}

	.no-results {
		grid-column: 1 / -1;
		color: #666;
	}

	@media (max-width: 750px) {
		main {
			padding: 0 20px;
		}

		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>