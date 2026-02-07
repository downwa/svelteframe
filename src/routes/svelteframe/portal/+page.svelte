<!-- FILE: src/routes/svelteframe/portal/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import ProfileEditModal from '../_components/ProfileEditModal.svelte';
	import { hasPermission } from '$routes/svelteframe/lib/client/access';
	import {
		importKeyFromBase64,
		exportKeyAsBase64,
		encryptData,
		decryptData,
		base64ToBuffer
	} from '../lib/client/crypto';
	import QrCodeModal from '../_components/QrCodeModal.svelte';
	import UnlockVaultModal from '../_components/UnlockVaultModal.svelte';

	import type { HeroSlide } from '../_pubcomponents/Hero.types';
	import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
	import headerImg1 from '../lib/assets/images/choggiung_droneA_6.webp';
	import headerImg2 from '../lib/assets/images/choggiung_droneA_6-p-2000.webp';
	import headerImg3 from '../lib/assets/images/choggiung_droneA_6-p-1600.webp';
	import headerImg4 from '../lib/assets/images/choggiung_droneA_6-p-1080.webp';
	import headerImg5 from '../lib/assets/images/choggiung_droneA_6-p-800.webp';
	import headerImg6 from '../lib/assets/images/choggiung_droneA_6-p-500.webp';

	const heroSlidesData: HeroSlide[] = [
		{
			bgImageSrc: headerImg1,
			bgImageSet: [
				{ src: headerImg1, minWidth: 2001 },
				{ src: headerImg2, minWidth: 1601 },
				{ src: headerImg3, minWidth: 1081 },
				{ src: headerImg4, minWidth: 801 },
				{ src: headerImg5, minWidth: 501 },
				{ src: headerImg6, minWidth: 0 }
			],
			bgImageAlt: 'An overview of Lake Nunavaugaluk, with mountains in the background',
			headingPhrase: 'User Portal',
			subText: 'View and manage company resources, user accounts, and more.',
			buttonText: '',
			buttonLink: '',
			progressText: ''
		}
	];

	const heroTitlePrefix = '';

	let showQrModal = false;
	let qrToken = '';
	let qrPath = '';
	let showUnlockModal = false;
	let pendingAction: (() => void) | null = null;

	async function handleRequestAddDevice() {
		showProfileModal = false;
		await tick();
		handleAddDevice();
	}

	async function handleAddDevice() {
		try {
			const mekBase64 = sessionStorage.getItem('MEK');
			if (!mekBase64) {
				// Prompt to unlock instead of throwing error
				pendingAction = handleAddDevice;
				showUnlockModal = true;
				return;
			}
			const mek = await importKeyFromBase64(mekBase64);

			const migrationKey = await window.crypto.subtle.generateKey(
				{ name: 'AES-GCM', length: 256 },
				true,
				['wrapKey', 'encrypt']
			);

			const wrappedMekBuffer = await window.crypto.subtle.wrapKey('raw', mek, migrationKey, {
				name: 'AES-GCM',
				iv: new Uint8Array(12)
			});

			const bufferToBase64Local = (buf: ArrayBuffer) => {
				let binary = '';
				const bytes = new Uint8Array(buf);
				for (let i = 0; i < bytes.byteLength; i++) {
					binary += String.fromCharCode(bytes[i]);
				}
				return window.btoa(binary);
			};

			const wrappedMekBase64 = bufferToBase64Local(wrappedMekBuffer);
			const migrationKeyBase64 = await exportKeyAsBase64(migrationKey);

			const res = await fetch('/svelteframe/api/user/device-token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					wrappedMEK: wrappedMekBase64,
					duration: 900
				})
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.message || 'Failed to create device token.');
			}

			const body = await res.json();
			qrToken = body.token;
			qrPath = `/svelteframe/auth/add-device?key=${encodeURIComponent(migrationKeyBase64)}`;
			showQrModal = true;
		} catch (e: any) {
			console.error('Add device error:', e);
			alert(`Could not start "add device" process: ${e.message}`);
		}
	}

	function setMessagesFromResult(result: any) {
		if (!form) return;
		// If SvelteKit returned structured action result
		if (result && typeof result === 'object') {
			if ('type' in result) {
				// Standard SvelteKit form action result
				if (result.type === 'error') {
					form.error =
						result.data?.message ??
						result.data?.error?.message ??
						'Form submission failed with an error.';
					form.message = '';
				} else if (result.type === 'success') {
					form.message = result.data?.message ?? 'Form submitted successfully';
					form.error = '';
				}
			} else {
				// Possibly a raw fetch error response - try common patterns
				// Sometimes `result.message` exists directly
				if (typeof result.message === 'string') {
					form.error = result.message;
					form.message = '';
				} else if (result.error && typeof result.error.message === 'string') {
					form.error = result.error.message;
					form.message = '';
				} else {
					const asString = JSON.stringify(result);
					form.error = `Error response: ${asString}`;
					form.message = '';
				}
			}
		} else {
			form.error = 'Invalid response format.';
			form.message = '';
		}
	}

	// Custom enhance wrapper that extracts error message for both fail() and thrown errors
	function customEnhance(formElement: HTMLFormElement) {
		return enhance(formElement, () => {
			return async ({ result, update }) => {
				setMessagesFromResult(result);
				// After setting error message, scroll to it if present
				// Use a next microtask so DOM updates first
				await update();

				const errorEl = document.querySelector('.error');
				if (errorEl) {
					// Smooth scroll, center align if possible
					errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
					// Optionally set focus for accessibility
					(errorEl as HTMLElement).focus?.();
				}
			};
		});
	}

	export let data: PageData;
	export let form: ActionData;

	let showContextMenu = false;
	let contextFile: string | null = null;
	let menuX = 0;
	let menuY = 0;
	let deleteForm: HTMLFormElement;
	let deleteFilenameInput: HTMLInputElement;
	let renameForm: HTMLFormElement;
	let renameFilenameInput: HTMLInputElement;
	let renameNewFilenameInput: HTMLInputElement;

	function handleContextMenu(event: MouseEvent, file: string) {
		event.preventDefault();
		contextFile = file;
		menuX = event.clientX;
		menuY = event.clientY;
		showContextMenu = true;
		focusFirstItem();
	}

	function closeContextMenu() {
		showContextMenu = false;
		contextFile = null;
	}

	function handleDelete() {
		if (!contextFile) return;

		const filename = contextFile;
		closeContextMenu();
		if (confirm(`Are you sure you want to permanently delete "${filename}"?`)) {
			if (deleteForm && deleteFilenameInput) {
				deleteFilenameInput.value = filename;
				deleteForm.requestSubmit();
			}
		}
	}

	function handleRename() {
		if (!contextFile) return;

		const oldFilename = contextFile;
		closeContextMenu();
		const newFilename = prompt(`Enter a new name for "${oldFilename}":`, oldFilename);
		if (newFilename && newFilename.trim() !== '') {
			if (renameForm && renameFilenameInput) {
				renameFilenameInput.value = oldFilename;
				renameNewFilenameInput.value = newFilename;
				renameForm.requestSubmit();
			}
		} else {
			alert('Invalid filename. Please try again.');
		}
	}

	let currentUser = data.user;
	let isDecrypted = false;
	let decryptedData: { displayName: string; acl: any[] } | null = null;

	onMount(() => {
		window.addEventListener('click', closeContextMenu);

		(async () => {
			const mekBase64 = sessionStorage.getItem('MEK');
			if (mekBase64) {
				try {
					const mek = await importKeyFromBase64(mekBase64);
					if (data.user.encryptedDataBlob && data.user.encryptedDataIV) {
						// Reconstruct combined buffer (IV + Ciphertext)
						const ivBuf = base64ToBuffer(data.user.encryptedDataIV);
						const cipherBuf = base64ToBuffer(data.user.encryptedDataBlob);

						const combined = new Uint8Array(ivBuf.length + cipherBuf.length);
						combined.set(ivBuf, 0);
						combined.set(cipherBuf, ivBuf.length);

						decryptedData = await decryptData(mek, combined);
						isDecrypted = true;
						sessionStorage.setItem('decryptedUserData', JSON.stringify(decryptedData));
					}
				} catch (e) {
					console.error('Failed to decrypt user data with MEK:', e);
				}
			}

			if (!isDecrypted) {
				const storedData = sessionStorage.getItem('decryptedUserData');
				if (storedData) {
					try {
						decryptedData = JSON.parse(storedData);
						isDecrypted = true;
					} catch (e) {
						console.error('[Portal] Failed to parse decryptedUserData:', e);
					}
				}
			}
		})();

		return () => {
			window.removeEventListener('click', closeContextMenu);
		};
	});

	$: {
		let mergedUser = { ...data.user };
		if (decryptedData) {
			mergedUser.displayName = decryptedData.displayName;
			mergedUser.acl = decryptedData.acl;
		}
		currentUser = mergedUser;
	}

	function handleKeyDown(event: KeyboardEvent) {
		const menu = event.currentTarget as HTMLElement;
		const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
		if (items.length === 0) return;

		const currentIndex = items.findIndex((item) => item === document.activeElement);

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				closeContextMenu();
				menuY = 0;
				break;

			case 'ArrowDown':
			case 'Tab':
				event.preventDefault();
				{
					let nextIndex = 0;
					if (currentIndex >= 0) {
						nextIndex = (currentIndex + 1) % items.length;
					}
					items[nextIndex].focus();
					highlightItem(items, items[nextIndex]);
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				{
					let prevIndex = items.length - 1;
					if (currentIndex > 0) {
						prevIndex = (currentIndex - 1 + items.length) % items.length;
					}
					items[prevIndex].focus();
					highlightItem(items, items[prevIndex]);
				}
				break;

			case 'Enter':
			case ' ':
				event.preventDefault();
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.click();
				}
				break;
		}
	}

	function highlightItem(items: any[], item: HTMLElement) {
		if (items.length === 0) return;
		items.forEach((i) => i.classList.remove('highlighted'));
		item.classList.add('highlighted');
	}

	async function focusFirstItem() {
		await tick();
		const menu = document.querySelector('.context-menu');
		if (!menu) return;
		const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
		if (items.length > 0) {
			items[0].focus();
			highlightItem(items, items[0]);
		}
	}

	$: console.log('[Portal Client] data.user:', data.user);

	const portalActionModules = import.meta.glob<any>('$lib/portal-actions/*.svelte', {
		eager: true
	});
	const portalActionKeys = Object.keys(portalActionModules);
	let showProfileModal = false;

	async function handleSaveProfile(event: CustomEvent) {
		const { privateName, publicName, updateEncrypted } = event.detail;
		showProfileModal = false;

		const formData = new FormData();
		formData.append('displayName', publicName);
		formData.append('username', data.user.username);

		if (updateEncrypted) {
			try {
				const mekBase64 = sessionStorage.getItem('MEK');
				if (!mekBase64) {
					throw new Error('Encryption key not found. Please log in again.');
				}
				const mek = await importKeyFromBase64(mekBase64);

				const userDataToEncrypt = {
					displayName: privateName,
					acl: currentUser.acl || []
				};
				const encryptedBlob = await encryptData(mek, userDataToEncrypt);

				const decoded = window.atob(encryptedBlob);
				const buffer = new Uint8Array(decoded.length);
				for (let i = 0; i < decoded.length; i++) buffer[i] = decoded.charCodeAt(i);

				const iv = buffer.slice(0, 12);
				const ciphertext = buffer.slice(12);

				const bufferToBase64Local = (buf: Uint8Array) => {
					let binary = '';
					for (let i = 0; i < buf.byteLength; i++) {
						binary += String.fromCharCode(buf[i]);
					}
					return window.btoa(binary);
				};

				formData.append('encryptedDataBlob', bufferToBase64Local(ciphertext));
				formData.append('encryptedDataIV', bufferToBase64Local(iv));

				decryptedData = userDataToEncrypt;
				sessionStorage.setItem('decryptedUserData', JSON.stringify(userDataToEncrypt));
			} catch (e: any) {
				console.error('[Portal] Profile encryption failed:', e);
				alert(`Failed to encrypt profile: ${e.message}`);
				return;
			}
		}

		try {
			const response = await fetch('?/updateProfile', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result?.error || 'Failed to update profile');
			}

			await invalidate('app:portal');
		} catch (e: any) {
			console.error('[Portal] Profile update failed:', e);
			alert(`Failed to update profile: ${e.message}`);
		}
	}

	function handleUnlockSuccess(event: CustomEvent) {
		const { mek } = event.detail;
		showUnlockModal = false;

		// If we have a pending action, execute it
		if (pendingAction) {
			const action = pendingAction;
			pendingAction = null;
			action();
		} else {
			// If no specific action, just reload to refresh state (e.g. if they clicked unlock button manually if we added one)
			window.location.reload();
		}
	}
