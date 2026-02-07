<!-- FILE: src/routes/svelteframe/_components/FilePicker.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import path from 'path-browserify';
	import { hasPermission } from '$routes/svelteframe/lib/client/access';

	const STORAGE_KEY = 'svelteframe_last_picker_dir';
	const dispatch = createEventDispatcher();

	export let children: any[] | undefined = undefined;

	// 'any' = standard file picker behavior
	// 'image' = adds API filter, shows preview panel, changes UI text
	export let type: 'any' | 'image' = 'any';

	// NEW: The existing value from the parent (e.g. "/images/logo.png")
	export let initialPath = '';
	// NEW: Base path for relative resolution and masking (e.g. "src/routes")
	export let basePath = '';
	// NEW: Limit browsing within this directory
	export let restrictTo = '';
	// NEW: Browse an absolute system path (instead of project-relative)
	export let absolutePath = '';
	// NEW: Allow selecting folders
	export let allowFolderSelection = false;
	// NEW: Show files in the tree
	export let showFiles = true;
	// NEW: Custom label for the confirmation button
	export let confirmButtonLabel = 'Add This';

	// NEW: User object for permission checks
	export let user: any = null;

	let activePath = ''; // Tracks the expanded branch
	export let selectedPath = ''; // Tracks the highlighted item
	let fetchError = '';

	// NEW: Image stats
	let imageStats: { width: number; height: number; sizeStr: string } | null = null;
	$: if (selectedPath) {
		updateImageStats(selectedPath);
	}

	async function updateImageStats(pathStr: string) {
		imageStats = null;
		if (!isImage(pathStr)) return;

		try {
			// 1. Get dimensions
			const img = new Image();
			img.src = pathStr;
			await new Promise((resolve) => {
				img.onload = resolve;
				img.onerror = resolve; // Continue even if image verify fails
			});
			const { naturalWidth, naturalHeight } = img;

			// 2. Get file size
			const res = await fetch(pathStr, { method: 'HEAD' });
			const bytes = parseInt(res.headers.get('content-length') || '0', 10);
			const sizeKB = (bytes / 1024).toFixed(1);

			if (naturalWidth && naturalHeight) {
				imageStats = {
					width: naturalWidth,
					height: naturalHeight,
					sizeStr: `${sizeKB} KB`
				};
			}
		} catch (e) {
			console.warn('Failed to load image stats', e);
		}
	}

	let fileTree: any[] = [];
	let isLoading = true;

	function sortNodes(nodes: any[]) {
		return nodes.sort((a, b) => {
			// 1. Directories first (nodes with children are directories)
			const aIsDir = !!a.children;
			const bIsDir = !!b.children;
			if (aIsDir && !bIsDir) return -1;
			if (!aIsDir && bIsDir) return 1;

			// 2. Alphabetical Case-Insensitive
			// 'en' locale with sensitivity: 'base' treats a and A as the same
			return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
		});
	}

	export let internalActivePath = ''; // Add this to track expansion with full paths

	let fileInput: HTMLInputElement;
	let isUploading = false;
	$: canUploadCurrent = user
		? hasPermission(user, internalActivePath ? norm(internalActivePath) + '/' : '', 'W')
		: false;

	// Helper to normalize paths for comparison
	const norm = (p: string) => (p ? p.replace(/\\/g, '/').replace(/\/$/, '') : '');

	const getAbsolutePath = (relPath: string) => {
		if (!absolutePath) return relPath;
		const base = absolutePath.replace(/[\\/]+$/, '');
		const target = norm(relPath).replace(/^[\\/]+/, '');
		return base + (target ? '/' + target : '');
	};

	async function loadProjectStructure() {
		if (children) return;

		isLoading = true;
		try {
			let url = '/svelteframe/api/project-structure';
			const params = new URLSearchParams();
			if (type === 'image') {
				params.set('types', 'image/');
				params.set('baseDir', 'static');
			}
			if (absolutePath) {
				params.set('absolutePath', absolutePath);
				// When absolutePath is used, we might still want to filter by extension
				if (!showFiles) params.set('types', '__FOLDER_ONLY__');
			}

			const res = await fetch(`${url}?${params.toString()}`);
			if (res.ok) {
				fetchError = '';
				let data = await res.json();
				let processedNodes = data;
				console.log(`[FilePicker] Raw API Data:`, data);
				console.log(`[FilePicker] Internal Active Path: ${internalActivePath}`);

				if (basePath) {
					const normalizedBase = norm(basePath);
					const findBase = (nodes: any[]): any => {
						for (const node of nodes) {
							if (node.path.replace(/\\/g, '/') === normalizedBase) return node;
							if (node.children) {
								const found = findBase(node.children);
								if (found) return found;
							}
						}
						return null;
					};

					const baseNode = findBase(data);
					if (baseNode?.children) {
						processedNodes = baseNode.children;
						console.log(`[FilePicker] Tree Rooted at: ${baseNode.path}`);
					}
				}

				const applyRecursiveSort = (nodes: any[]) => {
					const sorted = sortNodes([...nodes]);
					sorted.forEach((n) => {
						if (n.children) n.children = applyRecursiveSort(n.children);
					});
					return sorted;
				};

				fileTree = applyRecursiveSort(processedNodes);
				console.log(`[FilePicker] Tree matches against: ${internalActivePath}`);
			} else {
				const errData = await res.json().catch(() => ({}));
				fetchError = errData.error || errData.message || `Error ${res.status}: ${res.statusText}`;
				console.error(`[FilePicker] API Error:`, fetchError);
			}
		} finally {
			isLoading = false;
		}
	}

	function findNodeByPath(nodes: any[], targetPath: string): any {
		for (const node of nodes) {
			if (norm(node.path) === targetPath) return node;
			if (node.children) {
				const found = findNodeByPath(node.children, targetPath);
				if (found) return found;
			}
		}
		return null;
	}

	async function handleUpload(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files || files.length === 0) return;

		const file = files[0];
		const currentPath = norm(internalActivePath);

		// 1. Force path to be within 'static/' folder logic
		// If currentPath is "/images" (from image mode), we want "static/images"
		// If currentPath is "static/images" (from normal mode), we want "static/images"
		// If currentPath is "" (root), we want "static"

		let targetDir = currentPath;
		// Strip leading slash for consistent checking
		if (targetDir.startsWith('/')) targetDir = targetDir.substring(1);

		if (!targetDir.startsWith('static/') && targetDir !== 'static') {
			targetDir = targetDir ? `static/${targetDir}` : 'static';
		}
		targetDir = norm(targetDir);

		// 2. Check for Overwrite
		let childrenToCheck: any[] | undefined = undefined;

		if (currentPath === '') {
			// We are at root, check fileTree directly
			childrenToCheck = fileTree;
		} else {
			const currentDirNode = findNodeByPath(fileTree, currentPath);
			if (currentDirNode && currentDirNode.children) {
				childrenToCheck = currentDirNode.children;
			}
		}

		if (childrenToCheck) {
			const existing = childrenToCheck.find((child: any) => child.name === file.name);
			if (existing) {
				if (!confirm(`File "${file.name}" already exists in "${targetDir}". Overwrite?`)) {
					// Reset input
					(e.target as HTMLInputElement).value = '';
					return;
				}
			}
		} else {
			// If we can't determine children (e.g. somehow node not found), confirm upload anyway
			if (!confirm(`Upload "${file.name}" to "${targetDir}"?`)) {
				(e.target as HTMLInputElement).value = '';
				return;
			}
		}

		isUploading = true;
		console.log(`[FilePicker] Uploading ${file.name} to ${targetDir}`);

		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('targetDir', targetDir);

			const res = await fetch('/svelteframe/api/files/upload', {
				method: 'POST',
				body: formData
			});

			if (res.ok) {
				const result = await res.json();
				// Refresh tree
				await loadProjectStructure();
				// Reset input
				if (fileInput) fileInput.value = '';

				// Auto-select the uploaded file if we can reconstruct the path
				// The API returns the stripped path logic which matches currentPath + / + filename
				const newSelection =
					currentPath === '' || currentPath === '/'
						? '/' + file.name
						: currentPath + '/' + file.name;

				// Normalize to ensure leading slash if needed
				selectedPath = newSelection.startsWith('/') ? newSelection : '/' + newSelection;

				// NEW: Optimization Check
				if (isImage(file.name) && file.size > 100 * 1024) {
					const sizeKB = (file.size / 1024).toFixed(0);
					if (
						confirm(
							`The uploaded image is large (${sizeKB}KB). Would you like to create optimized versions (.webp, .jpg)?`
						)
					) {
						try {
							const optRes = await fetch('/svelteframe/api/files/optimize', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ filePath: targetDir + '/' + file.name })
							});

							if (optRes.ok) {
								const optResult = await optRes.json();
								alert(optResult.message);
								await loadProjectStructure(); // Refresh to see new files
							} else {
								const err = await optRes.json();
								alert(`Optimization failed: ${err.error}`);
							}
						} catch (e: any) {
							console.error(e);
							alert(`Optimization error: ${e.message}`);
						}
					}
				}
			} else {
				const err = await res.json();
				alert(`Error: ${err.error}`);
			}
		} catch (err) {
			console.error(err);
			alert('Upload failed.');
		} finally {
			isUploading = false;
		}
	}

	onMount(async () => {
		console.log(`[FilePicker] onMount:`, user);
		if (!children) {
			let lastPickedDir = sessionStorage.getItem(STORAGE_KEY);
			const normalizedBase = norm(basePath);

			// Helper updated: Now returns paths relative to the WEB ROOT (/)
			// because that's what your API returns.
			const toWebPath = (p: string) => {
				if (!p) return '';
				let cleaned = p.replace(/\\/g, '/');

				if (absolutePath) {
					// Reconstruct absolute path by joining the base absolutePath with the relative node path
					// --- FIX: Only prepend absolutePath if 'p' isn't already absolute ---
					// If absolutePath is "~" and p is "~/src/web...", don't double it.
					if (cleaned.startsWith(absolutePath)) {
						return cleaned;
					}

					const base = absolutePath.replace(/\\/g, '/').replace(/\/+$/, '');
					const target = cleaned.replace(/^\/+/, '');
					return base + '/' + target;
				}

				if (normalizedBase && cleaned.startsWith(normalizedBase)) {
					cleaned = cleaned.substring(normalizedBase.length);
				}

				// Ensure it starts with exactly one slash
				return '/' + cleaned.replace(/^\/+/, '');
			};

			if (initialPath) {
				selectedPath = initialPath;
				// Result: /images/board
				internalActivePath = norm(path.dirname(toWebPath(initialPath)));
				console.log(
					`[FilePicker] 1. Priority Initial: ${selectedPath} -> Expanding: ${internalActivePath}`
				);
			} else if (lastPickedDir) {
				// Result: /images/board
				internalActivePath = norm(toWebPath(lastPickedDir));
				console.log(`[FilePicker] 2. Priority LastDir: ${internalActivePath}`);
			}

			await loadProjectStructure();
		}
	});

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			dispatch('close');
		}
	}

	function toggleFolder(clickedPath: string) {
		const target = norm(clickedPath);
		console.log(`[FilePicker] Toggle folder: ${target}`);
		console.log(`[FilePicker] Internal active path: ${internalActivePath}`);

		// Toggle logic for the tree expansion
		if (internalActivePath === target) {
			// If clicking the active folder, collapse to parent
			internalActivePath = norm(path.dirname(target));
		} else {
			internalActivePath = target;
		}

		// Convert to public path for display and storage
		let publicPath = target;
		if (absolutePath) {
			publicPath = getAbsolutePath(target);
		} else {
			const normalizedBase = norm(basePath);
			if (target.startsWith(normalizedBase)) {
				// Strip base, then ensure exactly one leading slash
				publicPath = '/' + target.replace(normalizedBase, '').replace(/^\/+/, '');
			}
		}

		selectedPath = publicPath;
		sessionStorage.setItem(STORAGE_KEY, publicPath);
	}

	function confirmSelection() {
		if (selectedPath) {
			// Save the directory of the selected file
			const dirToSave = path.dirname(selectedPath);
			localStorage.setItem(STORAGE_KEY, dirToSave);
			let finalPath = selectedPath;
			// If we are masking, we might want to return the full path or a relative one?
			// The user said: "the top level should be directories within that".
			// Usually hrefs are relative to site root, so masking src/routes means /path/to/page
			// But for src properties, it might be /images/logo.png (masking site/static/)

			// Let's see how the user wants it. "return the path as selected"
			// Wait, if I Mask src/routes, and I select src/routes/about, should I return "/about"?
			// The user said "base within src/routes".

			if (basePath) {
				// Normalize both paths for comparison
				let normalizedBase = basePath.replace(/\\/g, '/').replace(/\/$/, '');
				let normalizedSelected = selectedPath.replace(/\\/g, '/');

				// If base is a relative path like 'src/routes',
				// and selected is also relative like 'src/routes/about', this works.
				if (normalizedSelected.startsWith(normalizedBase)) {
					finalPath = normalizedSelected.substring(normalizedBase.length);

					// Strip SvelteKit route markers
					finalPath = finalPath
						.replace(/\/\+page\.(svelte|ts|js)$/, '')
						.replace(/\/\+layout\.(svelte|ts|js)$/, '')
						.replace(/\/\+server\.(ts|js)$/, '');

					if (finalPath === '') finalPath = '/';
					if (!finalPath.startsWith('/')) finalPath = '/' + finalPath;
				}
			}

			console.log(`[FilePicker] 🎯 Confirming selection: ${finalPath}`);
			dispatch('select', finalPath);
		}
	}

	// Helper to check if a file extension is likely an image for preview purposes
	function isImage(pathStr: string): boolean {
		if (!pathStr) return false;
		const ext = pathStr.split('.').pop()?.toLowerCase();
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext || '');
	}
