<script lang="ts">
	import { onMount, tick } from 'svelte';

	type CategoryOption = { id: string; name: string; label: string };

	let {
		options,
		value = $bindable(''),
		id = 'category-select'
	}: {
		options: CategoryOption[];
		value?: string;
		id?: string;
	} = $props();

	let anchor = $state<HTMLDivElement | null>(null);
	let isOpen = $state(false);
	let query = $state('');
	let activeIndex = $state(-1);
	let menuStyle = $state({ top: '0px', left: '0px', width: '0px', maxHeight: '0px' });

	let selectedLabel = $derived(options.find((option) => option.id === value)?.label ?? '');
	let filteredOptions = $derived(
		options.filter((option) =>
			`${option.label} ${option.name}`
				.toLocaleLowerCase()
				.includes(query.trim().toLocaleLowerCase())
		)
	);

	function updatePosition() {
		const rect = anchor?.getBoundingClientRect();
		if (!rect) return;

		const viewportPadding = 8;
		const spaceBelow = window.innerHeight - rect.bottom - viewportPadding * 2;
		const spaceAbove = rect.top - viewportPadding * 2;
		const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
		const availableSpace = Math.max(0, openAbove ? spaceAbove : spaceBelow);
		const maxHeight = Math.min(280, window.innerHeight * 0.4, availableSpace);
		const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
		const left = Math.min(
			Math.max(rect.left, viewportPadding),
			window.innerWidth - width - viewportPadding
		);
		const top = openAbove
			? Math.max(viewportPadding, rect.top - maxHeight - 4)
			: Math.min(rect.bottom + 4, window.innerHeight - maxHeight - viewportPadding);

		menuStyle = {
			top: `${top}px`,
			left: `${left}px`,
			width: `${width}px`,
			maxHeight: `${maxHeight}px`
		};
	}

	function closeOptions() {
		isOpen = false;
		query = selectedLabel;
		activeIndex = -1;
	}

	function openOptions() {
		if (isOpen) return;
		query = '';
		isOpen = true;
		activeIndex = options.findIndex((option) => option.id === value) + 1;
		updatePosition();
	}

	function selectOption(option: CategoryOption | null) {
		value = option?.id ?? '';
		closeOptions();
	}

	async function moveActiveOption(direction: number) {
		const optionCount = filteredOptions.length + 1;
		const startIndex = activeIndex < 0 ? (direction > 0 ? -1 : 0) : activeIndex;
		activeIndex = (startIndex + direction + optionCount) % optionCount;
		await tick();
		document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!isOpen) openOptions();
			else void moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter' && isOpen) {
			event.preventDefault();
			if (activeIndex === 0) selectOption(null);
			else if (filteredOptions[activeIndex - 1]) selectOption(filteredOptions[activeIndex - 1]);
		} else if (event.key === 'Escape' && isOpen) {
			event.preventDefault();
			closeOptions();
		} else if (event.key === 'Tab' && isOpen) {
			closeOptions();
		}
	}

	function handleInput() {
		activeIndex = filteredOptions.length ? 1 : 0;
	}

	onMount(() => {
		const handlePointerDown = (event: PointerEvent) => {
			if (event.target instanceof Node && !anchor?.contains(event.target)) closeOptions();
		};
		document.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	});
</script>

<div class="category-picker" bind:this={anchor}>
	<input
		{id}
		role="combobox"
		aria-autocomplete="list"
		aria-controls={`${id}-options`}
		aria-expanded={isOpen}
		aria-activedescendant={isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
		autocomplete="off"
		value={isOpen ? query : selectedLabel}
		onfocus={openOptions}
		onclick={openOptions}
		oninput={(event) => {
			query = event.currentTarget.value;
			handleInput();
		}}
		onkeydown={handleKeydown}
	/>
	{#if isOpen}
		<div
			class="options"
			id={`${id}-options`}
			role="listbox"
			style:top={menuStyle.top}
			style:left={menuStyle.left}
			style:width={menuStyle.width}
			style:max-height={menuStyle.maxHeight}
		>
			<div
				class:active={activeIndex === 0}
				class="option"
				id={`${id}-option-0`}
				role="option"
				tabindex="-1"
				aria-selected={!value}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => selectOption(null)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') selectOption(null);
				}}
			>
				Not specified
			</div>
			{#each filteredOptions as option, index (option.id)}
				<div
					class:active={activeIndex === index + 1}
					class="option"
					id={`${id}-option-${index + 1}`}
					role="option"
					tabindex="-1"
					aria-selected={value === option.id}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => selectOption(option)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') selectOption(option);
					}}
				>
					{option.label}
				</div>
			{:else}
				<div class="empty">No categories found.</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.category-picker {
		position: relative;
		width: 100%;
	}
	input {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 8px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		font: inherit;
	}
	.options {
		position: fixed;
		z-index: 1000;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		background: white;
		color: #26352b;
		box-shadow: 0 6px 18px rgb(0 0 0 / 14%);
	}
	.option {
		padding: 9px 10px;
		cursor: pointer;
	}
	.option:hover,
	.option.active {
		background: #eef4ef;
		color: #216b48;
	}
	.empty {
		padding: 9px 10px;
		color: #657168;
	}
</style>
