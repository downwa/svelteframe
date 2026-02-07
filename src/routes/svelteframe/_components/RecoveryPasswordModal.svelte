<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { wrapKeyWithPassword } from '../lib/client/crypto';
	import { importKeyFromBase64 } from '../lib/client/crypto';

	export let show = false;
	export let hasExistingPassword = false;
	export let mode: 'save' | 'create' = 'save';
	export let mek: CryptoKey | null = null; // Required for 'create' mode

	const dispatch = createEventDispatcher();

	let password = '';
	let confirmPassword = '';
	let error = '';
	let status = 'idle'; // idle, saving, success
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

	// Reactive validation
	$: isLengthValid = password.length >= 14;
	$: isPatternValid = password.length > 0 && !/(.)\1{4,}/.test(password); // No 5+ repeated chars

	// Check for sequences (e.g. 12345, abcde)
	$: hasSequences = (() => {
		if (password.length < 5) return false;
		const sequences = [
			'01234567890123456789',
			'abcdefghijklmnopqrstuvwxyz',
			'qwertyuiopasdfghjklzxcvbnm' // Keyboard row
		];
		const lower = password.toLowerCase();
		for (const seq of sequences) {
			for (let i = 0; i < seq.length - 4; i++) {
				if (lower.includes(seq.substring(i, i + 5))) return true;
			}
			// Check reverse too
			const revInfo = seq.split('').reverse().join('');
			for (let i = 0; i < revInfo.length - 4; i++) {
				if (lower.includes(revInfo.substring(i, i + 5))) return true;
			}
		}
		return false;
	})();

	$: isComplexityValid = !hasSequences;

	$: doPasswordsMatch = password.length > 0 && password === confirmPassword;
	$: isValid = isLengthValid && isPatternValid && isComplexityValid && doPasswordsMatch;

	async function handleSubmit() {
		if (!isValid) return;

		status = 'saving';

		try {
			let keyToWrap: CryptoKey;

			if (mode === 'create') {
				if (!mek) throw new Error('Encryption key missing for creation.');
				keyToWrap = mek;
			} else {
				// 1. Get MEK from session
				const mekBase64 = sessionStorage.getItem('MEK');
				if (!mekBase64) {
					throw new Error('Encryption key not found. Please log in again.');
				}
				keyToWrap = await importKeyFromBase64(mekBase64);
			}

			// 2. Wrap MEK with password
			const { wrappedKey, salt } = await wrapKeyWithPassword(keyToWrap, password);

			if (mode === 'create') {
				// Dispatch success immediately with data
				dispatch('success', {
					wrappedKey,
					salt,
					password // Optional if needed by parent
				});
				handleClose();
				return;
			}

			// 3. Save to server (only for 'save' mode)
			const res = await fetch('/svelteframe/api/user/key-wrappers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'RECOVERY_PASSWORD',
					wrappedKeyBytes: wrappedKey,
					salt: salt
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to save recovery password.');
			}

			status = 'success';
			setTimeout(() => {
				handleClose();
			}, 1500);
		} catch (e: any) {
			console.error('Save password error:', e);
			error = e.message;
			status = 'idle';
		}
	}

	function handleClose() {
		password = '';
		confirmPassword = '';
		error = '';
		status = 'idle';
		dispatch('close');
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click|self={handleClose}>
		<div class="modal-content">
			<header>
				<h2>
					{#if mode === 'create'}
						Set Recovery Password
					{:else}
						{hasExistingPassword ? 'Change' : 'Set'} Recovery Password
					{/if}
				</h2>
				<button type="button" class="close-btn" on:click={handleClose}>×</button>
			</header>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="form-body">
					{#if status === 'success'}
						<div class="success-message">
							<span class="icon">✅</span>
							<p>Recovery password saved successfully.</p>
						</div>
					{:else}
						<p class="description">
							This password can be used to unlock your data if you lose access to your passkeys.
							<strong>Do not lose this password.</strong> We cannot recover it for you.
						</p>

						<!-- Hidden username field for accessibility/browser password managers -->
						<input
							type="text"
							name="username"
							style="display:none"
							autocomplete="username"
							value="username"
						/>

						<div class="input-group">
							<label for="recovery-password">New Password</label>
							<div class="password-wrapper">
								<input
									type={showPassword ? 'text' : 'password'}
									id="recovery-password"
									bind:value={password}
									required
									minlength="14"
									autocomplete="new-password"
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

						<div class="input-group">
							<label for="confirm-password">Confirm Password</label>
							<div class="password-wrapper">
								<input
									type={showPassword ? 'text' : 'password'}
									id="confirm-password"
									bind:value={confirmPassword}
									required
									minlength="14"
									autocomplete="new-password"
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

						<div class="validation-checklist">
							<div class="check-item" class:valid={isLengthValid}>
								<span class="icon">{isLengthValid ? '✅' : '⚪'}</span>
								<span>At least 14 characters</span>
							</div>
							<div class="check-item" class:valid={isPatternValid}>
								<span class="icon">{isPatternValid ? '✅' : '⚪'}</span>
								<span>No repetitive characters (e.g. "aaaaa")</span>
							</div>
							<div class="check-item" class:valid={isComplexityValid}>
								<span class="icon">{isComplexityValid ? '✅' : '⚪'}</span>
								<span>No sequences (e.g. "12345", "abcde")</span>
							</div>
							<div class="check-item" class:valid={doPasswordsMatch}>
								<span class="icon">{doPasswordsMatch ? '✅' : '⚪'}</span>
								<span>Passwords match</span>
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
						<button type="submit" disabled={status === 'saving' || !isValid}>
							{status === 'saving' ? 'Saving...' : 'Save Password'}
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
		z-index: 3000;
		display: grid;
		place-items: center;
	}
	.modal-content {
		background: white;
		border-radius: 8px;
		width: min(90%, 400px);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}
	header {
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #dee2e6;
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
		color: #6c757d;
	}

	.form-body {
		padding: 1.5rem;
		flex-grow: 1;
		overflow-y: auto;
	}

	footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid #dee2e6;
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		background: #f8f9fa;
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
		border: 1px solid #ced4da;
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
		padding: 2rem 0;
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
		background: #007bff;
		color: white;
	}
	button[type='submit']:disabled {
		background: #6c757d;
		cursor: not-allowed;
	}
	.secondary {
		background: #6c757d;
		color: white;
	}

	.validation-checklist {
		margin-top: 1rem;
		background: #f8f9fa;
		padding: 1rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.check-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		color: #6c757d;
	}
	.check-item:last-child {
		margin-bottom: 0;
	}
	.check-item.valid {
		color: #28a745;
		font-weight: 500;
	}
	.check-item .icon {
		font-size: 1rem;
	}
</style>
