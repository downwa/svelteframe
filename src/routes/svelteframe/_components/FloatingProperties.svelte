<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FloatingToolWindow from './FloatingToolWindow.svelte';
	import PropertyEditor from './PropertyEditor.svelte';

	export let head: any = null;
	export let props: any[] = [];
	export let components: any[] = [];
	export let imports: any[] = [];
	export let importedObjects: any[] = [];
	export let style: string = '';
	export let selectedObject: any = null;
	export let permissions = {
		canEditHtml: true,
		canEditProps: true,
		canEditStyle: true
	};
	export let user: any = null;
	export let visible = false;
	export let initialX = 500;
	export let initialY = 100;
	export let width = 600;
	export let height = 600;
	export let filePath = '';
	export let externalSelectedId: string | null = null;
	export let zIndex = 1100;

	// PropertyEditorRef to access exported methods like getDirtyImported()
	export let editorRef: PropertyEditor;

	const dispatch = createEventDispatcher();

	// Forward events
	function forwardEvent(e: CustomEvent) {
		dispatch(e.type, e.detail);
	}
</script>

<FloatingToolWindow
	title="Properties"
	{visible}
	{initialX}
	{initialY}
	{zIndex}
	{width}
	{height}
	on:close={() => dispatch('close')}
	on:focus={() => dispatch('focus')}
>
	<PropertyEditor
		bind:this={editorRef}
		{filePath}
		{head}
		{props}
		{components}
		{imports}
		{importedObjects}
		{style}
		bind:selectedObject
		{externalSelectedId}
		{permissions}
		{user}
		on:change={(e) => dispatch('change', e.detail)}
		on:select={forwardEvent}
		on:reorderprops={forwardEvent}
		on:reordercomponents={forwardEvent}
		on:delete={forwardEvent}
		on:editComponent={forwardEvent}
		on:editContent={forwardEvent}
		on:saveAll={(e) => dispatch('saveAll', e.detail)}
		on:close={() => dispatch('close')}
	/>
</FloatingToolWindow>
