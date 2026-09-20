<script lang="ts">
	import { compareStore } from '$lib/stores/compareStore';

	let {
		product,
		selectMode = false
	}: {
		product: {
			id: string;
			name: string;
			brand: string;
			barcode: string | null;
			category: string;
			image: string;
		};
		selectMode?: boolean;
	} = $props();

	let isSelected = $derived($compareStore.includes(product.id));

	function openProduct() {
		window.location.href = `/product/${product.id}`;
	}

	function addToComparison(event: MouseEvent) {
		event.stopPropagation();

		if (isSelected) {
			compareStore.removeProduct(product.id);
		} else {
			compareStore.addProduct(product.id);
		}
	}
</script>

<div
	class="product-card"
	role="button"
	tabindex="0"
	onclick={openProduct}
	onkeydown={(event) => {
		if (event.key === 'Enter') {
			openProduct();
		}
	}}
>
	<div class="product-image">
		{#if product.image}
			<img src={product.image} alt={product.name} />
		{:else}
			<span>No Image</span>
		{/if}
	</div>

	<div class="product-info">
		<span class="category">{product.category}</span>

		<h3>{product.name}</h3>

		<p>{product.brand}</p>

		{#if product.barcode}
			<p class="barcode">Barcode: {product.barcode}</p>
		{/if}

		{#if selectMode}
			<button type="button" class="compare-button" onclick={addToComparison}>
				{isSelected ? 'Remove from Comparison' : 'Add to Comparison'}
			</button>
		{/if}
	</div>
</div>

<style>
	.product-card {
		text-align: left;
		border: 1px solid #e5e5e5;
		border-radius: 12px;
		background: white;
		overflow: hidden;
		cursor: pointer;
		transition: transform 0.2s;
	}

	.product-card:hover {
		transform: translateY(-4px);
	}

	.product-image {
		height: 180px;
		background: #f5f5f5;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #888;
	}

	.product-image img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.product-info {
		padding: 16px;
	}

	.category {
		font-size: 12px;
		color: #777;
	}

	.product-info h3 {
		margin: 8px 0 6px;
		font-size: 17px;
	}

	.product-info p {
		margin: 0;
		color: #666;
		font-size: 14px;
	}

	.barcode {
		margin-top: 6px !important;
		font-size: 12px !important;
		color: #888 !important;
	}

	.compare-button {
		width: 100%;
		margin-top: 15px;
		padding: 10px;

		border: none;
		border-radius: 8px;

		background: #080808;
		color: white;

		cursor: pointer;
		font-size: 14px;
	}

	.compare-button:hover {
		opacity: 0.85;
	}
</style>
