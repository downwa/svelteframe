<!-- FILE: src/routes/svelteframe/auth/login/+page.svelte -->
<script lang="ts">
	import {
		startAuthentication,
		base64URLStringToBuffer,
		bufferToBase64URLString
	} from '@simplewebauthn/browser';
	import {
		deriveKey,
		decryptData,
		unwrapKeyWithPRF,
		unwrapKeyWithPassword,
		importKeyFromBase64,
		exportKeyAsBase64
	} from '$routes/svelteframe/lib/client/crypto';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import UnlockVaultModal from '../../_components/UnlockVaultModal.svelte';

	export let data; // From +page.server.ts
	$: pageTitle = `SvelteFrame Login (${data.siteName})`;

	let username = '';
	let errorMsg = '';
	let successMsg = '';
	let isLoading = false;
	let rememberMe = false;
	let showUnlockModal = false;

	async function finalizeLogin(mek: CryptoKey | null) {
		// Step 4: If MEK available, fetch and decrypt user data
		if (mek) {
			try {
				const dataRes = await fetch('/svelteframe/api/user/encrypted-data');
				if (dataRes.ok) {
					const { encryptedData, iv } = await dataRes.json();

					if (encryptedData && iv) {
						// Reconstruct the encrypted blob (IV + ciphertext)
						// iv and encryptedData (from server) are URL-safe base64 strings
						const ivBuf = base64URLStringToBuffer(iv);
						const cipherBuf = base64URLStringToBuffer(encryptedData);

						const ivArr = new Uint8Array(ivBuf);
						const cipherArr = new Uint8Array(cipherBuf);

						const combined = new Uint8Array(ivArr.length + cipherArr.length);
						combined.set(ivArr, 0);
						combined.set(cipherArr, ivArr.length);

						// Decrypt directly with the buffer to avoid re-encoding issues
						const decrypted = await decryptData(mek, combined);
						console.log('[Login] User data decrypted successfully');

						// Store decrypted data in sessionStorage
						sessionStorage.setItem('decryptedUserData', JSON.stringify(decrypted));
					}
				}
			} catch (e) {
				console.error('[Login] Failed to decrypt user data:', e);
			}

			// Ensure MEK is stored even if data decryption fails or no data exists yet
			try {
				const mekStr = await exportKeyAsBase64(mek);
				sessionStorage.setItem('MEK', mekStr);
			} catch (e) {
				console.error('[Login] Failed to export MEK:', e);
			}
		} else {
			console.log('[Login] No MEK available, user data will not be decrypted');
		}

		// Step 5: Handle remember me and reload
		if (rememberMe) {
			setCookie('svelteframe_username', username, 30);
		} else {
			setCookie('svelteframe_username', '', -1);
		}

		window.location.href = '/svelteframe/portal';
	}

	function handleUnlockSuccess(event: CustomEvent) {
		const { mek } = event.detail;
		showUnlockModal = false;
		finalizeLogin(mek);
	}

	function setCookie(name: string, value: string, days: number) {
		let expires = '';
		if (days) {
			const date = new Date();
			date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
			expires = '; expires=' + date.toUTCString();
		}
		document.cookie = name + '=' + (value || '') + expires + '; path=/';
	}

	function getCookie(name: string): string | null {
		const nameEQ = name + '=';
		const ca = document.cookie.split(';');
		for (let i = 0; i < ca.length; i++) {
			let c = ca[i];
			while (c.charAt(0) == ' ') c = c.substring(1, c.length);
			if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
		}
		return null;
	}

	onMount(() => {
		const rememberedUser = getCookie('svelteframe_username');
		if (rememberedUser) {
			username = rememberedUser;
			rememberMe = true;
		}
		const urlUsername = $page.url.searchParams.get('username');
		if (urlUsername) {
			username = urlUsername;
		}
		if ($page.url.searchParams.get('verified') === 'true') {
			successMsg = 'You have successfully created a Passkey and can login with it.';
		}
	});

	async function handleLogin() {
		errorMsg = '';
		isLoading = true;
		if (!username) {
			errorMsg = 'Username is required.';
			isLoading = false;
			return;
		}

		try {
			const resOptions = await fetch(`/svelteframe/auth/login/generate-options`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username })
			});
			const options = await resOptions.json();

			if (!resOptions.ok) {
				throw new Error(options.error || 'Failed to get login options.');
			}

			// Convert PRF extension salt to Uint8Array (required for some browsers)
			if (
				options.extensions?.prf?.eval?.first &&
				typeof options.extensions.prf.eval.first === 'string'
			) {
				options.extensions.prf.eval.first = base64URLStringToBuffer(
					options.extensions.prf.eval.first
				);
			}

			const credId = options.allowCredentials?.[0]?.id || 'none';
			// alert(
			// 	`DEBUG: Auth options.\nrpId: ${options.rpId}\ncreds: ${options.allowCredentials?.length}\nUV: ${options.userVerification}\nPRF: ${!!options.extensions?.prf}\nHost: ${window.location.hostname}\nID: ${credId.substring(0, 10)}...`
			// );

			// Perform WebAuthn assertion
			let assertion;
			try {
				// Attempt 1: Full options
				assertion = await startAuthentication({ optionsJSON: options });
			} catch (err: any) {
				// 	if (err.name === 'NotReadableError') {
				// 		//alert(`DEBUG: Attempt 1 failed (NotReadableError). Retrying WITHOUT PRF...`);

				// 		// Attempt 2: No PRF
				// 		const optionsNoPrf = JSON.parse(JSON.stringify(options));
				// 		if (optionsNoPrf.extensions) delete optionsNoPrf.extensions.prf;

				// 		try {
				// 			assertion = await startAuthentication({ optionsJSON: optionsNoPrf });
				// 			//alert(`DEBUG: Attempt 2 (No PRF) SUCCESS!`);
				// 		} catch (err2: any) {
				// 			if (err2.name === 'NotReadableError') {
				// 				//alert(
				// 				//	`DEBUG: Attempt 2 failed. Final attempt: EMPTY allowCredentials (Discoverable)...`
				// 				//);

				// 				// Attempt 3: No PRF + Empty allowCredentials
				// 				const optionsDiscoverable = JSON.parse(JSON.stringify(optionsNoPrf));
				// 				optionsDiscoverable.allowCredentials = [];

				// 				try {
				// 					assertion = await startAuthentication({ optionsJSON: optionsDiscoverable });
				// 					//alert(`DEBUG: Attempt 3 (Discoverable) SUCCESS!`);
				// 				} catch (err3: any) {
				// 					//alert(`DEBUG: Attempt 3 also failed.\nName: ${err3.name}\nMsg: ${err3.message}`);
				// 					throw err3;
				// 				}
				// 			} else {
				// 				//alert(`DEBUG: Attempt 2 failed with ${err2.name}: ${err2.message}`);
				// 				throw err2;
				// 			}
				// 		}
				// 	} else {
				alert(`DEBUG: Attempt failed with ${err.name}: ${err.message}`);
				throw err;
				// 	}
			}

			// === NEW MEK-BASED DECRYPTION SYSTEM ===

			// Step 1: Verify authentication with server
			const verificationRes = await fetch(`/svelteframe/auth/login/verify-authentication`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, data: assertion })
			});
			const verificationBody = await verificationRes.json();

			if (!verificationRes.ok) {
				throw new Error(verificationBody.message || 'Login verification failed.');
			}

			// Step 2: Fetch key wrappers
			const wrappersRes = await fetch('/svelteframe/api/user/key-wrappers');
			if (!wrappersRes.ok) {
				console.warn(
					`[Login] Could not fetch key wrappers. Status: ${wrappersRes.status} ${wrappersRes.statusText}`
				);
				try {
					const errBody = await wrappersRes.text();
					console.warn(`[Login] Error body: ${errBody}`);
				} catch (e) {
					/* ignore */
				}
				// Stop here if failed
				return;
			}
			const { wrappers } = await wrappersRes.json();

			// Step 3: Attempt to unwrap MEK
			let mek: CryptoKey | null = null;

			// Try 1: Unwrap with PRF (if available)
			const prfResults = (assertion.clientExtensionResults as any).prf;
			if (prfResults?.results?.first && wrappers) {
				console.log('[Login] PRF available, attempting to unwrap MEK...');

				// Find the PRF wrapper for this credential
				const prfWrapper = wrappers.find(
					(w: any) => w.type === 'PRF' && w.credentialId === assertion.id
				);

				if (prfWrapper) {
					try {
						let firstSalt = prfResults.results.first;
						if (typeof firstSalt === 'string') {
							firstSalt = base64URLStringToBuffer(firstSalt);
						}

						mek = await unwrapKeyWithPRF(prfWrapper.wrappedKeyBytes, firstSalt);
						console.log('[Login] MEK unwrapped with PRF');
					} catch (e) {
						console.error('[Login] Failed to unwrap MEK with PRF:', e);
					}
				} else {
					console.warn('[Login] No PRF wrapper found for this credential');
				}
			}

			// Try 2: Check sessionStorage (from recent registration)
			if (!mek) {
				const storedMEK = sessionStorage.getItem('MEK');
				if (storedMEK) {
					try {
						mek = await importKeyFromBase64(storedMEK);
						console.log('[Login] MEK retrieved from sessionStorage');
					} catch (e) {
						console.error('[Login] Failed to import MEK from sessionStorage:', e);
					}
				}
			}

			// Try 3: Prompt for recovery password
			if (!mek && wrappers) {
				const passwordWrapper = wrappers.find((w: any) => w.type === 'RECOVERY_PASSWORD');
				if (passwordWrapper) {
					showUnlockModal = true;
					isLoading = false;
					return; // Wait for modal interaction
				}
			}

			// Finalize immediately if we have MEK or if no recovery option exists
			await finalizeLogin(mek);
		} catch (err: any) {
			errorMsg = err.message;
			console.error(err);
			isLoading = false;
		}
	}
