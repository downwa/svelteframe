<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { enhance } from '$app/forms';
	import type { User } from '../lib/server/auth';

	export let show = false;
	export let user: User | null = null;

	const dispatch = createEventDispatcher();

	let changed = false;
	function close() {
		show = false;
		dispatch('close', { changed });
	}

	// Helper to truncate credential ID
	function formatId(id: any) {
		if (!id) return '';
		const idStr = typeof id === 'string' ? id : id.toString();
		return idStr.slice(0, 10) + '...';
	}

	function getFullId(id: any): string {
		if (!id) return '';
		return id.toString();
	}

	function formatDate(dateStr: string | undefined) {
		if (!dateStr) return 'Never';
		const date = new Date(dateStr);
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const dd = String(date.getDate()).padStart(2, '0');
		const yyyy = date.getFullYear();
		const hh = String(date.getHours()).padStart(2, '0');
		const min = String(date.getMinutes()).padStart(2, '0');
		return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
	}

	// Sort credentials by lastUsedAt (newest first)
	$: sortedCredentials =
		user?.credentials?.slice().sort((a, b) => {
			const dateA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
			const dateB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
			return dateB - dateA;
		}) || [];
</script>

{#if show && user}
	<div class="modal-backdrop" on:click={close}>
		<div class="modal-content" on:click|stopPropagation>
			<header>
				<h2>Manage Credentials for {user.displayName || user.username}</h2>
				<button class="close-btn" on:click={close}>&times;</button>
			</header>

			<div class="modal-body">
				{#if sortedCredentials.length === 0}
					<p>No credentials found for this user.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>Credential ID</th>
								<th>Type</th>
								<th>Last Used</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedCredentials as cred}
								<tr>
									<td title={cred.credentialID}>{formatId(cred.credentialID)}</td>
									<td>
										{#if cred.supportsPRF}
											<span title="Supports PRF">🔒 PRF</span>
										{:else}
											<span title="Recovery Password used for encryption">🗝️ Recovery</span>
										{/if}
									</td>
									<td>{formatDate(cred.lastUsedAt)}</td>
									<td>
										<form
											method="POST"
											action="?/deleteCredential"
											use:enhance={({ cancel }) => {
												if (
													!confirm(
														'Are you sure you want to delete this credential? This cannot be undone.'
													)
												) {
													cancel();
													return;
												}
												return async ({ result }) => {
													if (result.type === 'success' && user) {
														changed = true;
														// Remove the credential from the local user object to update UI
														const fullId = getFullId(cred.credentialID);
														user.credentials = (user.credentials || []).filter(
															(c) => getFullId(c.credentialID) !== fullId
														);
													} else if (result.type === 'failure') {
														alert(result.data?.error || 'Failed to delete credential');
													}
												};
											}}
										>
											<input type="hidden" name="username" value={user.username} />
											<input
												type="hidden"
												name="credentialId"
												value={getFullId(cred.credentialID)}
											/>
											<button type="submit" class="delete-btn">Delete</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<footer>
				<button class="secondary-btn" on:click={close}>Close</button>
			</footer>
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
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}
	.modal-content {
		background-color: var(--sp-bg-modal);
		color: var(--sp-text-main);
		border-radius: 8px;
		width: 90%;
		max-width: 800px;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		border: 1px solid var(--sp-border-main);
	}
	header {
		padding: 1rem;
		border-bottom: 1px solid var(--sp-border-main);
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: var(--sp-bg-header);
		border-top-left-radius: 8px;
		border-top-right-radius: 8px;
	}
	header h2 {
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
	.modal-body {
		padding: 1rem;
		flex-grow: 1;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--sp-border-main);
	}
	th {
		font-weight: 600;
		color: var(--sp-text-muted);
	}
	.delete-btn {
		background-color: #dc3545;
		color: white;
		border: none;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.delete-btn:hover {
		background-color: #c82333;
	}
	footer {
		padding: 1rem;
		border-top: 1px solid var(--sp-border-main);
		display: flex;
		justify-content: flex-end;
		background-color: var(--sp-bg-header);
		border-bottom-left-radius: 8px;
		border-bottom-right-radius: 8px;
	}
	.secondary-btn {
		background-color: var(--sp-color-secondary);
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
	}
	.secondary-btn:hover {
		background-color: var(--sp-color-secondary-hover);
	}
</style>
