<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';

	export let filePath: string;

	const dispatch = createEventDispatcher();

	let content = '';
	let isLoading = true;
	let isSaving = false;
	let error = '';

	onMount(async () => {
		try {
			const res = await fetch(
				`/svelteframe/api/files/content?path=${encodeURIComponent(filePath)}`
			);
			if (res.ok) {
				content = await res.text();
			} else {
				error = 'Failed to load file content.';
			}
		} catch (e) {
			error = 'Error loading file.';
		} finally {
			isLoading = false;
		}
	});

	async function handleSave() {
		if (
			!confirm(
				'WARNING: Editing source directly can corrupt the site if invalid changes are made. Proceed with save?'
			)
		) {
			return;
		}

		isSaving = true;
		error = '';

		try {
			// Using patch API with full range replacement for source editing
			const res = await fetch('/svelteframe/api/files/content', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: filePath,
					content: content
				})
			});

			if (res.ok) {
				dispatch('save');
			} else {
				const data = await res.json();
				error = data.error || 'Failed to save changes.';
			}
		} catch (e) {
			error = 'Error saving changes.';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="editor-container">
	<div class="actions-bar">
		<button class="btn secondary" on:click={() => dispatch('close')} disabled={isSaving}
			>Cancel</button
		>
		<button class="btn primary" on:click={handleSave} disabled={isSaving || isLoading}>
			{isSaving ? 'Saving...' : 'Save Source'}
		</button>
	</div>

	<div class="editor-body">
		{#if isLoading}
			<div class="loading">Loading source...</div>
		{:else if error}
			<div class="error-msg">{error}</div>
		{:else}
			<div class="warning-banner">
				⚠️ CAUTION: You are editing the raw Svelte source. Ensure syntax is valid to avoid build
				errors.
			</div>
			<textarea bind:value={content} spellcheck="false"></textarea>
		{/if}
	</div>
</div>

<style>
	.editor-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--sp-bg-main, #1e1e1e);
	}

	.actions-bar {
		padding: 8px 16px;
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		border-bottom: 1px solid var(--sp-border-main, #333);
		background: var(--sp-bg-header, #252526);
	}

	.btn {
		padding: 4px 12px;
		border-radius: 4px;
		border: 1px solid transparent;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.btn.primary {
		background: var(--sp-color-accent, #007acc);
		color: white;
	}

	.btn.primary:hover:not(:disabled) {
		background: #0062a3;
	}

	.btn.secondary {
		background: transparent;
		border-color: #444;
		color: #ccc;
	}

	.btn.secondary:hover:not(:disabled) {
		background: #333;
		color: white;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.editor-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.warning-banner {
		background: rgba(255, 165, 0, 0.1);
		border-bottom: 1px solid rgba(255, 165, 0, 0.3);
		color: orange;
		padding: 6px 1.5rem;
		font-size: 0.8rem;
		text-align: center;
	}

	textarea {
		flex: 1;
		background: transparent;
		color: #d4d4d4;
		border: none;
		resize: none;
		padding: 1rem;
		font-family: 'Fira Code', 'Consolas', monospace;
		font-size: 13px;
		line-height: 1.5;
		outline: none;
	}

	.loading,
	.error-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #888;
	}

	.error-msg {
		color: var(--sp-color-danger, #f44336);
	}
</style>
