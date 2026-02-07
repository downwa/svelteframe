<!-- FILE: src/routes/svelteframe/_components/Header.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';

	// --- Props ---
	export let selectedFile: { path: string; type: 'page' | 'component' } | null;
	export let editMode: boolean;
	export let sourceMode: boolean;
	export let forceOpen = false;
	// --- THIS IS THE FIX: New props for pinned state, bound from parent ---
	export let keepMenuActive = true;
	export let keepSidebarActive = true;
	// --- FIX: Add permissions prop ---
	export let permissions: {
		canEditHtml?: boolean;
		canEditProps?: boolean;
		canEditStyle?: boolean;
		canEditSource?: boolean;
	} = {};

	const dispatch = createEventDispatcher();

	// --- State for the hide delay ---
	const HIDE_DELAY = 1000;
	let leaveTimeout: any;

	// --- Other State ---
	let isHovered = false;
	let isFileMenuOpen = false;
	let isViewMenuOpen = false; // New state for the View menu
	let menuContainer: HTMLElement;

	// --- Event Handlers for smooth hiding ---
	function handleMouseEnter() {
		clearTimeout(leaveTimeout);
		isHovered = true;
	}

	function handleMouseLeave() {
		leaveTimeout = setTimeout(() => {
			isHovered = false;
		}, HIDE_DELAY);
	}

	// --- Other functions ---
	function toggleFileMenu() {
		isViewMenuOpen = false;
		isFileMenuOpen = !isFileMenuOpen;
	}

	function toggleViewMenu() {
		isFileMenuOpen = false;
		isViewMenuOpen = !isViewMenuOpen;
	}

	function handleNewFileClick() {
		isFileMenuOpen = false;
		dispatch('newFile');
	}

	$: user = $page.data.user;
	$: currentTheme = user?.preferences?.theme || 'dark';

	async function toggleTheme() {
		if (!user) return;
		const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

		try {
			const response = await fetch('/svelteframe/api/user/preferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: 'theme', value: newTheme })
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (e) {
			console.error('Failed to toggle theme:', e);
		}
	}

	let prevForceOpen = forceOpen;
	$: {
		if (prevForceOpen && !forceOpen) {
			isHovered = false;
		}
		prevForceOpen = forceOpen;
	}

	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				(isFileMenuOpen || isViewMenuOpen) &&
				menuContainer &&
				!menuContainer.contains(event.target as Node)
			) {
				isFileMenuOpen = false;
				isViewMenuOpen = false;
			}
		};
		window.addEventListener('click', handleClickOutside);
		return () => {
			window.removeEventListener('click', handleClickOutside);
		};
	});

	function getURLPath(path: string | undefined) {
		if (!path) return '';
		const srcIndex = path.indexOf('src/routes');
		const ret = srcIndex !== -1 ? path.substring(srcIndex + 10) : path;
		return ret.split('/').slice(0, -1).join('/');
	}
	function getDisplayPath(path: string | undefined) {
		if (!path) return 'SvelteFrame';
		const srcIndex = path.indexOf('src/');
		return srcIndex !== -1 ? path.substring(srcIndex) : path;
	}
</script>

<!-- THIS IS THE FIX: Updated expanded logic -->
<div
	class="control-bar"
	class:expanded={isHovered || forceOpen || keepMenuActive || isFileMenuOpen || isViewMenuOpen}
	on:mouseenter={handleMouseEnter}
	on:mouseleave={handleMouseLeave}
	role="toolbar"
	tabindex="0"
