<!-- FILE: src/routes/svelteframe/useradmin/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import UserEditModal from '../_components/UserEditModal.svelte';
	import CredentialManagementModal from '../_components/CredentialManagementModal.svelte';
	import type { User } from '../lib/server/auth';
	import type { HeroSlide } from '../_pubcomponents/Hero.types';
	import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
	import headerImg1 from '../lib/assets/images/choggiung_droneA_6.webp';
	import headerImg2 from '../lib/assets/images/choggiung_droneA_6-p-2000.webp';
	import headerImg3 from '../lib/assets/images/choggiung_droneA_6-p-1600.webp';
	import headerImg4 from '../lib/assets/images/choggiung_droneA_6-p-1080.webp';
	import headerImg5 from '../lib/assets/images/choggiung_droneA_6-p-800.webp';
	import headerImg6 from '../lib/assets/images/choggiung_droneA_6-p-500.webp';

	export let data: PageData;
	export let form: ActionData;

	let showEditModal = false;
	let showCredentialModal = false;
	let editingUser: User | null = null;
	let manageUser: User | null = null;

	function openEditModal(user: User | null) {
		editingUser = user;
		showEditModal = true;
	}

	function openCredentialModal(user: User | null) {
		manageUser = user;
		showCredentialModal = true;
	}

	function handleSave(event: CustomEvent) {
		const { user, originalUsername } = event.detail;
		const formData = new FormData();
		formData.append('user', JSON.stringify(user));
		if (originalUsername) {
			formData.append('originalUsername', originalUsername);
		}

		const formEl = document.createElement('form');
		formEl.method = 'POST';
		formEl.action = '?/saveUser';
		formEl.hidden = true;
		for (const [key, value] of formData.entries()) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = key;
			input.value = value as string;
			formEl.appendChild(input);
		}
		document.body.appendChild(formEl);
		formEl.submit();
	}

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
			headingPhrase: 'User Administration',
			subText: 'Manage user accounts, permissions, and roles within the system.',
			buttonText: '',
			buttonLink: '',
			progressText: ''
		}
	];

	const heroTitlePrefix = '';
	function handleResend(event: CustomEvent) {
		const { username } = event.detail;
		const formEl = document.createElement('form');
		formEl.method = 'POST';
		formEl.action = '?/resendVerification';
		formEl.hidden = true;
		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = 'username';
		input.value = username;
		formEl.appendChild(input);
		document.body.appendChild(formEl);
		formEl.submit();
		showEditModal = false;
	}
</script>

<div class="hero-container">
	<HeroStatic slides={heroSlidesData} staticHeadingText={heroTitlePrefix} />
</div>

