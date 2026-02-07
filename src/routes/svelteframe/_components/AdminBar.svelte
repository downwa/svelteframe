<!-- FILE: src/routes/svelteframe/_components/AdminBar.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { hasPermission } from '$routes/svelteframe/lib/client/access';
	import { fade } from 'svelte/transition';
	import VoiceEditor from './VoiceEditor.svelte';

	let showVoiceEditor = false;

	// --- Logic: Show only for Admins on main site routes ---
	$: user = $page.data.user;
	$: path = $page.url.pathname;
	$: isSvelteFrame = path.startsWith('/svelteframe');

	// Issue 3: Use 'preview' parameter to hide bar in the IDE iframe
	$: isPreview = $page.url.searchParams.get('preview') === 'true';

	// Issue 1: Robust Theme Detection
	// We look for preferences.theme. If missing, we default to 'dark'
	$: currentTheme = user?.preferences?.theme || 'dark';
	$: themeClass = currentTheme === 'light' ? 'sp-theme-light' : 'sp-theme-dark';

	function checkAdmin(u: any) {
		// Use optional chaining to prevent crashes if user is null
		if (!u?.acl) return false;

		return (
			hasPermission(u, 'src/routes/svelteframe/', 'W') ||
			hasPermission(u, 'virtual:svelteframe/edit/html', 'W') ||
			hasPermission(u, 'virtual:svelteframe/edit/script-props', 'W') ||
			hasPermission(u, 'virtual:svelteframe/edit/style', 'W')
		);
	}

	$: hasAccess = checkAdmin(user);
	$: showEditButton = hasPermission(user, 'src/routes' + path + '/+page.svelte', 'W');
	$: showBar = !isSvelteFrame && !isPreview && hasAccess && showEditButton;

	// --- Hover Interaction ---
	const HIDE_DELAY = 1000;
	let leaveTimeout: any;
	let isHovered = false;

	function handleMouseEnter() {
		clearTimeout(leaveTimeout);
		isHovered = true;
	}

	function handleMouseLeave() {
		leaveTimeout = setTimeout(() => (isHovered = false), HIDE_DELAY);
	}

	function handleEditClick() {
		let fileTarget =
			'src/routes' + (path === '/' ? '/+page.svelte' : path.replace(/\/$/, '') + '/+page.svelte');
		window.location.href = `/svelteframe?select=${encodeURIComponent(fileTarget)}`;
	}

	function startVoiceEdit() {
		showVoiceEditor = !showVoiceEditor;
	}
</script>

{#if showBar}
	<!-- 
		Wrapped in svelteframe-root to ensure theme.css variables are applied.
		The class "ide-theme" is used in your +layout.svelte to lock height,
		but here we only want the colors, so we just use the theme class.
	-->
	<div class="svelteframe-root {themeClass}" style="display: contents;">
		<div
			class="control-bar"
			class:expanded={isHovered}
			on:mouseenter={handleMouseEnter}
			on:mouseleave={handleMouseLeave}
			role="toolbar"
			tabindex="0"
		>
			<div class="bar-content">
				<div class="left-controls">
					<button class="icon-button" aria-label="Menu" disabled>
						<svg viewBox="0 0 24 24" width="24" height="24">
							<path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
						</svg>
					</button>

					{#if showEditButton}
						<button class="action-button edit-page" on:click={handleEditClick}>
							✎ Edit Page
						</button>
						<button class="tool-btn" on:click={startVoiceEdit} title="Voice Edit">
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
								<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
								<line x1="12" y1="19" x2="12" y2="22"></line>
							</svg>
						</button>
					{/if}
				</div>

				<div class="file-info">SvelteFrame</div>

				<div class="right-controls">
					<a href="/svelteframe/portal" class="user-portal-link">
						{user?.email || user?.username || 'User'}
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showVoiceEditor}
	<VoiceEditor pagePath={path} on:close={() => (showVoiceEditor = false)} />
{/if}

<style>
	/* Use the variables defined in theme.css */
	.control-bar {
		position: fixed;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10000;
		width: 33vw;
		height: 5px;
		background-color: var(--sp-color-accent, #007acc);
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
		cursor: pointer;
		overflow: hidden;
		transition: all 0.2s ease-in-out;
		pointer-events: auto;
	}

	.control-bar.expanded {
		width: 95vw;
		max-width: 1200px;
		height: 48px;
		/* These variables must exist in theme.css or be defined globally */
		background-color: var(--sp-bg-header, #333333);
		border: 1px solid var(--sp-border-main, #444444);
		border-top: none;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		overflow: visible;
	}

	.bar-content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		box-sizing: border-box;
		color: var(--sp-text-main, #d4d4d4);
		opacity: 0;
		transition: opacity 0.1s linear;
		gap: 1rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.control-bar.expanded .bar-content {
		opacity: 1;
		transition: opacity 0.2s linear 0.1s;
	}

	.left-controls,
	.right-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.file-info {
		font-family: monospace;
		font-size: 0.9rem;
		color: var(--sp-text-muted, #888888);
		text-align: center;
		flex-grow: 1;
	}

	.user-portal-link {
		font-size: 11px;
		color: var(--sp-text-muted);
		text-decoration: none;
		padding: 4px 12px;
		border: 1px solid var(--sp-border-main);
		border-radius: 4px;
		transition: all 0.2s;
	}

	.user-portal-link:hover {
		background-color: var(--sp-bg-hover);
		color: var(--sp-text-main);
		border-color: var(--sp-text-accent);
	}

	button,
	.action-button {
		background: none;
		border: 1px solid transparent;
		color: var(--sp-text-main);
		padding: 6px 14px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		text-decoration: none;
	}

	.edit-page {
		background-color: var(--sp-color-primary, #3a9a3a);
		color: white;
		font-weight: 500;
	}

	.icon-button {
		padding: 4px;
		display: flex;
		align-items: center;
		color: var(--sp-text-muted);
	}
</style>
