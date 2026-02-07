<script lang="ts">
	import { onMount } from 'svelte';

	let isRecording = false;
	let transcriptionResults: { text: string; final: boolean }[] = [];
	let error = '';
	let browserSupportsSpeechRecognition = true;

	let recognition: SpeechRecognition | null = null;

	onMount(() => {
		// Guard for SSR and unsupported browsers
		if (typeof window === 'undefined') return;

		const SpeechRecognition =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

		if (typeof SpeechRecognition === 'undefined') {
			browserSupportsSpeechRecognition = false;
			error =
				"Button was removed\nYour browser doesn't support Speech Recognition with the Web Speech API";
			return;
		}

		recognition = new SpeechRecognition();
		recognition.continuous = true;
		recognition.interimResults = true;

		recognition.addEventListener('result', (event: SpeechRecognitionEvent) => {
			const next: { text: string; final: boolean }[] = [];

			// Rebuild the full list each time, like the original DOMContentLoaded code
			for (const result of Array.from(event.results)) {
				const text = result[0].transcript;
				next.push({ text, final: result.isFinal });
			}

			transcriptionResults = next;
		});

		recognition.addEventListener('end', () => {
			// If recognition stops for any reason while flagged as recording,
			// keep state consistent with reality.
			if (isRecording) {
				isRecording = false;
			}
		});
	});

	const toggleRecording = () => {
		if (!recognition) return;

		if (isRecording) {
			recognition.stop();
			isRecording = false;
		} else {
			recognition.start();
			isRecording = true;
		}
	};
</script>

<main style="margin-top:100px">
	<h1>Test Speech</h1>

	<p>Click the button and start speaking</p>

	{#if browserSupportsSpeechRecognition}
		<button on:click={toggleRecording}>
			{isRecording ? 'Stop recording' : 'Start recording'}
		</button>

		<div id="transcription-result">
			{#each transcriptionResults as item}
				<p class:final={item.final}>{item.text}</p>
			{/each}
		</div>
	{:else}
		<p id="error-message" aria-hidden="false">
			{#each error.split('\n') as line, i}
				{line}{#if i < error.split('\n').length - 1}<br />{/if}
			{/each}
		</p>
	{/if}
</main>

<style>
	html,
	main {
		font-family: Arial, sans-serif;
		text-align: center;
	}
	#transcription-result {
		font-size: 18px;
		color: #5e5e5e;
	}
	#transcription-result .final {
		color: #000;
	}
	#error-message {
		color: #ff0000;
	}
	button {
		font-size: 20px;
		font-weight: 200;
		color: #fff;
		background: #2f2ff2;
		width: 220px;
		border-radius: 20px;
		margin-top: 2em;
		margin-bottom: 2em;
		padding: 1em;
		cursor: pointer;
	}
	button:hover,
	button:focus {
		background: #2f70f2;
	}
</style>
