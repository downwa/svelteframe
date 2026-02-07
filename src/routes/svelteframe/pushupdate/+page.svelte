<!-- src/routes/svelteframe/pushupdate/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
	import FilePicker from '../_components/FilePicker.svelte';
	import FloatingToolWindow from '../_components/FloatingToolWindow.svelte';
	import headerImg1 from '../lib/assets/images/choggiung_droneA_6.webp';

	const heroSlidesData = [
		{
			bgImageSrc: headerImg1,
			bgImageAlt: 'Dev Tool',
			headingPhrase: 'Developer Export',
			subText: 'Synchronize core SvelteFrame logic to a standalone repository',
			buttonText: '',
			buttonLink: '',
			progressText: ''
		}
	];

	let targetPath = '';
	let status = '';
	let isError = false;
	let isLoading = false;
	let showDirectoryPicker = false;

	async function handleExport(confirmClean = false) {
		isLoading = true;
		isError = false;
		status = 'Analyzing target directory...';

		const formData = new FormData();
		formData.append('targetPath', targetPath);
		if (confirmClean) formData.append('cleanRepo', 'true');

		try {
			const res = await fetch('/svelteframe/pushupdate', { method: 'POST', body: formData });
			const result = await res.json();

			if (result.needsConfirmation) {
				if (confirm(result.message)) {
					handleExport(true);
					return;
				}
				status = 'Operation cancelled.';
			} else if (res.ok) {
				status = result.message;
				isError = false;
			} else {
				status = result.message || 'An unknown error occurred.';
				isError = true;
			}
		} catch (e) {
			status = 'Failed to connect to the server.';
			isError = true;
		} finally {
			isLoading = false;
		}
	}
</script>

<HeroStatic slides={heroSlidesData} />

<div class="dev-page-wrapper">
	<div class="dev-container">
		<div class="glass-pane">
			<h2 class="high-contrast">Standalone Repository Sync</h2>
			<p class="description">
				Specify the root directory of the standalone SvelteFrame repo.
				<span class="warning-text"
					>Warning: Existing files will be replaced (except .git and .env).</span
				>
			</p>

			<div class="field-group">
				<label for="repo-path" class="high-contrast">Target Repository Path</label>
				<div class="input-row">
					<input
						id="repo-path"
						type="text"
						bind:value={targetPath}
						placeholder="/absolute/path/to/standalone-repo"
					/>
					<button class="secondary-btn" on:click={() => (showDirectoryPicker = true)}>
						Browse
					</button>
				</div>
				<button
					class="primary-btn"
					on:click={() => handleExport()}
					disabled={isLoading || !targetPath}
				>
					{isLoading ? 'Processing...' : 'Execute Export'}
				</button>
			</div>

			{#if status}
				<div
					class="status-box"
					class:error={isError}
					class:success={!isError && status.includes('Successfully')}
				>
					<span class="status-icon">{isError ? '❌' : 'ℹ️'}</span>
					<div class="status-content">
						<p class="high-contrast">Status Update</p>
						<p>{status}</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if showDirectoryPicker}
	<FloatingToolWindow
		title="Select Repository Folder"
		visible={true}
		width={700}
		height={500}
		on:close={() => (showDirectoryPicker = false)}
	>
		<FilePicker
			absolutePath="~"
			allowFolderSelection={true}
			showFiles={false}
			confirmButtonLabel="Set as Target"
			on:select={(e) => {
				targetPath = e.detail;
				showDirectoryPicker = false;
			}}
		/>
	</FloatingToolWindow>
{/if}

<style>
	/* Use a wrapper that allows for scrolling and fills the remaining height */
	.dev-page-wrapper {
		background-color: #020617;
		min-height: 60vh;
		width: 100%;
		display: block;
		overflow-y: auto; /* Enable scrolling if pane gets large */
		padding-bottom: 5rem;
	}

	.dev-container {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 4rem 1rem 0 1rem;
		width: 100%;
		box-sizing: border-box;
	}

	.glass-pane {
		background: #1e293b;
		padding: 3rem;
		border-radius: 1rem;
		width: 100%;
		max-width: 700px;
		border: 3px solid #334155; /* Thicker border for visual container */
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9);
		display: block;
		height: auto; /* Ensure height fits all content */
		position: relative;
	}

	.high-contrast {
		color: #ffffff !important;
		font-weight: 800;
	}

	h2 {
		font-size: 2rem;
		margin: 0 0 1.5rem 0;
		border-bottom: 1px solid #334155;
		padding-bottom: 1rem;
	}

	.description {
		color: #cbd5e1;
		line-height: 1.7;
		margin-bottom: 2.5rem;
		font-size: 1.1rem;
	}

	.warning-text {
		color: #fbbf24;
		font-weight: 700;
		display: block;
		margin-top: 1rem;
		background: rgba(251, 191, 36, 0.1);
		padding: 0.75rem;
		border-radius: 6px;
		border-left: 4px solid #fbbf24;
	}

	.field-group {
		margin-top: 2rem;
	}

	.field-group label {
		display: block;
		margin-bottom: 1rem;
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.075em;
	}

	.input-row {
		display: flex;
		flex-wrap: wrap; /* Allow wrap on small screens */
		gap: 15px;
		margin-bottom: 2rem;
	}

	input {
		flex: 1;
		min-width: 250px;
		padding: 14px 18px;
		background: #000000; /* Max contrast for text input */
		border: 2px solid #64748b;
		color: #ffffff;
		border-radius: 8px;
		font-size: 1.1rem;
		font-family: 'Courier New', monospace;
	}

	input:focus {
		border-color: #a78bfa;
		box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.2);
		outline: none;
	}

	button.primary-btn {
		width: 100%;
		padding: 18px;
		background: #7c3aed;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 800;
		font-size: 1.2rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transition: all 0.2s;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
	}

	button.primary-btn:hover:not(:disabled) {
		background: #8b5cf6;
		transform: translateY(-1px);
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
	}

	button.primary-btn:active {
		transform: translateY(1px);
	}

	button.secondary-btn {
		background: #334155;
		color: #ffffff;
		border: 2px solid #475569;
		padding: 0 28px;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 700;
		font-size: 1rem;
	}

	button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		filter: grayscale(1);
	}

	.status-box {
		margin-top: 3rem;
		padding: 1.5rem;
		background: #020617;
		border-radius: 10px;
		border: 2px solid #334155;
		border-left: 8px solid #64748b;
		display: flex;
		align-items: flex-start;
		gap: 15px;
	}

	.status-content {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.status-box p {
		margin: 0;
		color: #e2e8f0;
		font-size: 1.05rem;
		line-height: 1.5;
	}

	.status-box.success {
		border-left-color: #22c55e;
		background: rgba(34, 197, 94, 0.05);
	}

	.status-box.error {
		border-left-color: #ef4444;
		background: rgba(239, 68, 68, 0.05);
	}

	.status-icon {
		font-size: 1.5rem;
		margin-top: 2px;
	}
</style>
