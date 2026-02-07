<!-- FILE: src/routes/svelteframe/+page.svelte -->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FileExplorer from './_components/FileExplorer.svelte';
	import EditorPane from './_components/EditorPane.svelte';
	import Header from './_components/Header.svelte';
	import NewPageModal from './_components/NewPageModal.svelte';
	import { onMount } from 'svelte';
	import { debugLog, debugError } from './lib/server/debug';

	export let data;

	let allFiles: { pages: any[]; components: any[] } = {
		pages: [],
		components: []
	};
	let isLoadingFiles = true;
	let primarySelectedFile: { path: string; type: 'page' | 'component' } | null = null;
	let activeEditingFile: { path: string; type: 'page' | 'component' } | null = null;
	let editMode = false;
	let sourceMode = false;
	let isSidebarVisible = true;
	let showNewPageModal = false;
	let showPreviewWarning = false;
	let editorPane: EditorPane;
	let expandFileExplorerComponents = false;
	let keepMenuActive = data.user?.preferences?.keepMenuActive ?? true;
	let keepSidebarActive = data.user?.preferences?.keepSidebarActive ?? true;

	// --- FIX: State for unsaved changes warning ---
	let editorHasChanges = false;

	let availableComponents: { path: string; selector: string }[] = [];
	let availableTags: string[] = [];
	let currentComponentIndex = -1;
	let currentTagIndex = -1;
	let pendingTagSelector: string | null = null;

	$: canGoToPrevComponent = currentComponentIndex > 0;
	$: canGoToNextComponent =
		currentComponentIndex <
		(primarySelectedFile?.type === 'page'
			? availableComponents.length
			: allFiles.components.length) -
			1;
	$: canGoToPrevTag = currentTagIndex > 0;
	$: canGoToNextTag = availableTags.length > 0 && currentTagIndex < availableTags.length - 1;

	$: showNavControls = editMode && !sourceMode && activeEditingFile?.type === 'component';

	$: if (!editMode) {
		expandFileExplorerComponents = false;
	}

	$: if (keepSidebarActive) {
		isSidebarVisible = true;
	}

	async function savePreference(key: string, value: boolean) {
		if (!data.user) return;
		try {
			await fetch('/svelteframe/api/user/preferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key, value })
			});
		} catch (e) {
			console.error('Error saving preference:', e);
		}
	}

	async function handleSave() {
		if (editorPane && (editMode || sourceMode)) {
			await editorPane.saveFile();
			activeEditingFile = primarySelectedFile;
			// Stay in edit mode for "Save & Preview"
		}
	}

	function handleCancel() {
		activeEditingFile = primarySelectedFile;
		editMode = false;
		sourceMode = false;
	}

	function navigateComponent(direction: 'next' | 'prev') {
		if (!primarySelectedFile) return;
		let newIndex = currentComponentIndex;
		if (currentComponentIndex === -1 && direction === 'next') newIndex = 0;
		else newIndex += direction === 'next' ? 1 : -1;

		if (primarySelectedFile.type === 'page') {
			if (newIndex >= 0 && newIndex < availableComponents.length) {
				currentComponentIndex = newIndex;
				const component = availableComponents[newIndex];
				handleEditRequest(component.path, 'FIRST_SUBSTANTIVE');
			}
		} else if (primarySelectedFile.type === 'component') {
			if (newIndex >= 0 && newIndex < allFiles.components.length) {
				currentComponentIndex = newIndex;
				const nextFile = allFiles.components[newIndex];
				primarySelectedFile = nextFile;
				activeEditingFile = nextFile;
				handleToggleEdit();
			}
		}
	}

	function navigateTag(direction: 'next' | 'prev') {
		if (!activeEditingFile) return;
		let newIndex = currentTagIndex;
		if (currentTagIndex === -1 && direction === 'next') newIndex = 0;
		else newIndex += direction === 'next' ? 1 : -1;
		if (newIndex >= 0 && newIndex < availableTags.length) {
			currentTagIndex = newIndex;
			const selector = availableTags[newIndex];
			editorPane.loadElementForEditing(activeEditingFile.path, selector);
		}
	}

	// --- FIX: Add warning before discarding changes ---
	function handlePrimaryFileSelect(event: CustomEvent) {
		if (editorHasChanges) {
			if (
				!confirm('You have unsaved changes that will be lost. Are you sure you want to continue?')
			) {
				return;
			}
		}

		const file = event.detail;
		primarySelectedFile = file;
		activeEditingFile = file;
		showPreviewWarning = false;
		editMode = false;
		sourceMode = false;
		editorHasChanges = false; // Reset changes flag

		if (file.type === 'component') {
			currentComponentIndex = allFiles.components.findIndex((f) => f.path === file.path);
		} else {
			currentComponentIndex = -1;
		}

		const isComponent = file.type === 'component';
		const isRoutablePage = file.path.endsWith('+page.svelte');
		if (!isComponent && !isRoutablePage) {
			showPreviewWarning = true;
			sourceMode = true;
		}
		if (!keepSidebarActive) {
			isSidebarVisible = false;
		}
	}

	function handleToggleEdit() {
		if (!activeEditingFile) return;

		if (activeEditingFile.type === 'component') {
			if (editorPane) {
				sourceMode = false;
				editMode = true;
				currentTagIndex = 0;
				pendingTagSelector = null;
				editorPane.loadElementForEditing(activeEditingFile.path, 'FIRST_SUBSTANTIVE');
			}
		} else if (activeEditingFile.type === 'page') {
			isSidebarVisible = true;
			expandFileExplorerComponents = true;
			editMode = true;
			sourceMode = false;
		}
	}

	function handleEditSource() {
		if (activeEditingFile) {
			editMode = false;
			sourceMode = true;
		}
	}

	function handleEditRequest(componentPath: string, selector?: string) {
		const fileToEdit = allFiles.components.find((f) => f.path.includes(componentPath));
		if (fileToEdit) {
			activeEditingFile = fileToEdit;
			if (selector && editorPane) {
				editorPane.loadElementForEditing(fileToEdit.path, selector);
			}
			editMode = true;
			sourceMode = false;
		}
	}

	function handleRequestOpen(event: CustomEvent) {
		const { path, type, mode } = event.detail;
		console.log('[SvelteFrame+P] handleRequestOpen', path, type, mode);
		// Find the file object in our list
		const file = [...allFiles.pages, ...allFiles.components].find((f) => f.path === path);
		if (file) {
			primarySelectedFile = file;
			activeEditingFile = file;
			if (mode === 'edit') {
				editMode = true;
				sourceMode = false;
				// The EditorPane will react to activeEditingFile change and load AST.
				// However, if we are ALREADY on this file but just switching mode?
				// The EditorPane's loadAST is called in onMount and when selectedFile changes.
			} else {
				editMode = false;
				sourceMode = true;
			}
		} else {
			console.warn('[SvelteFrame+P] Could not find file for path:', path);
		}
	}

	function findAndSetCurrentTagIndex(selectorToFind: string | null) {
		if (!selectorToFind) return;

		if (availableTags.length === 0) {
			pendingTagSelector = selectorToFind;
			return;
		}

		const index = availableTags.findIndex((t) => t.endsWith(selectorToFind));

		if (index !== -1) {
			currentTagIndex = index;
			pendingTagSelector = null;
		}
	}

	function handleTagLoaded(event: CustomEvent) {
		debugLog(
			'[svelteframe+P:200] "tagloaded" event received. Selector from API:',
			event.detail.selector
		);
		findAndSetCurrentTagIndex(event.detail.selector);
	}

	// Watch for changes and save.
	// Note: This might trigger on initial load. To prevent that, we can use a flag.
	let isHydrated = false;

	$: if (isHydrated) {
		// Only save if values actually changed from what might be default
		// Ideally, check against previous value, but simple save on change is okay for bools
		savePreference('keepMenuActive', keepMenuActive);
		savePreference('keepSidebarActive', keepSidebarActive);
	}

	// Track index when surgically editing from a page
	$: if (
		primarySelectedFile?.type === 'page' &&
		activeEditingFile?.type === 'component' &&
		availableComponents.length > 0
	) {
		const idx = availableComponents.findIndex((c) => c.path === activeEditingFile?.path);
		if (idx !== -1) currentComponentIndex = idx;
	}

	onMount(() => {
		isHydrated = true;
		const selectFromUrl = $page.url.searchParams.get('select');

		async function init() {
			try {
				const res = await fetch('/svelteframe/api/files');
				if (!res.ok) {
					throw new Error(`HTTP error! Status: ${res.status}`);
				}
				const data = await res.json();

				allFiles = data;
				isLoadingFiles = false;

				if (selectFromUrl) {
					const fileToSelect =
						allFiles.pages.find((f: any) => f.path.includes(selectFromUrl)) ||
						allFiles.components.find((f: any) => f.path.includes(selectFromUrl)) ||
						null;
					if (fileToSelect) {
						primarySelectedFile = fileToSelect;
						activeEditingFile = fileToSelect;
					}
					const url = new URL(window.location.href);
					url.searchParams.delete('select');
					goto(url.toString(), { replaceState: true, noScroll: true });
				}
			} catch (error) {
				debugError('Error fetching or processing files:', error);
				document.location.href = '/svelteframe'; // Retry for login
				return;
			}
		}

		init();

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
				if (editMode || sourceMode) {
					event.preventDefault();
					handleSave();
				}
			}
			if (event.ctrlKey && event.altKey) {
				switch (event.key) {
					case 'PageDown':
						event.preventDefault();
						if (canGoToNextComponent) navigateComponent('next');
						break;
					case 'PageUp':
						event.preventDefault();
						if (canGoToPrevComponent) navigateComponent('prev');
						break;
					case 'ArrowRight':
						event.preventDefault();
						if (canGoToNextTag) navigateTag('next');
						break;
					case 'ArrowLeft':
						event.preventDefault();
						if (canGoToPrevTag) navigateTag('prev');
						break;
				}
			}
		};
		const handleMessage = (event: MessageEvent) => {
			const { type, components, tags, returnTo } = event.data;
			if (type === 'svelteframe_CONTENT_DISCOVERED') {
				debugLog(
					'[svelteframe+P:269] "CONTENT_DISCOVERED" message received. Available tags from preview:',
					tags
				);
				availableComponents = components || [];
				availableTags = tags || [];
				if (pendingTagSelector) {
					findAndSetCurrentTagIndex(pendingTagSelector);
				}
			} else if (type === 'svelteframe_EXIT_SURGICAL_EDIT') {
				let fileToSelect = null;
				if (returnTo) {
					const returnUrl = new URL(returnTo, window.location.origin);

					if (returnUrl.pathname.startsWith('/svelteframe')) {
						const selectPath = returnUrl.searchParams.get('select');
						if (selectPath) {
							fileToSelect =
								allFiles.pages.find((f) => f.path === selectPath) ||
								allFiles.components.find((f) => f.path === selectPath) ||
								null;
						}
					} else {
						fileToSelect = allFiles.pages.find((f) => {
							let pageRoute =
								f.path.replace(/^src\/routes/, '').replace(/\/\+page\.svelte$/, '') || '/';
							if (pageRoute !== '/' && pageRoute.endsWith('/index')) {
								pageRoute = pageRoute.replace('/index', '');
							}
							return pageRoute === returnUrl.pathname;
						});
					}
				}
				primarySelectedFile = fileToSelect;
				activeEditingFile = fileToSelect;
				editMode = false;
				sourceMode = false;
			} else if (type === 'svelteframe_CANCEL_PAGE_EDIT' || type === 'svelteframe_SAVE_PAGE_EDIT') {
				editMode = false;
				sourceMode = false;
			}
		};

		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('message', handleMessage);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('message', handleMessage);
		};
	});
