<script lang="ts">
	import { onMount, tick, setContext } from 'svelte';
	import { page } from '$app/stores';
	import { debugLog, debugError } from '$routes/svelteframe/lib/server/debug';
	import ComponentWrapper from './ComponentWrapper.svelte';
	import Footer from '$lib/components/Footer.svelte';

	export let data;

	let parsedData: any = null;
	let components: any[] = [];
	let isLoading = true;
	let errorMsg = '';
	let componentMap: Record<string, any> = {};

	// "Edit Mode" state is controlled by the PARENT (EditorPane) via postMessage
	// But since this +page.svelte IS the editor preview now, it's just a renderer.
	// The PARENT will decide when to overlay tools.
	// We just need to report what was clicked.

	async function loadComponent(importPath: string) {
		try {
			// Convert $lib or src/lib to absolute path for dynamic import
			// We can't actually do dynamic imports from arbitrary variables in Vite easily
			// unless they are relative to the root or follow a pattern.
			// However, since we are in the same app, we might get away with it if valid.
			// Best bet: use the same logic as the existing preview: /src/routes/svelteframe/preview/[...path]
			/*
                const module = await import(\`/\${componentPath}\`);
            */
			// Adjust path to start with /src/ if needed
			let cleanPath = importPath.replace(/^\$lib\//, 'src/lib/');
			if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
			cleanPath = cleanPath.replace('//', '/');

			const module = await import(/* @vite-ignore */ cleanPath);
			return module.default;
		} catch (e) {
			console.error(`Failed to load component ${importPath}`, e);
			return null;
		}
	}

	// Map of variable names to their values (parsed from script)
	let pageVariables: Record<string, any> = {};

	async function init() {
		try {
			const res = await fetch('/svelteframe/api/files/parse-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath: data.filePath })
			});
			if (!res.ok) throw new Error('Failed to parse page');
			const result = await res.json();
			parsedData = result.ast;

			// Load imports
			if (parsedData.imports) {
				for (const imp of parsedData.imports) {
					if (imp.source.endsWith('.svelte')) {
						const comp = await loadComponent(imp.source);
						if (comp) {
							// Map all specifiers
							imp.specifiers.forEach((spec: any) => {
								componentMap[spec.name] = comp;
							});
						}
					}
				}
			}

			// Load variables / props
			if (parsedData.props) {
				parsedData.props.forEach((p: any) => {
					try {
						pageVariables[p.name] = JSON.parse(p.value);
					} catch (e) {
						console.warn(`Failed to parse variable ${p.name}`, e);
					}
				});
			}

			components = parsedData.template || [];
		} catch (e: any) {
			errorMsg = e.message;
		} finally {
			isLoading = false;
		}
	}

	function resolveProps(props: Record<string, string>) {
		const resolved: Record<string, any> = {};
		for (const [key, value] of Object.entries(props)) {
			// Check if value looks like {variableName}
			if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
				const varName = value.substring(1, value.length - 1).trim();
				// Check if we have this variable in our parsed page scope
				if (pageVariables.hasOwnProperty(varName)) {
					resolved[key] = pageVariables[varName];
				} else {
					// Warn for unknown constants/variables
					if (varName !== 'true' && varName !== 'false') {
						// Fallback: keep original or try to evaluate?
						// For now keep original string if not found, usually better to pass undefined?
						// Or maybe it's a dynamic expression we can't handle.
						// If we leave it as string, it breaks types (HeroStatic expects Array).
						console.warn(`[FullPage] Could not resolve variable: ${varName} for prop ${key}`);
						// } else {
						// 	console.warn(`[FullPage] Resolved variable: ${varName} for prop ${key} to ${value}`);
					}
					resolved[key] = value;
				}
			} else {
				resolved[key] = value;
			}
		}
		return resolved;
	}

	function getPathForObject(obj: any, parentPath: string = ''): string {
		// Just use ID for now? Or construct a "path" like "0.1.2"?
		// We use IDs.
		return obj.id;
	}

	// --- Logic Block Simulation ---
	function canSimulateEach(content: string) {
		// Matches: {#each array as item} <Comp ... /> {/each}
		// Restricted to cases where it's a single component inside for now.
		return /\{#each\s+([\w.]+)\s+as\s+(\w+)\s*\}.*<(\w+).*\/>.*\{\/each\}/s.test(content);
	}

	function getSimulatedEach(content: string) {
		const match = content.match(
			/\{#each\s+([\w.]+)\s+as\s+(\w+)\s*\}(.*?)<(\w+)(.*?)\/>.*?\{\/each\}/s
		);
		if (!match) return {};
		const [_, arrayPath, varName, preComp, componentName, rawProps] = match;

		// Resolve array data
		let data = pageVariables;
		for (const segment of arrayPath.split('.')) {
			data = data?.[segment];
		}

		// Parse props: key={item.key} or key="val"
		const propsMap: Record<string, string> = {};
		const propRegex = /(\w+)=["{](.*?)["}]/g;
		let p;
		while ((p = propRegex.exec(rawProps)) !== null) {
			propsMap[p[1]] = p[2].replace(/^\{|\}$/g, '');
		}

		return { data, varName, componentName, propsMap };
	}

	function resolveSimProps(propsMap: Record<string, string>, item: any) {
		const resolved: Record<string, any> = {};
		for (const [key, expr] of Object.entries(propsMap)) {
			if (expr.startsWith('item.')) {
				const field = expr.substring(5);
				resolved[key] = item[field];
			} else if (expr === 'item') {
				resolved[key] = item;
			} else {
				resolved[key] = expr;
			}
		}
		return resolved;
	}

	let isEditMode = $page.url.searchParams.get('mode') === 'edit';
	let selectedId: string | null = null;
	let highlightRect: DOMRect | null = null;
	let secondaryId: string | null = null;
	let secondaryRect: DOMRect | null = null;

	function handleMessage(event: MessageEvent) {
		if (event.data.type === 'svelteframe_SET_MODE') {
			isEditMode = event.data.mode === 'edit';
			if (!isEditMode) {
				selectedId = null;
				highlightRect = null;
			}
		} else if (event.data.type === 'svelteframe_SELECT_OBJECT') {
			selectedId = event.data.id;
			secondaryId = event.data.parentId || null;
			updateHighlightRect();
		} else if (event.data.type === 'svelteframe_SCROLL_TO_SEGMENT') {
			// Highlight element based on start/end position
			// Note: Scrolling is disabled to prevent parent page from scrolling
			const { start, end } = event.data;

			console.log('[Fullpage] Received SCROLL_TO_SEGMENT:', start, end);

			// Find clickable/interactive elements first (these are more likely to have IDs)
			let targetElement: HTMLElement | null = null;

			// Try to find elements with IDs first (components usually have IDs)
			const elementsWithIds = document.querySelectorAll('[id]');
			if (elementsWithIds.length > 0) {
				// Pick the first one as a reasonable default
				targetElement = elementsWithIds[0] as HTMLElement;
				console.log('[Fullpage] Found element with ID:', targetElement.id);
			} else {
				// Fallback to any visible element
				const allElements = document.querySelectorAll('section, div, button, img, p, h1, h2, h3');
				for (const el of Array.from(allElements)) {
					if (el instanceof HTMLElement && el.offsetParent !== null) {
						targetElement = el;
						break;
					}
				}
			}

			if (targetElement) {
				// Update the highlight to show the selected element (red outline)
				selectedId = targetElement.id || null;
				console.log('[Fullpage] Setting selectedId to:', selectedId);
				updateHighlightRect();
			} else {
				console.log('[Fullpage] No target element found');
			}
		}
	}

	async function updateHighlightRect() {
		if (!selectedId && !secondaryId) {
			highlightRect = null;
			secondaryRect = null;
			return;
		}
		await tick(); // Wait for DOM

		const getRect = (id: string | null) => {
			if (!id) return null;
			const el = document.querySelector(
				`[data-sp-component="${id}"], [data-sp-id="${id}"], [data-sp-html-id="${id}"]`
			);
			if (!el) return null;

			const style = window.getComputedStyle(el);
			let rect: DOMRect | null = null;

			if (style.display === 'contents') {
				const rects = [];
				for (let i = 0; i < el.children.length; i++) {
					rects.push(el.children[i].getBoundingClientRect());
				}
				if (rects.length > 0) {
					const top = Math.min(...rects.map((r) => r.top));
					const left = Math.min(...rects.map((r) => r.left));
					const bottom = Math.max(...rects.map((r) => r.bottom));
					const right = Math.max(...rects.map((r) => r.right));
					rect = {
						top,
						left,
						width: right - left,
						height: bottom - top,
						bottom,
						right,
						x: left,
						y: top,
						toJSON: () => {}
					} as DOMRect;
				}
			} else {
				rect = el.getBoundingClientRect();
			}

			if (rect) {
				return {
					...rect,
					top: rect.top + window.scrollY,
					left: rect.left + window.scrollX
				} as DOMRect;
			}
			return null;
		};

		highlightRect = getRect(selectedId);
		secondaryRect = getRect(secondaryId);
	}

	let segmentsCache: Record<string, any[]> = {};
	async function getSegmentsFor(filePath: string) {
		if (segmentsCache[filePath]) return segmentsCache[filePath];
		try {
			const res = await fetch('/svelteframe/api/components/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath })
			});
			if (res.ok) {
				const data = await res.json();
				segmentsCache[filePath] = data.segments;
				return data.segments;
			}
		} catch (e) {
			console.error('[FullPage] Failed to fetch segments for', filePath, e);
		}
		return [];
	}

	function normalizeHtml(html: string): string {
		return html
			.replace(/\s*class="[^"]*"\s*/g, ' ')
			.replace(/\s*data-sp-[^=]+="[^"]*"\s*/g, ' ')
			.replace(/\s*s-[a-zA-Z0-9_-]+\s*/g, ' ')
			.replace(/>\s+</g, '><')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function aggressiveNormalize(html: string): string {
		return html
			.replace(/<([a-zA-Z0-9]+)[^>]*>/g, '<$1>') // Strip all attributes
			.replace(/<\/([a-zA-Z0-9]+)>/g, '</$1>')
			.replace(/>\s+/g, '>') // Strip whitespace after tags
			.replace(/\s+</g, '<') // Strip whitespace before tags
			.replace(/\s+/g, ' ')
			.trim();
	}

	function findBestSegmentForClick(
		clickX: number,
		clickY: number,
		compWrapper: HTMLElement,
		segments: any[]
	): any {
		console.log(
			'[FullPage] Scanning for best segment in segments=',
			segments,
			'at',
			clickX,
			clickY
		);
		const candidates: any[] = [];

		const htmlSegments = segments.filter((s) => s.type === 'html' && !s.isWrapper);
		let allElements = compWrapper?.querySelectorAll
			? compWrapper.querySelectorAll('*')
			: [compWrapper];

		if (allElements.length === 0) {
			console.log('[FullPage] No elements found in compWrapper');
			allElements = [compWrapper];
		}
		for (const el of allElements) {
			if (!el.getBoundingClientRect) {
				console.warn('[FullPage] Element has no getBoundingClientRect', el);
				continue;
			}
			const rect = el.getBoundingClientRect();
			if (
				clickX >= rect.left &&
				clickX <= rect.right &&
				clickY >= rect.top &&
				clickY <= rect.bottom
			) {
				const elHtmlNorm = normalizeHtml(el.outerHTML);
				const elText = el.textContent?.trim();
				console.log(
					'[FullPage] Searching for best segment for click at',
					clickX,
					clickY,
					'element:',
					el,
					elHtmlNorm,
					elText
				);

				for (const seg of htmlSegments) {
					const segNorm = normalizeHtml(seg.content || '');
					const segPlain = (seg.content || '').replace(/<[^>]+>/g, '').trim();

					let score = 0;
					if (segNorm && elHtmlNorm === segNorm) score = 100;
					else if (segNorm && segNorm.includes(elHtmlNorm)) score = 50;
					else if (segPlain && elText === segPlain) score = 10;
					else {
						// Fallback: Aggressive normalization (strip attributes)
						const elAgg = aggressiveNormalize(el.outerHTML);
						const segAgg = aggressiveNormalize(seg.content || '');
						if (segAgg.includes(elAgg)) score = 5;

						if (seg.id.includes('08a9')) {
							console.log('elAgg', elAgg);
							console.log('segAgg', segAgg);
							console.log('[FullPage] Segment 08a9:', seg.content);
						}
					}

					console.log(
						`[FullPage] Segment ${seg.id.substring(0, 4)} Score: ${score} (Aggressive match: ${score === 5})`
					);

					if (score > 0) {
						// Calculate DOM depth
						let domDepth = 0;
						let curr = el;
						while (curr !== compWrapper && curr.parentElement) {
							domDepth++;
							curr = curr.parentElement;
						}

						console.log(
							`  - Match Found! Segment ID: ${seg.id.substring(0, 8)}... Score: ${score} Preview: "${seg.preview}" (DomDepth: ${domDepth}, SegDepth: ${seg.depth})`
						);
						candidates.push({
							segment: seg,
							element: el,
							depth: seg.depth || 0,
							domDepth,
							score
						});
					}
				}
			}
		}

		if (candidates.length > 0) {
			// Sort by:
			// 1. Score DESC (Exact match always wins)
			// 2. DOM Depth DESC (Inner-most DOM element)
			// 3. Segment Depth DESC (Inner-most segment)
			candidates.sort((a, b) => b.score - a.score || b.domDepth - a.domDepth || b.depth - a.depth);
			const winner = candidates[0];
			console.log(
				'[FullPage] Scored candidates:',
				candidates.map((c) => ({
					id: c.segment.id,
					score: c.score,
					depth: c.depth,
					domDepth: c.domDepth
				}))
			);
			console.log(
				'[FullPage] Coordinate scan Winner:',
				winner.segment.id,
				'HTML:',
				winner.element.outerHTML.substring(0, 150) + '...'
			);
			return winner.segment;
		}
		return null;
	}

	async function handleClick(event: MouseEvent) {
		if (!isEditMode) return;

		const target = event.target as HTMLElement;
		const scopedClass = Array.from(target.classList).find((c) => c.startsWith('s-'));
		console.log('[FullPage] Click event detected', {
			tag: target.tagName,
			id: target.id,
			scopedClass: scopedClass,
			classes: target.className
		});
		event.preventDefault();
		event.stopPropagation();

		// Logic to find the innermost "data-sp-component" or "data-sp-block"
		// The event bubbles up. We can just check event.target and traverse up.

		// Find closest component wrapper
		// FIX: Use stricter selector to ensure we find OUR wrapper with an ID,
		// ignoring any internal component markers that might lack IDs.
		let compWrapper = target.closest('[data-sp-component][data-sp-id]');
		// Find closest HTML element (that is substantive)
		const htmlBlock = target.closest('[data-sp-html-id]');

		console.log('[FullPage] Closest Component:', compWrapper);
		console.log('[FullPage] Closest HTML Block:', htmlBlock);

		let clickedId: string | null = null;
		let type: 'html' | 'component' = 'html';

		// SELECTION PRIORITIES:
		// 1. Direct hit on an HTML block (data-sp-html-id)
		// 2. Coordinate-based scan for segments within the closest component
		// 3. Falling back to the component itself (data-sp-id)

		if (htmlBlock) {
			clickedId = htmlBlock.getAttribute('data-sp-html-id');
			type = 'html';
			compWrapper = htmlBlock;
		} else if (compWrapper) {
			const wrapper = compWrapper as HTMLElement;
			const id = wrapper.getAttribute('data-sp-id');
			const path = wrapper.getAttribute('data-sp-component') || data.filePath;

			console.log('[FullPage] No direct HTML hit, trying coordinate scan for component:', id);
			const segments = await getSegmentsFor(path);
			let bestSeg = findBestSegmentForClick(event.clientX, event.clientY, wrapper, segments);

			let sourcePath = path;
			if (bestSeg) {
				console.log('[FullPage] Coordinate scan found segment:', bestSeg.id);
				clickedId = bestSeg.id;
				type = 'html';
				sourcePath = path;
			} else {
				// Target the search
				console.log('[FullPage] Coordinate scan failed, targeting search on:', target);
				bestSeg = findBestSegmentForClick(event.clientX, event.clientY, target, segments);
			}
			if (!clickedId && id) {
				console.log('[FullPage] Coordinate scan failed, selecting component:', id);
				clickedId = id;
				type = 'component';
			}

			// Capture rect of the actual target or wrapper
			const targetRect = target.getBoundingClientRect();

			// Optimistic update
			if (type === 'component') {
				selectedId = null;
			} else {
				selectedId = clickedId;
			}
			secondaryId = id; // Always set parent component as secondaryId
			updateHighlightRect();

			// Notify Parent
			window.parent.postMessage(
				{
					type: 'svelteframe_CLICK_TARGET',
					id: clickedId,
					rect: targetRect,
					category: type,
					path: sourcePath,
					parentId: id // Pass the component wrapper ID as parentId
				},
				'*'
			);
		} else {
			console.log('[FullPage] No component or block found under cursor');
		}
	}

	onMount(() => {
		init();
		window.addEventListener('message', handleMessage);
		// Update rect on resize/scroll?
		window.addEventListener('scroll', updateHighlightRect);
		window.addEventListener('resize', updateHighlightRect);
		window.addEventListener('click', handleClick, { capture: true });
		return () => {
			window.removeEventListener('message', handleMessage);
			window.removeEventListener('scroll', updateHighlightRect);
			window.removeEventListener('resize', updateHighlightRect);
			window.removeEventListener('click', handleClick, { capture: true });
		};
	});
</script>

<div class="full-page-editor" role="main">
	{#if isLoading}
		<div class="loading">Loading Editor...</div>
	{:else if errorMsg}
		<div class="error">{errorMsg}</div>
	{:else}
		<!-- Render Template -->
		<!-- Note: We are ignoring <style> tags here as they are injected globally or scoped? 
             Ideally, we put them in svelte:head or just let them be if valid. 
             If parsedData has style, we might need to inject it. -->

		{#if parsedData.style}
			<style>
                {@html parsedData.style}
			</style>
		{/if}

		{#each components as block (block.id)}
			{#if block.type === 'component'}
				{#if componentMap[block.name]}
					<ComponentWrapper
						path={block.path || block.sourceFile || ''}
						id={block.id}
						name={block.name}
					>
						<svelte:component
							this={componentMap[block.name]}
							{...resolveProps(block.props)}
							{...pageVariables}
						/>
					</ComponentWrapper>
				{:else}
					<div class="component-missing">
						Missing: {block.name}
					</div>
				{/if}
			{:else if block.type === 'html'}
				<div data-sp-html-id={block.id} class="html-block-wrapper">
					{@html block.content}
				</div>
			{:else if block.type === 'logic'}
				{#if canSimulateEach(block.content)}
					{@const sim = getSimulatedEach(block.content)}
					<div class="logic-block-wrapper" data-logic-type="each">
						<div class="logic-label-small">Simulated Each: {block.tagName || block.subtype}</div>
						<div class="simulated-list">
							{#if Array.isArray(sim.data)}
								{#each sim.data as item}
									{#if sim.componentName && componentMap[sim.componentName]}
										<svelte:component
											this={componentMap[sim.componentName]}
											{...resolveSimProps(sim.propsMap || {}, item)}
											{...pageVariables}
										/>
									{:else if sim.componentName}
										<div class="component-missing">Missing: {sim.componentName}</div>
									{/if}
								{/each}
							{:else}
								<div class="logic-placeholder-compact">
									<span class="logic-icon">⚙️</span>
									<span class="logic-label">Each: {sim.varName} (No Data)</span>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<div class="logic-block-placeholder">
						<span class="logic-icon">⚙️</span>
						<span class="logic-label">Svelte {block.subtype} Block</span>
						<div class="logic-source">{block.content}</div>
					</div>
				{/if}
			{:else if block.type === 'html'}
				{#if block.content.trim()}
					<!--
						Use a wrapper for HTML blocks to capture clicks.
						Using a class to allow styling if needed (e.g. min-height).
					-->
					<div
						class="sp-html-block"
						class:sp-highlight={isEditMode && selectedId === block.id}
						class:sp-hover-target={isEditMode}
						data-sp-html-id={block.id}
					>
						{@html block.content}
					</div>
				{:else}
					{@html block.content}
				{/if}
			{/if}
		{/each}

		<!-- Selection Hightlight Overlay -->
		{#if isEditMode && secondaryRect}
			<div
				class="sp-selection-overlay secondary"
				style="top: {secondaryRect.top}px; left: {secondaryRect.left}px; width: {secondaryRect.width}px; height: {secondaryRect.height}px;"
			></div>
		{/if}
		{#if isEditMode && highlightRect}
			<div
				class="sp-selection-overlay"
				style="top: {highlightRect.top}px; left: {highlightRect.left}px; width: {highlightRect.width}px; height: {highlightRect.height}px;"
			></div>
		{/if}

		<!-- 
            Manually add Footer for editing since we hid the Layout footer.
            We use a fixed ID for the global footer to allow state persistence if we implement global state saving later.
        -->
		<ComponentWrapper path="src/lib/components/Footer.svelte" id="global-footer" name="Footer">
			<Footer />
		</ComponentWrapper>
	{/if}
</div>

<style>
	.full-page-editor {
		min-height: 100vh;
		position: relative;
	}
	.loading,
	.error {
		padding: 2rem;
		text-align: center;
		font-family: sans-serif;
	}
	.error {
		color: red;
	}
	.missing-component {
		border: 2px dashed red;
		padding: 1rem;
		color: red;
		background: rgba(255, 0, 0, 0.1);
	}

	.sp-html-block {
		/* Ensure it has some form factor */
		min-height: 1px;
	}
	.sp-html-block.sp-hover-target:hover {
		outline: 1px dashed #ff0000aa;
	}

	.sp-selection-overlay {
		position: absolute;
		border: 2px solid #007bff; /* Blue for primary segment */
		pointer-events: none;
		z-index: 9999;
		transition: all 0.1s ease-out;
		box-shadow: 0 0 4px rgba(0, 123, 255, 0.5);
	}
	.sp-selection-overlay.secondary {
		border: 2px solid #ff0000; /* Red for parent component */
		box-shadow: 0 0 4px rgba(255, 0, 0, 0.3);
		z-index: 9998;
	}
	.logic-block-wrapper {
		margin: 1rem 0;
		border: 1px dashed transparent;
		transition: border-color 0.2s;
	}
	.logic-block-wrapper:hover {
		border-color: var(--sp-color-primary, #3b82f6);
	}

	.logic-label-small {
		font-size: 0.65rem;
		color: #888;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.simulated-list {
		display: contents; /* Don't break layout */
	}

	.logic-placeholder-compact {
		background: #f8f9fa;
		border: 1px dashed #ced4da;
		padding: 8px;
		color: #6c757d;
		display: flex;
		align-items: center;
		gap: 8px;
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.logic-block-placeholder {
		background: #f8f9fa;
		border: 1px dashed #ced4da;
		padding: 1rem;
		color: #6c757d;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		border-radius: 4px;
	}
	.logic-icon {
		font-size: 1.5rem;
	}
	.logic-label {
		font-weight: bold;
		text-transform: uppercase;
		font-size: 0.8rem;
	}
	.logic-source {
		font-family: monospace;
		font-size: 0.75rem;
		background: #e9ecef;
		padding: 4px 8px;
		border-radius: 3px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
