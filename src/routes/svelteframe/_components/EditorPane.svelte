<script lang="ts">
	import { onMount, tick, createEventDispatcher } from 'svelte';
	import { page } from '$app/stores';
	import { debugError, debugLog, debugWarn } from '../lib/server/debug';
	import path from 'path-browserify';

	// Floating Tools
	import FloatingCSS from './FloatingCSS.svelte';
	import FloatingProperties from './FloatingProperties.svelte';
	import FloatingBlockEditor from './FloatingBlockEditor.svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';
	import SourceEditorModal from './SourceEditorModal.svelte';
	import FloatingCKEditor from './FloatingCKEditor.svelte';
	import PropertyEditor from './PropertyEditor.svelte'; // Type only? No, for ref
	import StructureSidebar from './StructureSidebar.svelte';

	export let selectedFile: { path: string; type: 'page' | 'component' } | null;
	// Props from parent (mostly permissions or status)
	export let editMode = false; // "Edit Mode" Toggle
	export let sourceMode = false; // Legacy/Unused?
	export let showPreviewWarning = false;
	export let isLoading = false;
	export let hasChanges = false;
	export let showNavControls = false; // Legacy
	// Navigation props (pass through for now to avoid breaking parent bind)
	export let canGoToPrevComponent = false;
	export let canGoToNextComponent = false;
	export let canGoToPrevTag = false;
	export let canGoToNextTag = false;
	export let currentTagIndex = -1;

	// Events
	const dispatch = createEventDispatcher();

	// Permissions
	$: permissions = $page.data.user?.permissions || {
		canEditHtml: false,
		canEditProps: false,
		canEditStyle: false,
		canEditSource: false
	};

	// State
	let iframeSrc = '';
	let iframe: HTMLIFrameElement;

	// Floating Visibility
	let showFloatingStyles = false;
	let showFloatingProperties = false;
	let showFloatingBlocks = false;
	let showSourceEditor = false;

	// Z-Order Management
	let maxZIndex = 2000;
	let zStyle = 2000;
	let zProps = 2001;
	let zBlocks = 2002;
	let zContent = 3000;
	let zSource = 4000;

	let pendingAutoOpenProperties = false;

	function bringToFront(type: string) {
		maxZIndex += 1;
		if (type === 'style') zStyle = maxZIndex;
		if (type === 'props') zProps = maxZIndex;
		if (type === 'blocks') zBlocks = maxZIndex;
		if (type === 'content') zContent = maxZIndex;
		if (type === 'source') zSource = maxZIndex;
	}

	// Editor State
	let activeFloatingContent = '';
	let activeSegment: any = null;
	let activeRect: DOMRect | null = null;
	let isEditingContent = false; // True if FloatingCKEditor is open
	let activeEditingElementId = '';
	let activeEditingPath = ''; // Path of component being edited
	let selectedComponentPath: string | null = null;
	let sidebarPath = ''; // Root path for the sidebar context
	let activeComponentId: string | null = null; // Global selected component ID
	let activeSegmentId: string | null = null; // Global selected segment ID

	// Data buffers
	let pageAST: any = null; // We might fetch this to popuplate Block/Prop editors
	// OR we let FloatingProperties fetch its own data?
	// FloatingProperties expects `props`, `components`, etc.
	// We should fetch active file AST here and pass it down.

	let head: any = null;
	let props: any[] = [];
	let components: any[] = [];
	let imports: any[] = [];
	let importedObjects: any[] = [];
	let style = '';
	let selectedObject: any = null;

	let propertyEditorRef: PropertyEditor;
	let sidebarRef: any; // Reference to StructureSidebar component
	let selectedSegmentPath: string | null = null; // Track selected segment for sync
	let selectedId: string | null = null; // Declare selectedId state

	// --- Initialization ---
	$: if (selectedFile) {
		// Load the full page editor route
		// Determine "clean" path for params
		// selectedFile.path is absolute usually? Or src/...
		// The loader expects just the path.
		if (selectedFile.path !== activeEditingPath) {
			editMode = false; // Reset edit mode when changing files
			showFloatingProperties = false;
			showFloatingStyles = false;
			showFloatingBlocks = false;
			selectedId = null;
			hasChanges = false;
			reloadFile();
		}
	}

	let windowWidth = 1000; // default for SSR
	if (typeof window !== 'undefined') {
		windowWidth = window.innerWidth;
	}

	const initialX = 400; // Starting position of the dialog
	// Calculate width to reach windowWidth - 10px
	$: propertiesDefaultWidth = Math.max(600, windowWidth - initialX - 10);

	// History State
	let fileHistory: string[] = [];
	let historyIndex = -1;
	let isNavigatingHistory = false;

	// When a file is selected (either from Explorer or the Sidebar "Dive")
	$: if (selectedFile && !isNavigatingHistory) {
		addToHistory(selectedFile.path);
	}

	function addToHistory(path: string) {
		// Don't add if it's the same as current
		if (fileHistory[historyIndex] === path) return;

		// If we were in the middle of history and pick a new file, truncate the "future"
		const newHistory = fileHistory.slice(0, historyIndex + 1);
		newHistory.push(path);
		fileHistory = newHistory;
		historyIndex = fileHistory.length - 1;
	}

	function navigateHistory(direction: number) {
		const newIndex = historyIndex + direction;
		if (newIndex >= 0 && newIndex < fileHistory.length) {
			isNavigatingHistory = true;
			historyIndex = newIndex;
			const targetPath = fileHistory[historyIndex];

			// Determine type based on path
			const type = targetPath.includes('src/routes') ? 'page' : 'component';

			// Notify parent to change the selected file
			dispatch('request-open', { path: targetPath, type, mode: editMode ? 'edit' : 'browse' });

			// Reset flag after a tick to allow the $: block to ignore the change we just caused
			tick().then(() => {
				isNavigatingHistory = false;
			});
		}
	}

	async function reloadFile() {
		if (!selectedFile) return;
		activeEditingPath = selectedFile.path;
		sidebarPath = selectedFile.path;
		selectedComponentPath = selectedFile.path; // Default to page
		activeEditingElementId = '';
		activeRect = null;
		isEditingContent = false;

		// Construct iframe URL
		// Editor route is /svelteframe/editor/fullpage/[...path]
		// Remove 'src/' prefix if needed or ensure it matches route logic.
		// Route is [...path], usually relative to project root?
		const relativePath = selectedFile.path.startsWith('/')
			? selectedFile.path.substring(1)
			: selectedFile.path;
		iframeSrc = `/svelteframe/editor/fullpage/${relativePath}`;

		// Load AST for tools
		await loadAST(selectedFile.path);
	}

	async function loadAST(filePath: string) {
		isLoading = true;
		try {
			const res = await fetch('/svelteframe/api/files/parse-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath })
			});
			if (res.ok) {
				const data = await res.json();
				const ast = data.ast;
				pageAST = ast;

				head = ast.head;
				props = ast.props || [];
				// Filter Components/HTML for Block Editor
				components = ast.template || [];

				imports = ast.imports || [];
				importedObjects = ast.importedObjects || [];
				style = ast.style || '';

				// Auto-select something?
				if (components.length > 0) selectedObject = components[0];

				// --- CONSUME THE FLAG HERE ---
				if (pendingAutoOpenProperties) {
					showFloatingProperties = true;
					bringToFront('props');
					pendingAutoOpenProperties = false; // Reset the flag

					// Optional: Auto-select the first property if it's a component
					if (props.length > 0) {
						selectedObject = props[0];
					}
				}
			}
		} catch (e) {
			console.error('Failed to load AST', e);
		} finally {
			isLoading = false;
		}
	}

	// --- Event Handling ---

	function handleIframeMessage(event: MessageEvent) {
		if (event.data.type === 'svelteframe_CLICK_TARGET') {
			const { id, rect, category, path, parentId } = event.data;
			handleTargetClick(id, rect, category, path, parentId);
		}
	}

	async function handleTargetClick(
		id: string,
		rect: DOMRect,
		category: string,
		pathFromEvent?: string,
		parentId?: string
	) {
		if (!editMode) return;

		console.log(`[EditorPane] Clicked ${category} : ${id} (Path: ${pathFromEvent})`);
		activeRect = rect;
		activeEditingElementId = id;

		// 1. Update selection in properties dialog (via URL param or direct prop if we can)
		// We can't easily push a URL param to the parent without a full reload,
		// but we can pass it to PropertyEditor as a prop or use a store.
		// For now, let's just make sure PropertyEditor's `selectedObject` is updated.

		// 2. If we have a component path, switch the properties context to it
		// But DON'T necessarily re-root the sidebar if we are still on the same page.
		if (pathFromEvent && pathFromEvent !== selectedComponentPath) {
			console.log('[EditorPane] Switching properties context to:', pathFromEvent);
			selectedComponentPath = pathFromEvent;
			await tick();
		}

		if (category === 'component') {
			activeComponentId = id;
			activeSegmentId = null;
		} else {
			activeComponentId = parentId || null;
			activeSegmentId = id;
		}

		// 2. Find the object in our AST or notify Sidebar to find the segment
		const found = findObjectById(id, components);

		if (found) {
			selectedObject = found;
			if (iframe && iframe.contentWindow) {
				const isComponent = category === 'component';
				iframe.contentWindow.postMessage(
					{
						type: 'svelteframe_SELECT_OBJECT',
						id: isComponent ? null : found.id,
						parentId: isComponent ? found.id : activeComponentId
					},
					'*'
				);
			}
		}

		// 3. Auto-sync sidebar and potentially open CKEditor
		if (sidebarRef) {
			console.log('[EditorPane] Syncing to sidebar:', id);

			// Find and highlight in sidebar
			// Use the segment's actual source path to ensure sidebar dives correctly
			const segResult = await sidebarRef.highlightSegment(pathFromEvent, id);
			const seg = segResult?.segment;
			const segParentId = segResult?.parentId || parentId;

			// 4. If it's an editable HTML segment, open CKEditor immediately
			if (seg && (category === 'html' || seg.type === 'html')) {
				console.log('[EditorPane] Auto-opening CKEditor for segment');
				handleSegmentEdit({ detail: { segment: seg } } as any);

				// Sync highlight to iframe
				if (iframe && iframe.contentWindow) {
					iframe.contentWindow.postMessage(
						{
							type: 'svelteframe_SELECT_OBJECT',
							id: seg.id,
							parentId: segParentId || activeComponentId
						},
						'*'
					);
				}
			}
		}
	}

	// Helper to find object
	function findObjectById(id: string, list: any[]): any {
		for (const item of list) {
			if (item.id === id) return item;
			// If item has slots/children? FullPageAST is flat list of blocks usually.
		}
		return null;
	}

	function handleSegmentEdit(event: CustomEvent) {
		const segment = event.detail.segment;
		const parentId = event.detail.parentId;
		activeFloatingContent = segment.content;
		activeSegment = segment;
		activeSegmentId = segment.id;
		if (parentId) activeComponentId = parentId;

		// CRITICAL: Store which file this segment belongs to!
		// The segment comes from the sidebar which is bound to selectedComponentPath
		// So we need to remember that path for when we save
		if (!activeSegment.sourceFile) {
			activeSegment.sourceFile = selectedComponentPath;
		}

		// Sync visual selection to iframe when editing starts (from sidebar click)
		if (iframe && iframe.contentWindow) {
			iframe.contentWindow.postMessage(
				{
					type: 'svelteframe_SELECT_OBJECT',
					id: activeSegment.id,
					parentId: activeComponentId
				},
				'*'
			);
		}

		isEditingContent = true;
		// Rect is already set by handleTargetClick if we clicked component.
	}

	function handleEditComponent(event: CustomEvent) {
		const name = event.detail.name;
		const providedPath = event.detail.path;
		console.log('[EditorPane] handleEditComponent', name, 'providedPath:', providedPath);

		if (providedPath) {
			// Ensure properties window will be open when the new file arrives
			pendingAutoOpenProperties = true;

			dispatch('request-open', {
				path: providedPath,
				type: 'component',
				mode: 'edit' // Ensure it opens in edit mode
			});
			return;
		}

		// Fallback to import search
		const imp = imports.find((i: any) => i.specifiers.some((s: any) => s.name === name));
		if (imp) {
			let src = imp.source;
			if (src.startsWith('$lib')) src = src.replace('$lib', 'src/lib');
			else if (src.startsWith('.')) {
				const dir = path.dirname(activeEditingPath);
				src = path.join(dir, src);
			}
			if (!src.endsWith('.svelte')) src += '.svelte';

			// Dispatch to parent to open this file in editor
			dispatch('request-open', { path: src, type: 'component' });
		}
	}

	function handleSidebarSelect(event: CustomEvent) {
		const { segment, parentId } = event.detail;

		// Update selection state for sidebar dual highlighting
		if (segment.type === 'logic' || segment.type === 'component') {
			activeComponentId = segment.id;
			activeSegmentId = null;
		} else if (segment.type === 'html') {
			activeSegmentId = segment.id;
			if (parentId) activeComponentId = parentId;
		}

		// Send message to iframe to scroll to and highlight the element
		if (iframe && iframe.contentWindow) {
			// First highlight
			if (segment.id) {
				const isComponent = segment.type === 'logic' || segment.type === 'component';
				iframe.contentWindow.postMessage(
					{
						type: 'svelteframe_SELECT_OBJECT',
						id: isComponent ? null : segment.id,
						parentId: isComponent ? segment.id : parentId
					},
					'*'
				);
			}

			// Then scroll
			if (segment.start !== undefined) {
				iframe.contentWindow.postMessage(
					{
						type: 'svelteframe_SCROLL_TO_SEGMENT',
						start: segment.start,
						end: segment.end
					},
					'*'
				);
			}
		}

		// FALLBACK: If the segment isn't found in current file structure
		// but it refers to a resolved component path (like BoardOfDirectors.svelte)
		if (segment && segment.resolvedPath && !activeSegmentId) {
			console.log(
				'[EditorPane] Segment not found in HTML, diving into component source:',
				segment.resolvedPath
			);

			// This triggers the file change.
			// addToHistory() will capture the OLD file before this finishes,
			// and then the NEW file as the current index.
			dispatch('request-open', {
				path: segment.resolvedPath,
				type: 'component',
				mode: 'edit'
			});
		}
	}

	// --- Save Logic ---
	async function handleCKEditorSave(e: CustomEvent) {
		const newContent = e.detail.content;

		// Use PATCH API with .test suffix for safety
		if (activeSegment) {
			// CRITICAL FIX: Use the segment's source file, not selectedComponentPath!
			// selectedComponentPath can change when clicking around, but the segment
			// knows which file it came from
			const targetFile = activeSegment.sourceFile || selectedComponentPath;

			if (!targetFile) {
				alert('Error: Cannot determine which file to save to');
				return;
			}

			console.log('[EditorPane] Saving segment from file:', targetFile);
			console.log('[EditorPane] Segment range:', activeSegment.start, '-', activeSegment.end);

			try {
				const res = await fetch('/svelteframe/api/components/patch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						filePath: targetFile,
						start: activeSegment.start,
						end: activeSegment.end,
						newContent: newContent
						// outputSuffix removed to save to actual file
					})
				});
				if (res.ok) {
					const result = await res.json();
					console.log(`[EditorPane] Saved to test file: ${result.outputPath}`);
					// alert removed per user request
					dispatch('saved', { path: targetFile, testPath: result.outputPath });
					isEditingContent = false;
					// Skip reload for test saves
				} else {
					const error = await res.json();
					alert(`Save failed: ${error.error}`);
				}
			} catch (e: any) {
				console.error('Patch failed', e);
				alert(`Save error: ${e.message}`);
			}
		}
	}

	async function handleGlobalSave() {
		// 1. If we are in Source Mode, save the raw content first
		if (showSourceEditor) {
			try {
				const res = await fetch('/svelteframe/api/files/content', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						path: activeEditingPath,
						content: pageAST.rawSource // Ensure SourceEditorModal binds back to a property
					})
				});
				if (res.ok) {
					showSourceEditor = false;
					hasChanges = false;
					reloadFile(); // Refresh everything
				}
				return;
			} catch (e) {
				console.error(e);
			}
		}

		if (propertyEditorRef) {
			// Pull modified Script Props back into the AST
			// (Assuming PropertyEditor updates pageAST.props via binding or internal logic)

			// Handle the "Shared Data" (Imported Objects)
			const updatedImports = propertyEditorRef.getDirtyImported();
			for (const updated of updatedImports) {
				const res = await fetch('/svelteframe/api/files/update-import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						filePath: updated.filePath,
						exportName: updated.exportName,
						newValue: updated.newValue
					})
				});
				if (!res.ok) console.error(`Failed to save ${updated.exportName}`);
			}
		}

		// --- 3. EXECUTE RECONSTRUCTION ---
		// This uses the pageAST which includes your props, template, and style
		await savePage(pageAST);

		hasChanges = false;
	}

	async function savePage(ast: any) {
		try {
			// We need full AST. `pageAST` should be up to date (sync with tools).
			const res = await fetch('/svelteframe/api/files/reconstruct-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath: selectedFile!.path,
					ast: ast
				})
			});
			if (res.ok) {
				// Refresh?
				reloadFile(); // Reload iframe and AST
				dispatch('saved', { path: selectedFile!.path });
			}
		} catch (e) {
			console.error(e);
			alert('Failed to save');
		}
	}

	// --- API for Parent ---
	export async function saveFile() {
		return savePage(pageAST);
	}

	$: if (iframe && iframe.contentWindow) {
		iframe.contentWindow.postMessage(
			{ type: 'svelteframe_SET_MODE', mode: editMode ? 'edit' : 'browse' },
			'*'
		);
	}

	export async function loadElementForEditing(path: string, selector: string) {
		console.log('[EditorPane] loadElementForEditing (Legacy) called', path, selector);
		if (!editMode) editMode = true;
		// Try to select if possible, but selector format might mismatch.
		// For now just ensuring edit mode is enough to stop crash.
	}

	// Tool Sync Handlers
	function handlePropsChange(e: CustomEvent) {
		debugLog('[EditorPane] Props change event received', props);

		// 1. Use data from event if present, otherwise fallback to bound variable
		if (e.detail && e.detail.props) {
			props = e.detail.props;
		}

		// `PropertyEditor` emits change. `props` / `components` are mutated in place or updated.
		// We just need to trigger a Save.
		// Check if we want auto-save or manual?
		// "Properties would always be on the toolbar...".
		// Let's trigger Save (reconstruct) on change?
		// Or just mark `hasChanges = true`?
		// Let's save for immediate feedback (Full Page Editor needs reload to show changes).
		// Actually, reloading iframe on every keystroke is bad.
		// We should debounce or have a "Apply" button?
		// User said: "After save, the page should refresh content".

		// So:
		// Floating Tools modify LOCAL state.
		// Iframe is NOT updated yet (unless we send postMessage updates? Complex).
		// We show "Unsaved Changes" (Save Button in Toolbar?).
		// Wait, Toolbar has "Edit Mode" toggle. Does it have "Save"?
		// New design didn't explicitly mention main Save button location, but standard toolbar usually has one.
		// Let's add a global SAVE button in toolbar.
		pageAST.props = props;
		pageAST.template = components;
		pageAST.style = style;

		// 2. CRITICAL: Force Svelte to recognize pageAST as "dirty"
		pageAST = { ...pageAST };

		hasChanges = true;
	}

	onMount(() => {
		window.addEventListener('message', handleIframeMessage);
		return () => {
			window.removeEventListener('message', handleIframeMessage);
		};
	});
