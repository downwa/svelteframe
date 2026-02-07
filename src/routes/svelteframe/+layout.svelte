<!-- FILE: src/routes/svelteframe/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';

	import './theme.css';

	// These are the routes that should have a light theme (by default) and normal scrolling.
	// The "fullpage" editor needs scrolling because it runs inside an iframe.
	const scrollableRoutes = [
		'/svelteframe/portal',
		'/svelteframe/useradmin',
		'/svelteframe/setup',
		'/svelteframe/editor/fullpage'
	];

	// This will be true for the main IDE page, but false for the portal, user admin, setup, and fullpage editor.
	$: isIdeRoute = !scrollableRoutes.some((p) => $page.url.pathname.startsWith(p));

	$: userTheme = $page.data.user?.preferences?.theme || (isIdeRoute ? 'dark' : 'light');
	$: themeClass = userTheme === 'light' ? 'sp-theme-light' : 'sp-theme-dark';
</script>

<div class="svelteframe-root {themeClass}" class:ide-theme={isIdeRoute}>
	<slot />
</div>

<style>
	/*
    This rule correctly handles the IDE theme, locking the body scroll.
  */
	:global(html:has(.svelteframe-root.ide-theme), body:has(.svelteframe-root.ide-theme)) {
		margin: 0;
		padding: 0;
		height: 100vh;
		overflow: hidden; /* This should be hidden for IDE, auto for others */
	}

	/* --- FIX: New rule to handle the non-IDE theme routes --- */
	/* This ensures the body can scroll on pages like useradmin */
	:global(
		html:has(.svelteframe-root:not(.ide-theme)),
		body:has(.svelteframe-root:not(.ide-theme))
	) {
		height: auto;
		overflow: auto;
	}

	/*
    These styles are for the IDE theme.
  */
	.svelteframe-root.ide-theme {
		height: 100vh;
		width: 100vw;
		background-color: var(--sp-bg-main);
		color: var(--sp-text-main);
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
			'Helvetica Neue', sans-serif;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* --- FIX: New rule to handle the root container on non-IDE pages --- */
	/* This allows the main container to grow with its content. */
	.svelteframe-root:not(.ide-theme) {
		min-height: 100vh;
		height: auto;
	}

	/*
    All other global styles below are for the IDE and are correct.
  */
	:global(.svelteframe-ide) {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		overflow: hidden;
		position: relative;
	}

	:global(.svelteframe-ide .main-content) {
		display: flex;
		flex-grow: 1;
		min-height: 0;
		padding-top: var(--main-header-height, 84px);
	}

	:global(.svelteframe-ide .sidebar) {
		width: 250px;
		flex-shrink: 0;
		height: 100%;
		background: var(--sp-bg-sidebar);
	}

	:global(.svelteframe-ide .editor-container) {
		flex-grow: 1;
		display: flex;
		min-width: 0;
	}
</style>
