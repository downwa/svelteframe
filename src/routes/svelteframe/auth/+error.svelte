<!-- FILE: src/routes/svelteframe/auth/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="error-container">
	<div class="error-card">
		<h1>An Error Occurred</h1>
		<p class="status-code">Error {$page.status}</p>
		<p class="message">{$page.error?.message || 'Something went wrong.'}</p>
		<a href="/svelteframe/auth/login" class="button">Go to Login</a>
	</div>
</div>

<style>
	.error-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background-color: #1e1e1e;
		color: #d4d4d4;
		font-family: sans-serif;
		padding: 2rem;
		/* --- FIX: Add box-sizing for more predictable layout --- */
		box-sizing: border-box;
	}
	.error-card {
		background-color: #2a2a2a;
		border: 1px solid #444;
		border-radius: 8px;
		padding: 2rem 3rem;
		text-align: center;
		max-width: 500px;
		width: 100%; /* Allow card to shrink */
	}
	h1 {
		color: #ff6b6b;
		margin-top: 0;
	}
	.status-code {
		font-size: 1.2rem;
		font-weight: bold;
		color: #aaa;
	}
	.message {
		font-size: 1.1rem;
		color: #d4d4d4;
		margin: 1.5rem 0;
		/* --- FIX: Help text break nicely on small screens --- */
		word-break: break-word;
	}
	.button {
		display: inline-block;
		background-color: #0e639c;
		color: white;
		border: none;
		padding: 10px 20px;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		text-decoration: none;
		transition: background-color 0.2s;
	}
	.button:hover {
		background-color: #157ac0;
	}

	/* --- FIX: Media query for mobile-friendly styles --- */
	@media (max-width: 600px) {
		.error-container {
			/* Reduce outer padding on small screens */
			padding: 1rem;
		}
		.error-card {
			/* Reduce inner padding on small screens to give text more space */
			padding: 2rem 1.5rem;
		}
		h1 {
			font-size: 1.8rem;
		}
		.message {
			font-size: 1rem;
		}
	}
</style>