</script>

<div class="auth-container">
	<h1>{pageTitle}</h1>
	<form on:submit|preventDefault={handleLogin}>
		<input
			type="text"
			bind:value={username}
			placeholder="Enter username (email)"
			disabled={isLoading}
		/>
		<label class="remember-me">
			<input type="checkbox" bind:checked={rememberMe} />
			Remember me
		</label>
		<button type="submit" disabled={isLoading}>
			{#if isLoading}Logging in...{:else}Login with Passkey{/if}
		</button>
	</form>
	{#if successMsg}
		<p class="success">{successMsg}</p>
	{/if}
	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}
	<a href="/svelteframe/auth/register">Create an account</a>
</div>

<UnlockVaultModal
	bind:show={showUnlockModal}
	on:close={() => {
		showUnlockModal = false;
		// If they close without unlocking, proceed with locked state
		finalizeLogin(null);
	}}
	on:unlocked={handleUnlockSuccess}
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
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: min(100%, 300px);
	}
	input[type='text'] {
		background-color: #3c3c3c;
		color: #f0f0f0;
		border: 1px solid #555;
		padding: 10px;
		border-radius: 4px;
		font-size: 1rem;
	}
	input::placeholder {
		color: #888;
	}
	.remember-me {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #ccc;
		cursor: pointer;
	}
	.remember-me input {
		margin: 0;
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
</style>
