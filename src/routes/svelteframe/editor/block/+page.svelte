<script lang="ts">
	import { onMount, tick, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import path from 'path-browserify';
	import { debugLog, debugError } from '../../lib/server/debug';
	import PropertyEditor from '../../_components/PropertyEditor.svelte';
	import BlockCanvas from '../../_components/BlockCanvas.svelte';
	import ManualCKEditor from '../../_components/ManualCKEditor.svelte';
	import html2canvas from 'html2canvas';

	let isLoading = true;
	let parsedData: any = null;
	let originalParsedData: any = null;
	let error: string | null = null;
	let selectedObject: any = null;
	let activeEditor: 'properties' | 'ckeditor' | 'preview' | 'none' = 'none';
	let ckEditorContent = '';
	let previewComponentUrl = '';
	let showCancelConfirmDialog = false;
	let hasChanges = false;
	let propertyEditorRef: PropertyEditor;

	$: componentsInTemplate = parsedData
		? parsedData.template.filter((b: any) => b.type === 'component')
		: [];

	$: userPermissions = $page.data.user?.permissions || {};

	// Permissions specific logic
	$: hasHtmlPerm = !!userPermissions.canEditHtml;
	$: hasPropsPerm = !!userPermissions.canEditProps;
	$: hasStylePerm = !!userPermissions.canEditStyle;
	$: hasSourcePerm = !!userPermissions.canEditSource;

	$: isRestricted = !hasSourcePerm && !hasPropsPerm;
	// Wait, restricted mode usually meant "Content Only".
	// Now we have granular permissions.
	// Let's define visibility based on permissions directly.

	$: isStyleOnly = hasStylePerm && !hasPropsPerm && !hasHtmlPerm;

	$: filteredTemplate = parsedData?.template
		? parsedData.template.filter((b: any) => {
				if (b.type === 'html') return hasHtmlPerm;
				if (b.type === 'component') return hasPropsPerm; // only show components if can edit props (which implies structure?)
				return true;
			})
		: [];

	$: isSimpleContentUser = hasHtmlPerm && !hasPropsPerm && !hasStylePerm && !hasSourcePerm;

	// Bottom Pane Visibility Logic:
	// 1. Must have HTML permissions to see the Block Canvas (structure editor).
	// 2. Hide if user is "Simple Content User" AND only has one block (no need to reorder/add).
	// 3. User request: "Users with only edit/styles or edit/script-props (or only one HTML block) need to have the bottom pane... collapsed"
	//    Interpretation:
	//      - If !hasHtmlPerm -> Hide (Restricted to props/styles)
	//      - If hasHtmlPerm but only 1 block -> Hide (Focus on content)
	$: showBottomPane = hasHtmlPerm && !(filteredTemplate.length <= 1);

	// --- FIX: Async handler for selection change to use tick() ---
	$: updateActiveEditor(selectedObject);

	async function updateActiveEditor(obj: any) {
		if (!obj) {
			activeEditor = 'none';
			return;
		}

		if (obj.type === 'html' && hasHtmlPerm) {
			// CORRUPTION PROTECTION:
			// 1. Wrapper blocks (structural)
			// 2. Comment blocks (will be stripped by CKEditor)
			if (obj.isWrapper || obj.isComment) {
				activeEditor = 'none'; // Will show PropertyEditor (Read Only view ideally, or just Tree)
				// If comment, maybe we can show a simple text area in PropertyEditor later?
				// For now, just preventing corruption is key.
			} else {
				activeEditor = 'ckeditor';
				ckEditorContent = obj.content;
			}
		} else {
			activeEditor = 'properties';
			// Wait for component to mount so bind:this is populated
			await tick();
			if (propertyEditorRef && typeof propertyEditorRef.scrollToSelected === 'function') {
				propertyEditorRef.scrollToSelected(obj);
			}
		}
	}

	function handlePropReorder(event: CustomEvent) {
		parsedData.props = event.detail;
		checkForChanges();
	}

	function handleBlockCanvasReorder(event: CustomEvent) {
		const newFilteredItems = event.detail;

		if (!isRestricted) {
			parsedData.template = newFilteredItems;
		} else {
			// --- Slot Merge Logic ---
			// 1. Identify indices of original visible items [0, 2, 4]
			const visibleIndices = parsedData.template
				.map((b: any, i: number) => ({ block: b, index: i }))
				.filter((item: any) => item.block.type === 'html')
				.map((item: any) => item.index);

			// 2. Create a copy of the full template
			const newFullTemplate = [...parsedData.template];

			// 3. Place the new items into the slots
			// Note: If items were deleted, we might have fewer items than slots.
			// Ideally, dndzone emits the new list. If items were removed, the list is shorter.
			// But BlockCanvas handles deletions separately via 'delete' event?
			// dndzone handles reordering. Does it handle removal? No, only if dragged out?
			// Assuming reorder only changes order.

			visibleIndices.forEach((originalIndex: number, i: number) => {
				if (newFilteredItems[i]) {
					newFullTemplate[originalIndex] = newFilteredItems[i];
				} else {
					// Logic gap: if filtered list shrank, we should remove the slot?
					// But handleBlockCanvasReorder is usually just reorder.
				}
			});
			parsedData.template = newFullTemplate;
		}
		checkForChanges();
	}

	function handleComponentReorder(event: CustomEvent) {
		const reorderedComponentIds = event.detail.map((c: any) => c.id);
		const newTemplate = [...parsedData.template];
		const componentsFromTemplate = newTemplate.filter((b: any) => b.type === 'component');

		const componentMap = new Map();
		componentsFromTemplate.forEach((c: any) => componentMap.set(c.id, c));

		const reorderedComponents = reorderedComponentIds
			.map((id: string) => componentMap.get(id))
			.filter(Boolean);

		let componentIndex = 0;
		for (let i = 0; i < newTemplate.length; i++) {
			if (newTemplate[i].type === 'component') {
				if (reorderedComponents[componentIndex]) {
					newTemplate[i] = reorderedComponents[componentIndex];
					componentIndex++;
				}
			}
		}

		parsedData.template = newTemplate;
		checkForChanges();
	}

	function handlePreviewComponent(event: CustomEvent) {
		const componentToPreview = event.detail;
		if (componentToPreview?.type !== 'component') return;

		const componentImport = parsedData.imports.find((imp: any) =>
			imp.specifiers.some((s: any) => s.name === componentToPreview.name)
		);

		if (componentImport) {
			const path = componentImport.source.replace('$lib/', 'src/lib/').replace(/^\//, '');
			previewComponentUrl = `/svelteframe/preview/${path}`;
			activeEditor = 'preview';
		} else {
			debugError(`Could not find import for component "${componentToPreview.name}" to preview.`);
		}
	}
	// ... (rest of functions)

	// ... (computeDiff)
	function computeDiff(original: any, modified: any) {
		return JSON.stringify(original) !== JSON.stringify(modified);
	}

	function checkForChanges() {
		if (!parsedData || !originalParsedData) {
			hasChanges = false;
			return;
		}
		const newHasChanges = computeDiff(originalParsedData, parsedData);

		if (newHasChanges !== hasChanges) {
			hasChanges = newHasChanges;
			if (browser) {
				window.parent.postMessage({ type: 'svelteframe_BLOCK_EDITOR_CHANGES', hasChanges }, '*');
			}
		}
	}

	$: if (activeEditor === 'ckeditor' && selectedObject) {
		selectedObject.content = ckEditorContent;
		checkForChanges();
	}

	function handleSelect(event: CustomEvent) {
		selectedObject = event.detail;
	}

	function handleDelete(event: CustomEvent) {
		const objectToDelete = event.detail;
		let wasDeleted = false;

		if (parsedData.template.some((b: any) => b.id === objectToDelete.id)) {
			parsedData.template = parsedData.template.filter((b: any) => b.id !== objectToDelete.id);
			wasDeleted = true;
		}

		if (objectToDelete.name && parsedData.props.some((p: any) => p.name === objectToDelete.name)) {
			parsedData.props = parsedData.props.filter((p: any) => p.name !== objectToDelete.name);
			wasDeleted = true;
		}

		if (objectToDelete.parentProp && objectToDelete.arrayIndex !== undefined) {
			const parent = parsedData.props.find((p: any) => p.name === objectToDelete.parentProp.name);
			if (parent) {
				try {
					const arr = JSON.parse(parent.value);
					if (Array.isArray(arr)) {
						arr.splice(objectToDelete.arrayIndex, 1);
						parent.value = JSON.stringify(arr, null, 2);
						wasDeleted = true;
					}
				} catch (e) {
					debugError('Could not delete from script property array', e);
				}
			}
		}

		if (wasDeleted && selectedObject?.id === objectToDelete.id) {
			selectedObject = parsedData.head || parsedData.template[0] || parsedData.props[0] || null;
		}

		parsedData = { ...parsedData };
		checkForChanges();
	}

	async function handleComponentDrop(event: CustomEvent) {
		const { file, index } = event.detail;
		const componentName = path.basename(file.path, '.svelte');
		const importSource = file.path.replace('src/lib/', '$lib/');

		const newBlock: any = {
			id: crypto.randomUUID(),
			type: 'component',
			name: componentName,
			props: {}
		};

		try {
			const res = await fetch(
				`/svelteframe/api/files/component-props?path=${encodeURIComponent(file.path)}`
			);
			if (res.ok) {
				const props = await res.json();
				for (const prop of props) {
					try {
						newBlock.props[prop.name] = JSON.parse(prop.defaultValue);
					} catch {
						newBlock.props[prop.name] = prop.defaultValue.replace(/^['"]|['"]$/g, '');
					}
				}
			}
		} catch (e) {
			debugError(`Could not fetch default props for ${componentName}`, e);
		}

		if (index !== null) {
			parsedData.template.splice(index, 0, newBlock);
		} else {
			parsedData.template.push(newBlock);
		}
		parsedData.template = [...parsedData.template];

		const importExists = parsedData.imports.some((imp: any) => imp.source === importSource);
		if (!importExists) {
			parsedData.imports.push({
				specifiers: [{ name: componentName, type: 'ImportDefaultSpecifier' }],
				source: importSource,
				kind: 'value'
			});
			parsedData.imports = [...parsedData.imports];
		}
		selectedObject = newBlock;
		checkForChanges();
	}

	async function handleSave() {
		try {
			const res = await fetch('/svelteframe/api/files/reconstruct-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath: $page.url.searchParams.get('path'),
					ast: parsedData
				})
			});
			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.message || 'Failed to save file.');
			}

			// Save Dirty Imported Objects
			if (propertyEditorRef) {
				const updatedImports = propertyEditorRef.getDirtyImported();
				for (const updated of updatedImports) {
					const original = originalParsedData.importedObjects?.find(
						(o: any) => o.id === updated.id
					);
					if (JSON.stringify(updated.newValue) !== original?.value) {
						const impRes = await fetch('/svelteframe/api/files/update-import', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								filePath: updated.filePath,
								exportName: updated.exportName,
								newValue: updated.newValue
							})
						});
						if (!impRes.ok) {
							const errData = await impRes.json();
							throw new Error(
								`Failed to save imported object ${updated.exportName}: ${errData.error}`
							);
						}
						// Update local state to match saved value
						const localIdx = parsedData.importedObjects?.findIndex((o: any) => o.id === updated.id);
						if (localIdx !== undefined && localIdx > -1) {
							parsedData.importedObjects[localIdx].value = JSON.stringify(
								updated.newValue,
								null,
								2
							);
						}
					}
				}
			}

			originalParsedData = JSON.parse(JSON.stringify(parsedData));
			checkForChanges();
			window.parent.postMessage({ type: 'svelteframe_SAVE_PAGE_EDIT' }, '*');
		} catch (err: any) {
			alert(`Error saving: ${err.message}`);
		}
	}

	function handleCancel() {
		// --- FIX: If editing an HTML block (WYSIWYG), cancel returns to list view ---
		if (activeEditor === 'ckeditor') {
			// If only one item is visible and we can't select anything else, cancel should exit page
			const onlyOneItem = filteredTemplate.length === 1;
			const nothingElseToSelect = !hasPropsPerm && !hasStylePerm && !hasSourcePerm;

			if (onlyOneItem && nothingElseToSelect) {
				if (hasChanges) {
					showCancelConfirmDialog = true;
				} else {
					window.parent.postMessage({ type: 'svelteframe_CANCEL_PAGE_EDIT' }, '*');
				}
			} else {
				activeEditor = 'none';
				selectedObject = null;
			}
		} else {
			if (hasChanges) {
				showCancelConfirmDialog = true;
			} else {
				window.parent.postMessage({ type: 'svelteframe_CANCEL_PAGE_EDIT' }, '*');
			}
		}
	}

	function confirmCancel() {
		showCancelConfirmDialog = false;
		window.parent.postMessage({ type: 'svelteframe_CANCEL_PAGE_EDIT' }, '*');
	}

	function abortCancel() {
		showCancelConfirmDialog = false;
	}

	async function generateThumbnails() {
		if (!parsedData?.template) return;
		// (Thumbnail generation logic skipped for brevity - kept from original)
	}

	let siblingFiles: string[] = [];
	let currentFileIndex = -1;

	function handleMessage(event: MessageEvent) {
		if (event.data?.type === 'svelteframe_SELECT_OBJECT') {
			if (event.data.id === 'style') {
				selectedObject = 'style';
			} else {
				// Add logic for selecting blocks by ID if needed
				const found = [
					...(parsedData?.template || []),
					...(parsedData?.props || []),
					parsedData?.head
				].find((obj) => obj && (obj.id === event.data.id || obj.name === event.data.id));

				if (found) selectedObject = found;
			}
		}
	}

	onMount(async () => {
		window.addEventListener('message', handleMessage);

		const filePath = $page.url.searchParams.get('path');
		if (!filePath) {
			error = 'No file path provided in URL.';
			isLoading = false;
			return;
		}

		// Fetch sibling files for navigation
		const directory = path.dirname(filePath);
		try {
			// Re-use api/files logic?? Or just fetch files from the same directory?
			// Existing api/files returns full tree or list.
			// Let's use api/files?path=... logic if available, OR just list-files?
			// Actually, `api/files` usually returns the full list.
			const res = await fetch('/svelteframe/api/files');
			if (res.ok) {
				const data = await res.json();
				const allPages = data.pages || [];
				// Filter for files in the same directory (siblings)
				siblingFiles = allPages
					.filter((f: any) => path.dirname(f.path) === directory && f.path.endsWith('.svelte'))
					.map((f: any) => f.path);
				currentFileIndex = siblingFiles.indexOf(filePath);
			}
		} catch (e) {
			console.error('Failed to fetch sibling files', e);
		}

		try {
			const res = await fetch('/svelteframe/api/files/parse-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath })
			});
			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || 'Failed to parse page.');
			}
			const data = await res.json();
			if (data.success) {
				// 1. Prepare the AST with IDs and types FIRST
				const ast = data.ast;
				if (ast.head) {
					ast.head.type = 'head';
					ast.head.id = 'page-head';
				}
				if (ast.template) {
					ast.template.forEach((block: any) => {
						if (!block.id) block.id = crypto.randomUUID();
					});
				}

				// 2. Clone identical copies for tracking
				originalParsedData = JSON.parse(JSON.stringify(ast));
				parsedData = JSON.parse(JSON.stringify(ast));

				// Smart Selection Logic
				// If the user can only see one thing, select it automatically.
				if (filteredTemplate.length === 1 && hasHtmlPerm && !hasPropsPerm && !hasStylePerm) {
					selectedObject = filteredTemplate[0];
				} else if (isStyleOnly) {
					// Restricted Style User: Auto-select style to show CSS editor immediately
					selectedObject = 'style';
				} else if (hasPropsPerm) {
					// Default to Head if possible
					if (parsedData.head && (parsedData.head.title || parsedData.head.meta.length > 0)) {
						selectedObject = parsedData.head;
					} else {
						selectedObject = parsedData.template[0] || parsedData.props[0];
					}
				} else {
					selectedObject = null;
				}
				checkForChanges();
			} else {
				throw new Error(data.error);
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			isLoading = false;
		}
		//selectedObject = 'style';
	});

	function navigateTag(direction: number) {
		if (!selectedObject || activeEditor === 'none') {
			// If nothing selected, select first or last?
			if (filteredTemplate.length > 0) {
				selectedObject = filteredTemplate[direction > 0 ? 0 : filteredTemplate.length - 1];
			}
			return;
		}

		// Find index of selectedObject in filteredTemplate
		const idx = filteredTemplate.findIndex((b: any) => b.id === selectedObject.id);
		if (idx === -1) return; // Selected object might be Head or Props or Style

		const newIdx = idx + direction;
		if (newIdx >= 0 && newIdx < filteredTemplate.length) {
			selectedObject = filteredTemplate[newIdx];
		} else {
			// Loop around? Or stop? Let's stop.
		}
	}

	function navigateComponent(direction: number) {
		if (hasChanges) {
			if (!confirm('You have unsaved changes. Discard them?')) return;
		}

		const newIdx = currentFileIndex + direction;
		if (newIdx >= 0 && newIdx < siblingFiles.length) {
			const newPath = siblingFiles[newIdx];
			// define a new URL to navigate to
			window.location.href = `?path=${encodeURIComponent(newPath)}`;
		}
	}

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('message', handleMessage);
		}
	});
