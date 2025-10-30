<!-- FILE: src/routes/sveltepress/portal/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { tick } from 'svelte';

  import type { HeroSlide } from '../_pubcomponents/Hero.types';
  import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
  import headerImg1 from '../lib/assets/images/alaska_droneA_6.webp';
  import headerImg2 from '../lib/assets/images/alaska_droneA_6-p-2000.webp';
  import headerImg3 from '../lib/assets/images/alaska_droneA_6-p-1600.webp';
  import headerImg4 from '../lib/assets/images/alaska_droneA_6-p-1080.webp';
  import headerImg5 from '../lib/assets/images/alaska_droneA_6-p-800.webp';
  import headerImg6 from '../lib/assets/images/alaska_droneA_6-p-500.webp';
  
  const heroSlidesData: HeroSlide[] = [
    {
      bgImageSrc: headerImg1,
      bgImageSet: [
        { src: headerImg1, minWidth: 2001 },
        { src: headerImg2, minWidth: 1601 },
        { src: headerImg3, minWidth: 1081 },
        { src: headerImg4, minWidth: 801 },
        { src: headerImg5, minWidth: 501 },
        { src: headerImg6, minWidth: 0 },
      ],
      bgImageAlt:
        'An overview of Lake Nunavaugaluk, with mountains in the background',
      headingPhrase: 'User Portal',
      subText: 'View and manage company resources, user accounts, and more.',
      buttonText: '',
      buttonLink: '',
      progressText: '',
    },
  ];

  const heroTitlePrefix = '';

  function setMessagesFromResult(result: any) {
    if(!form) return;
    // If SvelteKit returned structured action result
    if (result && typeof result === 'object') {
      if ('type' in result) {
        // Standard SvelteKit form action result
        if (result.type === 'error') {
          form.error = result.data?.message ?? result.data?.error?.message ?? 'Form submission failed with an error.';
          form.message = '';
        }
        else if (result.type === 'success') {
          form.message = result.data?.message ?? 'Form submitted successfully';
          form.error = '';
        }
      } else {
        // Possibly a raw fetch error response - try common patterns
        // Sometimes `result.message` exists directly
        if (typeof result.message === 'string') {
          form.error = result.message;
          form.message = '';
        }
        else if (result.error && typeof result.error.message === 'string') {
          form.error = result.error.message;
          form.message = '';
        }
        else {
          const asString = JSON.stringify(result);
          form.error = `Error response: ${asString}`;
          form.message = '';
        }
      }
    }
    else {
      form.error = 'Invalid response format.';
      form.message = '';
    }
  }

  // Custom enhance wrapper that extracts error message for both fail() and thrown errors
  function customEnhance(formElement: HTMLFormElement) {
    return enhance(formElement, () => {
      return async ({ result, update }) => {
        setMessagesFromResult(result);
        // After setting error message, scroll to it if present
        // Use a next microtask so DOM updates first
        await update();

        const errorEl = document.querySelector('.error');
        if (errorEl) {
          // Smooth scroll, center align if possible
          errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Optionally set focus for accessibility
          (errorEl as HTMLElement).focus?.();
        }

      };
    });
  }

  export let data: PageData;
  export let form: ActionData;

    // --- NEW: State for the context menu ---
  let showContextMenu = false;
  let contextFile: string | null = null;
  let menuX = 0;
  let menuY = 0;
  let deleteForm: HTMLFormElement;
  let deleteFilenameInput: HTMLInputElement;
  let renameForm: HTMLFormElement;
  let renameFilenameInput: HTMLInputElement;  
  let renameNewFilenameInput: HTMLInputElement;

  function handleContextMenu(event: MouseEvent, file: string) {
    event.preventDefault();
    contextFile = file;
    menuX = event.clientX;
    menuY = event.clientY;
    showContextMenu = true;
    focusFirstItem();
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextFile = null;
  }

  function handleDelete() {
    if (!contextFile) return;

    const filename = contextFile;
    closeContextMenu();
    // Show a confirmation dialog
    if (
      confirm(`Are you sure you want to permanently delete "${filename}"?`)
    ) {
      // If confirmed, submit the hidden form
      if (deleteForm && deleteFilenameInput) {
        deleteFilenameInput.value = filename;
        deleteForm.requestSubmit();
      }
    }
  }

  function handleRename() {
    if (!contextFile) return;

    // Prompt for new filename
    const oldFilename = contextFile;
    closeContextMenu();
    const newFilename = prompt(
      `Enter a new name for "${oldFilename}":`,
      oldFilename
    );
    if (newFilename && newFilename.trim() !== '') {
      // Submit the rename request (you would need to implement this action)
      // For now, just log it
      console.log(`Renaming "${oldFilename}" to "${newFilename}"`);
      // If confirmed, submit the hidden form
      if (renameForm && renameFilenameInput) {
        renameFilenameInput.value = oldFilename;
        renameNewFilenameInput.value = newFilename;
        renameForm.requestSubmit();
      }
    } else {
      alert('Invalid filename. Please try again.');
    }
  }

  onMount(() => {
    // Close the context menu if the user clicks anywhere else
    window.addEventListener('click', closeContextMenu);
    return () => {
      window.removeEventListener('click', closeContextMenu);
    };
  });

  function handleKeyDown(event: KeyboardEvent) {
    const menu = event.currentTarget as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;

    // Find the currently focused menuitem index
    const currentIndex = items.findIndex(item => item === document.activeElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeContextMenu();
        // Reset menu position e.g. to 0 after close
        menuY = 0; // or setMenuY(0) if using a function
        break;

      case 'ArrowDown':
      case 'Tab':  // Tab can also move focus forward in menus
        event.preventDefault();
        {
          let nextIndex = 0;
          if (currentIndex >= 0) {
            nextIndex = (currentIndex + 1) % items.length;
          }
          items[nextIndex].focus();
          highlightItem(items, items[nextIndex]);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        {
          let prevIndex = items.length - 1;
          if (currentIndex > 0) {
            prevIndex = (currentIndex - 1 + items.length) % items.length;
          }
          items[prevIndex].focus();
          highlightItem(items, items[prevIndex]);
        }
        break;

      case 'Enter':
      case ' ':
        // Space or Enter activates the focused menuitem
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.click();
        }
        break;
    }
  }

  // Optional: visually mark the focused item (you could use :focus in CSS instead)
  function highlightItem(items: any[], item: HTMLElement) {
    if (items.length === 0) return;    
    items.forEach(i => i.classList.remove('highlighted'));
    item.classList.add('highlighted');
  }

  // To ensure focus is moved inside the menu after opening, you can call this after menu opens:
  async function focusFirstItem() {
    await tick();
    const menu = document.querySelector('.context-menu');
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length > 0) {
      items[0].focus();
      highlightItem(items, items[0]);
    }
  }  

