import { writable } from 'svelte/store';

const STORAGE_KEY = 'nutrascore.compare.products';
const MAX_PRODUCTS = 2;
const isShowcaseMode = import.meta.env.MODE === 'showcase';

function normaliseSelection(ids: string[]): string[] {
	return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].slice(0, MAX_PRODUCTS);
}

function readSelectionFromUrl(): string[] {
	if (typeof window === 'undefined') {
		return [];
	}

	const params = new URLSearchParams(window.location.search);
	const ids = params.get('ids') ?? params.get('compare');
	if (!ids) {
		return [];
	}

	return normaliseSelection(ids.split(','));
}

function readStoredSelection(): string[] {
	const urlSelection = readSelectionFromUrl();
	if (urlSelection.length > 0) {
		return urlSelection;
	}

	if (isShowcaseMode) {
		return [];
	}

	if (typeof localStorage === 'undefined') {
		return [];
	}

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return [];
		}

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return normaliseSelection(parsed);
	} catch {
		return [];
	}
}

function persistSelection(ids: string[]) {
	if (isShowcaseMode) {
		return;
	}

	if (typeof localStorage === 'undefined') {
		return;
	}

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(normaliseSelection(ids)));
	} catch {
		// Ignore storage write errors so the selection still works in-memory.
	}
}

const selectedProducts = writable<string[]>(readStoredSelection());

function addProduct(productId: string) {
	selectedProducts.update((current) => {
		if (current.includes(productId)) {
			return current;
		}

		const next = [...current, productId].slice(0, MAX_PRODUCTS);
		persistSelection(next);
		return next;
	});
}

function removeProduct(productId: string) {
	selectedProducts.update((current) => {
		const next = current.filter((id) => id !== productId);
		persistSelection(next);
		return next;
	});
}

function clear() {
	selectedProducts.set([]);
	persistSelection([]);
}

export const compareStore = {
	subscribe: selectedProducts.subscribe,
	addProduct,
	removeProduct,
	clear
};