<div class="user-admin-container">
	<!-- --- FIX: Add the header with the title and "+ New User" button --- -->
	<header>
		<!-- --- FIX: Add a "Back to Portal" link --- -->
		<a href="/svelteframe/portal" data-sveltekit-reload class="back-link">
			&larr; Back to Portal
		</a>
		<div class="header-actions">
			<button on:click={() => openEditModal(null)}>+ New User</button>
			<form method="GET" action="/svelteframe/auth/logout" data-sveltekit-reload>
				<button type="submit" class="logout-button">Logout</button>
			</form>
		</div>
	</header>

	{#if form?.message}
		<div class="form-message" class:success={form?.success} class:error={!form?.success}>
			{form.message}
		</div>
	{/if}
	{#if form?.error}
		<div class="form-message error">{form.error}</div>
	{/if}

	<div class="user-tables">
		<section>
			<h2>Active Users</h2>
			<table>
				<thead>
					<tr>
						<th>Display Name</th>
						<th>Email (Username)</th>
						<th>Status</th>
						<th>Privacy</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.users.filter((u) => u.status !== 'Disabled') as user (user.username)}
						<tr>
							<td>
								<button class="link-button" on:click={() => openEditModal(user)}>
									{user.displayName}
									{#if user.encryptedData}
										<span class="table-shield" title="Has Encrypted Data">🛡️</span>
									{/if}
								</button>
							</td>
							<td>{user.username}</td>
							<td>
								<span class="status-badge {user.status.toLowerCase()}">
									{user.status}
								</span>
							</td>
							<td class="prf-status pointer" on:click={() => openCredentialModal(user)}>
								{#if user.credentials && user.credentials.length > 0}
									{#each user.credentials as credential}
										{#if credential.supportsPRF}
											<span title="This passkey supports PRF (hardware-backed encryption)">🔒</span>
										{:else}
											<span title="This credential uses a recovery password for encryption">🗝️</span
											>
										{/if}
									{/each}
								{:else}
									&nbsp;
								{/if}
							</td>
							<td class="actions">
								{#if user.status === 'Unverified'}
									<form method="POST" action="?/resendVerification" use:enhance>
										<input type="hidden" name="username" value={user.username} />
										<button type="submit" class="action-btn">Resend</button>
									</form>
								{/if}
								<form method="POST" action="?/disableUser" use:enhance>
									<input type="hidden" name="username" value={user.username} />
									<button type="submit" class="action-btn secondary"> Disable </button>
								</form>
								<form method="POST" action="?/deleteUser" use:enhance>
									<input type="hidden" name="username" value={user.username} />
									<button type="submit" class="action-btn danger">Delete</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section>
			<h2>Disabled Users</h2>
			<table>
				<thead>
					<tr>
						<th>Display Name</th>
						<th>Email (Username)</th>
						<th>Privacy</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.users.filter((u) => u.status === 'Disabled') as user (user.username)}
						<tr>
							<td>{user.displayName}</td>
							<td>{user.username}</td>
							<td class="prf-status pointer" on:click={() => openCredentialModal(user)}>
								{#if user.credentials && user.credentials.length > 0}
									{#each user.credentials as credential}
										{#if credential.supportsPRF}
											<span title="This passkey supports PRF (hardware-backed encryption)">🔒</span>
										{:else}
											<span title="This credential uses a recovery password for encryption">🗝️</span
											>
										{/if}
									{/each}
								{:else}
									&nbsp;
								{/if}
							</td>
							<td class="actions">
								<form method="POST" action="?/enableUser" use:enhance>
									<input type="hidden" name="username" value={user.username} />
									<button type="submit" class="action-btn">Enable</button>
								</form>
								<form method="POST" action="?/deleteUser" use:enhance>
									<input type="hidden" name="username" value={user.username} />
									<button type="submit" class="action-btn danger">Delete</button>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="3">No disabled users found.</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>
</div>

<UserEditModal
	bind:show={showEditModal}
	user={editingUser}
	on:close={() => (showEditModal = false)}
	on:save={handleSave}
	on:resend={handleResend}
/>

<CredentialManagementModal
	bind:show={showCredentialModal}
	user={manageUser}
	on:close={async (e) => {
		showCredentialModal = false;
		if (e.detail?.changed) {
			await invalidateAll();
		}
	}}
/>
```

<style>
	.prf-status {
		text-align: center;
		font-size: 1.1rem;
	}
	.hero-container {
		background-color: #f8f9fa;
	}
	.user-admin-container {
		padding: 2rem;
		max-width: 1000px;
		margin: 0 auto;
		background-color: #ffffff;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 1px solid #dee2e6;
		padding-bottom: 1rem;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.back-link {
		text-decoration: none;
		color: #007bff;
		font-weight: 500;
	}
	.back-link:hover {
		text-decoration: underline;
	}
	h2 {
		margin: 0;
		color: #343a40;
	}
	h2 {
		margin-top: 2rem;
		margin-bottom: 1rem;
	}
	button {
		background-color: #007bff;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
	}
	.link-button {
		background: none;
		border: none;
		padding: 0;
		color: #007bff;
		text-decoration: underline;
		cursor: pointer;
		text-align: left;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 2rem;
	}
	th,
	td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid #dee2e6;
		color: #495057;
	}
	th {
		color: #6c757d;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.actions form {
		margin: 0;
	}
	.action-btn {
		padding: 4px 8px;
		font-size: 0.8rem;
	}
	.action-btn.secondary {
		background-color: #6c757d;
	}
	.action-btn.danger {
		background-color: #dc3545;
	}
	.status-badge {
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: bold;
		color: white;
	}
	.status-badge.verified {
		background-color: #28a745;
	}
	.status-badge.unverified {
		background-color: #ffc107;
		color: #212529;
	}
	.form-message {
		padding: 1rem;
		margin-bottom: 1rem;
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
	.logout-button {
		background-color: #6c757d;
	}
	.logout-button:hover {
		background-color: #5a6268;
	}
	.table-shield {
		margin-left: 0.5rem;
		cursor: help;
		font-size: 1rem;
	}
	.pointer {
		cursor: pointer;
	}
	td.prf-status:hover {
		background-color: #f8f9fa;
	}
</style>
