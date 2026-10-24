import { afterEach, describe, expect, it } from 'vitest';
import { compareStore } from './compareStore';

afterEach(() => compareStore.clear());

function currentIds() {
	let ids: string[] = [];
	const unsubscribe = compareStore.subscribe((value) => (ids = value));
	unsubscribe();
	return ids;
}

describe('compareStore', () => {
	it('removes only the selected product from a two-product comparison', () => {
		compareStore.addProduct('one');
		compareStore.addProduct('two');

		compareStore.removeProduct('two');

		expect(currentIds()).toEqual(['one']);
	});

	it('preserves insertion order and enforces the two-product limit', () => {
		['one', 'two', 'three'].forEach((id) => compareStore.addProduct(id));
		expect(currentIds()).toEqual(['one', 'two']);
	});
});
