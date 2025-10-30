<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { PUBLIC_CKEDITOR_LICENSE_KEY } from '$env/static/public';

  // Import the main CSS file from the CKEditor build.
  // This allows Vite to correctly process the styles and font definitions.
  //import '@ckeditor/ckeditor5-build-decoupled-document/build/ckeditor.css';
  //import '@ckeditor/ckeditor5-build-decoupled-document/ckeditor.css';

  // --- Props from parent ---
  export let data = '';

  // --- Local State ---
  let toolbarEl: HTMLElement;
  let editorEl: HTMLElement;
  let editorInstance: any = null;

  // --- Lifecycle ---
  onMount(async () => {
    // We are correctly using the stable, pre-built package.
    const DecoupledEditor = (
      await import('@ckeditor/ckeditor5-build-decoupled-document')
    ).default;

    const editorConfig = {
      // --- THIS IS THE FIX ---
      // The 'findAndReplace' button has been removed from the toolbar
      // because it is not included in this pre-built package.
      toolbar: {
        items: [
          'undo', 'redo', '|',
          'heading', '|', 'fontFamily', 'fontSize', 'fontColor', 'fontBackgroundColor', '|',
          'bold', 'italic', 'underline', 'strikethrough', '|',
          'link', 'insertImage', 'insertTable', 'blockQuote', 'mediaEmbed', '|',
          'alignment', '|', 'bulletedList', 'numberedList', 'outdent', 'indent'
        ],
        shouldNotGroupWhenFull: false
      },
      licenseKey: PUBLIC_CKEDITOR_LICENSE_KEY,
      placeholder: 'Type or paste your content here!',
    };

    DecoupledEditor.create(editorEl, editorConfig)
      .then(editor => {
        editorInstance = editor;

        if (toolbarEl) {
          toolbarEl.appendChild(editor.ui.view.toolbar.element);
        }

        editor.setData(data);
        editor.model.document.on('change:data', () => {
          data = editor.getData();
        });
      })
      .catch(error => {
        console.error('ERROR creating DecoupledEditor instance:', error);
      });
  });

  onDestroy(() => {
    if (editorInstance) {
      editorInstance.destroy();
      editorInstance = null;
    }
  });

  $: if (editorInstance && editorInstance.getData() !== data) {
    editorInstance.setData(data);
  }
</script>

<div class="document-editor">
  <div class="toolbar-container" bind:this={toolbarEl}></div>
  <div class="content-container">
    <div class="editor" bind:this={editorEl}></div>
  </div>
</div>

<style>
  .document-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ck-color-base-border);
    border-radius: var(--ck-border-radius);
    background: var(--ck-color-base-background);
  }

  .toolbar-container {
    flex-shrink: 0;
    background: var(--ck-color-toolbar-background);
    border-bottom: 1px solid var(--ck-color-toolbar-border);
    padding: 0 0.5rem;
  }

  .content-container {
    flex-grow: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  :global(.ck-editor__editable) {
    color: black;
    background: white;
    min-height: 100%;
    box-shadow: var(--ck-inner-shadow);
    border-radius: var(--ck-border-radius);
  }

  /* --- NEW: Add list styling inside the editor --- */
  :global(.ck-content ul) {
    list-style-type: disc;
    padding-left: 2.5rem; /* Adjust as needed */
  }

  :global(.ck-content ol) {
    list-style-type: decimal;
    padding-left: 2.5rem; /* Adjust as needed */
  }

  :global(.ck-content li) {
    margin-bottom: 0.5em;
  }
</style>