<script lang="ts">
	import { resolve } from '$app/paths';
	import { compareStore } from '$lib/stores/compareStore';

	let {
		product,
		selectMode = false
	}: {
		product: {
			id: string;
			name: string;
			brand: string;

			image: string;
		};
		selectMode?: boolean;
	} = $props();

	let isSelected = $derived($compareStore.includes(product.id));
	let imageFailed = $state(false);
	let actionError = $state('');
	let signedIn = $state(false);

	$effect(() => {
		getCurrentUser()
			.then((user) => (signedIn = Boolean(user)))
			.catch(() => (signedIn = false));
	});

	function addToComparison(event: MouseEvent) {
		event.stopPropagation();

		if (isSelected) {
			compareStore.removeProduct(product.id);
		} else {
			compareStore.addProduct(product.id);
		}
	}
</script>

<article class="product-card">
	<a
		class="product-link"
		href={resolve(`/product/${product.id}`)}
		aria-label="View product: {product.name}"
	>
		<div class="product-image">
			{#if product.image && !imageFailed}
				<img
					src={product.image}
					alt={product.name}
					loading="lazy"
					decoding="async"
					onerror={() => (imageFailed = true)}
				/>
			{:else}
				<div class="image-placeholder" aria-label="No product image">
					<svg
						viewBox="0 0 48 48"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
					>
						<rect x="10" y="8" width="28" height="32" rx="5" />
						<path d="M18 8V5h12v3M17 19h14M17 25h14M17 31h8" />
					</svg>
					<span>No image available</span>
				</div>
			{/if}
		</div>

		<div class="product-info">
			<h3>{product.name || 'Unnamed product'}</h3>

			<p class="brand">{product.brand || 'Brand not listed'}</p>
		</div>
	</a>

	{#if actionError}<p class="action-error">{actionError}</p>{/if}

	{#if selectMode}
		<div class="card-actions">
			<button
				type="button"
				class:added={isSelected}
				class="compare-button"
				aria-pressed={isSelected}
				onclick={addToComparison}
			>
				{#if isSelected}
					<svg
						viewBox="0 0 20 20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="m4 10 4 4 8-8" />
					</svg>
					Added to compare
				{:else}
					<svg
						viewBox="0 0 20 20"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						aria-hidden="true"
					>
						<path d="M10 4v12M4 10h12" />
					</svg>
					Add to compare
				{/if}
			</button>
		</div>
	{/if}
</article>

<style>
	.product-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		overflow: hidden;
		background: #fff;
		border: 1px solid #e5e9e6;
		border-radius: 16px;
		box-shadow: 0 2px 6px rgb(20 40 28 / 3%);
		transition:
			transform 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease;
	}

	.product-card:hover {
		transform: translateY(-3px);
		border-color: #c5d9cb;
		box-shadow: 0 10px 24px rgb(20 40 28 / 8%);
	}

	.product-link {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		outline: none;
	}

	.product-link:focus-visible {
		outline: 3px solid #27764f;
		outline-offset: -4px;
		border-radius: 15px;
	}

	.product-image {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		padding: 18px;
		overflow: hidden;
		background: #f6f8f5;
	}

	.product-image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		transition: transform 220ms ease;
	}

	.product-card:hover .product-image img {
		transform: scale(1.04);
	}

	.image-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		color: #8b968e;
		font-size: 12px;
		text-align: center;
	}

	.image-placeholder svg {
		width: 42px;
		height: 42px;
	}

	.product-info {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		padding: 16px;
	}

	.product-info h3 {
		display: -webkit-box;
		width: 100%;
		margin: 0 0 7px;
		overflow: hidden;
		color: #202923;
		font-size: 16px;
		font-weight: 650;
		line-height: 1.45;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	.brand {
		margin: 0;
		color: #657168;
		font-size: 13px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.card-actions {
		padding: 0 16px 16px;
	}

	.action-error {
		margin: 0 16px 12px;
		color: #a32626;
		font-size: 12px;
	}

	.compare-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 42px;
		padding: 10px 12px;
		border: 1px solid #216b48;
		border-radius: 9px;
		background: #216b48;
		color: #fff;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			color 160ms ease;
	}

	.compare-button svg {
		flex: 0 0 17px;
		width: 17px;
		height: 17px;
	}

	.compare-button:hover {
		border-color: #185238;
		background: #185238;
	}

	.compare-button.added {
		border-color: #c6dfce;
		background: #edf6ef;
		color: #216b48;
	}

	.compare-button.added:hover {
		border-color: #a9d0b5;
		background: #e1f0e5;
	}

	.compare-button:focus-visible {
		outline: 3px solid #82bd98;
		outline-offset: 3px;
	}

	@media (max-width: 480px) {
		.product-image {
			height: 160px;
			padding: 12px;
		}

		.product-info {
			padding: 12px;
		}

		.product-info h3 {
			font-size: 14px;
		}

		.card-actions {
			padding: 0 12px 12px;
		}

		.compare-button {
			font-size: 12px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.product-card,
		.product-image img,
		.compare-button {
			transition: none;
		}

		.product-card:hover,
		.product-card:hover .product-image img {
			transform: none;
		}
	}
</style>
