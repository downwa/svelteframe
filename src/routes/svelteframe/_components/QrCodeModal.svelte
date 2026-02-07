<!-- FILE: src/routes/svelteframe/_components/QrCodeModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import QRCode from 'qrcode';

	export let show = false;
	export let token = '';
	export let path = '/svelteframe/auth/add-device';
	export let duration = 900; // 15 minutes

	const dispatch = createEventDispatcher();
	let canvas: HTMLCanvasElement;
	let timeLeft = duration;

	let error = '';
	let countdownInterval: any;
	let pollingInterval: any;

	// When the `show` prop becomes true, this block will run.
	$: if (show && token && canvas) {
		error = ''; // Reset error on show
		const separator = path.includes('?') ? '&' : '?';
		const url = `${window.location.origin}${path}${separator}token=${token}`;
		QRCode.toCanvas(canvas, url, { width: 256, margin: 2 });
		startTimers();
	}

	function cleanupTimers() {
		clearInterval(countdownInterval);
		clearInterval(pollingInterval);
	}

	function startTimers() {
		cleanupTimers(); // Clear any old timers first

		// Timer for the expiration countdown UI
		timeLeft = duration;
		countdownInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) {
				handleClose(); // Auto-close when expired
			}
		}, 1000);

		// --- NEW: Polling timer to check for token consumption ---
		pollingInterval = setInterval(async () => {
			try {
				// Check if token status is 'consumed'
				const response = await fetch('/svelteframe/api/user/check-device-token', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ token })
				});

				if (!response.ok) {
					console.debug('[QrCode] Check token status:', response.status);
					if (response.status === 404) {
						error = 'Token not found or expired.';
						cleanupTimers();
					}
					return;
				}

				const body = await response.json();
				console.debug('[QrCode] Token status:', body.status);

				if (body.status === 'consumed') {
					console.log('[QrCode] Token consumed! Closing modal.');
					handleClose();
				} else if (body.status === 'invalid' || body.status === 'expired') {
					error = `Link is ${body.status}. Please try again.`;
					cleanupTimers();
				}
			} catch (e: any) {
				console.error('[QrCode] Polling error (will retry):', e);
			}
		}, 3000); // Poll every 3 seconds
	}

	function handleClose() {
		cleanupTimers();
		dispatch('close');
	}

	function formatTime(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	// This is a Svelte lifecycle function that runs when the component is removed.
	// It's crucial for preventing memory leaks.
	onDestroy(() => {
		cleanupTimers();
	});
</script>

{#if show}
	<!-- Use the new handleClose function for all close actions -->
	<div class="modal-backdrop" on:click|self={handleClose}>
		<div class="modal-content">
			<header>
				<h2>Add a New Device</h2>
				<button type="button" class="close-btn" on:click={handleClose}>×</button>
			</header>
			<main>
				{#if error}
					<div class="error-state">
						<span class="icon">⚠️</span>
						<p>{error}</p>
						<button class="btn secondary" on:click={handleClose}>Close</button>
					</div>
				{:else}
					<p>Scan this QR code with the new device you wish to add.</p>
					<canvas bind:this={canvas}></canvas>
					<p class="timer">This code will expire in: <strong>{formatTime(timeLeft)}</strong></p>
				{/if}
			</main>
		</div>
	</div>
{/if}

<style>
	/* Standard modal styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: grid;
		place-items: center;
		z-index: 4000;
	}
	.modal-content {
		background: #ffffff;
		padding: 0;
		border-radius: 8px;
		width: min(95%, 400px);
		text-align: center;
	}
	header {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #dee2e6;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
	}
	main {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	canvas {
		border: 1px solid #dee2e6;
		border-radius: 4px;
	}
	.timer {
		font-size: 0.9rem;
		color: #6c757d;
	}
</style>
