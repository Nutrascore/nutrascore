<script lang="ts">
	let {
		product,
		selectMode = false,
		onSelect
	}: {
		product: {
			id: string;
			name: string;
			brand: string;
			category: string;
			image: string;
		};
		selectMode?: boolean;
		onSelect?: () => void;
	} = $props();

	function openProduct() {
		window.location.href = `/product/${product.id}`;
	}

	function addToComparison(event: MouseEvent) {
		event.stopPropagation();

		if (onSelect) {
			onSelect();
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

		{#if selectMode}
			<button
				type="button"
				class="compare-button"
				onclick={addToComparison}
			>
				Add to Comparison
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