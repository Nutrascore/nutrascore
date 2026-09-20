<script lang="ts">
	import { onMount } from 'svelte';
	import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';
	import { DecodeHintType } from '@zxing/library';
	import type { IScannerControls } from '@zxing/browser';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getProductByBarcode } from '$lib/api';

	let {
		onClose
	}: {
		onClose: () => void;
	} = $props();

	let videoElement = $state<HTMLVideoElement>();
	let fileInput = $state<HTMLInputElement>();
	let status = $state('Starting camera...');
	let error = $state('');
	let scanning = $state(true);
	let controls: IScannerControls | undefined;
	let reader: BrowserMultiFormatReader | undefined;
	let handledBarcode = false;

	const hints = new Map<DecodeHintType, unknown>([
		[
			DecodeHintType.POSSIBLE_FORMATS,
			[BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]
		]
	]);

	function stopScanner() {
		controls?.stop();
		controls = undefined;
		reader = undefined;
		if (videoElement?.srcObject instanceof MediaStream) {
			videoElement.srcObject.getTracks().forEach((track) => track.stop());
			videoElement.srcObject = null;
		}
		scanning = false;
	}

	function close() {
		stopScanner();
		onClose();
	}

	async function handleBarcode(rawValue: string) {
		if (handledBarcode) return;

		const barcode = rawValue.replace(/\D/g, '');
		if (![6, 8, 12, 13].includes(barcode.length)) {
			error = 'The detected code is not a supported product barcode.';
			return;
		}

		handledBarcode = true;
		stopScanner();
		status = 'Looking up product...';
		error = '';

		try {
			const product = await getProductByBarcode(barcode);
			await goto(resolve(`/product/${product.id}`));
		} catch (lookupError) {
			handledBarcode = false;
			if (
				lookupError instanceof Error &&
				(lookupError.message.includes('404') ||
					lookupError.message.includes('No product was found'))
			) {
				error = `Product not found for barcode ${barcode}.`;
			} else {
				error = 'Unable to look up this barcode. Please try again.';
			}
			status = '';
		}
	}

	async function startCamera() {
		try {
			reader = new BrowserMultiFormatReader(hints);
			status = 'Point your camera at a barcode.';
			controls = await reader.decodeFromConstraints(
				{
					video: { facingMode: { ideal: 'environment' } },
					audio: false
				},
				videoElement,
				(result) => {
					if (result) void handleBarcode(result.getText());
				}
			);
		} catch {
			scanning = false;
			status = '';
			error = 'Camera access is unavailable. Use the image picker instead.';
		}
	}

	async function handleImage(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		handledBarcode = false;
		error = '';
		status = 'Reading barcode image...';
		const url = URL.createObjectURL(file);

		try {
			reader ??= new BrowserMultiFormatReader(hints);
			const result = await reader.decodeFromImageUrl(url);
			await handleBarcode(result.getText());
		} catch {
			status = '';
			error = 'No supported barcode was found in that image.';
		} finally {
			URL.revokeObjectURL(url);
			input.value = '';
		}
	}

	onMount(() => {
		void startCamera();
		return stopScanner;
	});
</script>

<div
	class="scanner-backdrop"
	role="presentation"
	onclick={(event) => event.target === event.currentTarget && close()}
>
	<div class="scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
		<div class="scanner-header">
			<h2 id="scanner-title">Scan Barcode</h2>
			<button type="button" class="close-button" aria-label="Close scanner" onclick={close}
				>×</button
			>
		</div>

		{#if scanning}
			<div class="video-frame">
				<video bind:this={videoElement} autoplay muted playsinline></video>
				<div class="scan-guide" aria-hidden="true"></div>
			</div>
		{/if}

		{#if status}
			<p class="scanner-status">{status}</p>
		{/if}

		{#if error}
			<p class="scanner-error" role="alert">{error}</p>
		{/if}

		<div class="scanner-actions">
			<label class="file-button">
				Choose Barcode Image
				<input bind:this={fileInput} type="file" accept="image/*" onchange={handleImage} hidden />
			</label>
			{#if !scanning}
				<button
					type="button"
					class="retry-button"
					onclick={() => {
						error = '';
						handledBarcode = false;
						scanning = true;
						void startCamera();
					}}
				>
					Try Camera Again
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.scanner-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgb(0 0 0 / 70%);
	}

	.scanner-dialog {
		width: min(100%, 520px);
		padding: 24px;
		border-radius: 16px;
		background: white;
		box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
	}

	.scanner-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 18px;
	}

	.scanner-header h2 {
		margin: 0;
	}

	.close-button {
		border: none;
		background: transparent;
		font-size: 28px;
		line-height: 1;
		cursor: pointer;
	}

	.video-frame {
		position: relative;
		overflow: hidden;
		aspect-ratio: 4 / 3;
		border-radius: 12px;
		background: #111;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.scan-guide {
		position: absolute;
		inset: 25% 10%;
		border: 2px solid white;
		border-radius: 8px;
		box-shadow: 0 0 0 999px rgb(0 0 0 / 20%);
	}

	.scanner-status,
	.scanner-error {
		margin: 16px 0 0;
		text-align: center;
	}

	.scanner-error {
		color: #b00020;
	}

	.scanner-actions {
		display: flex;
		justify-content: center;
		gap: 10px;
		margin-top: 20px;
	}

	.file-button,
	.retry-button {
		padding: 10px 14px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: white;
		cursor: pointer;
		font: inherit;
	}

	.retry-button {
		background: #080808;
		color: white;
	}
</style>
