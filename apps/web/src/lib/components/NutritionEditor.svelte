<script lang="ts">
	import type { Nutrition } from '$lib/api';

	let { nutrition = $bindable(), disabled = false }: { nutrition: Nutrition; disabled?: boolean } =
		$props();

	const nutrientFields = [
		['kcalPer100g', 'Energy (kcal)'],
		['proteinG', 'Protein (g)'],
		['carbohydratesG', 'Carbohydrates (g)'],
		['sugarsG', 'Sugars (g)'],
		['fatG', 'Total fat (g)'],
		['saturatedFatG', 'Saturated fat (g)'],
		['transFatG', 'Trans fat (g)'],
		['fibreG', 'Dietary fibre (g)'],
		['sodiumMg', 'Sodium (mg)'],
		['saltG', 'Salt (g)'],
		['cholesterolMg', 'Cholesterol (mg)'],
		['calciumMg', 'Calcium (mg)'],
		['ironMg', 'Iron (mg)']
	] as const;
</script>

<fieldset class="nutrition-section" {disabled}>
	<legend>Nutrition values</legend>
	<label>
		Values are for
		<select bind:value={nutrition.basis}>
			<option value="perServing">Per serving</option>
			<option value="per100g">Per 100 g</option>
		</select>
	</label>
	{#each nutrientFields as [key, label] (key)}
		<label>
			{label}
			<input type="number" min="0" step="any" bind:value={nutrition[key]} />
		</label>
	{/each}
	<label>
		Vitamins and units
		<input type="text" maxlength="10000" bind:value={nutrition.vitamins} />
	</label>
</fieldset>

<fieldset class="serving-section" {disabled}>
	<legend>Serving size</legend>
	<label>
		Amount
		<input type="number" min="0" step="any" bind:value={nutrition.servingSize} />
	</label>
	<label>
		Unit
		<select bind:value={nutrition.servingUnit}>
			<option value={null}>Not specified</option>
			<option value="g">g</option>
			<option value="ml">ml</option>
			<option value="oz">oz</option>
			<option value="piece">piece</option>
			<option value="serving">serving</option>
		</select>
	</label>
</fieldset>

<style>
	fieldset {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
		margin: 0;
		min-width: 0;
		padding: 10px;
		border: 1px solid #dfe8e1;
		border-radius: 8px;
	}

	.nutrition-section {
		grid-column: 1 / -1;
	}

	.serving-section {
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		align-content: start;
	}

	legend {
		padding: 0 4px;
		font-weight: 600;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: #4f5f54;
		font-size: 13px;
	}

	input,
	select {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		padding: 8px;
		border: 1px solid #ccd8cf;
		border-radius: 8px;
		font: inherit;
	}

	@media (max-width: 700px) {
		fieldset {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
