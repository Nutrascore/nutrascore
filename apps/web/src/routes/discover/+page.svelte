<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import { compareStore } from '$lib/stores/compareStore';
	import { getCategories, searchProducts } from '$lib/api';
	import { formatNutritionValue } from '$lib/utils/formatNutrition';
	import { getVisiblePages } from '$lib/pagination';

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
		image: string;
		ingredients: string;
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
	let currentPage = $state(Math.max(Number(page.url.searchParams.get('page')) || 1, 1));
	let totalPages = $state(1);
	let totalProducts = $state(0);
	let categoryOptions = $state<string[]>([]);
	const pageSize = 24;
	let lastFilterKey = '';
	let requestSequence = 0;

	const filters = {
		nutrition: ['High Protein', 'Low Sugar', 'Low Calories']
	};

	let selectedFilters = $state({
		category: [] as string[],
		nutrition: [] as string[]
	});

	let searchQuery = $derived(page.url.searchParams.get('q') ?? '');

	function toggleFilter(type: 'category' | 'nutrition', value: string) {
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

			image: product.imageUrl ?? '',

			ingredients: '',

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

	async function loadProducts(
		query: string,
		categories: string[],
		nutrition: string[],
		pageNumber: number
	) {
		const requestId = ++requestSequence;
		loading = true;
		error = '';

		try {
			const searchResult = await searchProducts(query, pageNumber, pageSize, {
				categories,
				nutrition
			});

			if (requestId !== requestSequence) return;
			apiProducts = searchResult.products.map(convertProduct);
			totalPages = searchResult.totalPages;
			totalProducts = searchResult.total;
			if (pageNumber > searchResult.totalPages && searchResult.totalPages > 0) {
				currentPage = searchResult.totalPages;
			}
		} catch (err) {
			if (requestId !== requestSequence) return;
			console.error(err);

			error = err instanceof Error ? err.message : 'Unable to load products.';

			apiProducts = [];
		} finally {
			if (requestId === requestSequence) loading = false;
		}
	}

	$effect(() => {
		const query = searchQuery.trim();
		const categories = selectedFilters.category.join(',');
		const nutrition = selectedFilters.nutrition.join(',');
		const filterKey = `${query}\0${categories}\0${nutrition}`;

		if (filterKey !== lastFilterKey) {
			lastFilterKey = filterKey;
			if (currentPage !== 1) {
				currentPage = 1;
				return;
			}
		}

		void loadProducts(query, selectedFilters.category, selectedFilters.nutrition, currentPage);
	});

	$effect(() => {
		getCategories()
			.then((result) => {
				categoryOptions = result.categories.map((category) => category.name);
			})
			.catch((err) => {
				console.error(err);
				error = err instanceof Error ? err.message : 'Unable to load categories.';
			});
	});

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages && page !== currentPage) {
			currentPage = page;
			const currentParams = new URL(window.location.href).searchParams;
			const params = [...currentParams.entries()]
				.filter(([key]) => key !== 'page')
				.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
			if (page !== 1) params.push(`page=${page}`);
			const query = params.length > 0 ? `?${params.join('&')}` : '';
			const target = query ? (`/discover${query}` as `/discover?${string}`) : '/discover';
			void goto(resolve(target as '/discover' | `/discover?${string}`), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	}

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
						{#each categoryOptions as category (category)}
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

			{#if totalPages > 1}
				<nav class="pagination" aria-label="Product results pages">
					<button
						type="button"
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
					>
						Previous
					</button>
					{#if currentPage > 3}
						<span class="pagination-ellipsis" aria-hidden="true">...</span>
					{/if}
					{#each getVisiblePages(currentPage, totalPages) as pageNumber (pageNumber)}
						<button
							type="button"
							class:current={pageNumber === currentPage}
							aria-current={pageNumber === currentPage ? 'page' : undefined}
							aria-label={`Go to page ${pageNumber}`}
							onclick={() => goToPage(pageNumber)}
						>
							{pageNumber}
						</button>
					{/each}
					{#if currentPage < totalPages - 2}
						<span class="pagination-ellipsis" aria-hidden="true">...</span>
					{/if}
					<button
						type="button"
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
					>
						Next
					</button>
				</nav>
				<p class="pagination-summary">
					Showing page {currentPage} of {totalPages} ({totalProducts} products)
				</p>
			{/if}
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

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 28px;
	}

	.pagination button {
		min-width: 40px;
		min-height: 40px;
		padding: 8px 12px;
		border: 1px solid #d8ded9;
		border-radius: 8px;
		background: #fff;
		color: #254332;
		cursor: pointer;
	}

	.pagination button:hover:not(:disabled),
	.pagination button:focus-visible {
		border-color: #27764f;
		outline: 3px solid rgb(39 118 79 / 25%);
		outline-offset: 2px;
	}

	.pagination button.current {
		border-color: #27764f;
		background: #27764f;
		color: #fff;
		font-weight: 700;
	}

	.pagination button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.pagination-ellipsis {
		padding: 8px 2px;
		color: #657168;
	}

	.pagination-summary {
		margin: 12px 0 0;
		color: #666;
		text-align: center;
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
