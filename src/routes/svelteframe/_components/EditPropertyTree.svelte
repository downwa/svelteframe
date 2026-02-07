<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import RecursiveProperty from './RecursiveProperty.svelte';

	export let selectedObject: any = null;
	export let permissions = {
		canEditProps: true,
		canEditStyle: true
	};

	const dispatch = createEventDispatcher();

	function notifyChange() {
		dispatch('change');
	}

	function handleDirectFileRequest(obj: any, key: string) {
		dispatch('fileRequest', { obj, key });
	}

	function handleFilePickerFromChild(e: CustomEvent) {
		dispatch('fileRequest', e.detail);
	}
</script>

<div class="property-form">
	{#if selectedObject}
		{#if selectedObject.type === 'head'}
			<div class="prop-row-container">
				<div class="prop-name">title</div>
				<div class="prop-value-col">
					<input
						class="prop-value-input"
						type="text"
						bind:value={selectedObject.title}
						on:input={notifyChange}
					/>
				</div>
			</div>
		{:else if selectedObject.type === 'component'}
			<div class="component-header-actions">
				<span class="comp-tag">&lt;{selectedObject.name} /&gt;</span>
				<button
					class="icon-link-btn"
					title="Edit Component Source"
					on:click={() => dispatch('editComponent', { name: selectedObject.name })}
				>
					🔗
				</button>
			</div>
			{#if selectedObject.props}
				{#each Object.entries(selectedObject.props) as [key, value]}
					<div class="prop-row-container">
						<div class="prop-name">{key}</div>
						<div class="prop-value-col">
							{#if typeof value === 'boolean'}
								<input
									type="checkbox"
									bind:checked={selectedObject.props[key]}
									on:change={notifyChange}
								/>
							{:else if typeof value === 'string' && (value === '{true}' || value === '{false}')}
								<input
									type="checkbox"
									checked={value === '{true}'}
									on:change={(e) => {
										selectedObject.props[key] = e.currentTarget.checked ? '{true}' : '{false}';
										notifyChange();
									}}
								/>
							{:else}
								<div class="input-wrapper">
									{#if typeof value === 'string' && value.includes('<path')}
										<div class="svg-preview" title="SVG Preview">
											<svg viewBox="0 0 640 512" width="24" height="24">
												{@html value}
											</svg>
										</div>
									{/if}
									<input
										class="prop-value-input"
										type="text"
										bind:value={selectedObject.props[key]}
										on:input={notifyChange}
									/>
									{#if key.toLowerCase() === 'href' || key.toLowerCase() === 'src' || key.toLowerCase() === 'img' || key
											.toLowerCase()
											.includes('imagesrc')}
										<button
											class="file-picker-btn"
											title="Select Path"
											on:click={() => handleDirectFileRequest(selectedObject.props, key)}>📁</button
										>
									{/if}
									{#if typeof value === 'string' && value.match(/^\{[a-zA-Z_$][a-zA-Z0-9_$]*\}$/)}
										<button
											class="file-picker-btn link-btn"
											title="Go to property"
											on:click={() => dispatch('navigatetoprop', { name: value.slice(1, -1) })}
											>🔗</button
										>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		{:else if selectedObject.type === 'imported-object' || (selectedObject._parsed !== undefined && !selectedObject.props)}
			<!-- "Script Properties" or "Imports" -->
			<div class="prop-info-header">{selectedObject.name}</div>
			<div class="nested-group">
				<RecursiveProperty
					bind:value={selectedObject._parsed}
					key={selectedObject.name}
					on:change={notifyChange}
					on:input={() => dispatch('change')}
					on:fileRequest={handleFilePickerFromChild}
				/>
			</div>
		{:else if selectedObject.type === 'style' || selectedObject === 'style'}
			<!-- Style is handled by EditCSS usually, but if passed here, show placeholder or ignore -->
			<p class="no-selection">Select Styles in the Style Editor.</p>
		{:else}
			<p class="no-selection">Unknown object type: {selectedObject.type}</p>
		{/if}
	{:else}
		<p class="no-selection">Select an item to edit properties.</p>
	{/if}
</div>

<style>
	.property-form {
		padding: 0.5rem;
	}
	.prop-row-container {
		display: flex;
		align-items: flex-start;
		padding: 6px 0;
		border-bottom: 1px solid var(--sp-bg-header, #333);
	}
	.prop-name {
		font-family: monospace;
		color: var(--sp-text-accent, #4fc1ff);
		width: 100px;
		flex-shrink: 0;
		word-break: break-all;
		font-size: 0.85rem;
	}
	.prop-value-col {
		flex: 1;
		min-width: 0;
	}
	.prop-value-input {
		width: 100%;
		background: var(--sp-bg-input, #222);
		border: 1px solid var(--sp-border-main, #444);
		color: var(--sp-text-string, #ce9178);
		padding: 4px;
		border-radius: 2px;
	}
	.component-header-actions {
		margin-bottom: 1rem;
		border-bottom: 1px solid #444;
		padding-bottom: 0.5rem;
	}
	.comp-tag {
		color: var(--sp-text-keyword, #569cd6);
		font-family: monospace;
		font-weight: bold;
		font-size: 1.1em;
	}
	.icon-link-btn {
		background: transparent;
		border: none;
		color: var(--sp-text-muted, #888);
		cursor: pointer;
		margin-left: 8px;
		font-size: 1.1em;
		padding: 2px 4px;
		vertical-align: middle;
	}
	.icon-link-btn:hover {
		color: var(--sp-color-accent, #007acc);
	}
	.input-wrapper {
		display: flex;
		gap: 4px;
	}
	.file-picker-btn {
		background: var(--sp-bg-header, #333);
		border: 1px solid var(--sp-border-main, #555);
		color: white;
		cursor: pointer;
		padding: 0 6px;
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
	.prop-info-header {
		font-family: monospace;
		padding-bottom: 8px;
		color: var(--sp-text-muted, #888);
		font-weight: bold;
	}
	.no-selection {
		color: #888;
		font-style: italic;
	}
</style>
