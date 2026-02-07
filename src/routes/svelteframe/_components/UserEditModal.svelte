<!-- FILE: src/routes/svelteframe/_components/UserEditModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { User } from '../lib/server/auth';
	import FilePicker from './FilePicker.svelte';

	export let user: User | null;
	export let show = false;

	const dispatch = createEventDispatcher();

	let editableUser: User;
	let originalUsername: string | null;
	let showFilePicker = false;
	let isInitialized = false; // The flag to break the reactive loop.
	let selectedPresetIndex = -1;

	// --- NEW: Define the Special Roles Configuration ---
	interface PresetRole {
		label: string;
		path: string;
		permission: 'R' | 'W' | 'D';
		description: string;
	}

	let PRESET_ROLES: PresetRole[] = [
		{
			label: 'Super Administrator',
			path: './',
			permission: 'W',
			description: 'Full write access to the entire project'
		},
		{
			label: 'SvelteFrame Editor',
			path: 'src/routes/svelteframe/',
			permission: 'W',
			description: 'Can access the SvelteFrame editor interface'
		},
		{
			label: 'HTML Only Editor',
			path: 'virtual:svelteframe/edit/html',
			permission: 'W',
			description: 'Can edit page text and structure but cannot modify scripts or styles.'
		},
		{
			label: 'Script Property Editor',
			path: 'virtual:svelteframe/edit/script-props',
			permission: 'W',
			description: 'Can change component properties (images, titles) but not logic.'
		},
		{
			label: 'Style Editor',
			path: 'virtual:svelteframe/edit/style',
			permission: 'W',
			description: 'Can access and modify CSS style blocks.'
		},
		{
			label: 'User Manager',
			path: 'src/routes/svelteframe/useradmin/',
			permission: 'W',
			description: 'Can view and modify users'
		},
		{
			label: 'Site Manager',
			path: 'static/',
			permission: 'W',
			description: 'Can upload, delete, and rename public site assets'
		},
		{
			label: 'Documents Manager',
			path: 'static/documents/',
			permission: 'W',
			description: 'Can upload, delete, and rename public documents'
		},
		{
			label: 'Image Manager',
			path: 'static/images/',
			permission: 'W',
			description: 'Can upload, delete, and rename public images'
		},
		{
			label: 'Portal Manager',
			path: 'src/routes/svelteframe/portal/',
			permission: 'W',
			description: 'Can upload, delete, and rename files in restricted user Portal'
		},
		{
			label: 'Portal Restricted',
			path: 'src/routes/svelteframe/portal/',
			permission: 'D',
			description: 'Deny access to the restricted user portal'
		}
	];

	// --- NEW: Dynamic Portal Action Discovery ---
	const dynamicModules = import.meta.glob<string>('$lib/portal-actions/*.svelte', {
		eager: true,
		query: '?raw',
		import: 'default'
	});

	const DYNAMIC_ROLES: PresetRole[] = Object.entries(dynamicModules).map(([path, source]) => {
		const h3Match = source.match(/<h3>(.*?)<\/h3>/);
		const pMatch = source.match(/<p>(.*?)<\/p>/);
		const hrefMatch = source.match(/href="([^"]+)"/);

		const label = h3Match ? h3Match[1] : 'Unknown Action';
		const description = pMatch ? pMatch[1] : '';
		let href = hrefMatch ? hrefMatch[1] : '';

		// Ensure path starts with src/routes and ends with /
		if (href.startsWith('/')) href = href.slice(1);
		const fullPath = `src/routes/${href}${href.endsWith('/') ? '' : '/'}`;

		return {
			label,
			path: fullPath,
			permission: 'W' as const,
			description
		};
	});

	// Append dynamic roles to preset roles
	PRESET_ROLES = [...PRESET_ROLES, ...DYNAMIC_ROLES];

	// --- NEW: Helper to identify if a path/permission combo matches a known role ---
	function getRoleMatch(path: string, permission: string): PresetRole | undefined {
		return PRESET_ROLES.find((r) => r.path === path && r.permission === permission);
	}

	// --- NEW: Helper to get the tooltip text ---
	function getRoleTooltip(path: string, permission: string): string {
		const role = getRoleMatch(path, permission);
		return role ? `${role.label}: ${role.description}` : path;
	}

	// --- NEW: Add Preset Logic ---
	function handleAddPreset() {
		if (selectedPresetIndex === -1) return;

		const role = PRESET_ROLES[selectedPresetIndex];

		// Check if path already exists
		const existingIndex = editableUser.acl!.findIndex((a) => a.path === role.path);

		if (existingIndex >= 0) {
			// Update permission if path exists
			editableUser.acl![existingIndex].permission = role.permission;
		} else {
			// Add new entry
			editableUser.acl = [...editableUser.acl!, { path: role.path, permission: role.permission }];
		}

		// Reset selection
		selectedPresetIndex = -1;
	}

	// This reactive block locks and unlocks body scroll
	$: if (typeof document !== 'undefined') {
		if (show) {
			document.documentElement.style.overflow = 'hidden';
		} else {
			// When the modal closes, remove the inline style to restore scrolling.
			document.documentElement.style.overflow = '';
		}
	}

	// --- DEFINITIVE FIX for Uneditable Inputs ---
	// This reactive block now correctly handles the state initialization.
	$: {
		if (show && !isInitialized) {
			// This block now ONLY runs when the modal is opened (`show` is true)
			// AND the state has not yet been initialized for this session.
			if (user) {
				// Editing an existing user: Deep clone for safe editing.
				editableUser = JSON.parse(JSON.stringify(user));
				if (!editableUser.acl) editableUser.acl = [];
				originalUsername = user.username;
			} else {
				// Creating a new user.
				editableUser = {
					username: '',
					displayName: '',
					credentials: [],
					acl: [],
					verified: false
				};
				originalUsername = null;
			}
			// Set the flag to true to prevent this block from ever running again
			// until the modal is closed and re-opened.
			isInitialized = true;
		} else if (!show) {
			// When the modal is closed (`show` is false), reset the flag.
			// This prepares the component for the next time it is opened.
			isInitialized = false;
		}
	}

	function addAclEntry(path: string) {
		if (!editableUser.acl) editableUser.acl = [];
		if (!editableUser.acl.some((a) => a.path === path)) {
			editableUser.acl.push({ path, permission: 'R' });
			editableUser.acl = editableUser.acl; // Trigger reactivity
		}
	}

	function removeAclEntry(index: number) {
		if (editableUser.acl) {
			editableUser.acl.splice(index, 1);
			editableUser.acl = editableUser.acl; // Trigger reactivity
		}
	}

	function handleFileSelect(event: CustomEvent) {
		let selectedPath = event.detail;
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
						{#if editableUser?.encryptedData}
							<div class="encryption-notice">
								<span class="shield-icon">🛡️</span>
								<div class="notice-content">
									<strong>Zero-Knowledge Encryption Active</strong>
									<p>
										This user possesses a private, encrypted data blob. The <strong
											>Display Name</strong
										>
										and <strong>ACLs</strong> shown below are <em>plaintext fallbacks</em>
										visible to administrators. Modifying them will update the public fallback but
										<strong>will not</strong> change the user's private encrypted data.
									</p>
								</div>
							</div>
						{/if}

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
							{#if editableUser?.acl}
								{#each editableUser.acl as acl, i (acl)}
									<div class="acl-entry">
										<span class="acl-path" title={getRoleTooltip(acl.path, acl.permission)}>
											{acl.path}
										</span>
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
							{/if}
						</div>

						<div class="preset-section">
							<select bind:value={selectedPresetIndex}>
								<option value={-1}>Select a Role...</option>
								{#each PRESET_ROLES as role, i}
									<option value={i}>{role.label}</option>
								{/each}
							</select>
							<button
								type="button"
								class="preset-add-btn"
								on:click={handleAddPreset}
								disabled={selectedPresetIndex === -1}
							>
								Add Role
							</button>
						</div>

						<button type="button" class="add-btn" on:click={() => (showFilePicker = true)}>
							+ Add Custom Path
						</button>
					</section>
				</div>

				<footer>
					{#if originalUsername}
						<button
							type="button"
							class="resend-invitation-btn"
							on:click={() => dispatch('resend', { username: originalUsername })}
						>
							Resend Invitation
						</button>
						<span class="flex-spacer"></span>
					{/if}
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
	<FilePicker on:close={() => (showFilePicker = false)} on:select={handleFileSelect} />
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		display: grid;
		place-items: center;
		z-index: 3000;
	}
	.modal-content {
		background: var(--sp-bg-modal);
		color: var(--sp-text-main);
		padding: 0;
		border-radius: 8px;
		width: min(95%, 800px);
		border: 1px solid var(--sp-border-main);
		display: flex;
		flex-direction: column;
		max-height: 90vh;
		box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.4);
	}

	/* --- DEFINITIVE INTERNAL SCROLL FIX (Part 1) --- */
	/* Make the form a flex container that fills the modal content */
	.modal-content > form {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0; /* Prevents flexbox overflow issues */
	}

	header,
	footer {
		padding: 1rem 1.5rem;
		flex-shrink: 0;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--sp-border-main);
		background-color: var(--sp-bg-header);
		border-top-left-radius: 8px;
		border-top-right-radius: 8px;
	}
	h2 {
		margin: 0;
		color: var(--sp-text-main);
	}
	.close-btn {
		background: none;
		border: none;
		color: #6c757d;
		font-size: 1.5rem;
		cursor: pointer;
	}
	.form-body {
		padding: 1.5rem;
		overflow-y: auto;
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
	}
	@media (min-width: 768px) {
		.form-body {
			grid-template-columns: 1fr 1fr;
		}
	}
	h3 {
		margin-top: 0;
		border-bottom: 1px solid var(--sp-border-main);
		padding-bottom: 0.5rem;
		color: var(--sp-text-accent);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	input,
	select {
		background-color: var(--sp-bg-input);
		color: var(--sp-text-main);
		border: 1px solid var(--sp-border-main);
		padding: 10px;
		border-radius: 4px;
	}
	input:focus,
	select:focus {
		border-color: #80bdff;
		outline: 0;
		box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
	}
	.acl-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.acl-entry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.acl-path {
		flex-grow: 1;
		background: var(--sp-bg-active);
		padding: 8px;
		border-radius: 3px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: monospace;
		border: 1px solid var(--sp-border-main);
	}
	.acl-perms select {
		padding: 8px;
	}
	.remove-btn,
	.add-btn {
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		padding: 8px 12px;
		color: white;
	}
	.remove-btn {
		background-color: #dc3545;
	}
	.add-btn {
		background-color: #28a745;
	}
	.preset-section {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--sp-border-main);
	}
	.preset-section select {
		flex-grow: 1;
	}
	.preset-add-btn {
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 8px 16px;
		cursor: pointer;
		font-weight: bold;
	}
	.preset-add-btn:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}
	footer {
		border-top: 1px solid var(--sp-border-main);
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		background-color: var(--sp-bg-header);
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
	}
	footer button {
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		padding: 10px 20px;
	}
	footer .secondary {
		background-color: var(--sp-color-secondary);
		color: white;
	}
	footer button[type='submit'] {
		background-color: var(--sp-color-accent);
		color: white;
	}
	.encryption-notice {
		background-color: #e7f5ff;
		border: 1px solid #b3d7ff;
		color: #004085;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.shield-icon {
		font-size: 1.5rem;
	}
	.notice-content strong {
		display: block;
		margin-bottom: 0.5rem;
	}
	.notice-content p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.resend-invitation-btn {
		background-color: #ffc107;
		color: #212529;
		border: 1px solid #ffbc00;
	}
	.resend-invitation-btn:hover {
		background-color: #e0a800;
		border-color: #d39e00;
	}
	.flex-spacer {
		flex-grow: 1;
	}
</style>
