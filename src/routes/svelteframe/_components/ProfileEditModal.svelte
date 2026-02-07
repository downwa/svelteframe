<!-- FILE: src/routes/svelteframe/_components/ProfileEditModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { User } from '../lib/server/auth';
	import RecoveryPasswordModal from './RecoveryPasswordModal.svelte';

	export let user: User; // The currently logged-in user (with decrypted data if available)
	export let show = false;
	export let isDecrypted = false; // Whether the user currently has decrypted access
	export let publicDisplay = ''; // The original public display name (from server)

	const dispatch = createEventDispatcher();

	let privateName = '';
	let publicName = '';

	let showRecoveryModal = false;
	let hasRecoveryPassword = false;

	async function checkRecoveryStatus() {
		try {
			const res = await fetch('/svelteframe/api/user/key-wrappers');
			if (res.ok) {
				const data = await res.json();
				hasRecoveryPassword = data.wrappers?.some((w: any) => w.type === 'RECOVERY_PASSWORD');
			}
		} catch (e) {
			console.error('Failed to check recovery status:', e);
		}
	}

	onMount(() => {
		if (isDecrypted) {
			checkRecoveryStatus();
		}
	});

	// --- DEFINITIVE SCROLL FIX (JavaScript) ---
	// This reactive block directly applies the style to the <html> element,
	// bypassing any CSS selector or specificity issues. This is the exact
	// command that you verified in the console.
	$: if (typeof document !== 'undefined') {
		if (show) {
			document.documentElement.style.overflow = 'hidden';
		} else {
			// When the modal closes, remove the inline style to restore scrolling.
			document.documentElement.style.overflow = '';
		}
	}

	// Initialize form when modal opens
	$: if (show && user) {
		if (isDecrypted) {
			// If we have decrypted data, user.displayName is the PRIVATE one.
			privateName = user.displayName || '';

			checkRecoveryStatus();
		} else {
			privateName = ''; // locked/unknown
		}

		// Use the explicit publicDisplay prop if available, otherwise fallback to user.displayName
		// (which might be the private one if we didn't pass publicDisplay, but better than nothing)
		publicName = publicDisplay || user.displayName || '';
	}

	// Lock body scroll when modal is open
	$: if (typeof document !== 'undefined') {
		document.body.style.overflow = show ? 'hidden' : '';
	}

	function handleSubmit() {
		dispatch('save', {
			privateName,
			publicName,
			updateEncrypted: isDecrypted // Only attempt encryption if we are in a decrypted state
		});
	}

	function requestAddDevice() {
		dispatch('add-device');
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click|self={() => dispatch('close')}>
		<div class="modal-content" on:click|stopPropagation>
			<form on:submit|preventDefault={handleSubmit}>
				<header>
					<h2>Edit Profile</h2>
					<button type="button" class="close-btn" on:click={() => dispatch('close')}>×</button>
				</header>

				<div class="form-body">
					<p class="info-text">Manage your public identity and your private encrypted data.</p>

					{#if isDecrypted}
						<div class="section private-section">
							<h3>
								<span class="icon">🔒</span> Private Profile
							</h3>
							<p class="description">Encrypted with your passkey. Only YOU can see this.</p>
							<label>
								Private Display Name
								<input type="text" bind:value={privateName} placeholder="E.g. John Doe" />
							</label>

							<div class="recovery-actions">
								<p class="description">
									Status: {hasRecoveryPassword
										? '✅ Recovery Password Set'
										: '⚠️ No Recovery Password'}
								</p>
								<button
									type="button"
									class="tertiary small"
									on:click={() => (showRecoveryModal = true)}
								>
									{hasRecoveryPassword ? 'Change Password' : 'Set Recovery Password'}
								</button>
							</div>
						</div>
					{:else}
						<div class="section private-section disabled">
							<h3>
								<span class="icon">🔒</span> Private Profile
							</h3>
							<p class="warning">
								Unlock your profile by logging in with a PRF-compatible passkey or using your
								recovery password to edit your private data.
							</p>
						</div>
					{/if}

					<div class="section public-section">
						<h3>
							<span class="icon">📢</span> Public Profile
						</h3>
						<p class="description">
							Visible to administrators. Used as a fallback if encryption fails.
						</p>
						<label>
							Public Display Name
							<input type="text" bind:value={publicName} placeholder="E.g. J. Doe" required />
						</label>
					</div>
				</div>

				<footer>
					<button type="button" class="tertiary" on:click={requestAddDevice}>
						Add New Device
					</button>

					<!-- Existing save/cancel buttons -->
					<div class="main-actions">
						<button type="button" class="secondary" on:click={() => dispatch('close')}>
							Cancel
						</button>
						<button type="submit">
							{#if isDecrypted}
								Save & Encrypt
							{:else}
								Save Public Profile
							{/if}
						</button>
					</div>
				</footer>
			</form>
		</div>
	</div>

	<RecoveryPasswordModal
		bind:show={showRecoveryModal}
		hasExistingPassword={hasRecoveryPassword}
		on:close={() => {
			showRecoveryModal = false;
			checkRecoveryStatus(); // Refresh status after close
		}}
	/>
{/if}

<style>
	/* The JavaScript now handles the background scroll lock, so no :global() rule is needed here. */

	footer .tertiary {
		background-color: transparent;
		color: #007bff;
		border: 1px solid #007bff;
	}
	footer .tertiary:hover {
		background-color: #e7f5ff;
	}

	footer button[type='submit'] {
		background-color: #007bff;
		color: white;
	}

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
		width: min(95%, 500px);
		border: 1px solid var(--sp-border-main);
		display: flex; /* This is correct. It makes the modal content a flex container. */
		flex-direction: column; /* This is correct. */
		box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.4);
		/* --- NEW: max-height moved from inline style to here for consistency --- */
		max-height: 90vh;
	}

	/* --- FIX: Make the <form> itself the flex container that fills the modal --- */
	.modal-content > form {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0; /* Prevents flexbox overflow issues */
	}

	header,
	footer {
		padding: 1rem 1.5rem;
		flex-shrink: 0; /* Correctly prevents header/footer from shrinking */
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

	footer {
		border-top: 1px solid var(--sp-border-main);
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		background-color: var(--sp-bg-header);
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
	}

	/* --- FIX: This is the scrollable content area --- */
	.form-body {
		padding: 1.5rem;
		overflow-y: auto; /* This will now work correctly */
		flex-grow: 1; /* Tells this element to fill the available space */
	}

	/* --- All other styles below are correct and unchanged --- */
	h2 {
		margin: 0;
		color: var(--sp-text-main);
		font-size: 1.25rem;
	}
	.close-btn {
		background: none;
		border: none;
		color: var(--sp-text-muted);
		font-size: 1.5rem;
		cursor: pointer;
	}
	.info-text {
		margin-top: 0;
		color: var(--sp-text-muted);
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
	}
	.section {
		margin-bottom: 1.5rem;
		padding: 1rem;
		border-radius: 6px;
		border: 1px solid var(--sp-border-main);
	}
	.private-section {
		background-color: var(--sp-bg-active);
		border-color: var(--sp-border-main);
	}
	.public-section {
		background-color: var(--sp-bg-header);
	}
	.section.disabled {
		opacity: 0.7;
		background-color: #e9ecef;
	}
	h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.description {
		margin: 0 0 1rem 0;
		font-size: 0.85rem;
		color: var(--sp-text-muted);
	}
	.warning {
		margin: 0;
		font-size: 0.85rem;
		color: #856404;
		font-style: italic;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-weight: 500;
		font-size: 0.9rem;
	}
	input {
		padding: 0.6rem;
		border: 1px solid var(--sp-border-main);
		background-color: var(--sp-bg-input);
		color: var(--sp-text-main);
		border-radius: 4px;
		font-size: 1rem;
	}
	input:focus {
		border-color: #80bdff;
		outline: none;
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
	.recovery-actions {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--sp-border-main);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.tertiary.small {
		padding: 4px 10px;
		font-size: 0.85rem;
	}
</style>
