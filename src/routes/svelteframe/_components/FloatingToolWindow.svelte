<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	export let title = 'Tool';
	export let initialX = 100;
	export let initialY = 100;
	export let width = 300;
	export let height = 400;
	export let visible = true;
	export let zIndex = 1100;

	const dispatch = createEventDispatcher();

	let windowEl: HTMLElement;
	let isDragging = false;
	let isResizing = false;
	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let currentX = initialX;
	let currentY = initialY;
	let currentWidth = width;
	let currentHeight = height;

	function handleMouseDown(e: MouseEvent) {
		// Only trigger dragging from the header
		if ((e.target as HTMLElement).closest('.window-controls')) return;
		isDragging = true;
		startX = e.clientX - currentX;
		startY = e.clientY - currentY;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleResizeStart(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		startX = e.clientX;
		startY = e.clientY;
		startWidth = currentWidth;
		startHeight = currentHeight;
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			currentX = e.clientX - startX;
			currentY = e.clientY - startY;
		}
	}

	function handleResizeMove(e: MouseEvent) {
		if (isResizing) {
			currentWidth = Math.max(200, startWidth + (e.clientX - startX));
			currentHeight = Math.max(100, startHeight + (e.clientY - startY));
		}
	}

	function handleMouseUp() {
		isDragging = false;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	function handleResizeEnd() {
		isResizing = false;
		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', handleResizeEnd);
	}

	function close() {
		dispatch('close');
	}

	$: isInteracting = isDragging || isResizing;
</script>

{#if isInteracting}
	<div class="global-overlay"></div>
{/if}

{#if visible}
	<div
		class="floating-window"
		bind:this={windowEl}
		style="left: {currentX}px; top: {currentY}px; width: {currentWidth}px; height: {currentHeight}px; z-index: {zIndex};"
		on:mousedown={() => dispatch('focus')}
	>
		<div class="window-header" on:mousedown={handleMouseDown}>
			<span class="window-title">{title}</span>
			<div class="window-controls">
				<button on:click={close} title="Close">×</button>
			</div>
		</div>
		<div class="window-content">
			<slot />
		</div>
		<div class="resize-handle" on:mousedown={handleResizeStart}></div>
	</div>
{/if}

<style>
	.floating-window {
		position: fixed;
		background: var(--sp-bg-sidebar, #1e1e1e);
		border: 1px solid var(--sp-border-main, #333);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		border-radius: 6px;
		user-select: none;
	}
	.window-header {
		background: var(--sp-bg-header, #2a2d2e);
		padding: 5px 10px;
		cursor: move;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--sp-border-main, #333);
		color: var(--sp-text-main, #eee);
	}
	.window-title {
		font-weight: bold;
		font-size: 0.9rem;
	}
	.window-controls button {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		padding: 0 4px;
	}
	.window-controls button:hover {
		color: white;
	}
	.window-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--sp-bg-main, #1e1e1e);
		position: relative;
	}

	.resize-handle {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 15px;
		height: 15px;
		cursor: nwse-resize;
		z-index: 10;
		background: linear-gradient(135deg, transparent 50%, #555 50%);
		border-radius: 0 0 6px 0;
	}
	.global-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 9999;
		cursor: inherit;
		background: transparent;
	}
</style>