</script>

<div class="editor-pane-layout">
	<header class="main-toolbar">
		<div class="left-tools">
			<button
				class="tool-btn"
				class:active={editMode}
				on:click={() => (editMode = !editMode)}
				title="Toggle Edit Mode"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path
						d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
					></path></svg
				>
			</button>

			<button
				class="tool-btn"
				class:active={showFloatingStyles}
				on:click={() => (showFloatingStyles = !showFloatingStyles)}
				title="Styles (CSS)"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><path d="m12 19 7-7 3 3-7 7-3-3Z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z"
					></path><path d="m2 2 5 22 5-22Z"></path></svg
				>
			</button>

			<button
				class="tool-btn"
				class:active={showFloatingProperties}
				on:click={() => (showFloatingProperties = !showFloatingProperties)}
				title="Properties"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><circle cx="12" cy="12" r="3"></circle><path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
					></path></svg
				>
			</button>

			<button
				class="tool-btn"
				class:active={showFloatingBlocks}
				on:click={() => (showFloatingBlocks = !showFloatingBlocks)}
				title="HTML Blocks"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line
						x1="3"
						y1="9"
						x2="21"
						y2="9"
					></line><line x1="9" y1="21" x2="9" y2="9"></line></svg
				>
			</button>

			<div class="separator"></div>

			{#if permissions.canEditSource}
				<button
					class="tool-btn"
					class:active={showSourceEditor}
					on:click={() => (showSourceEditor = !showSourceEditor)}
					title="Source Code Editor"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"
						></polyline></svg
					></button
				>
			{/if}

			<div class="separator"></div>

			<!-- History Navigation -->
			<button
				class="tool-btn nav-btn"
				disabled={historyIndex <= 0}
				on:click={() => navigateHistory(-1)}
				title="Back"
			>
				&larr;
			</button>
			<button
				class="tool-btn nav-btn"
				disabled={historyIndex >= fileHistory.length - 1}
				on:click={() => navigateHistory(1)}
				title="Forward"
			>
				&rarr;
			</button>
		</div>
		<div class="right-tools">
			{#if hasChanges || showSourceEditor}
				<button class="tool-btn primary" on:click={handleGlobalSave}>Save Changes</button>
			{/if}
		</div>
	</header>

	<div class="main-body" style="display: flex; flex: 1; overflow: hidden; width: 100%;">
		{#if selectedComponentPath}
			<div
				class="structure-panel"
				style="width: 250px; flex-shrink: 0; border-right: 1px solid #333;"
			>
				<StructureSidebar
					bind:this={sidebarRef}
					filePath={sidebarPath}
					{activeComponentId}
					{activeSegmentId}
					on:edit={handleSegmentEdit}
					on:select={handleSidebarSelect}
					on:request-properties={() => {
						showFloatingProperties = true;
						bringToFront('props');
					}}
					on:editComponent={handleEditComponent}
				/>
			</div>
		{/if}

		<div class="editor-canvas" style="flex: 1; position: relative;">
			{#if iframeSrc}
				<iframe
					bind:this={iframe}
					src={iframeSrc}
					title="Full Page Editor"
					class="full-page-iframe"
					sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
					on:load={() => {
						// Set initial mode on load
						if (iframe && iframe.contentWindow) {
							iframe.contentWindow.postMessage(
								{ type: 'svelteframe_SET_MODE', mode: editMode ? 'edit' : 'browse' },
								'*'
							);
						}
					}}
				></iframe>
			{:else}
				<div class="placeholder">Select a file to edit</div>
			{/if}

			<!-- Floating Tools -->
			<FloatingCSS
				bind:visible={showFloatingStyles}
				bind:style
				zIndex={zStyle}
				on:change={handlePropsChange}
				on:close={() => (showFloatingStyles = false)}
				on:focus={() => bringToFront('style')}
			/>

			<FloatingProperties
				bind:visible={showFloatingProperties}
				bind:editorRef={propertyEditorRef}
				filePath={activeEditingPath}
				{head}
				{props}
				{components}
				{imports}
				{importedObjects}
				{style}
				bind:selectedObject
				externalSelectedId={selectedId}
				{permissions}
				user={$page.data.user}
				zIndex={zProps}
				{initialX}
				initialY={80}
				width={propertiesDefaultWidth}
				height={700}
				on:change={handlePropsChange}
				on:saveAll={handleGlobalSave}
				on:select={(e) => (selectedObject = e.detail)}
				on:editComponent={handleEditComponent}
				on:editContent={(e) => {
					const obj = e.detail;
					console.log('[EditorPane] editContent handler', obj);
					if (obj.type === 'html') {
						handleSegmentEdit({ detail: { segment: obj } } as any);
					} else if (obj.type === 'component' && obj.path) {
						// Pencil icon on a component instance - treat as "Edit this component"
						dispatch('request-open', { path: obj.path, type: 'component', mode: 'edit' });
					} else {
						selectedObject = obj;
					}
				}}
				on:reorderprops={(e) => {
					props = e.detail;
					handlePropsChange(e);
				}}
				on:reordercomponents={(e) => {
					components = e.detail;
					handlePropsChange(e);
				}}
				on:close={() => (showFloatingProperties = false)}
				on:focus={() => bringToFront('props')}
			/>

			<FloatingBlockEditor
				bind:visible={showFloatingBlocks}
				bind:template={components}
				bind:selectedObject
				zIndex={zBlocks}
				on:select={(e) => (selectedObject = e.detail)}
				on:delete={(e) => {
					/* Handle delete from list */ handlePropsChange(e);
				}}
				on:reorder={(e) => {
					components = e.detail;
					handlePropsChange(e);
				}}
				on:dropnew={(e) => {
					/* Handle new drop */ handlePropsChange(e);
				}}
				on:close={() => (showFloatingBlocks = false)}
				on:focus={() => bringToFront('blocks')}
			/>

			{#if showSourceEditor}
				<FloatingToolWindow
					title="Source Editor: {path.basename(activeEditingPath)}"
					visible={true}
					width={1000}
					height={700}
					zIndex={zSource}
					on:close={() => (showSourceEditor = false)}
					on:focus={() => bringToFront('source')}
				>
					<SourceEditorModal
						filePath={activeEditingPath}
						on:close={() => (showSourceEditor = false)}
						on:save={async () => {
							dispatch('save');
							showSourceEditor = false;
						}}
					/>
				</FloatingToolWindow>
			{/if}

			<!-- Contextual Editor -->
			<FloatingCKEditor
				bind:visible={isEditingContent}
				content={activeFloatingContent}
				rect={activeRect}
				zIndex={zContent}
				on:save={handleCKEditorSave}
				on:cancel={() => (isEditingContent = false)}
				on:focus={() => bringToFront('content')}
			/>
		</div>
	</div>
</div>

<style>
	.nav-btn {
		font-size: 1.1rem;
		padding: 0 8px;
		font-weight: bold;
	}

	.nav-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.nav-btn:hover:not(:disabled) {
		background: #444;
	}
	.editor-pane-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		background: #1e1e1e;
		position: relative;
		overflow: hidden;
	}
	.main-toolbar {
		height: 40px;
		background: #252526;
		border-bottom: 1px solid #333;
		display: flex;
		align-items: center;
		padding: 0 10px;
		justify-content: space-between;
	}
	.left-tools,
	.right-tools {
		display: flex;
		gap: 5px;
		align-items: center;
	}
	.tool-btn {
		background: transparent;
		border: 1px solid transparent;
		color: #ccc;
		padding: 4px 10px;
		cursor: pointer;
		font-size: 0.85rem;
		border-radius: 3px;
	}
	.tool-btn:hover {
		background: #333;
		color: white;
	}
	.tool-btn.active {
		background: #007acc;
		color: white;
	}
	.tool-btn.primary {
		background: #28a745;
		color: white;
	}
	.separator {
		width: 1px;
		height: 20px;
		background: #444;
		margin: 0 5px;
	}
	.editor-canvas {
		flex: 1;
		position: relative;
		overflow: hidden;
	}
	.full-page-iframe {
		width: 100%;
		height: 100%;
		border: none;
		background: white;
	}
	.placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		color: #666;
	}
</style>
