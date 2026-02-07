<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { unwrapKeyWithPassword, exportKeyAsBase64 } from '../lib/client/crypto';

	export let show = false;

	const dispatch = createEventDispatcher();

	let password = '';
	let error = '';
	let status = 'idle'; // idle, unlocking, success
	let showPassword = false;

	// Prevent background scrolling
	$: if (typeof document !== 'undefined') {
		if (show) {
			document.documentElement.style.overflow = 'hidden';
			document.body.style.overflow = 'hidden';
		} else {
			document.documentElement.style.overflow = '';
			document.body.style.overflow = '';
		}
	}

	async function handleSubmit() {
		error = '';
		status = 'unlocking';

		try {
			// 1. Fetch key wrappers
			const res = await fetch('/svelteframe/api/user/key-wrappers');
			if (!res.ok) throw new Error('Failed to fetch key wrappers.');

			const data = await res.json();
			const recoveryWrapper = data.wrappers?.find((w: any) => w.type === 'RECOVERY_PASSWORD');

			if (!recoveryWrapper) {
				throw new Error('No recovery password has been set for this account.');
			}

			// 2. Unwrap MEK
			const mek = await unwrapKeyWithPassword(
				recoveryWrapper.wrappedKeyBytes,
				password,
				recoveryWrapper.salt
			);

			// 3. Save to session
			const mekEx = await exportKeyAsBase64(mek);
			sessionStorage.setItem('MEK', mekEx);

			status = 'success';
			setTimeout(() => {
				dispatch('unlocked', { mek });
				handleClose();
			}, 1000);
		} catch (e: any) {
			console.error('Unlock error:', e);
			error = 'Incorrect password or data corruption.';
			status = 'idle';
		}
	}

	function handleClose() {
		password = '';
		error = '';
		status = 'idle';
		dispatch('close');
	}
</script>

{#if show}
	<div class="modal-backdrop">
		<div class="modal-content">
			<header>
				<h2>Unlock Your Vault</h2>
				<button type="button" class="close-btn" on:click={handleClose}>×</button>
			</header>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="form-body">
					{#if status === 'success'}
						<div class="success-message">
							<span class="icon">🔓</span>
							<p>Vault unlocked successfully.</p>
						</div>
					{:else}
						<p class="description">Enter your recovery password to unlock your encrypted data.</p>

						<div class="input-group">
							<label for="unlock-password">Recovery Password</label>
							<div class="password-wrapper">
								<input
									type={showPassword ? 'text' : 'password'}
									id="unlock-password"
									bind:value={password}
									required
									autofocus
									placeholder="Enter password..."
								/>
								<button
									type="button"
									class="toggle-btn"
									on:click={() => (showPassword = !showPassword)}
								>
									{showPassword ? '👁️' : '🔒'}
								</button>
							</div>
						</div>

						{#if error}
							<div class="error-message">{error}</div>
						{/if}
					{/if}
				</div>

				<footer>
					{#if status !== 'success'}
						<button type="button" class="secondary" on:click={handleClose}>Cancel</button>
						<button type="submit" disabled={status === 'unlocking'}>
							{status === 'unlocking' ? 'Unlocking...' : 'Unlock'}
						</button>
					{/if}
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		z-index: 4000;
		display: grid;
		place-items: center;
	}
	.modal-content {
		background: var(--sp-bg-modal);
		color: var(--sp-text-main);
		border-radius: 8px;
		width: min(90%, 400px);
		display: flex;
		flex-direction: column;
		border: 1px solid var(--sp-border-main);
	}
	header {
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--sp-border-main);
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--sp-text-muted);
	}

	.form-body {
		padding: 1.5rem;
	}

	footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--sp-border-main);
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		background: var(--sp-bg-header);
		border-radius: 0 0 8px 8px;
	}

	.description {
		color: #6c757d;
		font-size: 0.9rem;
		margin-top: 0;
		margin-bottom: 1.5rem;
	}

	.input-group {
		margin-bottom: 1rem;
	}
	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		font-size: 0.9rem;
	}
	input {
		width: 100%;
		padding: 0.6rem;
		border: 1px solid var(--sp-border-main);
		background-color: var(--sp-bg-input);
		color: var(--sp-text-main);
		border-radius: 4px;
		box-sizing: border-box;
	}

	.password-wrapper {
		position: relative;
		display: flex;
	}
	.password-wrapper input {
		padding-right: 2.5rem;
	}
	.toggle-btn {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 0.5rem;
		font-size: 1.2rem;
		display: flex;
		align-items: center;
	}

	.error-message {
		color: #dc3545;
		font-size: 0.9rem;
		margin-top: 1rem;
	}
	.success-message {
		text-align: center;
		color: #28a745;
		padding: 1rem 0;
	}
	.success-message .icon {
		font-size: 2rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	button {
		padding: 8px 16px;
		border-radius: 4px;
		border: none;
		font-weight: bold;
		cursor: pointer;
	}
	button[type='submit'] {
		background: var(--sp-color-accent);
		color: white;
	}
	button[type='submit']:disabled {
		background: #6c757d;
		cursor: not-allowed;
	}
	.secondary {
		background: var(--sp-color-secondary);
		color: white;
	}
</style>
