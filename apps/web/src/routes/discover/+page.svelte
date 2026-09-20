<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import { compareStore } from '$lib/stores/compareStore';
	import { searchProducts } from '$lib/api';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';

	interface ApiProduct {
		id: string;
		name: string;
		brand: string | null;
		barcode: string | null;
		nutriScore: string | null;
		novaGroup: number | null;
		imageUrl: string | null;
		nutrition: {
			kcalPer100g: string | null;
			fatG: string | null;
			saturatedFatG: string | null;
			transFatG: string | null;
			carbohydratesG: string | null;
			sugarsG: string | null;
			fibreG: string | null;
			proteinG: string | null;
			sodiumMg: string | null;
			saltG: string | null;
		} | null;
	}

	interface FrontendProduct {
		id: string;
		name: string;
		brand: string;
		barcode: string | null;
		category: string;
		image: string;
		ingredients: string;
		labels: string[];
		nutrition: {
			calories: string;
			protein: string;
			carbohydrates: string;
			fat: string;
			sugar: string;
			salt: string;
		};
	}

	let filtersOpen = $state(false);
	let loading = $state(false);
	let error = $state('');
	let apiProducts = $state<FrontendProduct[]>([]);

	const filters = {
		category: ['Snacks', 'Beverages', 'Instant Noodles', 'Biscuits'],
		nutrition: ['High Protein', 'Low Sugar', 'Low Calories'],
		diet: ['Vegetarian', 'Vegan']
	};

	const categoryNames: Record<string, string> = {
		Snacks: 'snacks',
		Beverages: 'beverages',
		'Instant Noodles': 'instant-noodles',
		Biscuits: 'biscuits'
	};

	let selectedFilters = $state({
		category: [] as string[],
		nutrition: [] as string[],
		diet: [] as string[]
	});

	let searchQuery = $derived(page.url.searchParams.get('q') ?? '');

	function toggleFilter(type: 'category' | 'nutrition' | 'diet', value: string) {
		const selected = selectedFilters[type];

		if (selected.includes(value)) {
			selectedFilters[type] = selected.filter((item) => item !== value);
		} else {
			selectedFilters[type] = [...selected, value];
		}
	}

	function convertProduct(product: ApiProduct): FrontendProduct {
		return {
			id: product.id,
			name: product.name,
			brand: product.brand ?? 'Unknown brand',
			barcode: product.barcode,

			// Category information is not currently returned by
			// the search endpoint, so do not pretend that every
			// product belongs to "Other".
			category: '',

			image: product.imageUrl ?? '',

			ingredients: 'Ingredients information available on product page.',

			labels: product.nutriScore ? [`Nutri-Score ${product.nutriScore.toUpperCase()}`] : [],

			nutrition: {
				calories: formatNutritionValue(product.nutrition?.kcalPer100g),
				protein: formatNutritionValue(product.nutrition?.proteinG),
				carbohydrates: formatNutritionValue(product.nutrition?.carbohydratesG),
				fat: formatNutritionValue(product.nutrition?.fatG),
				sugar: formatNutritionValue(product.nutrition?.sugarsG),
				salt: formatNutritionValue(product.nutrition?.saltG)
			}
		};
	}

	async function loadProducts() {
		loading = true;
		error = '';

		try {
			const query = searchQuery.trim();

			const selectedCategories = selectedFilters.category.map(
				(category) => categoryNames[category]
			);

			const searchResult = await searchProducts(query, 20, 0, {
				categories: selectedCategories,
				nutrition: selectedFilters.nutrition
			});

			apiProducts = searchResult.products.map(convertProduct);
		} catch (err) {
			console.error(err);

			error = err instanceof Error ? err.message : 'Unable to load products.';

			apiProducts = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void searchQuery;
		void selectedFilters.category;
		void selectedFilters.nutrition;
		void selectedFilters.diet;

		loadProducts();
	});

	let filteredProducts = $derived(apiProducts);
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

			<span class="arrow" class:rotated={filtersOpen}>⌄</span>
		</button>

		{#if filtersOpen}
			<div class="filters">
				<div class="filter-group">
					<span class="filter-label">Category</span>

					<div class="filter-options">
						{#each filters.category as category (category)}
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
						{#each filters.nutrition as nutrition (nutrition)}
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
					<small class="filter-note">Dietary classification is not available yet.</small>

					<div class="filter-options">
						{#each filters.diet as diet (diet)}
							<button type="button" class="filter-option" disabled>
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

				<p>
					{#if searchQuery}
						Search results for "{searchQuery}"
					{:else}
						Explore packaged food products.
					{/if}
				</p>
			</div>

			{#if $compareStore.length > 0}
				<a href={resolve('/compare')} class="compare-button">
					Compare ({$compareStore.length})
				</a>
			{/if}
		</div>

		{#if loading}
			<p class="status-message">Loading products...</p>
		{:else if error}
			<p class="status-message error">{error}</p>
		{:else}
			<div class="product-grid">
				{#each filteredProducts as product (product.id)}
					<ProductCard {product} selectMode={true} />
				{:else}
					<p class="no-results">No products found matching your search and filters.</p>
				{/each}
			</div>
		{/if}
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

	.no-results,
	.status-message {
		grid-column: 1 / -1;
		color: #666;
	}

	.status-message.error {
		color: #b00020;
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
