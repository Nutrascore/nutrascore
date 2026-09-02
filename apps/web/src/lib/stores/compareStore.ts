import { writable } from 'svelte/store';

const selectedProducts = writable<string[]>([]);

function addProduct(productId: string) {
	selectedProducts.update((current) => {
		if (current.includes(productId)) {
			return current;
		}

		if (current.length >= 2) {
			return current;
		}

		return [...current, productId];
	});
}

function removeProduct(productId: string) {
	selectedProducts.update((current) => current.filter((id) => id !== productId));
}

function clear() {
	selectedProducts.set([]);
}

export const compareStore = {
	subscribe: selectedProducts.subscribe,
	addProduct,
	removeProduct,
	clear
};
