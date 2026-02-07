<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { startRegistration, base64URLStringToBuffer } from '@simplewebauthn/browser';
	import {
		importKeyFromBase64,
		base64ToBuffer,
		wrapKeyWithPRF,
		exportKeyAsBase64
	} from '$routes/svelteframe/lib/client/crypto';
	import RecoveryPasswordModal from '../../_components/RecoveryPasswordModal.svelte';

	let status = 'loading'; // loading, ready, authenticating, success, error
	let errorMessage = '';
	let userDisplayName = '';
	let username = '';
	let token = '';
	let migrationKeyBase64 = '';
	let wrappedMEK = '';
	let unwrappedMEK: CryptoKey | null = null;

	let hasRecoveryPassword = false;
	let showRecoveryModal = false;
	let pendingMek: CryptoKey | null = null;
	let recoveryMode: 'save' | 'create' = 'create';
	let resolveRecovery: ((val: any) => void) | null = null;
	let rejectRecovery: ((reason?: any) => void) | null = null;

	function waitForRecoveryPassword(mek: CryptoKey): Promise<any> {
		pendingMek = mek;
		recoveryMode = 'create';
		showRecoveryModal = true;
		return new Promise((resolve, reject) => {
			resolveRecovery = resolve;
			rejectRecovery = reject;
		});
	}

	function handleRecoverySuccess(event: CustomEvent) {
		if (resolveRecovery) {
			resolveRecovery(event.detail);
			resolveRecovery = null;
			rejectRecovery = null;
		}
		showRecoveryModal = false;
	}

	function handleRecoveryClose() {
		if (rejectRecovery) {
			rejectRecovery(
				new Error('Process cancelled: Recovery password is required for this device.')
			);
			resolveRecovery = null;
			rejectRecovery = null;
		}
		showRecoveryModal = false;
	}

	onMount(async () => {
		token = $page.url.searchParams.get('token') || '';
		migrationKeyBase64 = $page.url.searchParams.get('key') || '';

		if (!token || !migrationKeyBase64) {
			status = 'error';
			errorMessage = 'Invalid link. Missing token or key.';
			return;
		}

		try {
			// Fetch token details
			const res = await fetch(`/svelteframe/api/user/device-token?token=${token}`);
			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to fetch token details.');
			}

			if (data.status !== 'pending') {
				throw new Error('This link has expired or already been used.');
			}

			userDisplayName = data.displayName || data.username;
			username = data.username;
			wrappedMEK = data.wrappedMEK;
			hasRecoveryPassword = !!data.hasRecoveryPassword;

			// Unwrap the MEK using the migration key
			const migrationKey = await importKeyFromBase64(migrationKeyBase64);
			const wrappedBytes = base64ToBuffer(wrappedMEK);

			// Unwrap MEK (AES-GCM unwrapping AES-GCM)
			unwrappedMEK = await window.crypto.subtle.unwrapKey(
				'raw',
				wrappedBytes.buffer as ArrayBuffer,
				migrationKey,
				{ name: 'AES-GCM', iv: new Uint8Array(12) }, // Zero IV used during wrap
				{ name: 'AES-GCM', length: 256 },
				true,
				['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
			);

			status = 'ready';
		} catch (e: any) {
			console.error('Initialization error:', e);
			status = 'error';
			errorMessage = e.message;
		}
	});

	async function registerDevice() {
		if (!unwrappedMEK) return;
		status = 'authenticating';

		try {
			// 1. Get registration options
			const resOptions = await fetch('./add-device/generate-options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token })
			});
			const options = await resOptions.json();
			if (!resOptions.ok) throw new Error(options.error);

			// 2. Register passkey
			if (
				options.extensions?.prf?.eval?.first &&
				typeof options.extensions.prf.eval.first === 'string'
			) {
				options.extensions.prf.eval.first = base64URLStringToBuffer(
					options.extensions.prf.eval.first
				);
			}

			const attestation = await startRegistration({ optionsJSON: options });

			// 3. Wrap MEK with new PRF or Recovery Password
			const prfResults = (attestation.clientExtensionResults as any).prf;
			let finalWrappedKey = '';
			let finalWrapperType = 'NONE';
			let finalSalt = '';

			if (prfResults?.results?.first) {
				// PRF Supported
				let firstSalt = prfResults.results.first;
				if (typeof firstSalt === 'string') firstSalt = base64URLStringToBuffer(firstSalt);
				finalWrappedKey = await wrapKeyWithPRF(unwrappedMEK, firstSalt);
				finalWrapperType = 'PRF';
			} else {
				// PRF Not Supported - Fallback to Recovery Password
				if (hasRecoveryPassword) {
					// User already has a recovery password. They don't NEED a new one.
					// But we should explain this.
					alert(
						"Your device doesn't support advanced encryption. Since you already have a recovery password set, you will be able to use it to unlock your data on this device."
					);
					// We send NONE as wrapper type because we don't need a DEVICE-SPECIFIC wrapper for recovery passwords.
					// The global one will work.
					finalWrapperType = 'NONE';
				} else {
					alert(
						"Your device doesn't support advanced encryption. You must create a recovery password now to secure your account on this device."
					);
					const result = await waitForRecoveryPassword(unwrappedMEK);
					finalWrappedKey = result.wrappedKey;
					finalSalt = result.salt;
					finalWrapperType = 'RECOVERY_PASSWORD';
				}
			}

			// 4. Verify and Login
			const verifyRes = await fetch('./add-device/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token,
					attestation,
					wrappedMEK: finalWrappedKey,
					wrapperType: finalWrapperType,
					salt: finalSalt
				})
			});

			const verifyData = await verifyRes.json();
			if (!verifyRes.ok) throw new Error(verifyData.error);

			// 5. Success - Save MEK to session and redirect
			const mekExported = await exportKeyAsBase64(unwrappedMEK);
			sessionStorage.setItem('MEK', mekExported);

			status = 'success';
			setTimeout(() => {
				goto('/svelteframe/portal');
			}, 1500);
		} catch (e: any) {
			console.error('Registration error:', e);
			status = 'error';
			errorMessage = e.message;
		}
	}