</script>

<!-- Rest of file is unchanged, but included for completeness -->

<form method="POST" action="?/deleteFile" use:enhance bind:this={deleteForm} style="display: none;">
	<input type="hidden" name="filename" bind:this={deleteFilenameInput} />
</form>

<form method="POST" action="?/renameFile" use:enhance bind:this={renameForm} style="display: none;">
	<input type="hidden" name="oldName" bind:this={renameFilenameInput} />
	<input type="hidden" name="newName" bind:this={renameNewFilenameInput} />
</form>

{#if showContextMenu}
	<div
		class="context-menu"
		role="menu"
		tabindex="0"
		style="top: {menuY}px; left: {menuX}px;"
		on:click|stopPropagation
		on:keydown={handleKeyDown}
	>
		<button role="menuitem" on:click={handleDelete}>Delete File</button>
		<button role="menuitem" on:click={handleRename}>Rename File</button>
	</div>
{/if}

<HeroStatic slides={heroSlidesData} staticHeadingText={heroTitlePrefix} />

<div class="portal-container">
	<div class="portal-header">
		<div class="user-welcome">
			Welcome, <strong>{currentUser.displayName}</strong>
			{#if isDecrypted}
				<span class="lock-icon" title="Decrypted from your private secure storage">🔒</span>
			{/if}
			<button
				class="edit-profile-btn"
				on:click={() => (showProfileModal = true)}
				title="Edit Profile"
			>
				✎
			</button>
		</div>
		<form method="POST" action="/svelteframe/auth/logout" data-sveltekit-reload>
			<button type="submit" class="logout-button">Logout</button>
		</form>
	</div>

	{#if form?.message}
		<div class="form-message success">{form.message}</div>
	{/if}
	{#if form?.error}
		<div class="form-message error">{form.error}</div>
	{/if}

	{#if data.protectedFiles && data.protectedFiles.length > 0}
		<section class="portal-section">
			<h2>Available Files</h2>
			<ul class="file-list">
				{#each data.protectedFiles as file}
					<li>
						<a
							href={`/svelteframe/api/protected-files/${file}`}
							class="file-card"
							download
							on:contextmenu={data.canUploadFiles
								? (event) => handleContextMenu(event, file)
								: null}
						>
							<span class="icon">📥</span>
							<span class="filename">{file}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.canAccessEditor || data.canAccessUserAdmin || data.canUploadFiles || data.canAccessMessages || data.canAccessPermits}
		<section class="portal-section">
			<h2>Available Actions</h2>
			<ul class="action-list">
				{#if data.canAccessEditor}
					<li>
						<a href="/svelteframe" rel="external" data-sveltekit-reload class="action-card">
							<h3>Content Editor</h3>
							<p>
								Access the SvelteFrame IDE to edit pages and components directly in the browser.
							</p>
						</a>
					</li>
				{/if}

				{#if data.canAccessUserAdmin}
					<li>
						<a
							href="/svelteframe/useradmin"
							rel="external"
							data-sveltekit-reload
							class="action-card"
						>
							<h3>User Administration</h3>
							<p>Manage user accounts, permissions, and email verification status.</p>
						</a>
					</li>
				{/if}

				{#if data.canUploadFiles}
					<li>
						<form
							method="POST"
							action="?/uploadFile"
							enctype="multipart/form-data"
							use:customEnhance
							class="action-card upload-form"
						>
							<h3>Upload New File</h3>
							<p>Add a new file to the "Available Files" section for all authenticated users.</p>
							<div class="form-controls">
								<input type="file" name="file" required />
								<button type="submit">Upload</button>
							</div>
						</form>
					</li>
				{/if}

				{#if hasPermission(data.user, 'virtual:superadmin', 'W')}
					<li>
						<a href="/svelteframe/pushupdate" class="action-card dev-tool">
							<h3>Update SvelteFrame Repository</h3>
							<p>Export core framework changes to the standalone developer repository.</p>
						</a>
					</li>
				{/if}

				{#if portalActionKeys.length > 0}
					{#each portalActionKeys as path}
						<li>
							<svelte:component
								this={portalActionModules[path].default}
								user={data.user}
								permissions={data}
							/>
						</li>
					{/each}
				{:else}
					<li>
						<div class="action-card disabled">
							<h3>No actions found</h3>
							<p>No portal plugins were found in lib/portal-actions.</p>
						</div>
					</li>
				{/if}
			</ul>
		</section>
	{/if}
</div>

<ProfileEditModal
	bind:show={showProfileModal}
	user={currentUser}
	publicDisplay={data.user.displayName}
	{isDecrypted}
	on:close={() => (showProfileModal = false)}
	on:save={handleSaveProfile}
	on:add-device={handleRequestAddDevice}
/>

<QrCodeModal
	bind:show={showQrModal}
	token={qrToken}
	path={qrPath}
	on:close={() => (showQrModal = false)}
/>

<UnlockVaultModal
	bind:show={showUnlockModal}
	on:close={() => {
		showUnlockModal = false;
		pendingAction = null;
	}}
	on:unlocked={handleUnlockSuccess}
/>

<style>
	.dev-tool {
		border-color: #a78bfa;
		border-style: dashed;
	}
	.dev-tool h3 {
		color: #a78bfa;
	}
	.action-card {
		width: 100%;
		text-align: left;
		font-family: inherit;
		font-size: inherit;
	}

	:global(html, body) {
		margin: 0;
		padding: 0;
		background-color: #f8f9fa; /* Light grey background */
		color: #212529; /* Dark text for readability */
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
			'Helvetica Neue', sans-serif;
	}

	.form-message {
		padding: 1rem;
		margin-bottom: 2rem;
		border-radius: 4px;
		border: 1px solid;
	}
	.form-message.success {
		border-color: #28a745;
		background-color: #d4edda;
		color: #155724;
	}
	.form-message.error {
		border-color: #dc3545;
		background-color: #f8d7da;
		color: #721c24;
	}

	.upload-form {
		display: flex;
		flex-direction: column;
	}

	.upload-form .form-controls {
		margin-top: auto; /* Pushes controls to the bottom */
		padding-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.upload-form input[type='file'] {
		font-size: 0.9rem;
	}

	.upload-form button {
		background-color: #28a745;
		border: none;
		color: white;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		align-self: flex-start;
	}

	.portal-container {
		max-width: 960px;
		margin: 0 auto; /* Margin top is handled by section */
		padding: 2rem;
	}

	.portal-section {
		margin-top: 4rem;
	}

	.portal-section h2 {
		font-size: 1.8rem;
		color: #495057;
		margin-bottom: 1.5rem;
		text-align: center;
		border-bottom: 1px solid #dee2e6;
		padding-bottom: 1rem;
	}

	.action-list,
	.file-list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 1.5rem;
	}

	.action-list {
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
	}

	.file-list {
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	}

	.action-card,
	.file-card {
		display: block;
		background-color: #ffffff;
		border: 1px solid #dee2e6;
		border-radius: 8px;
		padding: 1.5rem;
		text-decoration: none;
		color: #495057;
		transition:
			transform 0.2s ease-in-out,
			box-shadow 0.2s ease-in-out;
		height: 100%;
		box-sizing: border-box;
	}

	.action-card:not(.disabled):hover,
	.file-card:hover {
		transform: translateY(-5px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
		border-color: #007bff;
	}

	.action-card h3 {
		margin-top: 0;
		color: #007bff;
		font-size: 1.25rem;
	}

	.action-card p {
		color: #6c757d;
		line-height: 1.6;
	}

	.action-card.disabled {
		background-color: #e9ecef;
		cursor: not-allowed;
	}

	.action-card.disabled h3 {
		color: #6c757d;
	}

	.action-card.disabled p {
		color: #adb5bd;
	}

	.file-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-weight: 500;
	}

	.file-card .icon {
		font-size: 1.5rem;
		color: #007bff;
	}

	.portal-header {
		display: flex;
		justify-content: space-between; /* Changed from flex-end to space-between */
		align-items: center;
		padding: 0 0 2rem 0; /* Adjust padding */
	}

	.user-welcome {
		font-size: 1.2rem;
		color: #495057;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.lock-icon {
		font-size: 1rem;
		cursor: help;
	}

	.edit-profile-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.1rem;
		color: #6c757d;
		padding: 0 5px;
	}
	.edit-profile-btn:hover {
		color: #007bff;
	}

	.logout-button {
		background-color: #6c757d;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
	}

	.logout-button:hover {
		background-color: #5a6268;
	}

	button:focus {
		background-color: #bde4ff;
		outline: none;
	}

	/* --- NEW: Styles for the context menu --- */
	.context-menu {
		position: fixed;
		background-color: #ffffff;
		border: 1px solid #dee2e6;
		border-radius: 6px;
		padding: 4px;
		z-index: 1000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.context-menu button {
		width: 100%;
		text-align: left;
		color: #dc3545; /* Red for destructive action */
		background: none;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
	}

	.context-menu button:hover {
		background-color: #dc3545;
		color: white;
	}
</style>
