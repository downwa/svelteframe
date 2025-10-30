<!-- FILE: src/routes/sveltepress/_components/FileExplorer.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import path from 'path-browserify';
  import { debugError } from '../lib/server/debug';

  type FileEntry = {
    path: string;
    name: string;
    type: 'page' | 'component';
    usedBy?: string[];
  };

  type FileTree = {
    [folderPath: string]: FileEntry[];
  };

  export let pages: FileEntry[] = [];
  export let components: FileEntry[] = [];
  export let isLoading = true;
  export let expandComponents = false;

  const dispatch = createEventDispatcher();

  $: pageTree = buildTree(pages, 'page');
  $: componentTree = buildTree(components, 'component');

  let expandedFolders: { [key: string]: boolean } = {};
  let showContextMenu = false;
  let menuX = 0;
  let menuY = 0;
  let contextFile: FileEntry | null = null;
  let backupFiles: string[] = [];
  let showRestoreSubMenu = false;

  $: if (expandComponents) {
    Object.keys(componentTree).forEach((folder) => {
      expandedFolders[folder] = true;
    });
  }

  function handleDragStart(event: DragEvent, file: FileEntry) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('application/json', JSON.stringify(file));
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  function buildTree(files: FileEntry[], type: 'page' | 'component'): FileTree {
    const tree: FileTree = {};
    const prefix =
      type === 'page' ? 'src/routes/' : 'src/lib/';

    for (const file of files) {
      // Adjust prefix for local components
      const currentPrefix = file.path.startsWith('src/routes/') ? 'src/routes/' : prefix;
      const relativePath = file.path.substring(currentPrefix.length);
      const dirName = path.dirname(relativePath);
      const folderKey = dirName === '.' ? '/' : dirName;

      if (!tree[folderKey]) tree[folderKey] = [];
      tree[folderKey].push(file);
    }
    return tree;
  }

  function toggleFolder(folderPath: string) {
    expandedFolders[folderPath] = !expandedFolders[folderPath];
  }

  function formatTooltip(file: FileEntry): string {
    let tooltip = file.path.startsWith('src/routes/')
      ? file.path.substring('src/routes/'.length)
      : file.path.substring('src/lib/'.length);

    if (file.usedBy && file.usedBy.length > 0) {
      tooltip += '\n\nUsed by:';
      for (const user of file.usedBy) {
        const cleanUser = user.substring('src/routes/'.length);
        tooltip += `\n  • ${cleanUser}`;
      }
    }
    return tooltip;
  }

  function selectFile(file: FileEntry) {
    dispatch('select', file);
  }

  // POINT 11: Context menu for restoring files
  async function handleContextMenu(event: MouseEvent, file: FileEntry) {
    event.preventDefault();
    contextFile = file;
    menuX = event.clientX;
    menuY = event.clientY;
    showContextMenu = true;
    showRestoreSubMenu = false;
    backupFiles = [];

    try {
      const res = await fetch(`/sveltepress/api/files/backups?path=${encodeURIComponent(file.path)}`);
      if (res.ok) {
        backupFiles = await res.json();
      }
    } catch (e) {
      debugError("Couldn't fetch backups", e);
    }
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextFile = null;
  }

  async function handleRestore(backupFile: string) {
    if (!contextFile) return;
    try {
      const res = await fetch('/sveltepress/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          filePath: contextFile.path,
          backupFile: backupFile,
        }),
      });
      if (res.ok) {
        alert('File restored successfully. The file list will refresh.');
        // A full reload is the simplest way to ensure everything is up to date
        window.location.reload();
      } else {
        const err = await res.json();
        throw new Error(err.message);
      }
    } catch (e) {
      debugError('Restore failed', e);
      alert(`Error restoring file: ${e}`);
    }
    closeContextMenu();
  }

  onMount(() => {
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  });
</script>

