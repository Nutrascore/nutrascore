<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import { compareStore } from '$lib/stores/compareStore';
	import { getCategories, searchProducts } from '$lib/api';
	import { getVisiblePages } from '$lib/pagination';

	interface CategoryOption {
		id: string;
		name: string;
		productCount: number;
	}

	interface CategoryFilterOption {
		name: string;
		categoryNames: string[];
	}

	const commonCategoryFilters = [
		{
			name: 'Snacks',
			categoryNames: [
				'snacks',
				'namkeen',
				'potatochips',
				'chips',
				'crisps',
				'makhna',
				'mixture',
				'puffs',
				'puffss',
				'poppedchips',
				'popcorn',
				'potato sticks',
				'murukku',
				'mini samosa',
				'kodbale'
			]
		},
		{
			name: 'Biscuits',
			categoryNames: [
				'biscuit',
				'cookies',
				'butter cookies',
				'digestive biscuit',
				'cracker',
				'rusk',
				'wafer',
				'cream biscuit',
				'glucose biscuit'
			]
		},
		{
			name: 'Beverages',
			categoryNames: ['juice', 'fruit beverage', 'soda', 'milkshake', 'coffee', 'coconut water']
		},
		{
			name: 'Dairy',
			categoryNames: [
				'dairy',
				'icecream',
				'icereames',
				'kulfi',
				'yogurt',
				'cheese',
				'condensed milk',
				'cream',
				'creame'
			]
		},
		{
			name: 'Breakfast Foods',
			categoryNames: ['cereal', 'oats', 'musli', 'pancake mix', 'poha']
		},
		{
			name: 'Sweets',
			categoryNames: [
				'chocolate',
				'chocolate bar',
				'candy',
				'sweets',
				'laddu',
				'toffee',
				'burfi',
				'peda',
				'chocobar',
				'choco fills',
				'chocolatespread',
				'brownie',
				'cake',
				'waffle',
				'pie',
				'petha',
				'jelly'
			]
		},
		{
			name: 'Instant Foods',
			categoryNames: ['instant food', 'noodles']
		},
		{
			name: 'Sauces & Condiments',
			categoryNames: [
				'spread',
				'sauce',
				'masala powder',
				'pickle',
				'mayonnaise',
				'jam',
				'peanut butter',
				'chutney',
				'basil pisto dip'
			]
		}
	] satisfies CategoryFilterOption[];

	interface ApiProduct {
		id: string;
		name: string;
		brand: string | null;
		nutriScore: string | null;
		novaGroup: number | null;
		priceInr?: number | null;
		imageUrl: string | null;
	}

	interface FrontendProduct {
		id: string;
		name: string;
		brand: string;
		image: string;
		ingredients: string;
	}

	let filtersOpen = $state(false);
	let loading = $state(false);
	let error = $state('');
	let apiProducts = $state<FrontendProduct[]>([]);
	let currentPage = $state(Math.max(Number(page.url.searchParams.get('page')) || 1, 1));
	let totalPages = $state(1);
	let totalProducts = $state(0);
	let categoryOptions = $state<CategoryOption[]>([]);
	const pageSize = 24;
	let lastFilterKey = '';
	let requestSequence = 0;

	let selectedFilters = $state({
		category: [] as string[]
	});

	let searchQuery = $derived(page.url.searchParams.get('q') ?? '');
	let visibleCategories = $derived.by(() =>
		commonCategoryFilters.flatMap((filter) => {
			const categoryNames = categoryOptions
				.filter((category) => filter.categoryNames.includes(normalizeCategoryName(category.name)))
				.map((category) => category.name.trim().toLowerCase());

			return categoryNames.length > 0
				? [{ name: filter.name, categoryNames: [...new Set(categoryNames)] }]
				: [];
		})
	);
	let selectedCategoryNames = $derived(
		visibleCategories
			.filter((category) => selectedFilters.category.includes(category.name))
			.flatMap((category) => category.categoryNames)
	);

	function toggleCategory(category: string) {
		const selected = selectedFilters.category;

		if (selected.includes(category)) {
			selectedFilters.category = selected.filter((item) => item !== category);
		} else {
			selectedFilters.category = [...selected, category];
		}
	}

	function updatePageInUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (pageNumber === 1) {
			params.delete('page');
		} else {
			params.set('page', String(pageNumber));
		}

		const query = params.toString();
		const target = query ? (`/discover?${query}` as `/discover?${string}`) : '/discover';
		void goto(resolve(target as '/discover' | `/discover?${string}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function convertProduct(product: ApiProduct): FrontendProduct {
		return {
			id: product.id,
			name: product.name,
			brand: product.brand ?? 'Unknown brand',

			image: product.imageUrl ?? '',

			ingredients: ''
		};
	}

	async function loadProducts(query: string, categories: string[], pageNumber: number) {
		const requestId = ++requestSequence;
		loading = true;
		error = '';

		try {
			const searchResult = await searchProducts(query, pageNumber, pageSize, { categories });

			if (requestId !== requestSequence) return;
			apiProducts = searchResult.products.map(convertProduct);
			totalPages = searchResult.totalPages;
			totalProducts = searchResult.total;
			if (pageNumber > Math.max(searchResult.totalPages, 1)) {
				currentPage = Math.max(searchResult.totalPages, 1);
				updatePageInUrl(currentPage);
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
		const categories = selectedCategoryNames.join(',');
		const filterKey = `${query}\0${categories}`;

		if (filterKey !== lastFilterKey) {
			lastFilterKey = filterKey;
			if (currentPage !== 1) {
				currentPage = 1;
			}
			if (page.url.searchParams.has('page')) updatePageInUrl(1);
			if (currentPage !== 1) return;
		}

		void loadProducts(query, selectedCategoryNames, currentPage);
	});

	$effect(() => {
		getCategories()
			.then((result) => {
				categoryOptions = [...result.categories]
					.sort(
						(first, second) =>
							second.productCount - first.productCount || first.name.localeCompare(second.name)
					)
					.map(({ id, name, productCount }) => ({ id, name, productCount }));
			})
			.catch((err) => {
				console.error(err);
				error = err instanceof Error ? err.message : 'Unable to load categories.';
			});
	});

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages && page !== currentPage) {
			currentPage = page;
			updatePageInUrl(page);
		}
	}

	let filteredProducts = $derived(apiProducts);

	function normalizeCategoryName(name: string) {
		return name.trim().replace(/\s+/g, ' ').toLowerCase();
	}
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
					<div class="category-heading">
						<span class="filter-label">Category</span>
						{#if selectedFilters.category.length > 0}
							<button
								type="button"
								class="clear-categories"
								onclick={() => (selectedFilters.category = [])}
							>
								Clear selection
							</button>
						{/if}
					</div>

					{#if selectedFilters.category.length > 0}
						<div class="selected-categories" aria-label="Selected categories">
							{#each selectedFilters.category as category (category)}
								<button
									type="button"
									class="selected-category"
									aria-label={`Remove category ${category}`}
									onclick={() => toggleCategory(category)}
								>
									{category}<span aria-hidden="true">×</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if visibleCategories.length > 0}
						<div class="filter-options">
							{#each visibleCategories as category (category.name)}
								<button
									type="button"
									class="filter-option"
									class:selected={selectedFilters.category.includes(category.name)}
									aria-pressed={selectedFilters.category.includes(category.name)}
									onclick={() => toggleCategory(category.name)}
								>
									{category.name}
								</button>
							{/each}
						</div>
					{/if}
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
		margin-bottom: 36px;
		border: 1px solid #e5e5e5;
		border-radius: 12px;
		background: #fff;
		overflow: hidden;
	}

	.filters-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border: none;
		background: transparent;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.arrow {
		font-size: 20px;
		transition: transform 0.2s ease;
	}

	.arrow.rotated {
		transform: rotate(180deg);
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 0 18px 18px;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.filter-label {
		font-size: 14px;
		font-weight: 600;
		color: #254332;
	}

	.category-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.clear-categories {
		width: fit-content;
		padding: 0;
		border: 0;
		background: transparent;
		color: #216b48;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.selected-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.selected-category {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border: 1px solid #b8d5c2;
		border-radius: 999px;
		background: #edf6ef;
		color: #185238;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.filter-options {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.filter-option {
		padding: 6px 10px;
		border: 1px solid #d8ded9;
		border-radius: 8px;
		background: #fff;
		color: #254332;
		cursor: pointer;
		font: inherit;
		font-size: 13px;
	}

	.filter-option:hover {
		background: #f2f7f3;
		border-color: #9cbea7;
	}

	.filter-option.selected {
		background: #27764f;
		color: white;
		border-color: #27764f;
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
		color: white;
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
