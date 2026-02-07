<script lang="ts">
	import { browser } from '$app/environment';

	const STORAGE_KEY = 'testprf_encrypted';

	async function registerPasskey() {
		if (!browser || !window.PublicKeyCredential) {
			alert('WebAuthn not supported');
			return;
		}

		console.log('[register] starting');

		const res = await fetch('/svelteframe/testprf/register', {
			method: 'POST'
		});
		const options = await res.json();
		console.log('[register] options from server', options);

		options.publicKey.challenge = base64urlToArrayBuffer(options.publicKey.challenge);
		options.publicKey.user.id = base64urlToArrayBuffer(options.publicKey.user.id);

		if (options.publicKey.excludeCredentials) {
			for (const cred of options.publicKey.excludeCredentials) {
				cred.id = base64urlToArrayBuffer(cred.id);
			}
		}

		// Request PRF extension
		options.publicKey.extensions = {
			prf: {}
		};

		console.log('[register] options after conversion', options);

		const cred = (await navigator.credentials.create(options)) as PublicKeyCredential | null;
		console.log('[register] created credential', cred);

		if (!cred) {
			alert('Registration failed');
			return;
		}

		const attestationResponse = cred.response as AuthenticatorAttestationResponse;

		const payload = {
			id: cred.id,
			rawId: arrayBufferToBase64url(cred.rawId),
			type: cred.type,
			response: {
				clientDataJSON: arrayBufferToBase64url(attestationResponse.clientDataJSON),
				attestationObject: arrayBufferToBase64url(attestationResponse.attestationObject)
			}
		};

		console.log('[register] sending verify payload', payload);

		const verifyRes = await fetch('/svelteframe/testprf/register/verify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		console.log('[register] verify response status', verifyRes.status);

		if (verifyRes.ok) {
			alert('Registration verified');
		} else {
			alert('Registration verification failed');
		}
	}

	async function loginWithPasskey() {
		const { cred, prfKey } = await performPrfLogin();
		if (!cred) return;

		// Try to decrypt stored value
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			alert('Login verified, but no stored secret yet.');
			return;
		}

		try {
			const { iv, ciphertext } = JSON.parse(stored) as {
				iv: string;
				ciphertext: string;
			};

			const ivBuf = base64urlToArrayBuffer(iv);
			const ctBuf = base64urlToArrayBuffer(ciphertext);

			const plaintext = await decryptWithKey(prfKey, ctBuf, ivBuf);
			alert(`Decrypted secret: ${plaintext}`);
		} catch (e) {
			console.error('Decrypt error', e);
			alert('Login verified, but failed to decrypt stored secret.');
		}
	}

	async function saveSecretWithPasskey() {
		if (!browser || !window.PublicKeyCredential) {
			alert('WebAuthn not supported');
			return;
		}

		const text = prompt('Enter a secret to encrypt:');
		if (!text) return;

		const { cred, prfKey } = await performPrfLogin();
		if (!cred) return;
		if (!prfKey) {
			console.warn('[saveSecretWithPasskey] missing prfKey, aborting');
			return;
		}

		try {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const ciphertext = await encryptWithKey(prfKey, text, iv);

			const payload = {
				iv: arrayBufferToBase64url(iv.buffer),
				ciphertext: arrayBufferToBase64url(ciphertext)
			};

			localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
			alert('Secret encrypted and saved locally.');
		} catch (e) {
			console.error('Encrypt error', e);
			alert('Failed to encrypt secret.');
		}
	}

	// --- shared PRF login helper ---

	async function performPrfLogin(): Promise<{
		cred: PublicKeyCredential | null;
		prfKey: CryptoKey;
	}> {
		if (!browser || !window.PublicKeyCredential) {
			alert('WebAuthn not supported');
			return { cred: null, prfKey: null as any };
		}

		console.log('[login] starting (PRF)');

		const res = await fetch('/svelteframe/testprf/login', {
			method: 'POST'
		});
		const options = await res.json();
		console.log('[login] options from server', options);

		// Base64url → ArrayBuffer conversions
		options.publicKey.challenge = base64urlToArrayBuffer(options.publicKey.challenge);
		if (options.publicKey.allowCredentials) {
			for (const cred of options.publicKey.allowCredentials) {
				cred.id = base64urlToArrayBuffer(cred.id);
			}
		}

		// Add PRF extension
		const prfSaltBase64url = options.publicKey.extensions?.prf?.eval?.first;
		const prfSalt = prfSaltBase64url
			? base64urlToArrayBuffer(prfSaltBase64url)
			: crypto.getRandomValues(new Uint8Array(32)).buffer;

		options.publicKey.extensions = {
			prf: {
				eval: {
					first: prfSalt
				}
			}
		};

		console.log('[login] options after conversion + PRF', options);

		const cred = (await navigator.credentials.get(options)) as any;
		console.log('[login] assertion credential', cred);

		if (!cred) {
			alert('Login failed');
			return { cred: null, prfKey: null as any };
		}

		// Extract PRF results from client extension results
		const ext = cred.getClientExtensionResults?.();
		console.log('[login] clientExtensionResults', ext);

		if (!ext || !ext.prf || !ext.prf.results || !ext.prf.results.first) {
			alert('Login verified, but authenticator did not return PRF data.');
			return { cred, prfKey: null as any };
		}

		const prfBytes = ext.prf.results.first;

		// Derive AES-GCM key from PRF output (directly used here for simplicity)
		const prfKey = await crypto.subtle.importKey('raw', prfBytes, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		]);

		// Optionally still POST to /login/verify as before
		const assertionResponse = cred.response as AuthenticatorAssertionResponse;
		const payload = {
			id: cred.id,
			rawId: arrayBufferToBase64url(cred.rawId),
			type: cred.type,
			response: {
				clientDataJSON: arrayBufferToBase64url(assertionResponse.clientDataJSON),
				authenticatorData: arrayBufferToBase64url(assertionResponse.authenticatorData),
				signature: arrayBufferToBase64url(assertionResponse.signature),
				userHandle: assertionResponse.userHandle
					? arrayBufferToBase64url(assertionResponse.userHandle)
					: null
			}
		};

		const verifyRes = await fetch('/svelteframe/testprf/login/verify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		console.log('[login] verify response status', verifyRes.status);
		if (!verifyRes.ok) {
			alert('Assertion verification failed (server stub).');
			return { cred: null, prfKey: null as any };
		}

		return { cred, prfKey };
	}

	// --- AES-GCM helpers ---

	async function encryptWithKey(
		key: CryptoKey,
		plaintext: string,
		iv: Uint8Array
	): Promise<ArrayBuffer> {
		const enc = new TextEncoder();
		const data = enc.encode(plaintext);
		return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	}

	async function decryptWithKey(
		key: CryptoKey,
		ciphertext: ArrayBuffer,
		iv: ArrayBuffer
	): Promise<string> {
		const dec = new TextDecoder();
		const pt = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: new Uint8Array(iv) },
			key,
			ciphertext
		);
		return dec.decode(pt);
	}

	// --- existing base64url helpers (unchanged) ---

	function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
		const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
		const padLength = (4 - (base64.length % 4)) % 4;
		const padded = base64 + '='.repeat(padLength);
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	function arrayBufferToBase64url(buf: ArrayBuffer): string {
		const bytes = new Uint8Array(buf);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	}
</script>

<main>
	<h1>Passkey demo</h1>

	<button on:click={registerPasskey}> Register passkey </button>

	<button on:click={loginWithPasskey}> Login with passkey (show secret) </button>

	<button on:click={saveSecretWithPasskey}> Encrypt & save secret with passkey </button>
</main>

<style>
	main {
		background-color: #f0f0f0;
		margin-top: 100px;
	}
</style>