</script>

<div class="svelteframe-ide">
	<Header
		selectedFile={activeEditingFile}
		{editMode}
		{sourceMode}
		forceOpen={showNewPageModal}
		bind:keepMenuActive
		bind:keepSidebarActive
		permissions={data.user?.permissions}
		on:toggleSidebar={() => {
			if (!keepSidebarActive) isSidebarVisible = !isSidebarVisible;
		}}
		on:toggleEdit={handleToggleEdit}
		on:editSource={handleEditSource}
		on:newFile={() => (showNewPageModal = true)}
	/>

	<main class="main-content">
		{#if isSidebarVisible}
			<aside class="sidebar" transition:slide={{ duration: 200, axis: 'x' }}>
				<FileExplorer
					pages={allFiles.pages}
					components={allFiles.components}
					isLoading={isLoadingFiles}
					on:select={handlePrimaryFileSelect}
					expandComponents={expandFileExplorerComponents}
				/>
			</aside>
		{/if}

		<div class="editor-container">
			<EditorPane
				bind:this={editorPane}
				bind:hasChanges={editorHasChanges}
				selectedFile={activeEditingFile}
				{editMode}
				{sourceMode}
				{showPreviewWarning}
				isLoading={isLoadingFiles}
				on:save={handleSave}
				on:cancel={handleCancel}
				{showNavControls}
				{canGoToPrevComponent}
				{canGoToNextComponent}
				{canGoToPrevTag}
				{canGoToNextTag}
				on:prevComponent={() => navigateComponent('prev')}
				on:nextComponent={() => navigateComponent('next')}
				on:prevTag={() => navigateTag('prev')}
				on:nextTag={() => navigateTag('next')}
				on:tagloaded={handleTagLoaded}
				{currentTagIndex}
				on:request-open={handleRequestOpen}
			/>
		</div>
	</main>

	{#if showNewPageModal}
		<NewPageModal on:close={() => (showNewPageModal = false)} />
	{/if}
</div>
