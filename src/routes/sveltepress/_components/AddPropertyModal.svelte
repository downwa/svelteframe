<!-- FILE: src/routes/sveltepress/_components/AddPropertyModal.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let imports: any[] = [];
  const dispatch = createEventDispatcher();

  let name = '';
  let selectedType = 'string';
  let isArray = false;
  let modalContentEl: HTMLElement;

  const intrinsicTypes = ['string', 'number', 'boolean', 'any'];
  let importedTypes: string[] = [];

  onMount(() => {
    // Extract all named imports that are likely types
    const types = new Set<string>();
    imports.forEach((imp) => {
      if (imp.kind === 'type') {
        imp.specifiers.forEach((spec: any) => types.add(spec.name));
      }
    });
    importedTypes = Array.from(types);

    modalContentEl?.focus();
  });

  function handleAdd() {
    if (name.trim()) {
      dispatch('add', { name: name.trim(), type: selectedType, isArray });
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  }
</script>

<div
  class="modal-backdrop"
  on:click={handleBackdropClick}
  role="button"
  tabindex="-1"
  on:keydown|self={(e) => e.key === 'Escape' && dispatch('close')}
>
  <div
    class="modal-content"
    bind:this={modalContentEl}
    on:click|stopPropagation
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="0"
  >
    <h2 id="modal-title">Add New Script Property</h2>
    <form on:submit|preventDefault={handleAdd}>
      <label>
        Property Name
        <input type="text" bind:value={name} required />
      </label>
      <label>
        Data Type
        <select bind:value={selectedType}>
          <optgroup label="Intrinsic Types">
            {#each intrinsicTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </optgroup>
          {#if importedTypes.length > 0}
            <optgroup label="Imported Types">
              {#each importedTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={isArray} />
        Is an Array
      </label>
      <div class="actions">
        <button type="button" on:click={() => dispatch('close')}>Cancel</button>
        <button type="submit">Add Property</button>
      </div>
    </form>
  </div>
</div>

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
    z-index: 3000;
  }
  .modal-content {
    background: #4f4f4f;
    color: #e0e0e0;
    padding: 2rem;
    border-radius: 8px;
    width: min(90%, 400px);
    border: 1px solid #666;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .checkbox-label {
    flex-direction: row;
    align-items: center;
  }
  input,
  select {
    width: 100%;
    padding: 8px;
    background: #3c3c3c;
    border: 1px solid #666;
    color: white;
    border-radius: 4px;
  }
  input[type='checkbox'] {
    width: auto;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
  }
</style>