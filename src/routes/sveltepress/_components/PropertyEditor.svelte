<!-- FILE: src/routes/sveltepress/_components/PropertyEditor.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { debugLog, debugError } from '../lib/server/debug';
	import AddPropertyModal from './AddPropertyModal.svelte';

	export let head: any = null;
	export let props: any[] = [];
	export let components: any[] = [];
	export let imports: any[] = [];
	export let selectedObject: any = null;

	const dispatch = createEventDispatcher();

	// --- Local state for ALL DND operations ---
	let localProps: any[] = [];
	let isDraggingProps = false;
	let localComponents: any[] = [];
	let isDraggingComponents = false;

	// Sync local state with props, but only when not dragging
	$: if (!isDraggingProps) {
		localProps = props.map((p) => ({ ...p, id: p.name }));
	}
	$: if (!isDraggingComponents) {
		// FIX: Generate a new, unique ID for each item in the DND list
		// to ensure the key is unique for rendering, even if data is cloned.
		// Keep a reference to the original object for dispatching.
		localComponents = components.map((c) => ({
			name: c.name,
			id: crypto.randomUUID(), // Unique key for this UI instance
			original: c, // Reference to the actual data object
		}));
	}

	let isDraggingOverComponents = false;
	let showDropIndicator = false;
	let dropIndicatorTop = 0;
	let showContextMenu = false;
	let menuX = 0;
	let menuY = 0;
	let contextObject: any = null;
	let treeViewPane: HTMLElement;
	let showAddPropertyModal = false;

	let showReorderIndicator = false;
	let reorderIndicatorTop = 0;

	$: parsedProps = localProps.map((p) => {
		try {
			const value = JSON.parse(p.value);
			return { ...p, parsedValue: value, isObject: typeof value === 'object' };
		} catch (e) {
			return { ...p, parsedValue: p.value, isObject: false };
		}
	});

	// --- Use on:consider for local updates, on:finalize for parent updates ---
	function handlePropConsider(e: CustomEvent) {
		localProps = e.detail.items;
	}

	function handlePropFinalize(e: CustomEvent) {
		isDraggingProps = false;
		const reorderedProps = e.detail.items.map((item: any) => {
			const { id, ...rest } = item;
			return rest;
		});
		dispatch('reorderprops', reorderedProps);
	}

	function handleComponentConsider(e: CustomEvent) {
		localComponents = e.detail.items;
	}

	function handleComponentFinalize(e: CustomEvent) {
		isDraggingComponents = false;
		const reorderedComponents = e.detail.items.map((i: any) => i.original);
		// FIX: Dispatch the correct event for component reordering
		dispatch('reordercomponents', reorderedComponents);
	}

	function handleReorderDragOver(event: DragEvent) {
		event.preventDefault();
		showReorderIndicator = true;
		const listEl = event.currentTarget as HTMLElement;
		const listRect = listEl.getBoundingClientRect();
		const children = Array.from(
			listEl.querySelectorAll('li[data-id]'),
		) as HTMLElement[];

		let indicatorY = listEl.offsetHeight;

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childRect = child.getBoundingClientRect();
			const midPoint = childRect.top + childRect.height / 2;
			if (event.clientY < midPoint) {
				indicatorY = childRect.top - listRect.top;
				break;
			}
		}
		reorderIndicatorTop = indicatorY;
	}

	function handleReorderDragLeave() {
		showReorderIndicator = false;
	}

	function handleComponentListDragOver(event: DragEvent) {
		event.preventDefault();
		if (!isDraggingOverComponents) isDraggingOverComponents = true;

		const listEl = event.currentTarget as HTMLElement;
		const listRect = listEl.getBoundingClientRect();
		const children = Array.from(
			listEl.querySelectorAll('li[data-index]'),
		) as HTMLElement[];

		let indicatorY = listEl.offsetHeight;

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childRect = child.getBoundingClientRect();
			const midPoint = childRect.top + childRect.height / 2;
			if (event.clientY < midPoint) {
				indicatorY = childRect.top - listRect.top;
				break;
			}
		}

		dropIndicatorTop = indicatorY;
		showDropIndicator = true;
	}

	function handleComponentListDragLeave(event: DragEvent) {
		if (
			!event.relatedTarget ||
			!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
		) {
			isDraggingOverComponents = false;
			showDropIndicator = false;
		}
	}

	function handleComponentListDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOverComponents = false;
		showDropIndicator = false;

		if (event.dataTransfer) {
			const fileDataString = event.dataTransfer.getData('application/json');
			if (!fileDataString) return;

			const file = JSON.parse(fileDataString);
			let insertionIndex = components.length;

			const listEl = event.currentTarget as HTMLElement;
			const children = Array.from(
				listEl.querySelectorAll('li[data-index]'),
			) as HTMLElement[];

			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				const childRect = child.getBoundingClientRect();
				const midPoint = childRect.top + childRect.height / 2;
				if (event.clientY < midPoint) {
					insertionIndex = i;
					break;
				}
			}

			dispatch('dropcomponent', { file, index: insertionIndex });
		}
	}

	function selectObject(obj: any) {
		dispatch('select', obj);
	}

	function notifyChange() {
		dispatch('change');
	}

	export async function scrollToSelected(obj: any) {
		await tick();
		if (!treeViewPane || !obj) return;
		const id = obj.id || obj.name;
		if (!id) return;
		const element = treeViewPane.querySelector(`[data-id='${id}']`);
		element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	function handleContextMenu(event: MouseEvent, obj: any) {
		event.preventDefault();
		contextObject = obj;
		menuX = event.clientX;
		menuY = event.clientY;
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
	}

	function handleDeleteClick() {
		if (contextObject) {
			dispatch('delete', contextObject);
		}
		closeContextMenu();
	}

	function handleAddScriptPropertyClick() {
		showAddPropertyModal = true;
		closeContextMenu();
	}

	async function handlePropertyAdded(event: CustomEvent) {
		const { name, type, isArray } = event.detail;
		showAddPropertyModal = false;

		if (!name || props.some((p) => p.name === name)) {
			alert('Invalid or duplicate property name.');
			return;
		}

		let typeAnnotation = `: ${type}${isArray ? '[]' : ''}`;
		let value = 'null';

		if (isArray) {
			value = '[]';
			const typeImport = imports.find((imp) =>
				imp.specifiers.some((s: any) => s.name === type),
			);
			if (typeImport) {
				const res = await fetch(
					`/sveltepress/api/files/type-info?source=${encodeURIComponent(
						typeImport.source,
					)}&typeName=${type}`,
				);
				if (res.ok) {
					const typeInfo = await res.json();
					const newObj: any = {};
					for (const field of typeInfo.fields) {
						if (field.type === 'string') newObj[field.name] = '';
						else if (field.type === 'number') newObj[field.name] = 0;
						else if (field.type === 'boolean') newObj[field.name] = false;
						else newObj[field.name] = null;
					}
					value = `[${JSON.stringify(newObj, null, 2)}]`;
				}
			}
		} else {
			if (type === 'string') value = `''`;
			if (type === 'number') value = `0`;
			if (type === 'boolean') value = `false`;
		}

		props = [...props, { name, value, typeAnnotation }];
		notifyChange();
	}

	function handlePreviewClick() {
		if (contextObject) {
			dispatch('previewcomponent', contextObject);
		}
		closeContextMenu();
	}

	onMount(() => {
		window.addEventListener('click', closeContextMenu);
		return () => {
			window.removeEventListener('click', closeContextMenu);
		};
	});
</script>

{#if showAddPropertyModal}
	<AddPropertyModal
		{imports}
		on:close={() => (showAddPropertyModal = false)}
		on:add={handlePropertyAdded}
	/>
{/if}

{#if showContextMenu}
	<div
		class="context-menu"
		style="top: {menuY}px; left: {menuX}px;"
		on:click|stopPropagation
	>
		<button
			on:click={handleDeleteClick}
			disabled={contextObject?.type === 'head'}
		>
			Delete
		</button>
		{#if contextObject && (contextObject.name || contextObject.parentProp)}
			<button on:click={handleAddScriptPropertyClick}>
				{#if contextObject.parentProp}
					Add Array Element
				{:else}
					Add Script Property...
				{/if}
			</button>
		{/if}
		{#if contextObject?.type === 'component'}
			<button on:click={handlePreviewClick}>Preview Component</button>
		{/if}
	</div>
{/if}

<div class="property-editor-wrapper">
	<div class="pane tree-view-pane" bind:this={treeViewPane}>
		<h4>Object Tree</h4>
		<ul class="tree-list">
			<li data-id={head?.id}>
				<button
					class="tree-category"
					class:selected={head === selectedObject}
					on:click={() => selectObject(head)}
					on:contextmenu={(e) => handleContextMenu(e, head)}
				>
					Page Head
				</button>
			</li>
			{#if props.length > 0}
				<li>
					<span class="tree-category">Script Properties</span>
					<ul
						class="reorder-list"
						use:dndzone={{
							items: localProps,
							flipDurationMs: 200,
							type: 'prop',
						}}
						on:consider={handlePropConsider}
						on:finalize={handlePropFinalize}
						on:dragover={handleReorderDragOver}
						on:dragleave={handleReorderDragLeave}
					>
						{#if showReorderIndicator}
							<div
								class="drop-indicator"
								style="top: {reorderIndicatorTop}px;"
							></div>
						{/if}
						{#each parsedProps as prop (prop.id)}
							<li
								data-id={prop.id}
								on:dragstart={() => (isDraggingProps = true)}
								on:dragend={() => (isDraggingProps = false)}
							>
								<div class="tree-item-wrapper">
									<div class="drag-handle">⠿</div>
									<button
										class:selected={prop.name === selectedObject?.name}
										on:click={() => selectObject(prop)}
										on:contextmenu={(e) => handleContextMenu(e, prop)}
									>
										{prop.name}
									</button>
								</div>
								{#if prop.isObject && Array.isArray(prop.parsedValue)}
									<ul class="sub-tree">
										{#each prop.parsedValue as item, i (`${prop.id}-${i}`)}
											{@const itemName =
												item.name || item.src || `Item ${i + 1}`}
											{@const itemObj = {
												...item,
												type: 'script-prop-item',
												parentProp: prop,
												arrayIndex: i,
												id: `${prop.id}-${i}`,
											}}
											<li data-id={itemObj.id}>
												<button
													class:selected={selectedObject?.id === itemObj.id}
													on:click={() => selectObject(itemObj)}
													on:contextmenu={(e) => handleContextMenu(e, itemObj)}
												>
													{itemName}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				</li>
			{/if}
			<li>
				<span class="tree-category">Components</span>
				<ul
					class="component-list reorder-list"
					class:drop-target-active={isDraggingOverComponents}
					use:dndzone={{ items: localComponents, flipDurationMs: 200 }}
					on:consider={handleComponentConsider}
					on:finalize={handleComponentFinalize}
					on:dragover={handleComponentListDragOver}
					on:dragleave={handleComponentListDragLeave}
					on:drop={handleComponentListDrop}
				>
					{#if showDropIndicator}
						<div
							class="drop-indicator add-indicator"
							style="top: {dropIndicatorTop}px;"
						></div>
					{/if}
					{#if showReorderIndicator}
						<div
							class="drop-indicator"
							style="top: {reorderIndicatorTop}px;"
						></div>
					{/if}
					{#each localComponents as component, i (component.id)}
						<li
							data-index={i}
							data-id={component.id}
							on:dragstart={() => (isDraggingComponents = true)}
							on:dragend={() => (isDraggingComponents = false)}
						>
							<div class="tree-item-wrapper">
								<div class="drag-handle">⠿</div>
								<button
									class:selected={component.original.id === selectedObject?.id}
									on:click={() => selectObject(component.original)}
									on:contextmenu={(e) =>
										handleContextMenu(e, component.original)}
								>
									&lt;{component.name} /&gt;
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</li>
		</ul>
	</div>
	<div class="pane property-grid-pane">
		<h4>Properties</h4>
		{#if selectedObject}
			<div class="property-grid">
				{#if selectedObject.type === 'head'}
					<div class="prop-name">title</div>
					<input
						class="prop-value-input"
						type="text"
						bind:value={selectedObject.title}
						on:input={notifyChange}
					/>
					{#each selectedObject.meta as meta, i}
						<div class="prop-name">meta:{meta.name}</div>
						<input
							class="prop-value-input"
							type="text"
							bind:value={meta.content}
							on:input={notifyChange}
						/>
					{/each}
				{:else if selectedObject.type === 'component'}
					{#each Object.entries(selectedObject.props) as [key, value]}
						<div class="prop-name">{key}</div>
						{#if typeof value === 'boolean'}
							<input
								class="prop-value-input"
								type="checkbox"
								bind:checked={selectedObject.props[key]}
								on:change={notifyChange}
							/>
						{:else if typeof value === 'number'}
							<input
								class="prop-value-input"
								type="number"
								bind:value={selectedObject.props[key]}
								on:input={notifyChange}
							/>
						{:else}
							<input
								class="prop-value-input"
								type="text"
								bind:value={selectedObject.props[key]}
								on:input={notifyChange}
							/>
						{/if}
					{/each}
				{:else if selectedObject.name && selectedObject.value !== undefined}
					<div class="prop-name">name</div>
					<div class="prop-value-static">{selectedObject.name}</div>
					<div class="prop-name">value</div>
					<textarea
						class="prop-value-input code"
						bind:value={selectedObject.value}
						on:input={notifyChange}
					></textarea>
				{:else if selectedObject.type === 'script-prop-item'}
					{#each Object.entries(selectedObject) as [key, value]}
						{#if !['type', 'parentProp', 'arrayIndex', 'id'].includes(key)}
							<div class="prop-name">{key}</div>
							{#if typeof value === 'boolean'}
								<input
									type="checkbox"
									bind:checked={selectedObject[key]}
									on:change={notifyChange}
								/>
							{:else if typeof value === 'number'}
								<div class="input-wrapper">
									<input
										type="number"
										bind:value={selectedObject[key]}
										on:input={notifyChange}
									/>
								</div>
							{:else}
								<div class="input-wrapper">
									<input
										type="text"
										bind:value={selectedObject[key]}
										on:input={notifyChange}
									/>
									{#if key.toLowerCase().includes('src') || key.toLowerCase().includes('href') || key.toLowerCase().includes('link')}
										<button class="file-picker-btn" title="Select File"
											>📁</button
										>
									{/if}
								</div>
							{/if}
						{/if}
					{/each}
				{/if}
			</div>
		{:else}
			<p class="no-selection">Select an item to edit its properties.</p>
		{/if}
	</div>
</div>

<style>
	.property-editor-wrapper {
		display: flex;
		height: 100%;
		width: 100%;
		background-color: #252526;
		border-bottom: 1px solid #444;
	}
	.pane {
		padding: 1rem;
		overflow-y: auto;
	}
	.tree-view-pane {
		flex: 1;
		border-right: 1px solid #444;
		min-width: 200px;
	}
	.property-grid-pane {
		flex: 2;
	}
	h4 {
		margin-top: 0;
		color: #ccc;
		font-weight: 600;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #444;
	}
	.tree-list,
	.tree-list ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.tree-list ul {
		padding-left: 1rem;
	}
	.sub-tree {
		border-left: 1px solid #555;
		margin-left: 12px;
	}
	.tree-item-wrapper {
		display: flex;
		align-items: center;
	}
	.drag-handle {
		cursor: grab;
		color: #666;
		padding: 4px;
	}
	.reorder-list {
		position: relative;
	}
	.component-list {
		position: relative;
		padding: 4px 0;
		border-radius: 4px;
		transition: background-color 0.2s ease-in-out;
		min-height: 20px;
	}
	.component-list.drop-target-active {
		background-color: #004a7c;
	}
	.drop-indicator {
		position: absolute;
		height: 2px;
		background-color: #f0ad4e;
		width: 100%;
		left: 0;
		z-index: 10;
		pointer-events: none;
		box-shadow: 0 0 5px #f0ad4e;
		transform: translateY(-1px);
	}
	.drop-indicator.add-indicator {
		background-color: #00aaff;
		box-shadow: 0 0 5px #00aaff;
	}
	.tree-category {
		font-weight: bold;
		color: #a9a9a9;
		font-size: 0.9rem;
		display: block;
		margin-top: 0.5rem;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 4px 8px;
		border-radius: 3px;
		cursor: pointer;
	}
	.tree-list button {
		flex-grow: 1;
		text-align: left;
		background: none;
		border: none;
		color: #d4d4d4;
		padding: 4px 8px;
		border-radius: 3px;
		cursor: pointer;
		font-family: monospace;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tree-list button:hover {
		background-color: #37373d;
	}
	.tree-list button.selected {
		background-color: #094771;
		color: white;
	}
	.property-grid {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 8px 12px;
		align-items: center;
	}
	.prop-name {
		font-weight: bold;
		color: #9cdcfe;
		font-family: monospace;
	}
	.prop-value-static {
		color: #ce9178;
		font-family: monospace;
	}
	.input-wrapper {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.prop-value-input,
	input[type='text'],
	input[type='number'],
	input[type='checkbox'] {
		width: 100%;
		background-color: #3c3c3c;
		border: 1px solid #555;
		color: #ce9178;
		padding: 6px 8px;
		border-radius: 3px;
		font-family: monospace;
		flex-grow: 1;
	}
	input[type='checkbox'] {
		width: auto;
		flex-grow: 0;
		height: 16px;
		width: 16px;
	}
	.file-picker-btn {
		flex-shrink: 0;
		padding: 4px;
		background-color: #555;
		border: 1px solid #666;
		cursor: pointer;
	}
	.prop-value-input.code {
		min-height: 100px;
		resize: vertical;
	}
	.no-selection {
		color: #888;
	}
	.context-menu {
		position: fixed;
		background-color: #3c3c3c;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 4px;
		min-width: 150px;
		z-index: 2000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.context-menu button {
		width: 100%;
		text-align: left;
		color: #d4d4d4;
		background: none;
		border: none;
		padding: 6px 12px;
		border-radius: 3px;
		cursor: pointer;
	}
	.context-menu button:hover:not(:disabled) {
		background-color: #007acc;
		color: white;
	}
	.context-menu button:disabled {
		color: #666;
		cursor: not-allowed;
	}
</style>