<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { dndzone } from 'svelte-dnd-action';

	export let head: any = null;
	export let props: any[] = [];
	export let components: any[] = [];
	export let importedObjects: any[] = [];
	export let selectedObject: any = null;
	export let showStylesString = true; // "Styles" (2Styles previously)
	export let permissions = {
		canEditStyle: true
	};

	// Local state for DND
	let localProps: any[] = [];
	let localComponents: any[] = [];
	let isDraggingProps = false;
	let isDraggingComponents = false;

	const dispatch = createEventDispatcher();

	// Sync local state when props change (and not dragging)
	$: if (!isDraggingProps) {
		localProps = props;
	}
	$: if (!isDraggingComponents) {
		localComponents = components
			.filter((c) => c.type !== 'html')
			.map((c) => ({
				name: c.name,
				id: c.id || crypto.randomUUID(), // Ensure ID
				path: c.path,
				original: c
			}));
	}

	function selectObject(obj: any) {
		dispatch('select', obj);
	}

	function handlePropReorder(e: CustomEvent) {
		localProps = e.detail.items;
		if (e.type === 'finalize') {
			isDraggingProps = false;
			dispatch('reorderprops', localProps);
		} else {
			isDraggingProps = true;
		}
	}

	function handleComponentReorder(e: CustomEvent) {
		localComponents = e.detail.items;
		if (e.type === 'finalize') {
			isDraggingComponents = false;
			dispatch(
				'reordercomponents',
				localComponents.map((i) => i.original)
			);
		} else {
			isDraggingComponents = true;
		}
	}
</script>

<div class="tree-container">
	<ul class="tree-list">
		{#if head || (permissions.canEditStyle && showStylesString)}
			<li>
				<span class="tree-category">Page Metadata</span>
				<ul>
					{#if head}
						<li data-id={head.id}>
							<button class:selected={head === selectedObject} on:click={() => selectObject(head)}
								>SEO & Head Tags</button
							>
						</li>
					{:else}
						<li class="muted">
							<button disabled>SEO & Head Tags (None)</button>
						</li>
					{/if}
					{#if permissions.canEditStyle && showStylesString}
						<li data-id="page-style">
							<button
								class:selected={selectedObject === 'style'}
								on:click={() => selectObject('style')}>Global CSS</button
							>
						</li>
					{/if}
				</ul>
			</li>
		{/if}

		<li class:muted={localProps.length === 0}>
			<span class="tree-category">Script Properties</span>
			<ul
				class="reorder-list"
				use:dndzone={{ items: localProps, flipDurationMs: 200, type: 'prop' }}
				on:consider={(e) => (localProps = e.detail.items)}
				on:finalize={handlePropReorder}
			>
				{#each localProps as prop (prop.id)}
					<li data-id={prop.id}>
						<div class="tree-item-wrapper">
							<button class:selected={prop === selectedObject} on:click={() => selectObject(prop)}
								>{prop.name}</button
							>
						</div>
					</li>
				{/each}
			</ul>
		</li>

		<li class:muted={localComponents.length === 0}>
			<span class="tree-category">Components</span>
			<ul
				class="component-list reorder-list"
				use:dndzone={{ items: localComponents, flipDurationMs: 200 }}
				on:consider={(e) => (localComponents = e.detail.items)}
				on:finalize={handleComponentReorder}
			>
				{#each localComponents as component (component.id)}
					<li data-id={component.id}>
						<div class="tree-item-wrapper">
							<div class="tree-item-left">
								<button
									class:selected={component.original === selectedObject}
									on:click={() => selectObject(component.original)}
									>&lt;{component.name} /&gt;</button
								>
							</div>
							<button
								class="edit-source-btn"
								on:click|stopPropagation={() => {
									console.log(
										'[EditObjectTree] LINK-CLICK for:',
										component.name,
										'path:',
										component.path
									);
									dispatch('editComponent', { name: component.name, path: component.path });
								}}
								title="Edit Component Source">🔗</button
							>
						</div>
					</li>
				{/each}
				{#if localComponents.length === 0}
					<li class="empty-placeholder">No components</li>
				{/if}
			</ul>
		</li>

		<li class:muted={!importedObjects || importedObjects.length === 0}>
			<span class="tree-category">Imports (Shared Data)</span>
			<ul class="reorder-list">
				{#if importedObjects && importedObjects.length > 0}
					{#each importedObjects as imp (imp.id)}
						<li data-id={imp.id}>
							<button class:selected={selectedObject === imp} on:click={() => selectObject(imp)}
								>🔗 {imp.name}</button
							>
						</li>
					{/each}
				{:else}
					<li class="empty-placeholder">No imports detected</li>
				{/if}
			</ul>
		</li>
	</ul>
</div>

<style>
	.tree-container {
		height: 100%;
		overflow-y: auto;
		padding: 0.5rem;
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
	.tree-list button {
		background: none;
		border: none;
		color: var(--sp-text-muted, #888);
		cursor: pointer;
		text-align: left;
		width: 100%;
		padding: 4px 6px;
		border-radius: 3px;
		font-size: 0.85rem;
		transition: all 0.2s;
	}
	.tree-list button:hover {
		background-color: rgba(255, 255, 255, 0.05);
		color: var(--sp-text-main, #eee);
	}
	.tree-list button.selected {
		background-color: var(--sp-color-accent, #0e639c);
		color: white;
		font-weight: 500;
	}
	.muted {
		opacity: 0.4;
		filter: grayscale(1);
	}
	.muted button {
		cursor: default !important;
	}
	.tree-category {
		display: block;
		padding: 12px 0 6px 0;
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--sp-text-accent, #9cdcfe);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		margin-bottom: 4px;
	}
	.tree-item-wrapper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}
	.edit-source-btn {
		opacity: 1; /* Always visible as per user request */
		padding: 2px 4px !important;
		width: auto !important;
		font-size: 0.7rem !important;
		background: rgba(255, 255, 255, 0.1) !important;
		border-radius: 4px;
	}
	.tree-item-left {
		display: flex;
		align-items: center;
		flex: 1;
	}
	.edit-inline-btn {
		display: none; /* Removed as per user request */
	}
</style>
