<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		getModeratorProducts,
		getModeratorProduct,
		getCategories,
		createModeratorProduct,
		deleteModeratorProduct,
		removeModeratorImage,
		uploadModeratorImage,
		updateModeratorImage,
		updateModeratorProduct,
		type Nutrition,
		type ModeratorProduct
	} from '$lib/api';
	import { getPageStateAfterDeletion, getVisiblePages } from '$lib/pagination';

	const pageSize = 20;
	function blankNutrition(): Nutrition {
		return {
			kcalPer100g: null,
			fatG: null,
			saturatedFatG: null,
			transFatG: null,
			carbohydratesG: null,
			sugarsG: null,
			fibreG: null,
			proteinG: null,
			sodiumMg: null,
			saltG: null,
			servingSize: null,
			servingUnit: null
		};
	}
	let products = $state<ModeratorProduct[]>([]);
	let query = $state('');
	let status = $state('');
	let appliedQuery = $state('');
	let appliedStatus = $state('');
	let page = $state(1);
	let total = $state(0);
	let totalPages = $state(1);
	let loading = $state(true);
	let saving = $state(false);
	let createSaving = $state(false);
	let deleting = $state<string | null>(null);
	let error = $state('');
	let message = $state('');
	let editing = $state<string | null>(null);
	let imageUrl = $state('');
	let originalImageUrl = $state('');
	let sourceUrl = $state('');
	let name = $state('');
	let brand = $state('');
	let ingredients = $state('');
	let nutrition = $state<Nutrition>(blankNutrition());
	let showCreate = $state(false);
	let createName = $state('');
	let createBrand = $state('');
	let createCategoryId = $state('');
	let createIngredients = $state('');
	let createImageUrl = $state('');
	let createNutrition = $state<Nutrition>(blankNutrition());
	let categoryOptions = $state<{ id: string; name: string }[]>([]);
	let detailsLoading = $state(false);
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state('');
	let jumpValue = $state('');
	let ready = $state(false);
	let requestVersion = 0;

	function captureScrollPosition() {
		return { left: window.scrollX, top: window.scrollY };
	}

	async function restoreScrollPosition(position: { left: number; top: number }) {
		await tick();
		window.scrollTo({ left: position.left, top: position.top, behavior: 'auto' });
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		query = params.get('q') ?? '';
		status = params.get('status') ?? '';
		appliedQuery = query.trim();
		appliedStatus = status;
		const initialPage = params.get('page');
		if (initialPage && /^\d+$/.test(initialPage) && Number(initialPage) > 0)
			page = Number(initialPage);
		ready = true;
		syncUrl();
		void loadCategories();
	});

	async function loadCategories() {
		try {
			const result = await getCategories();
			categoryOptions = result.categories.map(({ id, name }) => ({ id, name }));
		} catch (err) {
			categoryOptions = [];
			error = err instanceof Error ? err.message : 'Unable to load categories.';
		}
	}

	function syncUrl() {
		const params = new SvelteURLSearchParams();
		if (appliedQuery) params.set('q', appliedQuery);
		if (appliedStatus) params.set('status', appliedStatus);
		if (page !== 1) params.set('page', String(page));
		const search = params.toString();
		history.replaceState(
			history.state,
			'',
			`${window.location.pathname}${search ? `?${search}` : ''}`
		);
	}

	async function load() {
		const version = ++requestVersion;
		loading = true;
		error = '';
		try {
			const result = await getModeratorProducts(appliedQuery, appliedStatus, page, pageSize);
			if (version !== requestVersion) return;
			products = result.products;
			total = result.total;
			totalPages = result.totalPages;
			page = result.page;
			syncUrl();
		} catch (err) {
			if (version !== requestVersion) return;
			error = err instanceof Error ? err.message : 'Unable to load moderator products.';
		} finally {
			if (version === requestVersion) loading = false;
		}
	}

	$effect(() => {
		if (ready) void load();
	});

	function openCreate() {
		showCreate = true;
		createName = '';
		createBrand = '';
		createCategoryId = '';
		createIngredients = '';
		createImageUrl = '';
		createNutrition = blankNutrition();
		message = '';
		error = '';
	}

	function closeCreate() {
		if (createSaving) return;
		showCreate = false;
	}

	async function createProduct() {
		if (createSaving) return;
		if (!createName.trim()) {
			error = 'Product name is required.';
			return;
		}
		const scrollPosition = captureScrollPosition();
		createSaving = true;
		error = '';
		message = '';
		try {
			const created = await createModeratorProduct({
				name: createName,
				brand: createBrand.trim() || null,
				categoryId: createCategoryId || null,
				ingredients: createIngredients || null,
				imageUrl: createImageUrl.trim() || null,
				nutrition: createNutrition
			});
			showCreate = false;
			message = `Product "${created.name}" created successfully.`;
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to create product.';
		} finally {
			createSaving = false;
			await restoreScrollPosition(scrollPosition);
		}
	}

	async function beginEdit(product: ModeratorProduct) {
		editing = product.id;
		imageUrl = product.image_url ?? '';
		originalImageUrl = imageUrl;
		sourceUrl = product.source_url ?? '';
		clearSelectedFile();
		message = '';
		error = '';
		detailsLoading = true;
		try {
			const details = await getModeratorProduct(product.id);
			name = details.name;
			brand = details.brand ?? '';
			ingredients = details.ingredients ?? '';
			nutrition = {
				kcalPer100g: details.nutrition?.kcalPer100g ?? null,
				fatG: details.nutrition?.fatG ?? null,
				saturatedFatG: details.nutrition?.saturatedFatG ?? null,
				transFatG: details.nutrition?.transFatG ?? null,
				carbohydratesG: details.nutrition?.carbohydratesG ?? null,
				sugarsG: details.nutrition?.sugarsG ?? null,
				fibreG: details.nutrition?.fibreG ?? null,
				proteinG: details.nutrition?.proteinG ?? null,
				sodiumMg: details.nutrition?.sodiumMg ?? null,
				saltG: details.nutrition?.saltG ?? null,
				servingSize: details.nutrition?.servingSize ?? null,
				servingUnit: details.nutrition?.servingUnit ?? null
			};
		} catch (err) {
			editing = null;
			error = err instanceof Error ? err.message : 'Unable to load product details.';
		} finally {
			detailsLoading = false;
		}
	}

	function clearSelectedFile() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		selectedFile = null;
		previewUrl = '';
	}

	function selectFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		clearSelectedFile();
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			error = 'Choose a JPEG, PNG, or WebP image.';
			input.value = '';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			error = 'Image uploads must be 5 MB or smaller.';
			input.value = '';
			return;
		}
		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
		error = '';
	}

	async function save(product: ModeratorProduct) {
		const scrollPosition = captureScrollPosition();
		saving = true;
		error = '';
		try {
			await updateModeratorProduct(product.id, {
				name,
				brand: brand.trim() || null,
				ingredients: ingredients || null,
				nutrition
			});
			if (selectedFile) {
				await uploadModeratorImage(product.id, selectedFile, sourceUrl);
			} else if (imageUrl !== originalImageUrl) {
				await updateModeratorImage(product.id, imageUrl, sourceUrl);
			}
			message = 'Product changes saved.';
			editing = null;
			clearSelectedFile();
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to save image.';
		} finally {
			saving = false;
			await restoreScrollPosition(scrollPosition);
		}
	}

	async function deleteProduct(product: ModeratorProduct) {
		if (deleting) return;
		if (
			!confirm(
				`Delete "${product.name}"? This permanently removes the product and its catalogue associations.`
			)
		)
			return;
		const scrollPosition = captureScrollPosition();
		deleting = product.id;
		error = '';
		message = '';
		try {
			await deleteModeratorProduct(product.id);
			products = products.filter((item) => item.id !== product.id);
			const nextPageState = getPageStateAfterDeletion(page, total, pageSize);
			total = nextPageState.total;
			totalPages = nextPageState.totalPages;
			page = nextPageState.page;
			editing = null;
			syncUrl();
			message = `Product "${product.name}" deleted.`;
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to delete product.';
		} finally {
			deleting = null;
			await restoreScrollPosition(scrollPosition);
		}
	}

	async function remove(product: ModeratorProduct) {
		if (!confirm(`Remove the image for ${product.name}?`)) return;
		try {
			await removeModeratorImage(product.id);
			message = 'Image removed.';
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to remove image.';
		}
	}

	function applyFilters() {
		appliedQuery = query.trim();
		appliedStatus = status;
		page = 1;
		syncUrl();
	}

	function goToPage(target: number) {
		if (!Number.isSafeInteger(target) || target < 1 || target > totalPages || target === page)
			return;
		page = target;
		syncUrl();
	}

	function submitPageJump() {
		if (!/^\d+$/.test(jumpValue)) {
			error = `Enter a whole page number from 1 to ${totalPages}.`;
			return;
		}
		const target = Number(jumpValue);
		if (!Number.isSafeInteger(target) || target < 1 || target > totalPages) {
			error = `Enter a whole page number from 1 to ${totalPages}.`;
			return;
		}
		error = '';
		goToPage(target);
	}