</script>

<!-- Cannot use because node is not found: {@const nodePath = norm(node.path)} 
{@const isExpanded =
	internalActivePath === nodePath || internalActivePath.startsWith(nodePath + '/')}
	-->
{#if !children}
	<!-- ROOT MODAL STRUCTURE -->
	<div class="picker-container">
		<div class="picker-body">
			<div class="file-tree-container">
				{#if isLoading}
					<p>Loading project structure...</p>
				{:else if fetchError}
					<div class="error-msg">
						<p>{fetchError}</p>
						{#if fetchError.includes('401') || fetchError.toLowerCase().includes('authenticate')}
							<button on:click={() => dispatch('reauth', true)}>Go to Step 1: Authentication</button
							>
						{/if}
						<button
							on:click={() => {
								fileTree = [];
								loadProjectStructure();
							}}>Retry</button
						>
					</div>
				{:else}
					<!-- Pass 'type' down to recursive children -->
					<svelte:self
						children={fileTree}
						bind:internalActivePath
						bind:selectedPath
						{type}
						{basePath}
						{user}
						{absolutePath}
						{allowFolderSelection}
						{showFiles}
						{confirmButtonLabel}
					/>
				{/if}
			</div>

			<!-- PREVIEW PANEL (Only shown in Image Mode) -->
			{#if type === 'image' && selectedPath}
				<div class="preview-panel">
					<h4>Preview</h4>
					<div class="path-display">{selectedPath}</div>

					{#if isImage(selectedPath)}
						<div class="img-wrapper">
							<img src={selectedPath} alt="Preview" />
						</div>
						{#if imageStats}
							<div class="img-stats">
								{imageStats.width}x{imageStats.height}px &bull; {imageStats.sizeStr}
							</div>
						{/if}
					{:else}
						<div class="no-preview">No preview available</div>
					{/if}
				</div>
			{/if}
		</div>

		<footer>
			<input
				type="file"
				bind:this={fileInput}
				on:change={handleUpload}
				style="display:none"
				accept={type === 'image' ? 'image/*' : '*'}
			/>
			{#if canUploadCurrent}
				<button
					class="add-button secondary"
					disabled={isUploading}
					on:click={() => fileInput.click()}
				>
					{isUploading ? 'Uploading...' : 'Upload File'}
				</button>
			{/if}
			<button class="add-button" disabled={!selectedPath} on:click={confirmSelection}>
				{confirmButtonLabel}
			</button>
		</footer>
	</div>
{:else}
	<!-- RECURSIVE TREE ITEMS -->
	<ul>
		{#each children as node}
			{@const nodePath = norm(node.path)}

			<!-- FIX: Logic to expand parents AND the target itself -->
			{@const isExpanded =
				internalActivePath === nodePath || internalActivePath.startsWith(nodePath + '/')}

			<!-- FIX: Use a cleaner regex replacement to avoid double slashes -->
			{@const publicNodePath = absolutePath
				? getAbsolutePath(nodePath)
				: basePath
					? '/' + nodePath.replace(norm(basePath), '').replace(/^\/+/, '')
					: nodePath}
			{@const isSelected = selectedPath === publicNodePath}

			<li>
				{#if node.children}
					<div
						class="node-btn folder"
						class:selected={isSelected}
						on:click|stopPropagation={() => toggleFolder(node.path)}
						role="button"
						tabindex="0"
					>
						<span class="icon" class:expanded={isExpanded}>▶</span>
						<span class="icon-folder">📁</span>
						{node.name}
						{#if allowFolderSelection}
							<button
								class="folder-select-btn"
								class:selected={isSelected}
								on:click|stopPropagation={() => (selectedPath = publicNodePath)}
							>
								{isSelected ? 'Selected' : 'Select'}
							</button>
						{/if}
					</div>
					{#if isExpanded}
						<!-- RE-ADD: You must bind the variables so expansion state is shared -->
						<svelte:self
							children={node.children}
							bind:internalActivePath
							bind:selectedPath
							{type}
							{basePath}
							{user}
							{absolutePath}
							{allowFolderSelection}
							{showFiles}
							{confirmButtonLabel}
						/>
					{/if}
				{:else if showFiles}
					<!-- FIX: Ensure files are actually rendered inside the <li> -->
					<button
						class="node-btn file"
						class:selected={isSelected}
						on:click|stopPropagation={() => (selectedPath = publicNodePath)}
					>
						<span class="icon-file">📄</span>
						{node.name}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #dee2e6;
		padding: 1rem 1.5rem;
		flex-shrink: 0;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.close-btn {
		background: none;
		border: none;
		color: #6c757d;
		font-size: 1.5rem;
		cursor: pointer;
	}

	.picker-container {
		display: flex;
		flex-direction: column;
		height: 100%; /* Important: fill the FloatingToolWindow */
		background: var(--sp-bg-main);
		color: var(--sp-text-main);
	}

	/* Body Layout */
	.picker-body {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.file-tree-container {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.5rem 1.5rem;
		background: var(--sp-bg-main);
		max-height: 50vh; /* Constraint for scrolling */
		min-height: 300px;
	}

	/* Preview Panel Styles */
	.preview-panel {
		width: 300px;
		flex-shrink: 0; /* Don't let the preview get crushed */
		padding: 1rem;
		background: var(--sp-bg-header);
		border-left: 1px solid var(--sp-border-main);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
	}

	.preview-panel h4 {
		margin: 0;
		font-size: 0.9rem;
		color: #495057;
		text-transform: uppercase;
	}

	.path-display {
		font-size: 0.75rem;
		color: #6c757d;
		word-break: break-all;
		background: #fff;
		padding: 6px;
		border: 1px solid #ced4da;
		border-radius: 3px;
		font-family: monospace;
	}

	.img-wrapper {
		width: 100%;
		height: 250px;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Checkerboard pattern for transparency */
		background: repeating-conic-gradient(#fff 0% 25%, #ced4da 0% 50%) 50% / 20px 20px;
		border: 1px solid #ced4da;
	}

	.img-wrapper img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.no-preview {
		color: #888;
		font-style: italic;
		text-align: center;
		margin-top: 2rem;
	}

	.img-stats {
		font-size: 0.8rem;
		text-align: center;
		color: #555;
		margin-top: 0.5rem;
		padding: 4px;
		background: #f8f9fa;
		border-radius: 4px;
		border: 1px solid #dee2e6;
	}

	/* Tree Styles */
	ul {
		list-style: none;
		padding-left: 1.2rem;
	}
	.node-btn {
		background: none;
		border: none;
		color: #495057;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 3px;
		width: 100%;
		text-align: left;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid transparent;
	}
	.node-btn:hover {
		background-color: #e9ecef;
	}
	.node-btn.selected {
		background-color: #cfe2ff;
		border-color: #b6d4fe;
		color: #004085;
		font-weight: bold;
	}
	.icon {
		font-size: 0.6em;
		width: 1em;
		transition: transform 0.1s ease-in-out;
	}
	.icon.expanded {
		transform: rotate(90deg);
	}
	.icon-folder,
	.icon-file {
		width: 1em;
	}
	.file {
		padding-left: calc(8px + 1em + 0.5rem);
	}

	footer {
		flex-shrink: 0;
		padding: 1rem 1.5rem;
		background: var(--sp-bg-header);
		border-top: 1px solid var(--sp-border-main);
		text-align: right;
	}
	.add-button {
		background-color: #007bff;
		color: white;
		border: none;
		padding: 10px 24px;
		border-radius: 5px;
		font-weight: bold;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.add-button:hover:not(:disabled) {
		background-color: #0069d9;
	}
	.add-button:disabled {
		background-color: #6c757d;
		cursor: not-allowed;
	}
	.add-button.secondary {
		background-color: #6c757d;
		margin-right: 10px;
	}
	.add-button.secondary:hover:not(:disabled) {
		background-color: #5a6268;
	}
	.node-btn.folder {
		color: var(--sp-text-main);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}
	.folder-select-btn {
		margin-left: auto;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 0.7rem;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
	.folder-select-btn:hover {
		opacity: 1;
		background: #2563eb;
	}
	.folder-select-btn.selected {
		background: #10b981;
		opacity: 1;
	}
	.error-msg {
		color: #ef4444;
		padding: 1rem;
		background: rgba(239, 68, 68, 0.1);
		border-radius: 6px;
		margin: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
	}
	.error-msg p {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.error-msg button {
		background: #ef4444 !important;
		color: white !important;
		border: none !important;
		padding: 4px 12px !important;
		border-radius: 4px !important;
		cursor: pointer !important;
		font-size: 0.75rem !important;
	}
	.error-msg button:hover {
		background: #dc2626 !important;
	}
</style>
