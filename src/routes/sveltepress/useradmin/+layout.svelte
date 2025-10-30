<!-- FILE: src/routes/sveltepress/useradmin/+layout.svelte -->
<div class="user-admin-layout">
  <slot />
</div>

<style>
  /*
    This layout file provides a clean slate for the user admin page.
    It overrides the parent /sveltepress layout, which has a dark theme
    and disables scrolling.
  */
  :global(html, body) {
    background-color: #ffffff;
    color: #212529;
    /* Re-enable scrolling that the parent layout disabled */
    overflow: auto;
    height: auto;
  }

  .user-admin-layout {
    background-color: #ffffff;
  }
</style>