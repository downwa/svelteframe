<!-- src/routes/svelteframe/_components/VoiceEditor.svelte -->
<script lang="ts">
	import { onMount, createEventDispatcher, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { AI_MODELS } from '$routes/svelteframe/lib/AImodels';

	let { pagePath } = $props<{ pagePath: string }>();
	const dispatch = createEventDispatcher();

	let transcript = $state('');
	let workflowState = $state<'chat' | 'ready_to_execute' | 'executing' | 'finished'>('chat');
	let isRecording = $state(false);
	let wasRecording = $state(false); // Track if we were recording before AI started
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let selectedModel = $state<string>(''); // Will be loaded from user preferences

	// Window positioning state
	let winX = $state(100);
	let winY = $state(100);
	let winWidth = $state(550);
	let winHeight = $state(500);
	let isDragging = $state(false);
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let windowRef: HTMLElement | undefined = $state();

	let recognition: any = null;

	const chat = new Chat({
		transport: new DefaultChatTransport({
			api: '/svelteframe/api/ai/voice-edit',
			body: { path: pagePath }
		})
	});
	(window as any).chat = chat;

	// Derived busy state for UI
	const isBusy = $derived(
		chat.status === 'streaming' || chat.status === 'submitted' || workflowState === 'executing'
	);

	// Watch for AI busy state and manage recording
	$effect(() => {
		if (isBusy && isRecording) {
			// AI started processing, pause recording
			wasRecording = true;
			stopRecording();
		} else if (!isBusy && wasRecording && workflowState !== 'executing') {
			// AI finished, resume recording if it was active
			wasRecording = false;
			startRecording();
		}
	});

	$effect(() => {
		if (chat.messages.length > 0 && chat.status === 'ready' && workflowState === 'chat') {
			const last = chat.messages[chat.messages.length - 1];
			if (last.role === 'assistant') workflowState = 'ready_to_execute';
		}
		if (scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	});

	// Background task to keep speech recognition alive
	$effect(() => {
		if (browser && isRecording && recognition) {
			const interval = setInterval(() => {
				try {
					recognition.start();
				} catch (e: any) {
					// Ignore "already started" errors (InvalidStateError: recognition has already started)
					if (e.name !== 'InvalidStateError') {
						console.warn('Speech recognition auto-start attempt failed:', e);
					}
				}
			}, 1000);
			return () => clearInterval(interval);
		}
	});

	function deleteLastTurn() {
		if (chat.messages.length === 0) return;

		// Find the last user message and remove everything after it (inclusive)
		let lastUserIdx = -1;
		for (let i = chat.messages.length - 1; i >= 0; i--) {
			if (chat.messages[i].role === 'user') {
				lastUserIdx = i;
				break;
			}
		}

		if (lastUserIdx !== -1) {
			chat.messages = chat.messages.slice(0, lastUserIdx);
			if (workflowState === 'ready_to_execute') workflowState = 'chat';
			console.log('Last turn forgotten.');
		}
	}

	onMount(async () => {
		if (browser && typeof window !== 'undefined') {
			// Load user's model preference
			try {
				const res = await fetch('/svelteframe/api/user/preferences');
				if (res.ok) {
					const prefs = await res.json();
					selectedModel = prefs.voiceEditModel || AI_MODELS[0].id;
				} else {
					selectedModel = AI_MODELS[0].id;
				}
			} catch (e) {
				selectedModel = AI_MODELS[0].id;
			}

			const SpeechRec =
				(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRec) {
				recognition = new SpeechRec();
				window.recognition = recognition;
				recognition.continuous = true;
				recognition.interimResults = true;
				recognition.onresult = (event: any) => {
					for (let i = event.resultIndex; i < event.results.length; ++i) {
						if (event.results[i].isFinal) {
							// Trim, lowercase, and strip punctuation
							const resultText = event.results[i][0].transcript
								.trim()
								.toLowerCase()
								.replace(/[.,!?;]$/, '');

							console.log('Voice recognition result:', resultText);

							if (resultText === 'make it so') {
								if (workflowState === 'ready_to_execute') {
									handleExecute();
								} else {
									console.log('Cannot execute: not in ready_to_execute state');
								}
							} else if (resultText === 'okay' || resultText === 'ok') {
								if (!isBusy && transcript.trim()) {
									handleSend();
								} else {
									console.log('Cannot send: AI is busy or no transcript');
								}
							} else if (resultText === 'undo') {
								if (!isBusy) {
									handleUndo();
								} else {
									console.log('Cannot undo: AI is busy');
								}
							} else if (resultText === 'forget that' || resultText === 'forget it') {
								if (!isBusy) {
									deleteLastTurn();
								}
							} else if (resultText === 'clear input' || resultText === 'clear that') {
								transcript = '';
							} else {
								// Keep the original casing/punctuation for the actual transcript
								transcript += (transcript ? ' ' : '') + event.results[i][0].transcript.trim();
							}
						}
					}
				};
			}

			function handleGlobalKeyDown(e: KeyboardEvent) {
				if (e.key === 'Escape' && transcript.trim()) {
					transcript = '';
				}
			}

			window.addEventListener('mousemove', handleWindowMouseMove);
			window.addEventListener('mouseup', handleWindowMouseUp);
			window.addEventListener('keydown', handleGlobalKeyDown);

			// Auto-start recording on load
			toggleRecording();
		}
	});

	async function handleSend() {
		if (isBusy || !transcript.trim()) return;
		let text = transcript.trim();
		transcript = '';

		if (chat.messages.length === 0) {
			text = `[VOICE_EDIT_CONTEXT: ${pagePath}]\nUSER_REQUEST: ${text}`;
		}

		if (workflowState === 'finished') workflowState = 'chat';
		console.log('Sending chat text: ', text);

		chat.sendMessage({ text });
	}

	async function handleExecute() {
		if (browser && typeof window !== 'undefined') {
			workflowState = 'executing';
			stopRecording();
			wasRecording = false; // Reset this so we can override it later

			// Using window.fetch inside an event handler is safe from SSR warnings
			const res = await fetch('/svelteframe/api/ai/voice-edit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: chat.messages,
					data: { action: 'execute', path: pagePath }
				})
			});

			if (res.ok) {
				workflowState = 'finished';
				const doneMsg: any = {
					id: Date.now().toString(),
					role: 'assistant',
					content: 'Done! Changes applied.',
					parts: [{ type: 'text', text: 'Done! Changes applied.' }]
				};
				chat.messages = [...chat.messages, doneMsg];

				// Auto-resume recording after successful execution
				await tick();
				startRecording();
			}
		} else {
			console.warn('Cannot execute this on server');
		}
	}

	async function handleUndo(confirm = false) {
		if (browser && typeof window !== 'undefined') {
			const res = await fetch('/svelteframe/api/ai/voice-edit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: chat.messages,
					data: { action: 'undo', path: pagePath, confirm }
				})
			});

			if (res.ok) {
				const result = await res.json();

				if (result.status === 'confirm_required') {
					if (window.confirm(result.message)) {
						return handleUndo(true);
					}
					return;
				}

				const undoMsg: any = {
					id: Date.now().toString(),
					role: 'assistant',
					content: result.message,
					parts: [{ type: 'text', text: result.message }]
				};
				chat.messages = [...chat.messages, undoMsg];
				workflowState = 'chat';
			}
		}
	}

	function toggleRecording() {
		if (isRecording) stopRecording();
		else startRecording();
	}

	function stopRecording() {
		console.log('stop recording');
		recognition?.stop();
		isRecording = false;
	}

	function startRecording() {
		console.log('start recording');
		try {
			recognition?.start();
			isRecording = true;
		} catch (e) {
			console.warn('Failed to start recording:', e);
		}
	}

	async function handleModelChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		selectedModel = select.value;

		// Save to user preferences
		try {
			await fetch('/svelteframe/api/user/preferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: 'voiceEditModel', value: selectedModel })
			});
		} catch (e) {
			console.error('Failed to save model preference:', e);
		}
	}

	// ... Dragging logic ...
	function handleTitleMouseDown(e: MouseEvent) {
		isDragging = true;
		if (windowRef) {
			const rect = windowRef.getBoundingClientRect();
			dragOffsetX = e.clientX - rect.left;
			dragOffsetY = e.clientY - rect.top;

			// Capture current dimensions to state to prevent snap-back
			winWidth = rect.width;
			winHeight = rect.height;
		}
	}
	function handleWindowMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		winX = e.clientX - dragOffsetX;
		winY = e.clientY - dragOffsetY;
	}
	function handleWindowMouseUp() {
		isDragging = false;
	}
