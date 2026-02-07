<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	export let path: string;
	export let id: string;
	export let name: string;

	const dispatch = createEventDispatcher();
	let ref: HTMLElement;

	function handleClick(e: MouseEvent) {
		// Stop propagation if we handled it, or let bubbles flow?
		// We want to capture the "innermost" click.
		// If we use capture phase at the top, we can find the target.
		// If we use bubble, the innermost handler runs first.
		// So we can attach a handler here.
		// But we only want to trigger "Select" if the editor is in "Edit Mode".
		// We'll leave that logic to the parent (delegation) or check a store/context?
		// Better: Dispatch a custom event that bubbles.
		e.stopPropagation(); // Stop default click? No, might break links.
		// Actually, we should probably prevent default ONLY if in edit mode.
		// The parent (+page.svelte) will handle the global click listener.
		// So we just provide the data attribute.
	}
</script>

<!-- 
    Using display: contents to avoid breaking layout.
    The data attributes will be present in the DOM for the global click handler to find.
-->
<div
	bind:this={ref}
	style="display: contents;"
	data-sp-component={path}
	data-sp-id={id}
	data-sp-name={name}
>
	<slot />
</div>

<style>
	/* No styles needed for display: contents */
</style>
