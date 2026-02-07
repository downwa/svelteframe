<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import ManualCKEditor from './ManualCKEditor.svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';

	export let content = '';
	export let rect: DOMRect | null = null;
	export let visible = false;
	export let zIndex = 2000;

	const dispatch = createEventDispatcher();

	let initialContent = '';
	let localContent = ''; // The temporary buffer for editing
	// Use a flag to ignore the first "change" event which is usually just CKEditor normalizing the HTML
	let hasInteracted = false;

	// When the window opens, take a snapshot
	$: if (visible && content !== initialContent && initialContent === '') {
		initialContent = content;
		localContent = content; // Sync the buffer with the truth
		hasInteracted = false;
	}

	function handleContentChange() {
		// If the editor just loaded and normalized, initialContent
		// might not match content exactly, so we track interaction instead
		hasInteracted = true;
	}

	function save() {
		// Note: We send the raw localContent, not normalized, to preserve
		// the user's intended formatting in the actual file.
		dispatch('save', { content: localContent });
		cleanup();
	}

	/**
	 * Normalizes HTML for comparison by:
	 * 1. Using DOMParser to handle attribute order and encoding
	 * 2. Removing whitespace between tags
	 * 3. Collapsing internal whitespace
	 */
	function normalizeHtml(html: string): string {
		if (typeof document === 'undefined') return html;
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// --- NEW: Aggressive internal trimming ---
			// This finds every element and trims the whitespace from its start/end
			const allElements = doc.body.querySelectorAll('*');
			allElements.forEach((el) => {
				if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
					// If the element only contains text, trim it
					el.textContent = el.textContent?.trim() || '';
				}
			});

			let result = doc.body.innerHTML;

			return result
				.replace(/\n/g, '') // Remove newlines
				.replace(/>\s+/g, '>') // Remove whitespace between tags
				.replace(/\s+</g, '<') // Remove whitespace between tags
				.replace(/\s+/g, ' ') // Collapse multiple spaces to one
				.trim();
		} catch (e) {
			return html.trim();
		}
	}

	function isMeaningfullyDifferent(current: string, original: string): boolean {
		// console.log(
		// 	'isMeaningfullyDifferent: current=',
		// 	normalizeHtml(current),
		// 	'original=',
		// 	normalizeHtml(original)
		// );
		return normalizeHtml(current) !== normalizeHtml(original);
	}

	async function cancel() {
		await tick();

		// Only warn if the user touched the keyboard AND the content is
		// structurally different from what we started with.
		if (hasInteracted && isMeaningfullyDifferent(localContent, initialContent)) {
			if (!confirm('You have unsaved changes. Discard them?')) {
				return;
			}
		}
		cleanup();
		dispatch('cancel');
	}

	function cleanup() {
		initialContent = '';
		localContent = '';
		hasInteracted = false;
	}
</script>

{#if visible}
	<FloatingToolWindow
		title="Edit Content"
		visible={true}
		width={850}
		height={650}
		{zIndex}
		on:close={cancel}
		on:focus={() => dispatch('focus')}
	>
		<div class="ck-editor-container">
			<div class="ck-body">
				<ManualCKEditor bind:data={localContent} on:change={handleContentChange} height="100%" />
			</div>
			<div class="ck-footer">
				<button class="btn cancel" on:click={cancel}>Cancel</button>
				<button class="btn save" on:click={save}>Save</button>
			</div>
		</div>
	</FloatingToolWindow>
{/if}

<style>
	.ck-editor-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		flex: 1;
		background: white;
		position: relative; /* CRITICAL for CKEditor menu positioning */
	}

	.ck-body {
		flex: 1;
		min-height: 0; /* Important for flex child resizing */
		padding: 0; /* Remove padding to let editor fill space */
		display: flex;
		flex-direction: column;
	}

	:global(.ck-editor) {
		display: flex !important;
		flex-direction: column !important;
		height: 100% !important;
	}

	:global(.ck-editor__main) {
		flex: 1 !important;
		overflow: auto !important;
	}

	:global(.ck-toolbar) {
		position: sticky !important;
		top: 0;
		z-index: 10;
		border-top: none !important;
		border-left: none !important;
		border-right: none !important;
	}

	.ck-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 12px 16px;
		background: #f5f5f5;
		border-top: 1px solid #ddd;
	}

	.btn {
		padding: 8px 20px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 600;
		font-size: 14px;
		transition: all 0.2s;
	}

	.save {
		background: #28a745;
		color: white;
	}

	.save:hover {
		background: #218838;
	}

	.cancel {
		background: #6c757d;
		color: white;
	}

	.cancel:hover {
		background: #5a6268;
	}
</style>
