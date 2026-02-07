<!-- 
  This file acts as a trigger. 
  The presence of <HeroStatic /> tells the backend API 
  to initiate the special hero creation flow.
  The final generated page will have a full script block
  and props passed to the component.
-->
<script>
  import HeroStatic from '$lib/components/HeroStatic.svelte';
</script>

<HeroStatic />
