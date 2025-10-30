<!-- FILE: src/routes/sveltepress/_components/FilePicker.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import path from 'path-browserify';

  const dispatch = createEventDispatcher();

  export let children: any[] | undefined = undefined;

  let activePath = ''; // Tracks the expanded branch

  // --- FIX: Make selectedPath a prop to share state across recursive calls ---
  export let selectedPath = ''; // Tracks the highlighted item for adding

  let fileTree: any[] = [];
  let isLoading = true;

  onMount(async () => {
    if (!children) {
      try {
        const res = await fetch('/sveltepress/api/project-structure');
        fileTree = await res.json();
      } catch (e) {
        console.error('Failed to load project structure', e);
      } finally {
        isLoading = false;
      }
    }
  });

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  }

  function toggleFolder(clickedPath: string) {
    if (activePath.startsWith(clickedPath) && activePath !== clickedPath) {
      // Clicking a parent of the active path keeps the branch open
    } else if (activePath === clickedPath) {
      const parent = path.dirname(clickedPath);
      activePath = parent === '.' ? '' : parent;
    } else {
      activePath = clickedPath;
    }
    selectedPath = clickedPath;
  }

  function confirmSelection() {
    if (selectedPath) {
      dispatch('select', selectedPath);
    }
  }
</script>

{#if !children}
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal-content">
      <header>
        <h2>Select a File or Directory</h2>
        <button class="close-btn" on:click={() => dispatch('close')}>×</button>
      </header>
      <div class="file-tree-container">
        {#if isLoading}
          <p>Loading project structure...</p>
        {:else}
          <!-- The `bind:selectedPath` now works correctly -->
          <svelte:self children={fileTree} bind:activePath bind:selectedPath />
        {/if}
      </div>
      <footer>
        <button
          class="add-button"
          disabled={!selectedPath}
          on:click={confirmSelection}
        >
          Add This
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if children}
  <ul>
    {#each children as node}
      {@const isExpanded = activePath.startsWith(node.path)}
      {@const isSelected = selectedPath === node.path}
      <li>
        {#if node.children}
          <!-- This is a directory -->
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
          </div>
          {#if isExpanded && node.children.length}
            <svelte:self children={node.children} bind:activePath bind:selectedPath />
          {/if}
        {:else}
          <!-- This is a file -->
          <button
            class="node-btn file"
            class:selected={isSelected}
            on:click|stopPropagation={() => (selectedPath = node.path)}
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
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: grid;
    place-items: center;
    z-index: 4000;
  }
  .modal-content {
    background: #f8f9fa;
    color: #212529;
    padding: 0;
    border-radius: 8px;
    width: min(90%, 600px);
    height: min(80vh, 700px);
    border: 1px solid #dee2e6;
    display: flex;
    flex-direction: column;
  }
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
  }
  .close-btn {
    background: none;
    border: none;
    color: #6c757d;
    font-size: 1.5rem;
    cursor: pointer;
  }
  .file-tree-container {
    flex-grow: 1;
    overflow-y: auto;
    padding: 0.5rem 1.5rem;
  }
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
    border-top: 1px solid #dee2e6;
    background-color: #f1f3f5;
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
</style>