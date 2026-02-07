<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { page } from '$app/stores';
	import EditObjectTree from './EditObjectTree.svelte';
	import EditPropertyTree from './EditPropertyTree.svelte';
	import EditCSS from './EditCSS.svelte';
	import AddPropertyModal from './AddPropertyModal.svelte';
	import FilePicker from './FilePicker.svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';

	export let head: any = null;
	export let props: any[] = [];
	export let components: any[] = [];
	export let imports: any[] = [];
	export let importedObjects: any[] = [];
	export let style: string = '';
	export let selectedObject: any = null;
	export let permissions = {
		canEditHtml: true,
		canEditProps: true,
		canEditStyle: true
	};
	export let onlyStyle = false;

	export let filePath = ''; // Add filePath prop
	export let externalSelectedId: string | null = null;
	export let isInitialized = false;
	export let user: any = null; // NEW: Passed from parent (EditorPane -> FloatingProperties)
	let lastPath = '';

	const dispatch = createEventDispatcher();
	let originalPropsSnapshot: string = ''; // Serialized snapshot
	let hasLocalChanges = false;

	// --- Internal Working State ---
	let workingProps: any[] = [];
	let workingImportedObjects: any[] = [];
	let relinkKey = 0;

	$: if (props !== undefined && isInitialized) {
		// If we just loaded a component like BoardOfDirectors,
		// try to auto-select the main data array if nothing is selected.
		if (!selectedObject) {
			const mainData = workingProps.find(
				(p) =>
					p.name.toLowerCase().includes('members') ||
					p.name.toLowerCase().includes('items') ||
					p.name.toLowerCase().includes('data')
			);
			if (mainData) {
				selectedObject = mainData;
			}
		}
	}

	// Buffer initialization logic - runs whenever data or path changes
	$: if (props !== undefined && importedObjects !== undefined && filePath) {
		if (filePath !== lastPath) {
			console.log('[PropertyEditor] 📁 File path changed, resetting buffers:', filePath);
			isInitialized = false;
			lastPath = filePath;
		}

		if (!isInitialized) {
			console.log('[PropertyEditor] 🔄 Initializing buffers for:', filePath);
			// 1. Clear and Remap Props
			const nextWorkingProps = props.map((p) => {
				try {
					const val = JSON.parse(p.value);
					return {
						...p,
						id: p.name,
						_parsed: val,
						isObject: val !== null && typeof val === 'object'
					};
				} catch {
					return { ...p, id: p.name, _parsed: p.value, isObject: false };
				}
			});

			// 2. Clear and Remap Imported Objects
			const nextImported = importedObjects.map((io) => {
				try {
					const val = JSON.parse(io.value);
					return {
						...io,
						_parsed: val,
						isObject: typeof val === 'object' && val !== null,
						type: 'imported-object'
					};
				} catch (e) {
					return { ...io, _parsed: io.value, isObject: false, type: 'imported-object' };
				}
			});

			// 3. Sync from Active Component (Priority)
			const activeId = externalSelectedId || $page.url.searchParams.get('activeId');
			if (activeId) {
				const activeMatch = [...nextImported, ...nextWorkingProps, ...components].find(
					(obj) => (obj.id || obj.name) === activeId
				);
				if (activeMatch) {
					console.log('[PropertyEditor] 🎯 Pre-selecting active component:', activeId);
					selectedObject = activeMatch;
				}
			}

			// Re-link selection if we have one but data changed
			if (selectedObject && !activeId) {
				const currentId = selectedObject.id || selectedObject.name;
				const freshMatch = [...nextImported, ...nextWorkingProps, ...components].find(
					(obj) => (obj.id || obj.name) === currentId
				);
				if (freshMatch) {
					console.log('[PropertyEditor] ✅ Re-linked selection:', currentId);
					selectedObject = freshMatch;
				} else {
					console.warn('[PropertyEditor] ⚠️ Could not re-link selection:', currentId);
				}
			}

			// Auto-select first available item if nothing is selected or re-link failed
			if (
				!selectedObject ||
				![...nextImported, ...nextWorkingProps, ...components].some((obj) => obj === selectedObject)
			) {
				const firstItem = nextImported[0] || nextWorkingProps[0];
				if (firstItem) {
					console.log(
						'[PropertyEditor] 🎯 Auto-selecting first item:',
						firstItem.name || firstItem.id
					);
					selectedObject = firstItem;
				}
			}

			workingProps = nextWorkingProps;
			workingImportedObjects = nextImported;
			isInitialized = true;
			relinkKey++;
		}
	}

	// Logic to support "Only Style" mode used by restricted permissions or direct invocation
	$: if (onlyStyle && selectedObject !== 'style') {
		selectedObject = 'style';
	}
	// Initialize snapshot when component is ready or filePath changes
	$: if (isInitialized && !originalPropsSnapshot) {
		originalPropsSnapshot = JSON.stringify(props);
	}

	// Logic to check if we are different from original
	$: {
		if (isInitialized && originalPropsSnapshot) {
			const current = JSON.stringify(props);
			hasLocalChanges = current !== originalPropsSnapshot;
		}
	}

	function handleSaveClick() {
		dispatch('saveAll');
		// Update snapshot so the "Save" button disappears until next change
		originalPropsSnapshot = JSON.stringify(props);
	}

	function handleCloseClick() {
		if (hasLocalChanges) {
			if (confirm('You have unsaved changes. Discard them and revert to original values?')) {
				// Revert local state
				const reverted = JSON.parse(originalPropsSnapshot);
				props = reverted;
				// Notify parent to revert the iframe/AST
				dispatch('change', { props: reverted });
				dispatch('close');
			}
		} else {
			dispatch('close');
		}
	}

	function notifyChange() {
		// Serialize back to props
		const updatedProps = workingProps.map((wp) => {
			return { ...wp, value: JSON.stringify(wp._parsed, null, 0) };
		});
		props = updatedProps;
		//console.log('notifyChange', props);
		dispatch('change', { props: updatedProps });
	}

	export function getDirtyImported() {
		const clean = workingImportedObjects.map((io) => ({
			id: io.id,
			filePath: io.path,
			exportName: io.name,
			newValue: JSON.parse(JSON.stringify(io._parsed))
		}));
		return clean;
	}

	export function scrollToSelected(obj: any) {
		// Pass through if we implemented tree scrolling, for now just select it
		selectedObject = obj;
	}

	// --- Modals & File Picking ---
	let showAddPropertyModal = false;
	let showFilePicker = false;
	let filePickerType: 'any' | 'image' = 'any';
	let initialFilePickerPath = '';
	let activeFileCallback: ((path: string) => void) | null = null;
	let showContextMenu = false;
	let contextObject: any = null;
	let menuX = 0;
	let menuY = 0;

	let filePickerBasePath = '';
	let filePickerRestrictTo = '';

	function handleFileRequest(e: CustomEvent) {
		const { obj, key } = e.detail;
		initialFilePickerPath = obj[key] || '';

		const keyLower = key.toString().toLowerCase();
		if (keyLower === 'href') {
			filePickerType = 'any';
			filePickerBasePath = 'site/src/routes';
		} else if (keyLower === 'src' || keyLower === 'img' || keyLower.includes('imagesrc')) {
			filePickerType = 'image';
			filePickerBasePath = 'site/static';
		} else {
			filePickerType = 'any';
			filePickerBasePath = '';
		}

		console.log(
			`[PropertyEditor] 📁 File requested for ${key}. Type: ${filePickerType}, Base: ${filePickerBasePath}`
		);

		activeFileCallback = (path) => {
			console.log(`[PropertyEditor] 🎯 Applying path before cleaning: ${path} to ${key}`);

			let finalPath = path;
			const keyLower = key.toString().toLowerCase();
			if (keyLower === 'href') {
				// Clean: site/src/routes/about/+page.svelte -> /about
				finalPath = path
					.replace(/^site\/src\/routes/, '')
					.replace(/^src\/routes/, '')
					.replace(/\/+page\.svelte$/, '')
					.replace(/\.svelte$/, '');

				if (finalPath === '') finalPath = '/';
				if (!finalPath.startsWith('/')) finalPath = '/' + finalPath;
				console.log(`[PropertyEditor] ✨ Cleaned href path: ${finalPath}`);
			}

			obj[key] = finalPath;

			// Force Svelte to notice the change in the nested object
			if (selectedObject && selectedObject._parsed === obj) {
				selectedObject._parsed = selectedObject._parsed;
			} else if (selectedObject && selectedObject.props === obj) {
				selectedObject.props = selectedObject.props;
			}

			notifyChange();
			relinkKey++; // Trigger UI refresh
		};
		showFilePicker = true;
	}

	function handleFileSelected(e: CustomEvent) {
		if (activeFileCallback) {
			activeFileCallback(e.detail);
			// Force update if needed?
			workingProps = [...workingProps];
			notifyChange();
		}
		showFilePicker = false;
	}

	function handleNavigate(e: CustomEvent) {
		const name = e.detail.name;
		// Find in props or imports
		const target =
			workingProps.find((p) => p.name === name) ||
			workingImportedObjects.find((i) => i.name === name);
		if (target) {
			selectedObject = target;
			dispatch('select', target);
		} else {
			alert(`Property '${name}' not found in script.`);
		}
	}

	// --- Events from Object Tree ---
	function handleSelect(e: CustomEvent) {
		selectedObject = e.detail;
		dispatch('select', selectedObject);
	}

	function handlePropReorder(e: CustomEvent) {
		workingProps = e.detail;
		notifyChange();
	}

	function handleComponentReorder(e: CustomEvent) {
		dispatch('reordercomponents', e.detail);
	}

	function handleCSSChange(e: CustomEvent) {
		style = e.detail.style;
		dispatch('change');
	}

	onMount(() => {
		const hideMenu = () => (showContextMenu = false);
		window.addEventListener('click', hideMenu);

		// Workaround for selection initialization race conditions
		// Wait for a short delay after mount to ensure AST data has settled and buffers initialized
		setTimeout(() => {
			if (selectedObject && isInitialized) {
				const currentId = selectedObject.id || selectedObject.name;
				console.log('[PropertyEditor] ⏱️ Post-mount selection check for:', currentId);
				const freshMatch = [...workingImportedObjects, ...workingProps].find(
					(obj) => (obj.id || obj.name) === currentId
				);
				if (freshMatch && selectedObject !== freshMatch) {
					console.log('[PropertyEditor] ✅ Post-mount re-linked selection:', currentId);
					selectedObject = freshMatch;
					relinkKey++;
				}
			}
		}, 300);

		return () => window.removeEventListener('click', hideMenu);
	});
