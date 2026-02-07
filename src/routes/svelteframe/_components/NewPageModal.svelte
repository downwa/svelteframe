<!-- FILE: src/routes/svelteframe/_components/NewPageModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	const dispatch = createEventDispatcher();

	let templates: string[] = [];
	let routePath = '';
	let selectedTemplate = '';
	let modalContentEl: HTMLElement;

	onMount(async () => {
		try {
			const res = await fetch('/svelteframe/api/templates');
			if (!res.ok) throw new Error('Failed to load templates');
			templates = await res.json();
			if (templates.length > 0) {
				selectedTemplate = templates[0];
			}
		} catch (e) {
			console.error(e);
		}

		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				dispatch('close');
			}
		}

		window.addEventListener('keydown', handleKeydown);
		modalContentEl?.focus();

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	async function createPage() {
		console.log('Creating page:', { routePath, selectedTemplate });
		dispatch('close');
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			dispatch('close');
		}
	}

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			dispatch('close');
		}
	}
</script>

<div
	class="modal-backdrop"
	on:click={handleBackdropClick}
	on:keydown={handleBackdropKeydown}
	role="button"
	tabindex="0"
	aria-label="Close dialog"
>
	<div
		class="modal-content"
		on:click|stopPropagation
		bind:this={modalContentEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<h2 id="modal-title">Create New Page</h2>
		<form on:submit|preventDefault={createPage}>
			<label>
				Route Path (e.g., 'about/team')
				<input type="text" bind:value={routePath} required />
			</label>
			<label>
				Template
				<select bind:value={selectedTemplate}>
					{#each templates as template}
						<option value={template}>{template}</option>
					{/each}
				</select>
			</label>
			<div class="actions">
				<button type="button" on:click={() => dispatch('close')}>Cancel</button>
				<button type="submit">Create</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: grid;
		place-items: center;
		z-index: 1000;
	}
	.modal-content {
		background: var(--sp-bg-modal);
		color: var(--sp-text-main);
		padding: 2rem;
		border-radius: 8px;
		width: min(90%, 500px);
		border: 1px solid var(--sp-border-main);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	input,
	select {
		width: 100%;
		padding: 8px;
		background: var(--sp-bg-input);
		border: 1px solid var(--sp-border-main);
		color: var(--sp-text-main);
		border-radius: 4px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
