<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let key: string | number;
	export let value: any;
	export let level: number = 0;

	// Notify parent that data changed
	function handleNotify() {
		dispatch('change');
	}

	// Forward events from children
	function forwardChange() {
		dispatch('change');
	}

	// File Picker Handlers
	function requestFile() {
		// Leaf node dispatch. We don't have the parent object context here easily,
		// so we rely on the bubbling chain or the parent handler logic.
		dispatch('fileRequest', { key, obj: null });
	}

	function handleChildFileRequest(e: CustomEvent) {
		// If the child didn't provide an owner object, WE (this object) are the owner
		if (!e.detail.obj && typeof value === 'object') {
			e.detail.obj = value;
		}
		dispatch('fileRequest', e.detail);
	}

	// Array Management
	function addArrayItem() {
		if (Array.isArray(value)) {
			// Clone the structure of the first item, or empty object
			const newItem = value.length > 0 ? JSON.parse(JSON.stringify(value[0])) : {};
			// Clear values in the clone
			const clearValues = (obj: any) => {
				for (const k in obj) {
					if (typeof obj[k] === 'string') obj[k] = '';
					else if (typeof obj[k] === 'number') obj[k] = 0;
					else if (typeof obj[k] === 'boolean') obj[k] = false;
					else if (typeof obj[k] === 'object' && obj[k] !== null) clearValues(obj[k]);
				}
			};
			clearValues(newItem);
			value = [...value, newItem];
			dispatch('change');
		}
	}

	function removeArrayItem(index: number) {
		if (Array.isArray(value)) {
			// value.splice(index, 1);
			// value = value;
			// ✅ Create a new array reference without the deleted item
			value = value.filter((_, i) => i !== index);
			dispatch('change');
		}
	}
</script>

<div class="prop-row-container">
	<!-- Label -->
	<div class="prop-name" style="padding-left: {level * 16}px; min-width: {100 + level * 8}px">
		{isNaN(Number(key)) ? key : `[${key}]`}
	</div>

	<!-- Value -->
	<div class="prop-value-col">
		{#if typeof value === 'object' && value !== null}
			<div class="header-row">
				<span class="muted type-label">
					{Array.isArray(value) ? `Array [${value.length}]` : '{Object}'}
				</span>
				{#if Array.isArray(value)}
					<button class="icon-btn add" on:click={addArrayItem} title="Add Item">+</button>
				{/if}
			</div>

			<div class="nested-group">
				{#if Array.isArray(value)}
					{#each value as item, i (i)}
						<div class="array-item-wrapper">
							<div class="array-item-content">
								<svelte:self
									key={i}
									bind:value={value[i]}
									level={level + 1}
									on:fileRequest={handleChildFileRequest}
									on:change={forwardChange}
								/>
							</div>
							<button
								class="icon-btn delete"
								on:click={() => removeArrayItem(i)}
								title="Remove Item">×</button
							>
						</div>
					{/each}
				{:else}
					{#each Object.keys(value) as k (k)}
						<svelte:self
							key={k}
							bind:value={value[k]}
							level={level + 1}
							on:fileRequest={handleChildFileRequest}
							on:change={forwardChange}
						/>
					{/each}
				{/if}
			</div>
		{:else if typeof value === 'boolean'}
			<input
				class="prop-value-input checkbox"
				type="checkbox"
				bind:checked={value}
				on:change={handleNotify}
			/>
		{:else if typeof value === 'number' || (isNaN(Number(key)) && key
					.toString()
					.toLowerCase()
					.includes('width'))}
			<input class="prop-value-input" type="number" bind:value on:input={handleNotify} />
		{:else}
			<!-- String / Default -->
			<div class="input-wrapper">
				{#if typeof value === 'string' && value.includes('<path')}
					<div class="svg-preview" title="SVG Preview">
						<svg viewBox="0 0 640 512" width="24" height="24">
							{@html value}
						</svg>
					</div>
				{/if}
				<input class="prop-value-input" type="text" bind:value on:input={handleNotify} />
				{#if key.toString().toLowerCase() === 'href' || key
						.toString()
						.toLowerCase() === 'src' || key.toString().toLowerCase().includes('img') || key
						.toString()
						.toLowerCase()
						.includes('imagesrc')}
					<button class="file-picker-btn" on:click={requestFile} title="Select File">📁</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.prop-row-container {
		display: flex;
		align-items: flex-start;
		padding: 4px 0;
		border-bottom: 1px solid var(--sp-border-main);
	}
	.prop-name {
		font-family: 'Consolas', monospace;
		color: var(--sp-text-accent);
		font-size: 0.85rem;
		padding-right: 10px;
		word-break: break-all;
	}
	.prop-value-col {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
	}
	.nested-group {
		margin-top: 4px;
		width: 100%;
		border-left: 1px solid var(--sp-border-main);
	}
	.muted {
		color: var(--sp-text-muted);
		font-size: 0.8rem;
		font-family: monospace;
	}
	.header-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.input-wrapper {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
	}
	.prop-value-input {
		width: 100%;
		background-color: var(--sp-bg-input);
		border: 1px solid var(--sp-border-main);
		color: var(--sp-text-string);
		padding: 4px 6px;
		border-radius: 2px;
		font-family: monospace;
		font-size: 0.85rem;
		flex-grow: 1;
	}
	input[type='checkbox'] {
		width: auto;
		flex-grow: 0;
	}

	.file-picker-btn {
		flex-shrink: 0;
		padding: 2px 6px;
		background-color: var(--sp-bg-header);
		border: 1px solid var(--sp-border-main);
		cursor: pointer;
		color: var(--sp-text-main);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.svg-preview {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		background: white;
		border-radius: 4px;
		margin-right: 8px;
	}
	.svg-preview svg {
		max-width: 100%;
		max-height: 100%;
	}
	:global(.svg-preview .fa-primary) {
		fill: var(--sp-color-accent, #007acc);
	}
	:global(.svg-preview .fa-secondary) {
		fill: var(--sp-text-muted, #888);
	}

	.icon-btn {
		background: none;
		border: none;
		color: var(--sp-text-muted);
		cursor: pointer;
		font-weight: bold;
		padding: 0 4px;
		font-size: 1.1rem;
		line-height: 1;
	}
	.icon-btn.add:hover {
		color: var(--sp-color-primary);
	}
	.icon-btn.delete {
		font-size: 1.2rem;
		align-self: flex-start;
		margin-top: 4px;
	}
	.icon-btn.delete:hover {
		color: var(--sp-color-danger);
	}

	.array-item-wrapper {
		display: flex;
		align-items: flex-start;
		width: 100%;
	}
	.array-item-content {
		flex: 1;
		min-width: 0;
	}
</style>