</script>

<div
	class="floating-window"
	style="left: {winX}px; top: {winY}px; width: {winWidth}px; height: {winHeight}px;"
	bind:this={windowRef}
>
	<div class="title-bar" onmousedown={handleTitleMouseDown}>
		<span class="title"
			>Voice edit this page <small style="font-size: 0.7em; opacity: 0.8;"
				>(Say "okay" to send)</small
			></span
		>
		<button class="close-btn" onclick={() => dispatch('close')}>×</button>
	</div>

	<div class="content-area">
		<div class="chat-log" bind:this={scrollContainer}>
			{#each chat.messages as msg}
				{@const hasContent =
					msg.parts &&
					msg.parts.length > 0 &&
					msg.parts.some(
						(p) =>
							p.type === 'text' &&
							p.text &&
							p.text.replace(/\[VOICE_EDIT_CONTEXT:.*?\]\nUSER_REQUEST:\s*/, '').trim()
					)}
				<div class="message {msg.role}">
					<div class="role-label">{msg.role === 'user' ? 'You' : 'AI'}</div>
					<div class="msg-content">
						{#if hasContent}
							{#each msg.parts as part}
								{#if part.type === 'text'}
									{part.text.replace(/\[VOICE_EDIT_CONTEXT:.*?\]\nUSER_REQUEST:\s*/, '').trim()}
								{/if}
							{/each}
						{:else}
							<em style="opacity: 0.6;">(empty response)</em>
						{/if}
					</div>
				</div>
			{/each}

			{#if chat.error}
				<div class="message assistant error">
					<div class="msg-content" style="color: #ff8888; border-color: red;">
						⚠️ {chat.error.message}
					</div>
				</div>
			{/if}
		</div>

		<div class="input-area">
			<div class="input-wrapper">
				{#if transcript.trim()}
					<div class="draft-indicator">Draft (say "clear input" to wipe)</div>
				{/if}
				<textarea bind:value={transcript} placeholder="Speak... say 'okay' to send"></textarea>
				{#if transcript.trim()}
					<button
						class="clear-input-btn"
						onclick={() => (transcript = '')}
						title="Clear draft (Esc)">×</button
					>
				{/if}
			</div>
			<button
				class="mic-btn {isRecording ? 'recording' : ''} {isBusy ? 'busy' : ''}"
				onclick={toggleRecording}
				disabled={isBusy}
			>
				{#if isBusy}
					⏳
				{:else if isRecording}
					🛑
				{:else}
					🎤
				{/if}
			</button>
		</div>

		<div class="controls">
			<div class="controls-left">
				<select
					class="model-select"
					bind:value={selectedModel}
					onchange={handleModelChange}
					disabled={isBusy}
				>
					{#each AI_MODELS as model}
						<option value={model.id}>{model.name}</option>
					{/each}
				</select>
				{#if chat.messages.length > 0}
					<button
						class="forget-btn"
						onclick={deleteLastTurn}
						disabled={isBusy}
						title="Remove last user/AI turn from history (say 'forget that')"
					>
						Forget last turn
					</button>
				{/if}
			</div>
			<div class="controls-right">
				{#if workflowState === 'chat' || workflowState === 'ready_to_execute'}
					<button onclick={() => dispatch('close')}>Cancel</button>
					<button class="primary" onclick={handleSend} disabled={isBusy || !transcript.trim()}
						>➡</button
					>
					{#if workflowState === 'ready_to_execute'}
						<button class="accent" onclick={handleExecute} disabled={isBusy}>Make it so</button>
					{/if}
				{:else if workflowState === 'executing'}
					<span class="status">Working...</span>
				{:else}
					<button onclick={() => handleUndo()}> Undo </button>
					<button class="primary" onclick={() => dispatch('close')}>Finished</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* Use your previous styles, adding: */
	small {
		font-weight: normal;
		margin-left: 5px;
	}
	.recording {
		color: red;
		box-shadow: 0 0 5px red;
	}
	.error-box {
		background: rgba(255, 0, 0, 0.1) !important;
		border: 1px solid #ff4444 !important;
		color: #ff8888 !important;
		font-style: italic;
	}
	.floating-window {
		position: fixed;
		width: 550px;
		height: 500px;
		background: #1e1e1e;
		color: white;
		border: 1px solid #333;
		display: flex;
		flex-direction: column;
		z-index: 9999;
		border-radius: 8px;
		resize: both;
		overflow: hidden;
		min-width: 500px;
		min-height: 400px;
	}
	.title-bar {
		padding: 10px;
		background: #2d2d2d;
		cursor: move;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.close-btn {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 2rem;
		padding: 0;
		line-height: 1;
	}
	.close-btn:hover {
		color: #fff;
	}
	.content-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 10px;
		overflow: hidden;
	}
	.chat-log {
		flex: 1;
		overflow-y: auto;
		margin-bottom: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.msg-content {
		background: #2d2d2d;
		padding: 8px;
		border-radius: 4px;
		font-size: 0.9em;
		white-space: pre-wrap;
	}
	.user .msg-content {
		background: #007acc;
	}
	.input-area {
		display: flex;
		gap: 5px;
		align-items: stretch;
	}
	.input-wrapper {
		flex: 1;
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.draft-indicator {
		position: absolute;
		top: -18px;
		left: 5px;
		font-size: 0.7em;
		color: #aaa;
		font-style: italic;
	}
	.clear-input-btn {
		position: absolute;
		right: 5px;
		top: 5px;
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 5px;
		line-height: 1;
	}
	.clear-input-btn:hover {
		color: #fff;
	}
	textarea {
		flex: 1;
		height: 60px;
		background: #252526;
		color: white;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 8px;
		padding-right: 30px;
		font-family: inherit;
		resize: none;
	}
	.forget-btn {
		margin-left: 10px;
		padding: 4px 8px;
		font-size: 0.75rem;
		background: #442222;
		border-color: #663333;
		color: #ffcccc;
	}
	.forget-btn:hover:not(:disabled) {
		background: #663333;
	}
	.mic-btn {
		width: 50px;
		height: 50px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		background: #333;
		border: 1px solid #444;
		border-radius: 4px;
		cursor: pointer;
		color: white;
		transition: all 0.2s;
	}
	.mic-btn:hover:not(:disabled) {
		background: #3c3c3c;
	}
	.mic-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.mic-btn.busy {
		animation: pulse 1.5s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}
	.controls-left {
		display: flex;
		align-items: center;
	}
	.controls-right {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		flex: 1;
	}
	.model-select {
		padding: 6px 10px;
		background: #333;
		color: white;
		border: 1px solid #444;
		border-radius: 4px;
		font-size: 0.85rem;
		cursor: pointer;
		min-width: 150px;
	}
	.model-select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button {
		padding: 8px 16px;
		border-radius: 4px;
		border: 1px solid #444;
		background: #333;
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s;
	}
	button:hover:not(:disabled) {
		background: #3c3c3c;
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	button.primary {
		background: #007acc;
		color: white;
		border: none;
		padding: 8px 20px;
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
	}
	button.accent {
		background: #28a745;
		color: white;
		border: none;
		padding: 5px 15px;
		cursor: pointer;
	}
	.mic.active {
		color: red;
	}
</style>