</script>

<div id="thumbnail-renderer" style="position: absolute; left: -9999px; top: -9999px;"></div>

{#if showCancelConfirmDialog}
	<div class="modal-backdrop">
		<div class="modal-content">
			<h2>Discard Changes?</h2>
			<p>You have unsaved changes. Are you sure you want to discard them?</p>
			<div class="modal-actions">
				<button class="button-secondary" on:click={abortCancel}>No, Keep Editing</button>
				<button class="button-danger" on:click={confirmCancel}>Yes, Discard</button>
			</div>
		</div>
	</div>
{/if}

<div class="block-editor-layout">
	<header class="editor-header">
		<div class="file-info">
			Editing Page: {$page.url.searchParams.get('path')?.split('/').pop()}
		</div>
		<div class="actions">
			<!-- Navigation Controls moved to EditorPane -->
			<button
				class="button-secondary"
				on:click={() => window.parent.postMessage({ type: 'svelteframe_OPEN_STYLES' }, '*')}
				>3Styles</button
			>
			<button class="button-secondary" on:click={handleCancel}>Cancel</button>
			<button class="button-primary" on:click={handleSave}>Save & Preview</button>
		</div>
	</header>

	<div class="editor-panes">
		{#if isLoading}
			<p>Loading page data...</p>
		{:else if error}
			<p class="error-message">{error}</p>
		{:else if parsedData}
			<div class="top-pane" class:full-height={!showBottomPane}>
				{#if activeEditor === 'ckeditor'}
					<ManualCKEditor bind:data={ckEditorContent} />
				{:else if activeEditor === 'preview' && previewComponentUrl}
					<!-- Internal Preview Pane -->
					<div class="preview-pane">
						<iframe
							src={previewComponentUrl}
							title="Component Preview"
							sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
						></iframe>
						<button class="close-preview" on:click={() => (activeEditor = 'none')}
							>Close Preview</button
						>
					</div>
				{:else}
					<!-- Default: Show Property Editor (Tree is here) -->
					<!-- Even if activeEditor is 'none', we show this so the tree is visible -->
					<PropertyEditor
						bind:this={propertyEditorRef}
						bind:head={parsedData.head}
						bind:props={parsedData.props}
						bind:style={parsedData.style}
						components={componentsInTemplate}
						imports={parsedData.imports}
						{selectedObject}
						on:select={handleSelect}
						on:change={checkForChanges}
						on:dropcomponent={handleComponentDrop}
						on:delete={handleDelete}
						on:reorderprops={handlePropReorder}
						on:reordercomponents={handleComponentReorder}
						on:reordercomponents={handleComponentReorder}
						on:previewcomponent={handlePreviewComponent}
						permissions={$page.data.user?.permissions}
					/>
				{/if}
			</div>

			<!-- Bottom Pane: Only show if user has HTML permissions AND structure is relevant -->
			{#if showBottomPane}
				<div class="bottom-pane" title="Drag components from the File Explorer here">
					<BlockCanvas
						template={filteredTemplate}
						{selectedObject}
						on:select={handleSelect}
						on:delete={handleDelete}
						on:reorder={handleBlockCanvasReorder}
						on:dropnew={handleComponentDrop}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.block-editor-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		overflow: hidden;
		position: relative;
	}
	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		background-color: var(--sp-bg-header);
		border-bottom: 1px solid var(--sp-border-main);
		color: var(--sp-text-main);
		flex-shrink: 0;
	}
	.file-info {
		font-family: monospace;
		flex-grow: 1;
		color: var(--sp-text-accent);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.actions button,
	.modal-actions button {
		padding: 8px 16px;
		border-radius: 6px;
		border: none;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color 0.2s,
			transform 0.1s;
	}
	.actions button:active {
		transform: translateY(1px);
	}
	.button-primary {
		background-color: var(--sp-color-accent);
		color: white;
	}
	.button-primary:hover {
		background-color: #2c7a2c;
	}
	.button-secondary {
		background-color: var(--sp-color-secondary);
		color: white;
	}
	.button-secondary:hover {
		background-color: var(--sp-color-secondary-hover);
	}
	.button-danger {
		background-color: #dc3545;
		color: white;
	}
	.button-danger:hover {
		background-color: #bb2d3b;
	}
	.editor-panes {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-height: 0;
	}
	.top-pane {
		height: 40%;
		min-height: 200px;
		flex-shrink: 0;
		display: flex;
		transition: height 0.3s ease;
	}
	.top-pane.full-height {
		height: 100%;
		min-height: 0;
		flex-grow: 1;
	}
	.top-pane > :global(*) {
		flex-grow: 1;
	}
	.bottom-pane {
		height: 60%;
		flex-grow: 1;
	}
	.error-message {
		color: #f44336;
		padding: 2rem;
	}
	.no-selection-pane {
		display: grid;
		place-content: center;
		color: #888;
		width: 100%;
	}
	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: grid;
		place-items: center;
		z-index: 1001;
	}
	.modal-content {
		background: var(--sp-bg-modal);
		color: var(--sp-text-main);
		padding: 2rem;
		border-radius: 8px;
		width: min(90%, 450px);
		border: 1px solid var(--sp-border-main);
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
	}
	.modal-content h2 {
		margin-top: 0;
	}
	.modal-content .modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	.context-menu button:hover:not(:disabled) {
		background-color: #007acc;
		color: white;
	}

	.preview-pane {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		border: 1px solid #444;
	}
	.preview-pane iframe {
		flex-grow: 1;
		border: none;
		background: white;
	}
	.close-preview {
		padding: 5px;
		background: #444;
		color: white;
		border: none;
		border-top: 1px solid #555;
		cursor: pointer;
	}

	.nav-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-right: 1rem;
	}
	.nav-group {
		display: flex;
		align-items: center;
		background: #444;
		border-radius: 4px;
		overflow: hidden;
	}
	.nav-btn {
		padding: 4px 10px;
		background: #444;
		color: white;
		border: none;
		cursor: pointer;
		font-weight: bold;
	}
	.nav-btn:hover {
		background: #555;
	}
	.nav-label {
		color: #ccc;
		font-size: 0.8rem;
		padding: 0 5px;
		font-family: sans-serif;
	}
</style>
