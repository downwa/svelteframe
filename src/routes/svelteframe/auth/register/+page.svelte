<!-- FILE: src/routes/svelteframe/auth/register/+page.svelte -->
<script lang="ts">
	import {
		startRegistration,
		base64URLStringToBuffer,
		bufferToBase64URLString
	} from '@simplewebauthn/browser';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { debugLog } from '$routes/svelteframe/lib/server/debug';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import {
		deriveKey,
		encryptData,
		generateMasterKey,
		wrapKeyWithPRF,
		wrapKeyWithPassword,
		exportKeyAsBase64,
		base64ToBuffer
	} from '$routes/svelteframe/lib/client/crypto';
	import RecoveryPasswordModal from '../../_components/RecoveryPasswordModal.svelte';

	let username = '';
	let displayName = '';
	let errorMsg = '';
	let successMsg = '';
	let isLoading = false;
	let isVerifiedFlow = false;
	let emailSent = false;
	let formElement: HTMLFormElement;

	let showRecoveryModal = false;
	let pendingMek: CryptoKey | null = null;
	let resolveRecovery: ((val: any) => void) | null = null;
	let rejectRecovery: ((reason?: any) => void) | null = null;

	function waitForRecoveryPassword(mek: CryptoKey): Promise<any> {
		pendingMek = mek;
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
		// If we were waiting for a password and the user closed the modal, cancel registration
		if (rejectRecovery) {
			rejectRecovery(
				new Error(
					'Registration cancelled: Recovery password is required if your device does not support advanced encryption.'
				)
			);
			resolveRecovery = null;
			rejectRecovery = null;
		}
		showRecoveryModal = false;
	}

	onMount(() => {
		const params = $page.url.searchParams;
		if (params.get('verified') === 'true') {
			isVerifiedFlow = true;
			username = params.get('username') || '';
			displayName = username.split('@')[0] || 'New User'; // Pre-fill display name from the email
			successMsg = 'Email verified! Now, create your passkey to finish setting up your account.';
		}
	});

	async function handleRegister() {
		errorMsg = '';
		isLoading = true;

		// --- Initiating Flow ---
		if (!isVerifiedFlow) {
			if (!username) {
				errorMsg = 'Please enter a valid email address.';
				isLoading = false;
				return;
			}

			// Check Turnstile Token
			// The widget injects an input with this name
			const turnstileInput = formElement.querySelector(
				'[name="cf-turnstile-response"]'
			) as HTMLInputElement;
			const turnstileToken = turnstileInput?.value;

			if (!turnstileToken) {
				errorMsg = 'Please complete the human verification check.';
				isLoading = false;
				return;
			}

			try {
				debugLog('Step 0: Initiating registration for', username);
				const res = await fetch(`/svelteframe/auth/register/initiate`, {
					method: 'POST',
					body: JSON.stringify({ username, turnstileToken })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.message || 'Failed to initiate registration.');

				emailSent = true;
				successMsg = `Verification email sent to ${username}. Please check your inbox.`;
			} catch (err: any) {
				errorMsg = err.message;
				console.error(err);
			} finally {
				isLoading = false;
			}
			return;
		}

		try {
			debugLog('Step 1: Fetching registration options from server...');
			const resOptions = await fetch(`/svelteframe/auth/register/generate-options`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName })
			});
			const options = await resOptions.json();
			if (!resOptions.ok) {
				// --- FIX: Surface actual error from server (e.g. "Registration session has expired") ---
				throw new Error(options.message || options.error || 'Could not get registration options.');
			}
			debugLog('Step 2: Received options. Now showing browser passkey prompt...');

			// --- FIX: Firefox requires PRF values to be Uint8Array, but JSON transport makes them strings ---
			// SimpleWebAuthn doesn't auto-convert nested extension fields deeply enough in all versions.
			if (
				options.extensions?.prf?.eval?.first &&
				typeof options.extensions.prf.eval.first === 'string'
			) {
				options.extensions.prf.eval.first = base64URLStringToBuffer(
					options.extensions.prf.eval.first
				);
			}

			const attestation = await startRegistration({ optionsJSON: options });
			debugLog('Step 3: Passkey created. Now generating MEK and encrypting data...');

			// === NEW MEK-BASED ENCRYPTION SYSTEM ===

			// Step 1: Always generate a Master Encryption Key (MEK)
			const mek = await generateMasterKey();
			debugLog('Generated MEK');

			// Step 2: Encrypt user data with MEK
			const userDataToEncrypt = {
				displayName: displayName,
				acl: [] // Start with empty ACLs
			};
			const encryptedDataString = await encryptData(mek, userDataToEncrypt);

			// Parse the encrypted data to separate IV (first 12 bytes) from ciphertext
			// encryptData returns base64(IV + ciphertext), we need to split them
			// encryptedDataString is Standard Base64 (from crypto.ts), so use base64ToBuffer
			const combined = base64ToBuffer(encryptedDataString);
			const iv = combined.slice(0, 12);
			const ciphertext = combined.slice(12);
			const encryptedDataBlob = bufferToBase64URLString(ciphertext);
			const encryptedDataIV = bufferToBase64URLString(iv);

			debugLog('Encrypted user data with MEK');

			// Step 3: Wrap the MEK based on PRF support
			const prfResults = (attestation.clientExtensionResults as any).prf;
			let wrappedMEK: string;
			let wrapperType: 'PRF' | 'RECOVERY_PASSWORD';
			let salt: string | undefined;
			let credentialId: string | undefined;

			if (prfResults?.results?.first) {
				// PRF Supported: Wrap MEK with PRF output
				debugLog('PRF supported! Wrapping MEK with PRF...');

				let firstSalt = prfResults.results.first;
				if (typeof firstSalt === 'string') {
					firstSalt = base64URLStringToBuffer(firstSalt);
				}

				wrappedMEK = await wrapKeyWithPRF(mek, firstSalt);
				wrapperType = 'PRF';
				credentialId = attestation.id; // Link wrapper to this credential

				debugLog('MEK wrapped with PRF');
			} else {
				// PRF Not Supported: Wrap MEK with recovery password
				debugLog('PRF not supported. Prompting for recovery password...');

				// Use modal to get password and wrapped key
				const result = await waitForRecoveryPassword(mek);

				wrappedMEK = result.wrappedKey;
				salt = result.salt;
				wrapperType = 'RECOVERY_PASSWORD';

				// Store MEK in sessionStorage for immediate use after registration
				sessionStorage.setItem('MEK', await exportKeyAsBase64(mek));

				debugLog('MEK wrapped with recovery password');
			}

			debugLog('Step 3.5: MEK wrapped. Now sending to server for verification...');

			const verificationPayload = {
				username,
				data: attestation,
				displayName, // Send plaintext for initial setup (will be encrypted on server)
				// MEK-based encryption data
				encryptedDataBlob,
				encryptedDataIV,
				// Key wrapper data
				keyWrapper: {
					type: wrapperType,
					wrappedKeyBytes: wrappedMEK,
					salt,
					credentialId
				}
			};

			const verificationRes = await fetch(`/svelteframe/auth/register/verify-registration`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(verificationPayload)
			});

			// SvelteKit's fetch will automatically follow the redirect from the server.
			// If the fetch completes without throwing an error, it means the redirect
			// was successful and the browser is already navigating.
			debugLog('Step 4: Verification sent. verificationRes:', verificationRes);
			if (!verificationRes.ok) {
				const errorData = await verificationRes.json();
				throw new Error(errorData.error || 'Could not verify registration.');
			}
			document.location.href =
				'/svelteframe/auth/login?username=' + encodeURIComponent(username) + '&verified=true';
		} catch (err: any) {
			isLoading = false;
			if (err.name === 'InvalidStateError') {
				errorMsg = 'This authenticator has likely already been registered. Try logging in.';
			} else {
				errorMsg = `Could not create passkey: ${err.message}`;
			}
			// DEBUG: Detailed alert for error
			alert(`An error occurred: ${errorMsg}`);
			console.error(err);
		} finally {
			// This will only run if an error occurs, re-enabling the button.
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
</svelte:head>

<div class="auth-container">
	<h1>
		{#if isVerifiedFlow}
			Create Your Passkey
		{:else}
			Register for SvelteFrame
		{/if}
	</h1>
	{#if successMsg}
		<p class="success">{successMsg}</p>
	{/if}

	{#if !emailSent}
		<form on:submit|preventDefault={handleRegister} bind:this={formElement}>
			<label>
				Username (Email)
				<input
					type="text"
					bind:value={username}
					placeholder="Enter username"
					disabled={isLoading}
					readonly={isVerifiedFlow}
				/>
			</label>

			<!-- --- NEW: Field for Display Name --- -->
			{#if isVerifiedFlow}
				<label>
					Display Name
					<input
						type="text"
						bind:value={displayName}
						placeholder="Your display name"
						disabled={isLoading}
					/>
				</label>
			{/if}

			{#if !isVerifiedFlow}
				<div class="turnstile-container">
					<div
						class="cf-turnstile"
						data-sitekey={PUBLIC_TURNSTILE_SITE_KEY}
						data-theme="dark"
					></div>
				</div>
			{/if}

			<button type="submit" disabled={isLoading}>
				{#if isLoading}
					{#if isVerifiedFlow}Creating...{:else}Sending...{/if}
				{:else if isVerifiedFlow}
					Create Passkey
				{:else}
					Register
				{/if}
			</button>
		</form>
	{/if}

	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}

	{#if !isVerifiedFlow}
		<a href="/svelteframe/auth/login">Already have an account? Login</a>
	{/if}
</div>

<RecoveryPasswordModal
	bind:show={showRecoveryModal}
	mode="create"
	mek={pendingMek}
	on:success={handleRecoverySuccess}
	on:close={handleRecoveryClose}
/>

<style>
	.auth-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1.25rem;
		padding: 2rem;
		box-sizing: border-box;
	}
	h1 {
		color: #e0e0e0;
	}
	p {
		color: #a0a0a0;
		text-align: center;
		max-width: 350px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: min(100%, 300px);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-align: left;
		font-size: 0.9rem;
		color: #ccc;
	}
	input {
		background-color: #3c3c3c;
		color: #f0f0f0;
		border: 1px solid #555;
		padding: 10px;
		border-radius: 4px;
		font-size: 1rem;
	}
	input[readonly] {
		background-color: #2a2a2a;
		color: #888;
		cursor: not-allowed;
	}
	input::placeholder {
		color: #888;
	}
	button {
		background-color: #0e639c;
		color: white;
		border: none;
		padding: 10px 15px;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	button:hover {
		background-color: #157ac0;
	}
	.error,
	.success {
		padding: 10px;
		border-radius: 4px;
		width: min(100%, 300px);
		text-align: center;
	}
	.error {
		color: #ff6b6b;
		background-color: rgba(255, 107, 107, 0.1);
		border: 1px solid #ff6b6b;
	}
	.success {
		color: #a5d6a7;
		background-color: rgba(165, 214, 167, 0.1);
		border: 1px solid #a5d6a7;
	}
	a {
		color: #3794ff;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.turnstile-container {
		display: flex;
		justify-content: center;
		margin-bottom: 0.5rem;
	}
</style>
