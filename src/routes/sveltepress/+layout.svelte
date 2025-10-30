<!-- FILE: src/routes/sveltepress/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  // These are the routes that should have a light theme and normal scrolling.
  const lightThemeRoutes = ['/sveltepress/portal', '/sveltepress/useradmin', '/sveltepress/setup'];

  // This will be true for the main IDE page, but false for the portal, user admin and setup.
  $: isIdeRoute = !lightThemeRoutes.some((p) =>
    $page.url.pathname.startsWith(p),
  );
</script>

<!--
  The invalid conditional <svelte:head> block has been removed.
  We now apply a conditional class to the root element, and the styles
  will target this class.
-->
<div class="sveltepress-root" class:ide-theme={isIdeRoute}>
  <slot />
</div>

<style>
  /*
    --- FIX: Use the :has() pseudo-class for conditional global styles ---
    This is the modern, correct way to solve this. This rule says:
    "If the <body> tag contains an element with the classes .sveltepress-root
    and .ide-theme, then apply these styles to the <html> and <body> tags."
    This works with SSR and does not violate any Svelte rules.
  */
  :global(html:has(.sveltepress-root.ide-theme), body:has(.sveltepress-root.ide-theme)) {
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow: hidden;
  }

  /*
    These styles are scoped to the .ide-theme class and will only apply
    when the `isIdeRoute` variable is true.
  */
  .sveltepress-root.ide-theme {
    height: 100vh;
    width: 100vw;
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /*
    These styles target a class that is only present on the main IDE page
    (/sveltepress/+page.svelte), so they do not need to be changed.
  */
  :global(.sveltepress-ide) {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
  }

  :global(.sveltepress-ide .main-content) {
    display: flex;
    flex-grow: 1;
    min-height: 0;
    padding-top: var(--main-header-height, 84px);
  }

  :global(.sveltepress-ide .sidebar) {
    width: 250px;
    flex-shrink: 0;
    height: 100%;
    background: #252526;
  }

  :global(.sveltepress-ide .editor-container) {
    flex-grow: 1;
    display: flex;
    min-width: 0;
  }
</style>