<!-- FILE: src/routes/svelteframe/_components/BlockCanvas.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { debugLog } from '../lib/server/debug';

  export let template: any[] = [];
  export let selectedObject: any = null;

  const dispatch = createEventDispatcher();

  // --- FIX: Local state for DND operations ---
  let localTemplate: any[] = [];
  let isDragging = false;

  // Sync local state with prop, but only when not dragging
  $: if (!isDragging) {
    localTemplate = template;
  }

  let showDropIndicator = false;
  let dropIndicatorTop = 0;
  let showContextMenu = false;
  let menuX = 0;
  let menuY = 0;
  let contextBlock: any = null;

  function selectBlock(block: any) {
    dispatch('select', block);
  }

  function deleteBlock(block: any) {
    dispatch('delete', block);
  }

  // --- FIX: Use on:consider for local updates, on:finalize for parent updates ---
  function handleDndConsider(event: CustomEvent) {
    localTemplate = event.detail.items;
  }

  function handleDndFinalize(event: CustomEvent) {
    isDragging = false;
    debugLog('[BlockCanvas] Finalizing reorder. Dispatching event.');
    dispatch('reorder', event.detail.items);
  }

  function handleDragStart() {
    isDragging = true;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    showDropIndicator = true;

    const canvas = event.currentTarget as HTMLElement;
    const canvasRect = canvas.getBoundingClientRect();
    const children = Array.from(
      canvas.querySelectorAll('.block[data-index]'),
    ) as HTMLElement[];

    let indicatorY = canvas.offsetHeight + canvas.scrollTop;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childRect = child.getBoundingClientRect();
      const midPoint = childRect.top + childRect.height / 2;
      if (event.clientY < midPoint) {
        indicatorY = childRect.top - canvasRect.top + canvas.scrollTop;
        break;
      }
    }
    dropIndicatorTop = indicatorY;
  }

  function handleDragLeave() {
    showDropIndicator = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    showDropIndicator = false;

    if (!event.dataTransfer) return;
    const fileDataString = event.dataTransfer.getData('application/json');
    if (!fileDataString) return;

    const file = JSON.parse(fileDataString);
    let insertionIndex: number = template.length;

    const canvas = event.currentTarget as HTMLElement;
    const children = Array.from(
      canvas.querySelectorAll('.block[data-index]'),
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

    dispatch('dropnew', { file, index: insertionIndex });
  }

  function handleContextMenu(event: MouseEvent, block: any) {
    event.preventDefault();
    contextBlock = block;
    menuX = event.clientX;
    menuY = event.clientY;
    showContextMenu = true;
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  function handleDeleteClick() {
    if (contextBlock) {
      deleteBlock(contextBlock);
    }
    closeContextMenu();
  }

  function handlePreviewClick() {
    if (contextBlock?.type === 'component') {
      dispatch('preview', contextBlock);
    }
    closeContextMenu();
  }

  onMount(() => {
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  });
</script>

{#if showContextMenu}
  <div
    class="context-menu"
    style="top: {menuY}px; left: {menuX}px;"
    on:click|stopPropagation
  >
    <button on:click={handleDeleteClick}>Delete</button>
    {#if contextBlock?.type === 'component'}
      <button on:click={handlePreviewClick}>Preview Component</button>
    {/if}
  </div>
{/if}

<div
  class="block-canvas"
  use:dndzone={{ items: localTemplate, flipDurationMs: 200 }}
  on:consider={handleDndConsider}
  on:finalize={handleDndFinalize}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if showDropIndicator}
    <div class="drop-indicator" style="top: {dropIndicatorTop}px;"></div>
  {/if}

  {#each localTemplate as block, i (block.id)}
    <div
      class="block"
      class:selected={block.id === selectedObject?.id}
      on:click={() => selectBlock(block)}
      on:contextmenu={(e) => handleContextMenu(e, block)}
      on:dragstart={handleDragStart}
      on:dragend={() => (isDragging = false)}
      role="button"
      tabindex="0"
      on:keydown={(e) => e.key === 'Enter' && selectBlock(block)}
      data-index={i}
    >
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="block-content">
        {#if block.thumbnail}
          <img
            src={block.thumbnail}
            alt="Component thumbnail"
            class="thumbnail"
          />
        {/if}
        {#if block.type === 'component'}
          <div class="block-header component">{block.name}</div>
          <div class="block-body">
            {#each Object.entries(block.props) as [key, value]}
              <div>
                <span class="prop-key">{key}:</span>
                <span class="prop-value">{String(value)}</span>
              </div>
            {/each}
          </div>
        {:else if block.type === 'html'}
          <div class="block-header html">HTML</div>
          <div class="block-body html-body">
            {block.content.substring(0, 100)}...
          </div>
        {/if}
      </div>
      <button
        class="delete-button"
        title="Delete block"
        on:click|stopPropagation={() => deleteBlock(block)}
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .block-canvas {
    padding: 2rem;
    overflow-y: auto;
    height: 100%;
    background-color: #1e1e1e;
    position: relative;
    transition: background-color 0.2s ease-in-out;
  }
  .drop-indicator {
    position: absolute;
    height: 2px;
    background-color: #f0ad4e; /* Reorder color */
    width: calc(100% - 4rem);
    left: 2rem;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 0 5px #f0ad4e;
    transform: translateY(-1px);
  }
  .block {
    border: 1px solid #4a4a4a;
    border-radius: 4px;
    margin-bottom: 1rem;
    background-color: #2a2a2a;
    display: flex;
    align-items: center;
    padding: 0.5rem;
    gap: 0.5rem;
    cursor: pointer;
    transition: border-color 0.2s ease;
    position: relative;
    overflow: hidden;
  }
  .block:hover {
    border-color: #666;
  }
  .block.selected {
    border-color: #007acc;
    box-shadow: 0 0 5px #007acc;
  }
  .block-content {
    flex-grow: 1;
    position: relative;
    z-index: 2;
  }
  .thumbnail {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.15;
    z-index: 1;
    pointer-events: none;
  }
  .block-header {
    font-family: monospace;
    font-weight: bold;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    display: inline-block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }
  .component {
    background-color: #007acc;
    color: white;
  }
  .html {
    background-color: #e34c26;
    color: white;
  }
  .drag-handle {
    cursor: grab;
    color: #888;
    padding: 0.5rem;
    align-self: stretch;
    display: flex;
    align-items: center;
    background: #333;
    margin-left: -0.5rem;
    border-right: 1px solid #4a4a4a;
  }
  .drag-handle:hover {
    color: #eee;
  }
  .delete-button {
    cursor: pointer;
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    color: #888;
    z-index: 2;
  }
  .delete-button:hover {
    color: #f44336;
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
</style>
