<!-- src/routes/svelteframe/_components/StructureSidebar.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { slide } from 'svelte/transition';

	export let filePath: string | null = null;
	export let segments: any[] = [];
	export let isRoot = true;
	export let activeComponentId: string | null = null;
	export let activeSegmentId: string | null = null;
	export let currentParentId: string | null = null;

	const dispatch = createEventDispatcher();
	let loading = false;
	let error = '';
	let highlightedSegment: any = null;

	$: if (filePath && isRoot) {
		loadStructure(filePath);
	}

	async function loadStructure(path: string) {
		loading = true;
		error = '';
		try {
			const res = await fetch('/svelteframe/api/components/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath: path })
			});
			if (res.ok) {
				const data = await res.json();
				segments = data.segments.map((s: any) => ({
					...s,
					expanded: false,
					children: null,
					isLoadingChildren: false
				}));

				if (path.includes('+page.svelte')) {
					segments.push({
						id: 'global-footer',
						type: 'logic',
						subtype: 'InlineComponent',
						tagName: 'Footer',
						start: -1,
						end: -1,
						depth: 0,
						preview: 'Footer',
						resolvedPath: 'src/lib/components/Footer.svelte',
						expanded: false,
						children: null,
						isLoadingChildren: false,
						isManuallyAdded: true
					});
				}
			} else {
				error = 'Failed to load structure';
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function toggleExpand(segment: any) {
		if (!segment.resolvedPath) {
			segment.expanded = !segment.expanded;
			segments = [...segments];
			return;
		}

		segment.expanded = !segment.expanded;
		segments = [...segments];

		if (segment.expanded && !segment.children && !segment.isLoadingChildren) {
			segment.isLoadingChildren = true;
			segments = [...segments];

			try {
				const res = await fetch('/svelteframe/api/components/analyze', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filePath: segment.resolvedPath })
				});
				if (res.ok) {
					const data = await res.json();
					segment.children = data.segments.map((s: any) => ({
						...s,
						expanded: false,
						children: null
					}));
				}
			} catch (e) {
				console.error(e);
			} finally {
				segment.isLoadingChildren = false;
				segments = [...segments];
			}
		}
	}

	function handleEdit(segment: any) {
		if (segment.type === 'html') {
			dispatch('edit', { segment, parentId: currentParentId });
		}
	}

	function forwardEdit(event: CustomEvent) {
		dispatch('edit', event.detail);
	}

	function forwardSelect(event: CustomEvent) {
		dispatch('select', event.detail);
	}

	function getTooltip(segment: any): string {
		if (segment.preview && segment.preview.length > 20) {
			return segment.preview;
		}
		return '';
	}

	const findInList = async (
		list: any[],
		targetPath: string,
		targetStart: string | number,
		listContextPath: string,
		currentParentId: string | null = null
	): Promise<{ segment: any; parentId: string | null } | null> => {
		console.log(
			`[StructureSidebar] findInList: searching for "${targetStart}" in "${listContextPath}" (Target: "${targetPath}")`
		);

		for (const seg of list) {
			if (listContextPath === targetPath) {
				const isMatch =
					typeof targetStart === 'string'
						? seg.id === targetStart || `${seg.start}-${seg.end}` === targetStart
						: seg.start === targetStart ||
							(targetStart !== -1 && seg.start <= targetStart && seg.end >= targetStart);

				if (isMatch) {
					console.log(`[StructureSidebar] Found match in current context: ${seg.id}`);
					return { segment: seg, parentId: currentParentId };
				}
			}

			if (seg.resolvedPath) {
				const isParentOfTarget = targetPath.startsWith(seg.resolvedPath);
				const isExactTarget = targetPath === seg.resolvedPath;

				if (isParentOfTarget || isExactTarget) {
					// Only expand/dive if we haven't found the target yet
					const isTargetComponent = isExactTarget && seg.id === targetStart;

					if (!isTargetComponent) {
						console.log(
							`[StructureSidebar] Diving into component: ${seg.tagName || seg.type} (${seg.resolvedPath})`
						);

						if (!seg.expanded) await toggleExpand(seg);
						if (seg.children) {
							const nextParentId = seg.type === 'component' ? seg.id : currentParentId;
							const found = await findInList(
								seg.children,
								targetPath,
								targetStart,
								seg.resolvedPath,
								nextParentId
							);
							if (found) {
								seg.expanded = true;
								segments = [...segments];
								return found;
							}
						}
					}
				}
			}

			if (seg.children && !seg.resolvedPath) {
				const nextParentId = seg.type === 'component' ? seg.id : currentParentId;
				const found = await findInList(
					seg.children,
					targetPath,
					targetStart,
					listContextPath,
					nextParentId
				);
				if (found) {
					seg.expanded = true;
					segments = [...segments];
					return found;
				}
			}
		}
		console.log(`[StructureSidebar] findInList: no match found in "${listContextPath}"`);
		return null;
	};

	export async function highlightSegment(componentPath: string, segmentIdOrStart: string | number) {
		if (loading) {
			let attempts = 0;
			while (loading && attempts < 20) {
				await new Promise((r) => setTimeout(r, 100));
				attempts++;
			}
		}

		console.log('[StructureSidebar] highlightSegment:', componentPath, segmentIdOrStart);
		const result = await findInList(segments, componentPath, segmentIdOrStart, filePath || '');
		if (result) {
			const { segment: found, parentId } = result;
			console.log(
				'[StructureSidebar] Found segment:',
				found.tagName || found.type,
				found.id,
				'Parent:',
				parentId
			);
			highlightedSegment = found;
			segments = [...segments];

			if (found.type === 'html' && !found.isWrapper) {
				console.log('[StructureSidebar] Auto-editing HTML segment');
				dispatch('edit', { segment: found, parentId });
			}

			setTimeout(() => {
				const element = document.querySelector(`[data-segment-id="${found.start}-${found.end}"]`);
				if (element) {
					console.log('[StructureSidebar] Scrolling to segment');
					element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}, 150);
		} else {
			console.warn(
				'[StructureSidebar] Segment not found in structure:',
				componentPath,
				segmentIdOrStart
			);

			// Notify the parent (EditorPane) to open the Properties window
			//
			// Get the component we were actually looking inside
			if (activeComponentId) {
				const componentObj = segments.find((s) => s.id === activeComponentId);

				console.log('[StructureSidebar] Component object:', componentObj);
				// Check if this component has a resolved source file path
				if (componentObj && componentObj.resolvedPath) {
					console.log(
						'[StructureSidebar] Segment not found, requesting to open component source:',
						componentObj.resolvedPath
					);

					// Dispatch the request-open event.
					// This will bubble up or be handled by EditorPane.
					dispatch('editComponent', {
						path: componentObj.resolvedPath,
						name: componentObj.tagName
					});
				}
			}
		}
	}

	function handleRowClick(segment: any) {
		if (segment.type === 'html') {
			handleEdit(segment);
		} else {
			toggleExpand(segment);
		}
		dispatch('select', { segment, parentId: currentParentId });
	}
</script>

<div class="structure-sidebar" class:root={isRoot}>
	{#if isRoot}
		<div class="header">Structure</div>
	{/if}

	{#if loading && isRoot}
		<div class="loading">Analyzing...</div>
	{:else if error && isRoot}
		<div class="error">{error}</div>
	{:else if segments.length === 0 && isRoot}
		<div class="empty">No structure found</div>
	{:else}
		<div class="tree" style={isRoot ? '' : 'padding-left: 10px; border-left: 1px solid #444;'}>
			{#each segments as segment}
				<div class="segment-wrapper">
					<div
						class="row"
						class:has-children={!!segment.resolvedPath}
						class:editable={segment.type === 'html'}
						class:non-editable={segment.type !== 'html'}
						class:interactive={segment.isInteractive}
						class:highlighted={highlightedSegment === segment}
						class:component-active={segment.id === activeComponentId}
						class:segment-active={segment.id === activeSegmentId}
						data-segment-id="{segment.start}-{segment.end}"
						title={getTooltip(segment)}
						on:click={() => handleRowClick(segment)}
					>
						<!-- Expander Arrow -->
						<span class="expander">
							{#if segment.resolvedPath}
								{segment.expanded ? '▼' : '▶'}
							{:else}
								<span class="spacer"></span>
							{/if}
						</span>

						<span class="icon">
							{#if segment.type === 'html'}
								{#if segment.subtype === 'text'}
									📝
								{:else}
									📄
								{/if}
							{:else if segment.type === 'logic'}
								{#if segment.subtype === 'InlineComponent'}
									🧩
								{:else}
									⚙️
								{/if}
							{:else if segment.type === 'container'}
								{#if segment.isInteractive}
									🔘
								{:else}
									📦
								{/if}
							{/if}
						</span>
						<span class="label">
							{#if segment.type === 'html'}
								{segment.subtype === 'text' ? 'Text' : segment.tagName}
							{:else}
								{segment.tagName || 'Block'}
							{/if}
						</span>
					</div>

					<!-- Children (Recursive) -->
					{#if segment.expanded}
						<div class="children" transition:slide|local>
							{#if segment.isLoadingChildren}
								<div class="loading-sub">Loading...</div>
							{:else if segment.children}
								<svelte:self
									bind:segments={segment.children}
									isRoot={false}
									{activeComponentId}
									{activeSegmentId}
									currentParentId={segment.type === 'component' ? segment.id : currentParentId}
									on:edit={forwardEdit}
									on:select={forwardSelect}
								/>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.structure-sidebar.root {
		width: 100%;
		height: 100%;
		background: var(--sp-bg-sidebar, #252526);
		color: var(--sp-text-main, #ccc);
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
			'Helvetica Neue', sans-serif;
		font-size: 13px;
		overflow-y: auto;
		border-right: 1px solid var(--sp-border-main, #333);
	}
	.header {
		padding: 8px 12px;
		font-weight: 600;
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.05em;
		background: var(--sp-bg-header, #333);
		color: var(--sp-text-muted, #888);
		border-bottom: 1px solid var(--sp-border-main, #444);
	}
	.segment-wrapper {
		display: flex;
		flex-direction: column;
	}
	.row {
		padding: 4px 0;
		cursor: default;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.row:hover {
		background: var(--sp-bg-hover, #2a2d2e);
	}
	.row.has-children {
		cursor: pointer;
	}
	.row.editable {
		cursor: pointer;
	}
	.row.editable:hover {
		background: var(--sp-bg-active, #37373d);
		color: var(--sp-text-main, white);
	}

	/* Grey out non-editable items */
	.row.non-editable {
		color: var(--sp-text-muted, #888);
	}
	.row.non-editable .icon {
		opacity: 0.6;
	}

	/* Highlight interactive elements */
	.row.interactive {
		color: var(--sp-text-accent, #9cdcfe);
	}

	/* Highlighted/selected row (transient/hover) */
	.row.highlighted {
		background: var(--sp-color-accent, #094771);
		color: white;
	}

	.row.component-active {
		background: rgba(255, 0, 0, 0.2) !important;
		border-left: 3px solid #ff0000 !important;
		color: white !important;
	}

	.row.segment-active {
		background: rgba(0, 123, 255, 0.2) !important;
		border-left: 3px solid #007bff !important;
		color: white !important;
	}

	.expander {
		width: 16px;
		text-align: center;
		font-size: 9px;
		color: var(--sp-text-muted, #888);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.spacer {
		display: inline-block;
		width: 16px;
	}

	.label {
		font-weight: 500;
	}

	.loading-sub {
		padding-left: 20px;
		font-size: 11px;
		font-style: italic;
		color: #666;
	}
</style>