{#if showContextMenu && contextFile}
  <div
    class="context-menu"
    style="top: {menuY}px; left: {menuX}px;"
    on:click|stopPropagation
    on:contextmenu|preventDefault
  >
    <div
      class="menu-item"
      class:disabled={backupFiles.length === 0}
      on:mouseenter={() => (showRestoreSubMenu = backupFiles.length > 0)}
      on:mouseleave={() => (showRestoreSubMenu = false)}
    >
      Restore ›
      {#if showRestoreSubMenu}
        <div class="sub-menu">
          {#each backupFiles as backup}
            <button class="menu-item" on:click={() => handleRestore(backup)}>
              {backup.replace(`_${contextFile.name}`, '')}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<nav class="file-explorer">
  {#if isLoading}
    <p class="loading-text">Loading files...</p>
  {:else}
    <section>
      <h3 class="header">PAGES</h3>
      <ul>
        {#each Object.entries(pageTree) as [folder, files] (folder)}
          {#if files.length === 1 && files[0].name === '+page.svelte'}
            <li>
              <button
                class="file-button compact"
                on:click={() => selectFile(files[0])}
                on:contextmenu={(e) => handleContextMenu(e, files[0])}
                title={formatTooltip(files[0])}
              >
                {folder}
              </button>
            </li>
          {:else}
            <li class="folder-item">
              <button
                class="folder-header"
                on:click={() => toggleFolder(folder)}
              >
                <span class="icon" class:expanded={expandedFolders[folder]}>
                  ▶
                </span>
                {folder}
              </button>
              {#if expandedFolders[folder]}
                <ul class="file-list">
                  {#each files as file (file.path)}
                    <li>
                      <button
                        class="file-button"
                        on:click={() => selectFile(file)}
                        on:contextmenu={(e) => handleContextMenu(e, file)}
                        title={formatTooltip(file)}
                      >
                        {file.name.replace('.svelte', '')}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>
    </section>
    <section class="components-section">
      <h3 class="header">COMPONENTS</h3>
      <ul>
        {#each Object.entries(componentTree) as [folder, files] (folder)}
          <li class="folder-item">
            <button class="folder-header" on:click={() => toggleFolder(folder)}>
              <span class="icon" class:expanded={expandedFolders[folder]}>
                ▶
              </span>
              {folder}
            </button>
            {#if expandedFolders[folder]}
              <ul class="file-list">
                {#each files as file (file.path)}
                  <li>
                    <button
                      class="file-button"
                      on:click={() => selectFile(file)}
                      on:contextmenu={(e) => handleContextMenu(e, file)}
                      title={formatTooltip(file)}
                      draggable="true"
                      on:dragstart={(e) => handleDragStart(e, file)}
                    >
                      {file.name.replace('.svelte', '')}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</nav>

<style>
  .file-explorer {
    background: #252526;
    padding: 10px;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
  }
  .loading-text,
  .header {
    padding: 0 8px;
    color: #ccc;
  }
  .header {
    font-size: 0.75rem;
    font-weight: bold;
    margin: 10px 0 5px;
  }
  .components-section {
    background-color: #3a3a3c;
    border-radius: 4px;
    padding: 1px 0 10px;
    margin-top: 1rem;
  }
  .components-section .header {
    padding-left: 18px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  button {
    background: none;
    border: none;
    color: #cccccc;
    text-align: left;
    width: 100%;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
  }
  button:hover {
    background-color: #37373d;
  }
  .folder-header {
    font-weight: bold;
  }
  .icon {
    font-size: 0.6em;
    margin-right: 6px;
    transition: transform 0.1s ease-in-out;
  }
  .icon.expanded {
    transform: rotate(90deg);
  }
  .file-list {
    padding-left: 15px;
  }
  .file-button.compact {
    padding-left: 13px;
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
  .menu-item {
    position: relative;
    width: 100%;
    text-align: left;
    color: #d4d4d4;
    background: none;
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    display: block;
  }
  .menu-item:not(.disabled):hover {
    background-color: #007acc;
    color: white;
  }
  .menu-item.disabled {
    color: #666;
    cursor: not-allowed;
  }
  .sub-menu {
    position: absolute;
    left: 100%;
    top: -5px;
    background-color: #3c3c3c;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 4px;
    min-width: 150px;
    z-index: 2001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }
</style>