>
	<div class="bar-content">
		<div class="left-controls" bind:this={menuContainer}>
			<!-- THIS IS THE FIX: Disable button when sidebar is pinned -->
			<button
				class="icon-button"
				title="Toggle File Explorer"
				aria-label="Toggle File Explorer"
				on:click|stopPropagation={() => dispatch('toggleSidebar')}
				disabled={keepSidebarActive}
			>
				<svg viewBox="0 0 24 24" width="24" height="24">
					<path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
				</svg>
			</button>
			<div class="menu-container">
				<button class="menu-button" on:click|stopPropagation={toggleFileMenu}> File </button>
				{#if isFileMenuOpen}
					<div class="dropdown-menu">
						<button class="menu-item" on:click|stopPropagation={handleNewFileClick}>
							New Page...
						</button>
						<a href="/svelteframe/portal" data-sveltekit-reload class="menu-item"> Go to Portal </a>
						<form method="GET" action="/svelteframe/auth/logout" data-sveltekit-reload>
							<button type="submit" class="menu-item logout">Logout</button>
						</form>
					</div>
				{/if}
			</div>
			<!-- THIS IS THE FIX: New "View" menu -->
			<div class="menu-container">
				<button class="menu-button" on:click|stopPropagation={toggleViewMenu}> View </button>
				{#if isViewMenuOpen}
					<div class="dropdown-menu view-menu">
						<label>
							<input type="checkbox" bind:checked={keepMenuActive} />
							Keep Menu Active
						</label>
						<label>
							<input type="checkbox" bind:checked={keepSidebarActive} />
							Keep Sidebar Active
						</label>
						<div class="menu-divider"></div>
						<button class="menu-item" on:click|stopPropagation={toggleTheme}>
							Theme: {currentTheme === 'dark' ? '🌙 Dark' : '☀️ Light'}
						</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="file-info">
			<a href={getURLPath(selectedFile?.path)}>{getDisplayPath(selectedFile?.path)}</a>
		</div>

		<div class="right-controls">
			{#if selectedFile && !(editMode || sourceMode)}{/if}
		</div>
	</div>
</div>

<style>
	.control-bar {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		width: 33vw;
		height: 5px;
		background-color: var(--sp-color-accent);
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
		cursor: pointer;
		overflow: hidden;
		transition:
			height 0.2s ease-in-out,
			width 0.2s ease-in-out,
			background-color 0.2s ease-in-out;
	}
	.control-bar.expanded {
		width: 95vw;
		max-width: 1200px;
		height: 48px;
		background-color: var(--sp-bg-header);
		border: 1px solid var(--sp-border-main);
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
		padding: 0 1rem;
		box-sizing: border-box;
		color: var(--sp-text-main);
		opacity: 0;
		transition: opacity 0.1s linear;
		gap: 1rem;
	}
	.control-bar.expanded .bar-content {
		opacity: 1;
		transition: opacity 0.2s linear 0.1s;
	}
	.left-controls,
	.right-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.file-info {
		font-family: monospace;
		font-size: 0.9rem;
		color: var(--sp-text-muted);
		text-align: center;
		flex-grow: 1;
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	button {
		background: none;
		border: 1px solid transparent;
		color: var(--sp-text-main);
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
		white-space: nowrap;
	}
	button:hover:not(:disabled) {
		background-color: var(--sp-bg-hover);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-button.edit {
		background-color: var(--sp-color-accent);
		color: white;
	}
	.action-button.source {
		background-color: #f0ad4e;
		color: white;
	}
	.icon-button {
		padding: 4px;
	}
	.menu-container {
		position: relative;
		display: inline-block;
	}
	.dropdown-menu {
		position: absolute;
		top: 100%;
		left: 0;
		background-color: var(--sp-bg-modal);
		border: 1px solid var(--sp-border-main);
		border-radius: 4px;
		padding: 4px;
		min-width: 150px;
		z-index: 1001;
	}
	.dropdown-menu button {
		width: 100%;
		text-align: left;
	}

	/* --- FIX: Create a shared .menu-item class --- */
	.menu-item {
		/* Reset browser defaults */
		background: none;
		border: none;
		font-family: inherit; /* Inherit font from parent */
		font-size: inherit; /* Inherit font size from parent */
		margin: 0;

		/* Shared visual styles */
		display: block;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		color: var(--sp-text-main);
		padding: 6px 12px;
		border-radius: 3px;
		cursor: pointer;
		text-decoration: none; /* For the <a> tag */
	}

	.menu-item:hover {
		background-color: var(--sp-bg-hover);
		color: white; /* Ensure text color changes on hover for links too */
	}
	/* --- THIS IS THE FIX: Styles for the new menu items --- */
	.view-menu {
		min-width: 200px;
	}
	.view-menu label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 6px 12px;
		cursor: pointer;
		border-radius: 3px;
	}
	.view-menu label:hover {
		background-color: var(--sp-bg-hover);
	}
	.menu-item.logout:hover {
		background-color: #c82333;
	}
	.menu-divider {
		height: 1px;
		background-color: var(--sp-border-main);
		margin: 4px 0;
	}
</style>