</script>

<!-- --- NEW: Hidden form for the delete action --- -->
<form
  method="POST"
  action="?/deleteFile"
  use:enhance
  bind:this={deleteForm}
  style="display: none;"
>
  <input type="hidden" name="filename" bind:this={deleteFilenameInput} />
</form>

<!-- --- NEW: Hidden form for the rename action --- -->
<form
  method="POST"
  action="?/renameFile"
  use:enhance
  bind:this={renameForm}
  style="display: none;"
>
  <input type="hidden" name="oldName" bind:this={renameFilenameInput} />
  <input type="hidden" name="newName" bind:this={renameNewFilenameInput} />
</form>

<!-- --- NEW: Context Menu Markup --- -->
{#if showContextMenu}
  <div
    class="context-menu"
    role="menu"
    tabindex="0"  
    style="top: {menuY}px; left: {menuX}px;"
    on:click|stopPropagation
    on:keydown={handleKeyDown}
  >
    <button role="menuitem" on:click={handleDelete}>Delete File</button>
    <button role="menuitem" on:click={handleRename}>Rename File</button>
  </div>
{/if}

<HeroStatic slides={heroSlidesData} staticHeadingText={heroTitlePrefix} />

<div class="portal-container">
  <div class="portal-header">
    <form method="POST" action="/sveltepress/auth/logout" data-sveltekit-reload>
      <button type="submit" class="logout-button">Logout (post)</button>
    </form>
    <form method="GET" action="/sveltepress/auth/logout" data-sveltekit-reload>
      <button type="submit" class="logout-button">Logout</button>
    </form>

  </div>

  {#if form?.message}
    <div class="form-message success">{form.message}</div>
  {/if}
  {#if form?.error}
    <div class="form-message error">{form.error}</div>
  {/if}

  {#if data.protectedFiles && data.protectedFiles.length > 0}
    <section class="portal-section">
      <h2>Available Files</h2>
      <ul class="file-list">
        {#each data.protectedFiles as file}
          <li>
            <a
              href={`/sveltepress/api/protected-files/${file}`}
              class="file-card"
              download
              on:contextmenu={data.canUploadFiles
                ? (event) => handleContextMenu(event, file)
                : null}
            >
              <span class="icon">📥</span>
              <span class="filename">{file}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

<!-- --- FIX: Check for any available actions before rendering the section --- -->
{#if data.canAccessEditor || data.canAccessUserAdmin || data.canUploadFiles}
  <section class="portal-section">
    <h2>Available Actions</h2>
    <ul class="action-list">
      {#if data.canAccessEditor}
        <li>
          <a href="/sveltepress" data-sveltekit-reload class="action-card">
            <h3>Content Editor</h3>
            <p>
              Access the SveltePress IDE to edit pages and components directly
              in the browser.
            </p>
          </a>
        </li>
      {/if}

      {#if data.canAccessUserAdmin}
        <li>
          <a
            href="/sveltepress/useradmin"
            data-sveltekit-reload
            class="action-card"
          >
            <h3>User Administration</h3>
            <p>
              Manage user accounts, permissions, and email verification status.
            </p>
          </a>
        </li>
      {/if}

      <!-- --- FIX: Use the new `canUploadFiles` flag --- -->
      {#if data.canUploadFiles}
        <li>
          <form
            method="POST"
            action="?/uploadFile"
            enctype="multipart/form-data"
            use:customEnhance
            class="action-card upload-form"
          >
            <h3>Upload New File</h3>
            <p>
              Add a new file to the "Available Files" section for all
              authenticated users.
            </p>
            <div class="form-controls">
              <input type="file" name="file" required />
              <button type="submit">Upload</button>
            </div>
          </form>
        </li>
      {/if}

      {#if data.canAccessEditor}
        <li>
          <div class="action-card disabled">
            <h3>Analytics (Coming Soon)</h3>
            <p>View website traffic and performance metrics.</p>
          </div>
        </li>
      {/if}
    </ul>
  </section>
{/if}
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background-color: #f8f9fa; /* Light grey background */
    color: #212529; /* Dark text for readability */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }

  .form-message {
    padding: 1rem;
    margin-bottom: 2rem;
    border-radius: 4px;
    border: 1px solid;
  }
  .form-message.success {
    border-color: #28a745;
    background-color: #d4edda;
    color: #155724;
  }
  .form-message.error {
    border-color: #dc3545;
    background-color: #f8d7da;
    color: #721c24;
  }

  .upload-form {
    display: flex;
    flex-direction: column;
  }

  .upload-form .form-controls {
    margin-top: auto; /* Pushes controls to the bottom */
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .upload-form input[type='file'] {
    font-size: 0.9rem;
  }

  .upload-form button {
    background-color: #28a745;
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    align-self: flex-start;
  }  

  .portal-container {
    max-width: 960px;
    margin: 0 auto; /* Margin top is handled by section */
    padding: 2rem;
  }

  .portal-section {
    margin-top: 4rem;
  }

  .portal-section h2 {
    font-size: 1.8rem;
    color: #495057;
    margin-bottom: 1.5rem;
    text-align: center;
    border-bottom: 1px solid #dee2e6;
    padding-bottom: 1rem;
  }

  .action-list,
  .file-list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 1.5rem;
  }

  .action-list {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }

  .file-list {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }

  .action-card,
  .file-card {
    display: block;
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1.5rem;
    text-decoration: none;
    color: #495057;
    transition:
      transform 0.2s ease-in-out,
      box-shadow 0.2s ease-in-out;
    height: 100%;
    box-sizing: border-box;
  }

  .action-card:not(.disabled):hover,
  .file-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    border-color: #007bff;
  }

  .action-card h3 {
    margin-top: 0;
    color: #007bff;
    font-size: 1.25rem;
  }

  .action-card p {
    color: #6c757d;
    line-height: 1.6;
  }

  .action-card.disabled {
    background-color: #e9ecef;
    cursor: not-allowed;
  }

  .action-card.disabled h3 {
    color: #6c757d;
  }

  .action-card.disabled p {
    color: #adb5bd;
  }

  .file-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-weight: 500;
  }

  .file-card .icon {
    font-size: 1.5rem;
    color: #007bff;
  }

  .portal-header {
    display: flex;
    justify-content: flex-end;
    padding: 0 0 2rem 0; /* Adjust padding */
  }

  .logout-button {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
  }

  .logout-button:hover {
    background-color: #5a6268;
  }

  button.highlighted, button:focus {
    background-color: #bde4ff;
    outline: none;
  }

  /* --- NEW: Styles for the context menu --- */
  .context-menu {
    position: fixed;
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    padding: 4px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .context-menu button {
    width: 100%;
    text-align: left;
    color: #dc3545; /* Red for destructive action */
    background: none;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .context-menu button:hover {
    background-color: #dc3545;
    color: white;
  }  
</style>