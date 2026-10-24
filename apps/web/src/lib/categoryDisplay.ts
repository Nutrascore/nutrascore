export interface CategoryDisplayOption {
	id: string;
	name: string;
	label: string;
}

export function toTitleCaseCategoryName(name: string): string {
	return name.replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
		const [firstLetter, ...remaining] = Array.from(word);
		return `${firstLetter.toLocaleUpperCase('en-US')}${remaining.join('').toLocaleLowerCase('en-US')}`;
	});
}

export function getCategoryDisplayOptions(
	categories: { id: string; name: string }[]
): CategoryDisplayOption[] {
	const uniqueCategories = [
		...new Map(categories.map((category) => [category.id.toLowerCase(), category])).values()
	];
	const options = uniqueCategories.map(({ id, name }) => ({
		id,
		name: toTitleCaseCategoryName(name),
		label: ''
	}));
	const groups = new Map<string, CategoryDisplayOption[]>();

	for (const option of options) {
		const key = option.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
		const group = groups.get(key) ?? [];
		group.push(option);
		groups.set(key, group);
	}

	for (const group of groups.values()) {
		if (group.length === 1) {
			group[0].label = group[0].name;
			continue;
		}

		for (const option of group) {
			let idLength = 6;
			while (
				group.some(
					(other) =>
						other !== option &&
						other.id.slice(0, idLength).toLowerCase() === option.id.slice(0, idLength).toLowerCase()
				)
			) {
				idLength += 1;
			}
			option.label = `${option.name} · ${option.id.slice(0, idLength)}`;
		}
	}

	return options.sort((first, second) => first.name.localeCompare(second.name));
}
