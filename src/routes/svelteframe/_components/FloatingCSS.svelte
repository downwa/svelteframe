<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';
	import EditCSS from './EditCSS.svelte';

	export let style: string = '';
	export let visible = false;
	export let initialX = 100;
	export let initialY = 100;
	export let zIndex = 1100;

	const dispatch = createEventDispatcher();

	function handleChange(e: CustomEvent) {
		dispatch('change', e.detail);
	}
</script>

<FloatingToolWindow
	title="Styles"
	{visible}
	{initialX}
	{initialY}
	{zIndex}
	width={350}
	height={500}
	on:close={() => dispatch('close')}
	on:focus={() => dispatch('focus')}
>
	<div class="scroller">
		<EditCSS {style} on:change={handleChange} />
	</div>
</FloatingToolWindow>

<style>
	.scroller {
		height: 100%;
		overflow-y: auto;
	}
</style>