</script>

<svelte:head><title>Moderator dashboard — NutraScore</title></svelte:head>
<main class="dashboard">
	<h1>Moderator dashboard</h1>
	<p>Manage product details and their associated images.</p>
	<form
		class="filters"
		onsubmit={(event) => {
			event.preventDefault();
			applyFilters();
		}}
	>
		<input bind:value={query} placeholder="Search products" aria-label="Search products" />
		<select bind:value={status} aria-label="Image status">
			<option value="missing">Missing images</option><option value="existing"
				>Existing images</option
			>
		</select>
		<button disabled={loading}>Filter</button>
	</form>
	<div class="dashboard-actions">
		<button onclick={openCreate} disabled={createSaving || loading}>Add product</button>
	</div>
	{#if showCreate}
		<form
			class="editor create-editor"
			onsubmit={(event) => {
				event.preventDefault();
				void createProduct();
			}}
		>
			<h2>Add product</h2>
			<fieldset class="editor-section basic-section">
				<legend>Basic product information</legend>
				<label>Product name<input bind:value={createName} required maxlength="500" /></label>
				<label>Brand<input bind:value={createBrand} maxlength="500" /></label>
				<label
					>Category<select bind:value={createCategoryId}>
						<option value="">Not specified</option>
						{#each categoryOptions as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</select></label
				>
			</fieldset>
			<fieldset class="editor-section ingredients-section">
				<legend>Ingredients</legend>
				<label
					><span class="sr-only">Ingredients</span><textarea bind:value={createIngredients} rows="4"
					></textarea></label
				>
			</fieldset>
			<fieldset class="editor-section nutrition-section">
				<legend>Nutrition per 100g / 100ml</legend>
				{#each [['kcalPer100g', 'Energy (kcal)'], ['proteinG', 'Protein (g)'], ['carbohydratesG', 'Carbohydrates (g)'], ['sugarsG', 'Sugars (g)'], ['fatG', 'Total fat (g)'], ['saturatedFatG', 'Saturated fat (g)'], ['transFatG', 'Trans fat (g)'], ['fibreG', 'Dietary fibre (g)'], ['sodiumMg', 'Sodium (mg)'], ['saltG', 'Salt (g)']] as field (field[0])}
					<label
						>{field[1]}<input
							type="number"
							min="0"
							step="any"
							bind:value={createNutrition[field[0] as keyof Nutrition]}
						/></label
					>
				{/each}
			</fieldset>
			<fieldset class="editor-section serving-section">
				<legend>Serving size</legend>
				<label
					>Amount<input
						type="number"
						min="0"
						step="any"
						bind:value={createNutrition.servingSize}
					/></label
				>
				<label
					>Unit<select bind:value={createNutrition.servingUnit}>
						<option value={null}>Not specified</option><option value="g">g</option><option
							value="ml">ml</option
						><option value="oz">oz</option><option value="piece">piece</option><option
							value="serving">serving</option
						>
					</select></label
				>
			</fieldset>
			<fieldset class="editor-section image-section">
				<legend>Product image</legend>
				<label
					>Image URL<input type="url" bind:value={createImageUrl} placeholder="https://…" /></label
				>
				<small>Use an HTTPS image URL. It will be checked before the product is saved.</small>
			</fieldset>
			<div class="editor-actions">
				<button type="submit" disabled={createSaving}
					>{createSaving ? 'Saving…' : 'Save product'}</button
				>
				<button type="button" class="secondary" disabled={createSaving} onclick={closeCreate}
					>Cancel</button
				>
			</div>
		</form>
	{/if}
	<p class="summary">
		Showing {products.length} of {total} products · Page {totalPages === 0 ? 0 : page} of {totalPages}
	</p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if message}<p class="success">{message}</p>{/if}
	{#if loading}<p>Loading products…</p>
	{:else if products.length === 0}<p>No matching products.</p>
	{:else if products.length > 0}<div class="list">
			{#each products as product (product.id)}
				<section class="row">
					<div class="preview">
						{#if product.image_url}<img src={product.image_url} alt={product.name} />{:else}<span
								>No image</span
							>{/if}
					</div>
					<div class="info">
						<strong>{product.name}</strong><span
							>{product.brand ?? 'Brand not listed'} · {product.category}</span
						>
					</div>
					{#if editing === product.id}
						<div class="editor">
							<fieldset class="editor-section basic-section" disabled={detailsLoading}>
								<legend>Basic product information</legend>
								<label>Product name<input bind:value={name} required maxlength="500" /></label>
								<label>Brand<input bind:value={brand} maxlength="500" /></label>
							</fieldset>
							<fieldset class="editor-section ingredients-section" disabled={detailsLoading}>
								<legend>Ingredients</legend>
								<label
									><span class="sr-only">Ingredients</span><textarea
										bind:value={ingredients}
										rows="4"></textarea></label
								>
							</fieldset>
							<fieldset class="editor-section nutrition-section" disabled={detailsLoading}>
								<legend>Nutrition per 100g / 100ml</legend>
								{#each [['kcalPer100g', 'Energy (kcal)'], ['proteinG', 'Protein (g)'], ['carbohydratesG', 'Carbohydrates (g)'], ['sugarsG', 'Sugars (g)'], ['fatG', 'Total fat (g)'], ['saturatedFatG', 'Saturated fat (g)'], ['transFatG', 'Trans fat (g)'], ['fibreG', 'Dietary fibre (g)'], ['sodiumMg', 'Sodium (mg)'], ['saltG', 'Salt (g)']] as field (field[0])}
									<label
										>{field[1]}<input
											type="number"
											min="0"
											step="any"
											bind:value={nutrition[field[0] as keyof Nutrition]}
										/></label
									>
								{/each}
							</fieldset>
							<fieldset class="editor-section" disabled={detailsLoading}>
								<legend>Serving size</legend>
								<label
									>Amount<input
										type="number"
										min="0"
										step="any"
										bind:value={nutrition.servingSize}
									/></label
								>
								<label
									>Unit<select bind:value={nutrition.servingUnit}>
										<option value={null}>Not specified</option><option value="g">g</option><option
											value="ml">ml</option
										>
										<option value="oz">oz</option><option value="piece">piece</option><option
											value="serving">serving</option
										>
									</select></label
								>
							</fieldset>
							<input bind:value={imageUrl} placeholder="https://… image URL" /><input
								bind:value={sourceUrl}
								placeholder="Source page URL"
							/>
							<label class="file-input">
								Upload image
								<input type="file" accept="image/jpeg,image/png,image/webp" onchange={selectFile} />
							</label>
							{#if previewUrl}<img
									class="upload-preview"
									src={previewUrl}
									alt="Upload preview"
								/>{/if}
							<button disabled={saving || detailsLoading} onclick={() => void save(product)}
								>{saving ? 'Saving…' : 'Save changes'}</button
							><button
								disabled={saving}
								class="secondary"
								onclick={() => {
									clearSelectedFile();
									editing = null;
								}}>Cancel</button
							>
							<button
								class="danger"
								disabled={saving || deleting === product.id}
								onclick={() => void deleteProduct(product)}
							>
								{deleting === product.id ? 'Deleting…' : 'Delete product'}
							</button>
						</div>
					{:else}<div class="actions">
							<button onclick={() => beginEdit(product)}>Edit</button>{#if product.image_url}
								<button class="danger" onclick={() => void remove(product)}>Remove Image</button
								>{/if}
							<button
								class="danger"
								disabled={deleting === product.id}
								onclick={() => void deleteProduct(product)}
							>
								{deleting === product.id ? 'Deleting…' : 'Delete product'}
							</button>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
	<nav class="pagination" aria-label="Moderator product pages">
		<button class="secondary" disabled={page <= 1 || loading} onclick={() => goToPage(1)}
			>First</button
		>
		<button class="secondary" disabled={page <= 1 || loading} onclick={() => goToPage(page - 1)}
			>Previous</button
		>
		<span class="page-buttons">
			{#if totalPages > 5 && page > 3}<button
					class="page-number"
					disabled={loading}
					onclick={() => goToPage(1)}>1</button
				><span>…</span>{/if}
			{#each getVisiblePages(page, totalPages) as pageNumber (pageNumber)}
				<button
					class:current={pageNumber === page}
					class="page-number"
					aria-current={pageNumber === page ? 'page' : undefined}
					disabled={loading || pageNumber === page}
					onclick={() => goToPage(pageNumber)}>{pageNumber}</button
				>
			{/each}
			{#if totalPages > 5 && page < totalPages - 2}<span>…</span><button
					class="page-number"
					disabled={loading}
					onclick={() => goToPage(totalPages)}>{totalPages}</button
				>{/if}
		</span>
		<form
			class="page-jump"
			onsubmit={(event) => {
				event.preventDefault();
				submitPageJump();
			}}
		>
			<label for="page-jump">Go to</label>
			<input
				id="page-jump"
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				bind:value={jumpValue}
				aria-label="Page number"
				disabled={totalPages === 0 || loading}
			/>
			<button class="secondary" disabled={totalPages === 0 || loading}>Go</button>
		</form>
		<button
			class="secondary"
			disabled={page >= totalPages || loading}
			onclick={() => goToPage(page + 1)}>Next</button
		>
		<button
			class="secondary"
			disabled={page >= totalPages || loading}
			onclick={() => goToPage(totalPages)}>Last</button
		>
	</nav>
</main>

<style>
	.dashboard {
		max-width: 1180px;
		margin: 48px auto;
		padding: 0 24px;
	}
	.filters {
		display: flex;
		gap: 10px;
		margin: 24px 0;
	}
	input,
	select {
		padding: 10px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		font: inherit;
	}
	.filters input {
		flex: 1;
	}
	.dashboard-actions {
		display: flex;
		justify-content: flex-end;
		margin: 12px 0;
	}
	button {
		padding: 10px 14px;
		border: 0;
		border-radius: 8px;
		background: #216b48;
		color: white;
		cursor: pointer;
		font: inherit;
	}
	.secondary {
		background: #eef4ef;
		color: #216b48;
	}
	.danger {
		background: #a32626;
	}
	.list {
		display: grid;
		gap: 12px;
	}
	.row {
		display: grid;
		grid-template-columns: 90px 1fr auto;
		gap: 18px;
		align-items: center;
		padding: 14px;
		border: 1px solid #e5e9e6;
		border-radius: 12px;
	}
	.preview {
		width: 90px;
		height: 90px;
		display: grid;
		place-items: center;
		background: #f6f8f5;
		border-radius: 8px;
		color: #8b968e;
	}
	.preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.info {
		display: grid;
		gap: 5px;
	}
	.info span,
	.info small {
		color: #657168;
	}
	.summary {
		color: #657168;
	}
	.actions,
	.editor {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.editor {
		grid-column: 2 / -1;
		min-width: 0;
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.create-editor {
		grid-column: auto;
		margin: 16px 0 20px;
		padding: 16px;
		border: 1px solid #dfe8e1;
		border-radius: 12px;
		background: #fbfdfb;
	}
	.create-editor h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.editor input {
		min-width: 0;
		max-width: 100%;
	}
	.editor-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 10px;
		margin: 0;
		min-width: 0;
		padding: 12px;
		border: 1px solid #dfe8e1;
		border-radius: 8px;
	}
	.ingredients-section {
		grid-template-columns: minmax(0, 1fr);
	}
	.image-section {
		grid-template-columns: minmax(0, 1fr);
	}
	.image-section small {
		color: #657168;
	}
	.editor-section legend {
		padding: 0 4px;
		font-weight: 600;
	}
	.editor-section label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: #4f5f54;
		font-size: 13px;
	}
	.editor-section textarea {
		width: 100%;
		min-height: 96px;
		resize: vertical;
		padding: 10px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		font: inherit;
		box-sizing: border-box;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	.file-input {
		padding: 10px 14px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		color: #216b48;
		cursor: pointer;
		font-weight: 600;
	}
	.file-input input {
		display: none;
	}
	.upload-preview {
		width: 70px;
		height: 70px;
		object-fit: contain;
		border-radius: 8px;
	}
	.editor-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pagination {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 18px;
		margin: 24px 0;
	}
	.page-buttons,
	.page-jump {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.page-jump input {
		width: 76px;
	}
	.page-number {
		padding: 8px 10px;
		background: #eef4ef;
		color: #216b48;
	}
	.page-number.current {
		background: #216b48;
		color: white;
	}
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.error {
		color: #a32626;
	}
	.success {
		color: #216b48;
	}
	@media (max-width: 700px) {
		.row {
			grid-template-columns: 70px 1fr;
		}
		.preview {
			width: 70px;
			height: 70px;
		}
		.actions,
		.editor {
			grid-column: 1 / -1;
			justify-content: flex-start;
		}
		.filters {
			flex-wrap: wrap;
		}
		.dashboard {
			padding: 0 12px;
		}
		.dashboard-actions {
			justify-content: stretch;
		}
		.dashboard-actions button {
			width: 100%;
		}
		.editor-section {
			grid-template-columns: minmax(0, 1fr);
		}
		.row {
			align-items: start;
		}
	}
</style>
