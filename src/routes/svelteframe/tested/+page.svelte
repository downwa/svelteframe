<!-- FILE: src/routes/svelteframe/tested/+page.svelte -->
<script lang="ts">
	import TestEditor from '../_components/TestEditor.svelte';
	import { enhance } from '$app/forms';

	export let data; // This comes from the load function in +page.server.ts
	let editorComponent;
	let isSaving = false;
</script>

<!-- enhance handles the form submission without a page reload -->
<main>
	<form
		method="POST"
		action="?/save"
		use:enhance={({ formData }) => {
			// 1. Get the latest data from the CKEditor instance
			const editorData = editorComponent?.getData() || '';

			// 2. Manually set the 'content' field in the formData being sent to the server
			formData.set('content', editorData);

			console.log('Sending to server:', editorData);
			isSaving = true;
			return async ({ update }) => {
				isSaving = false;
				update();
			};
		}}
	>
		<div class="controls">
			<button type="submit" disabled={isSaving}>
				{isSaving ? 'Saving...' : 'Save to .test File'}
			</button>
		</div>

		<TestEditor bind:this={editorComponent} initialData={data.sourceContent} />
	</form>
</main>

<style>
	main {
		margin-top: 100px;
	}
	.controls {
		padding: 1rem;
		background: #f4f4f4;
		border-bottom: 1px solid #ccc;
		position: sticky;
		top: 0;
		z-index: 10;
	}
	button {
		padding: 10px 20px;
		background: #007bff;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	button:disabled {
		background: #ccc;
	}
</style>
