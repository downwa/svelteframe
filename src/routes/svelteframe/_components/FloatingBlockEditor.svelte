<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';
	import BlockCanvas from './BlockCanvas.svelte';

	export let template: any[] = [];
	export let selectedObject: any = null;
	export let visible = false;
	export let initialX = 50;
	export let initialY = 100;
	export let zIndex = 1100;

	const dispatch = createEventDispatcher();

	function forwardEvent(e: CustomEvent) {
		dispatch(e.type, e.detail);
	}
</script>

<FloatingToolWindow
	title="HTML Blocks"
	{visible}
	{initialX}
	{initialY}
	{zIndex}
	width={300}
	height={500}
	on:close={() => dispatch('close')}
	on:focus={() => dispatch('focus')}
>
	<!-- Use compact mode for floating tool to save space -->
	<BlockCanvas
		class="compact"
		{template}
		{selectedObject}
		on:select={forwardEvent}
		on:delete={forwardEvent}
		on:reorder={forwardEvent}
		on:dropnew={forwardEvent}
	/>
</FloatingToolWindow>
