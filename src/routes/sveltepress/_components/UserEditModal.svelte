<!-- FILE: src/routes/sveltepress/_components/UserEditModal.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { User } from '../lib/server/auth';
  import FilePicker from './FilePicker.svelte';

  export let user: User | null;
  export let show = false;

  const dispatch = createEventDispatcher();

  let editableUser: User;
  let originalUsername: string | null;
  let showFilePicker = false;

  $: if (show && user) {
    // Deep clone the user object for editing to avoid mutating the original
    editableUser = JSON.parse(JSON.stringify(user));
    originalUsername = user.username;
  } else if (show && !user) {
    // Create a blank user for creation
    editableUser = {
      username: '',
      displayName: '',
      credentials: [],
      acl: [],
      verified: false,
    };
    originalUsername = null;
  }

  function addAclEntry(path: string) {
    if (!editableUser.acl.some((a) => a.path === path)) {
      editableUser.acl.push({ path, permission: 'R' });
      editableUser.acl = editableUser.acl; // Trigger reactivity
    }
  }

  function removeAclEntry(index: number) {
    editableUser.acl.splice(index, 1);
    editableUser.acl = editableUser.acl; // Trigger reactivity
  }

  function handleFileSelect(event: CustomEvent) {
    let selectedPath = event.detail;
    // For directories, add a trailing slash
    if (!selectedPath.split('/').pop().includes('.')) {
      selectedPath += '/';
    }
    addAclEntry(selectedPath);
    showFilePicker = false;
  }

  function handleSubmit() {
    dispatch('save', { user: editableUser, originalUsername });
  }
</script>

{#if show}
  <div class="modal-backdrop" on:click|self={() => dispatch('close')}>
    <div class="modal-content" on:click|stopPropagation>
      <form on:submit|preventDefault={handleSubmit}>
        <header>
          <h2>{originalUsername ? 'Edit User' : 'Create New User'}</h2>
          <button type="button" class="close-btn" on:click={() => dispatch('close')}>×</button>
        </header>

        <div class="form-body">
          <section class="user-details">
            <h3>Details</h3>
            <label>
              Display Name
              <input type="text" bind:value={editableUser.displayName} required />
            </label>
            <label>
              Email (Username)
              <input type="email" bind:value={editableUser.username} required />
            </label>
          </section>

          <section class="user-permissions">
            <h3>Permissions</h3>
            <div class="acl-list">
              {#each editableUser.acl as acl, i (acl.path)}
                <div class="acl-entry">
                  <span class="acl-path" title={acl.path}>{acl.path}</span>
                  <div class="acl-perms">
                    <select bind:value={acl.permission}>
                      <option value="R">Read</option>
                      <option value="W">Write</option>
                      <option value="D">Deny</option>
                    </select>
                  </div>
                  <button type="button" class="remove-btn" on:click={() => removeAclEntry(i)}>
                    -
                  </button>
                </div>
              {/each}
            </div>
            <button type="button" class="add-btn" on:click={() => (showFilePicker = true)}>
              + Add Permission
            </button>
          </section>
        </div>

        <footer>
          <button type="button" class="secondary" on:click={() => dispatch('close')}>
            Cancel
          </button>
          <button type="submit">Save Changes</button>
        </footer>
      </form>
    </div>
  </div>
{/if}

{#if showFilePicker}
  <FilePicker
    on:close={() => (showFilePicker = false)}
    on:select={handleFileSelect}
  />
{/if}

<style>
  /* --- FIX: Converted all styles to a light theme --- */
  .modal-backdrop {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.6); display: grid; place-items: center; z-index: 3000;
  }
  .modal-content {
    background: #ffffff; color: #212529; padding: 0;
    border-radius: 8px; width: min(95%, 800px);
    border: 1px solid #dee2e6; display: flex; flex-direction: column;
    max-height: 90vh;
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
  }
  header, footer {
    padding: 1rem 1.5rem; flex-shrink: 0;
  }
  header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #dee2e6;
  }
  h2 { margin: 0; color: #343a40; }
  .close-btn { background: none; border: none; color: #6c757d; font-size: 1.5rem; cursor: pointer; }
  .form-body {
    padding: 1.5rem; overflow-y: auto; display: grid;
    grid-template-columns: 1fr; gap: 2rem;
  }
  @media (min-width: 768px) {
    .form-body { grid-template-columns: 1fr 1fr; }
  }
  h3 { margin-top: 0; border-bottom: 1px solid #dee2e6; padding-bottom: 0.5rem; color: #495057; }
  label { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  input, select {
    background-color: #ffffff; color: #495057; border: 1px solid #ced4da;
    padding: 10px; border-radius: 4px;
  }
  input:focus, select:focus {
    border-color: #80bdff;
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }
  .acl-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .acl-entry { display: flex; align-items: center; gap: 0.5rem; }
  .acl-path {
    flex-grow: 1; background: #e9ecef; padding: 8px; border-radius: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace;
    border: 1px solid #ced4da;
  }
  .acl-perms select { padding: 8px; }
  .remove-btn, .add-btn {
    border: none; border-radius: 4px; cursor: pointer;
    font-weight: bold; padding: 8px 12px; color: white;
  }
  .remove-btn { background-color: #dc3545; }
  .add-btn { background-color: #28a745; }
  footer {
    border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 1rem;
    background-color: #f8f9fa;
  }
  footer button {
    border: none; border-radius: 4px; cursor: pointer;
    font-weight: bold; padding: 10px 20px;
  }
  footer .secondary { background-color: #6c757d; color: white; }
  footer button[type="submit"] { background-color: #007bff; color: white; }
</style>