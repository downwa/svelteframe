<!-- src/routes/svelteframe/testai/+page.svelte -->
<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { onMount } from 'svelte';

	let userInput = $state('');
	let chat = $state<Chat | null>(null);
	let scrollContainer = $state<HTMLUListElement | null>(null); // Reference for scrolling

	onMount(() => {
		chat = new Chat({});
	});

	// Auto-scroll logic: triggers whenever chat.messages updates
	$effect(() => {
		if (chat?.messages && scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!chat || !userInput) return;
		chat.sendMessage({ text: userInput });
		userInput = '';
	}
</script>

<main class="chat-container">
	<ul bind:this={scrollContainer}>
		{#if chat}
			{#each chat.messages as message}
				<li class="message {message.role}">
					<div class="role">{message.role}</div>
					<div class="content">
						{#each message.parts as part}
							{#if part.type === 'text'}
								<div>{part.text}</div>
							{/if}
						{/each}
					</div>
				</li>
			{/each}
		{/if}
	</ul>

	<form onsubmit={handleSubmit}>
		<input bind:value={userInput} placeholder="Type a message..." />
		<button type="submit" disabled={!userInput || chat?.status === 'streaming'}> Send </button>
	</form>
</main>

<style>
	.chat-container {
		max-width: 800px;
		margin: 100px auto 20px auto; /* 100px top margin for your header */
		padding: 0 20px;
		font-family: sans-serif;
		display: flex;
		flex-direction: column;
		/* Adjust height to account for the 100px header + some padding */
		height: calc(100vh - 140px);
	}

	ul {
		list-style: none;
		padding: 1.5rem;
		background: #f4f4f4;
		border-radius: 12px;
		border: 1px solid #ddd;
		flex: 1;
		overflow-y: auto; /* Enable the scrollbar */
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0;
	}

	/* Optional: Modern scrollbar styling */
	ul::-webkit-scrollbar {
		width: 8px;
	}
	ul::-webkit-scrollbar-track {
		background: transparent;
	}
	ul::-webkit-scrollbar-thumb {
		background: #bbb;
		border-radius: 10px;
	}

	.message {
		padding: 1rem;
		border-radius: 12px;
		max-width: 80%;
		word-wrap: break-word;
	}

	.user {
		background: #007bff;
		color: white;
		align-self: flex-end;
		border-bottom-right-radius: 2px;
	}

	.assistant {
		background: white;
		color: #333;
		align-self: flex-start;
		border: 1px solid #ddd;
		border-bottom-left-radius: 2px;
	}

	.role {
		font-size: 0.7rem;
		font-weight: bold;
		text-transform: uppercase;
		margin-bottom: 4px;
		opacity: 0.7;
	}

	form {
		display: flex;
		gap: 10px;
		padding: 15px 0;
		background: white; /* Ensures input stays readable against site bg */
	}

	input {
		flex: 1;
		padding: 12px;
		border: 1px solid #ccc;
		border-radius: 8px;
		outline: none;
	}

	input:focus {
		border-color: #007bff;
	}

	button {
		padding: 0 20px;
		background: #007bff;
		color: white;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: bold;
	}

	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}
</style>