</script>

<!-- MODALS -->
{#if showAddPropertyModal}
	<AddPropertyModal
		{imports}
		on:close={() => (showAddPropertyModal = false)}
		on:add={(e) => {
			const { name, type, isArray } = e.detail;
			let val = isArray ? [] : type === 'number' ? 0 : type === 'boolean' ? false : '';
			workingProps = [
				...workingProps,
				{
					name,
					value: JSON.stringify(val),
					id: name,
					_parsed: val,
					isObject: typeof val === 'object'
				}
			];
			notifyChange();
		}}
	/>
{/if}

{#if showFilePicker}
	<FloatingToolWindow
		title={filePickerType === 'image' ? 'Select Image' : 'Select Path'}
		visible={true}
		width={700}
		height={600}
		initialX={250}
		initialY={100}
		zIndex={5000}
		on:close={() => (showFilePicker = false)}
	>
		<FilePicker
			on:close={() => (showFilePicker = false)}
			on:select={handleFileSelected}
			type={filePickerType}
			initialPath={initialFilePickerPath}
			basePath={filePickerBasePath}
			restrictTo={filePickerRestrictTo}
			{user}
		/>
	</FloatingToolWindow>
{/if}

<div class="property-editor-wrapper">
	{#if permissions.canEditProps && !onlyStyle}
		<div class="pane-column tree-column">
			<header class="pane-header"><h4>Object Tree</h4></header>
			<!-- Add Property Button could go here or in context menu -->
			<div class="pane-scrollable">
				<EditObjectTree
					{head}
					props={workingProps}
					{components}
					importedObjects={workingImportedObjects}
					{selectedObject}
					{permissions}
					on:select={handleSelect}
					on:reorderprops={handlePropReorder}
					on:reordercomponents={handleComponentReorder}
					on:editComponent={(e) => {
						console.log('[PropertyEditor] editComponent event caught1', e.detail);
						dispatch('editComponent', e.detail);
					}}
					on:editContent={(e) => {
						console.log('[PropertyEditor] editContent event caught2', e.detail);
						dispatch('editContent', e.detail);
					}}
				/>
				<div style="padding: 10px; text-align: center;">
					<button class="small-btn" on:click={() => (showAddPropertyModal = true)}
						>+ Add Property</button
					>
				</div>
			</div>
		</div>
	{/if}

	<div class="pane-column grid-column">
		<header class="pane-header">
			<h4>{selectedObject === 'style' ? 'Styles' : 'Properties'}</h4>
		</header>
		<div class="pane-scrollable property-scroller">
			{#key relinkKey}
				{#if selectedObject && isInitialized}
					{#if selectedObject === 'style' || selectedObject.type === 'style'}
						<EditCSS {style} on:change={handleCSSChange} />
					{:else}
						<EditPropertyTree
							{selectedObject}
							{permissions}
							on:change={notifyChange}
							on:fileRequest={handleFileRequest}
							on:navigatetoprop={handleNavigate}
						/>
					{/if}
				{:else if props === undefined || importedObjects === undefined}
					<p class="no-selection">Loading properties...</p>
				{:else}
					<p class="no-selection">Select an item from the tree to edit its properties.</p>
				{/if}
			{/key}
		</div>
	</div>
</div>

<div class="editor-footer">
	<button class="footer-btn secondary" on:click={handleCloseClick}>
		{hasLocalChanges ? 'Cancel & Revert' : 'Close'}
	</button>

	{#if hasLocalChanges}
		<button class="footer-btn primary" on:click={handleSaveClick}> Save All Changes </button>
	{/if}
</div>

<style>
	.editor-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 12px 1rem;
		background: var(--sp-bg-header);
		border-top: 1px solid var(--sp-border-main);
		flex-shrink: 0;
	}

	.footer-btn {
		padding: 8px 20px;
		border-radius: 4px;
		border: none;
		font-weight: 600;
		cursor: pointer;
		font-size: 13px;
		transition: opacity 0.2s;
	}

	.footer-btn.primary {
		background: var(--sp-color-primary);
		color: white;
	}

	.footer-btn.secondary {
		background: var(--sp-color-secondary);
		color: white;
	}

	.footer-btn:hover {
		opacity: 0.9;
	}
	.property-editor-wrapper {
		display: flex;
		flex: 1;
		height: 100%;
		width: 100%;
		background-color: var(--sp-bg-sidebar);
		overflow: hidden;
		min-height: 0;
	}
	.pane-column {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.tree-column {
		flex: 0 0 280px;
		border-right: 1px solid var(--sp-border-main);
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.grid-column {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}
	.pane-header {
		background-color: var(--sp-bg-header);
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--sp-border-main);
	}
	.pane-header h4 {
		margin: 0;
		color: var(--sp-text-main);
		font-size: 0.85rem;
		text-transform: uppercase;
	}
	.pane-scrollable {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overflow-x: auto;
		min-height: 0;
	}
	/* Ensure children fill the height if they are flex containers */
	.pane-scrollable > :global(*) {
		/* Only flex the large children, not small buttons */
		flex: 0.05;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.tree-column .pane-scrollable {
		/* Specific to tree column to ensure internal elements pack correctly */
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		overflow: hidden; /* The internal tree container will scroll */
	}
	.tree-column :global(.tree-container) {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.small-btn {
		font-size: 0.8rem;
		padding: 4px 8px;
		cursor: pointer;
		background: var(--sp-color-secondary, #444);
		color: white;
		border: none;
		border-radius: 4px;
	}
	.no-selection {
		padding: 2rem;
		color: #888;
		font-style: italic;
		text-align: center;
	}
</style>