</script>

<div class="container">
	<div class="card">
		<h1>Add This Device</h1>

		{#if status === 'loading'}
			<p>Verifying link...</p>
			<div class="spinner"></div>
		{:else if status === 'error'}
			<div class="error-state">
				<p class="error-icon">❌</p>
				<h3>Something went wrong</h3>
				<p>{errorMessage}</p>
				<a href="/svelteframe/auth/login" class="btn secondary">Go to Login</a>
			</div>
		{:else if status === 'ready'}
			<div class="ready-state">
				<p>
					You are about to add this device to the account:
					<strong>{userDisplayName}</strong> ({username})
				</p>
				<p class="crypto-notice">🔒 Your encryption key has been securely transferred.</p>
				<button on:click={registerDevice} class="btn primary"> Register This Device </button>
			</div>
		{:else if status === 'authenticating'}
			<p>Follow the prompts on your device...</p>
			<div class="spinner"></div>
		{:else if status === 'success'}
			<div class="success-state">
				<p class="success-icon">✅</p>
				<h3>Device Added!</h3>
				<p>Redirecting to portal...</p>
			</div>
		{/if}
	</div>
</div>

<RecoveryPasswordModal
	bind:show={showRecoveryModal}
	bind:mode={recoveryMode}
	mek={pendingMek}
	on:success={handleRecoverySuccess}
	on:close={handleRecoveryClose}
/>

<style>
	.container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background-color: #f8f9fa;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	.card {
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		max-width: 400px;
		width: 100%;
		text-align: center;
	}

	h1 {
		margin-top: 0;
		color: #333;
	}

	.spinner {
		border: 4px solid #f3f3f3;
		border-top: 4px solid #3498db;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		animation: spin 1s linear infinite;
		margin: 1rem auto;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.btn {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		border: none;
		margin-top: 1rem;
		transition: transform 0.1s;
	}

	.btn:active {
		transform: scale(0.98);
	}

	.btn.primary {
		background-color: #007bff;
		color: white;
	}

	.btn.secondary {
		background-color: #6c757d;
		color: white;
	}

	.error-state {
		color: #d32f2f;
	}

	.error-icon,
	.success-icon {
		font-size: 3rem;
		margin: 0;
	}

	.crypto-notice {
		background: #e8f5e9;
		color: #2e7d32;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
		margin: 1rem 0;
	}
</style>
