<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import HeroStatic from '../_pubcomponents/HeroStatic.svelte';
	import FilePicker from '../_components/FilePicker.svelte';
	import FloatingToolWindow from '../_components/FloatingToolWindow.svelte';
	import headerImg1 from '../lib/assets/images/choggiung_droneA_6.webp';

	export let data: PageData;

	const heroSlidesData = [
		{
			bgImageSrc: headerImg1,
			bgImageAlt: 'Setup Header',
			headingPhrase: 'SvelteFrame Setup',
			subText: 'Configuring your next-generation platform',
			buttonText: '',
			buttonLink: '',
			progressText: ''
		}
	];

	let isLocalAuth = data.isAuthenticated;
	let step = isLocalAuth ? 2 : 1;

	// Gating: Force back to Step 1 if not authenticated and trying to go further
	$: {
		if (step > 1 && !isLocalAuth && !data.isAuthenticated) {
			step = 1;
		}
	}

	let status = isLocalAuth ? 'Authentication successful.' : '';
	let isLoading = false;

	// Config Variables (Pre-filled from data.env)
	let config: Record<string, string> = {
		ADMINUSER: data.env?.ADMINUSER || '',
		ADMIN_DISPLAY_NAME: data.env?.ADMIN_DISPLAY_NAME || '',
		RPID: data.env?.RPID || 'localhost',
		ORIGINPORT: data.env?.ORIGINPORT || '5173',
		ORIGIN: data.env?.ORIGIN || 'http://localhost:5173',
		PUBLIC_SITE_NAME: data.env?.PUBLIC_SITE_NAME || 'SvelteFrame Site',
		PUBLIC_SITE_URL: data.env?.PUBLIC_SITE_URL || 'http://localhost:5173',

		// Mail
		MAIL_SERVER: data.env?.MAIL_SERVER || 'smtp.office365.com',
		MAIL_PORT: data.env?.MAIL_PORT || '587',
		MAIL_USER: data.env?.MAIL_USER || '',
		MAIL_PASS: data.env?.MAIL_PASS || '',
		EMAIL_FROM_ADDRESS: data.env?.EMAIL_FROM_ADDRESS || '',
		BREVO_API_KEY: data.env?.BREVO_API_KEY || '',
		BREVO_SMTP_KEY: data.env?.BREVO_SMTP_KEY || '',

		// Keys/APIs
		PUBLIC_CKEDITOR_LICENSE_KEY: data.env?.PUBLIC_CKEDITOR_LICENSE_KEY || 'GPL',
		PUBLIC_TURNSTILE_SITE_KEY: data.env?.PUBLIC_TURNSTILE_SITE_KEY || '',
		TURNSTILE_SECRET_KEY: data.env?.TURNSTILE_SECRET_KEY || '',
		OPENROUTER_API_KEY: data.env?.OPENROUTER_API_KEY || '',
		MSGRAPH_SECRET: data.env?.MSGRAPH_SECRET || '',
		MSGRAPH_APPID: data.env?.MSGRAPH_APPID || '',
		MSGRAPH_TENID: data.env?.MSGRAPH_TENID || '',
		NODE_ENV:
			data.env?.NODE_ENV === 'dev'
				? 'development'
				: data.env?.NODE_ENV === 'prod'
					? 'production'
					: data.env?.NODE_ENV || 'development'
	};

	let confirmationFile: File | null = null;

	async function handleAuth() {
		if (!confirmationFile) {
			status = 'Please select the confirmation file.';
			return;
		}

		isLoading = true;
		const formData = new FormData();
		formData.append('action', 'auth');
		formData.append('file', confirmationFile);

		try {
			const res = await fetch('/svelteframe/setup/confirm', { method: 'POST', body: formData });
			const result = await res.json();
			if (res.ok) {
				isLocalAuth = true;
				step = 2;
				status = 'Authentication successful.';
			} else {
				status = result.message || 'Authentication failed.';
			}
		} catch (e) {
			status = 'Error connecting to server.';
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		isLoading = true;
		const formData = new FormData();
		formData.append('action', 'save');
		for (const [key, value] of Object.entries(config)) {
			formData.append(key, value);
		}

		try {
			const res = await fetch('/svelteframe/setup/confirm', { method: 'POST', body: formData });
			const result = await res.json();
			if (res.ok) {
				status = 'Configuration saved successfully!';
			} else {
				status = result.message || 'Failed to save configuration.';
			}
		} catch (e) {
			status = 'Error connecting to server.';
		} finally {
			isLoading = false;
		}
	}

	const nextStep = () => step++;
	const prevStep = () => step--;

	interface Field {
		key: string;
		label: string;
		type: string;
		hint?: string;
		options?: { label: string; value: string }[];
		action?: {
			label: string;
			id?: string;
			url?: string;
			external?: boolean;
		};
	}

	interface Section {
		id: string;
		title: string;
		desc: string;
		fields: Field[];
	}

	const sections: Section[] = [
		{
			id: 'general',
			title: 'General Settings',
			desc: 'Core identity and security parameters for your installation.',
			fields: [
				{
					key: 'PUBLIC_SITE_URL',
					label: 'Site URL',
					type: 'url',
					hint: 'The public URL of your site (e.g. https://example.com).'
				},
				{
					key: 'ADMINUSER',
					label: 'Admin Email',
					type: 'email',
					hint: 'The primary account used for administration.'
				},
				{
					key: 'ADMIN_DISPLAY_NAME',
					label: 'Admin Name',
					type: 'text',
					hint: 'Optional display name for notifications.'
				},
				{
					key: 'RPID',
					label: 'Passkey RPID',
					type: 'text',
					hint: 'Your domain name (e.g. example.com) for authentication.'
				},
				{
					key: 'ORIGIN',
					label: 'Passkey Site Origin',
					type: 'url',
					hint: 'Full URL including https:// (e.g. https://example.com).'
				}
			]
		},
		{
			id: 'mail',
			title: 'Email Configuration',
			desc: 'Used for account verification and system alerts. MS Graph is a modern alternative to SMTP.',
			fields: [
				{ key: 'MAIL_SERVER', label: 'SMTP Server', type: 'text' },
				{ key: 'MAIL_PORT', label: 'SMTP Port', type: 'number' },
				{ key: 'MAIL_USER', label: 'SMTP User', type: 'text' },
				{ key: 'MAIL_PASS', label: 'SMTP Password', type: 'password' },
				{
					key: 'EMAIL_FROM_ADDRESS',
					label: 'From Address',
					type: 'email',
					hint: 'Default sender address.'
				},
				{
					key: 'MSGRAPH_APPID',
					label: 'MS Graph App ID',
					type: 'text',
					hint: 'Optional: Use Microsoft Graph for email sending.'
				},
				{ key: 'MSGRAPH_SECRET', label: 'MS Graph Secret', type: 'password' },
				{ key: 'MSGRAPH_TENID', label: 'MS Graph Tenant ID', type: 'text' },
				{
					key: 'BREVO_API_KEY',
					label: 'Brevo API Key',
					type: 'text',
					hint: 'Alternative for high-volume delivery.'
				}
			]
		},
		{
			id: 'security',
			title: 'Security & Licensing',
			desc: 'API keys for third-party integrations and bot protection.',
			fields: [
				{
					key: 'PUBLIC_TURNSTILE_SITE_KEY',
					label: 'Turnstile Site Key',
					type: 'text',
					action: { label: 'How to setup?', id: 'turnstile-walkthrough' }
				},
				{ key: 'TURNSTILE_SECRET_KEY', label: 'Turnstile Secret', type: 'password' },
				{
					key: 'PUBLIC_CKEDITOR_LICENSE_KEY',
					label: 'CKEditor License',
					type: 'text',
					hint: 'Set to "GPL" unless you have a commercial key.',
					action: { label: 'Pricing', url: 'https://ckeditor.com/pricing/', external: true }
				}
			]
		},
		{
			id: 'advanced',
			title: 'Advanced & AI',
			desc: 'Logic and integration parameters for AI and Graph services.',
			fields: [
				{
					key: 'PUBLIC_SITE_NAME',
					label: 'Site Name',
					type: 'text',
					hint: 'The name the AI uses to identify itself to OpenRouter.'
				},
				{
					key: 'OPENROUTER_API_KEY',
					label: 'OpenRouter API Key',
					type: 'password',
					hint: 'Required for Voice Editor features.'
				},
				{
					key: 'NODE_ENV',
					label: 'Environment',
					type: 'select',
					options: [
						{ label: 'Development', value: 'development' },
						{ label: 'Production', value: 'production' },
						{ label: 'Dev (Legacy)', value: 'dev' },
						{ label: 'Prod (Legacy)', value: 'prod' }
					],
					hint: 'Set to production for live sites.'
				}
			]
		},
		{
			id: 'integration',
			title: 'Site Integration',
			desc: 'Connect SvelteFrame to an existing website or prepare a standalone instance.',
			fields: [
				{
					key: 'targetPath',
					label: 'Target Directory Path',
					type: 'text',
					hint: 'Absolute path to the root of the site to integrate into.'
				}
			]
		}
	];

	let targetPath = '';
	let mergeResults: any[] = [];
	let otherRoutes: string[] = [];
	let showPreview = false;
	let cleanInstall = false;

	async function runIntegrationPreview() {
		isLoading = true;
		const formData = new FormData();
		formData.append('action', 'integrate');
		formData.append('targetPath', targetPath);

		try {
			const res = await fetch('/svelteframe/setup/confirm', { method: 'POST', body: formData });
			const result = await res.json();
			if (res.ok) {
				mergeResults = result.results;
				otherRoutes = result.otherRoutes || [];
				showPreview = true;
				status = 'Merge preview generated.';
			} else {
				status = result.message || 'Failed to generate preview.';
			}
		} catch (e) {
			status = 'Error connecting to server.';
		} finally {
			isLoading = false;
		}
	}

	async function applyIntegration() {
		if (
			cleanInstall &&
			!confirm(
				'WARNING: This will erase ALL other files and routes in the target directory (except .git). Are you absolutely sure?'
			)
		) {
			return;
		}

		isLoading = true;
		const formData = new FormData();
		formData.append('action', 'apply-integration');
		formData.append('targetPath', targetPath);
		formData.append('approvedFiles', JSON.stringify(mergeResults));
		formData.append('cleanInstall', cleanInstall.toString());

		try {
			const res = await fetch('/svelteframe/setup/confirm', { method: 'POST', body: formData });
			const result = await res.json();
			if (res.ok) {
				status = 'Integration applied successfully!';
				nextStep();
			} else {
				status = result.message || 'Failed to apply integration.';
			}
		} catch (e) {
			status = 'Error connecting to server.';
		} finally {
			isLoading = false;
		}
	}

	function getPassTip(val: string) {
		if (!val) return '';
		return `Ends with: ...${val.slice(-4)}`;
	}

	let showDirectoryPicker = false;
	function handleDirectorySelect(event: CustomEvent<string>) {
		targetPath = event.detail;
		showDirectoryPicker = false;
	}

	let showTurnstileWalkthrough = false;
	function handleAction(action: any) {
		if (action.id === 'turnstile-walkthrough') {
			showTurnstileWalkthrough = true;
		} else if (action.url) {
			window.open(action.url, '_blank');
		}
	}

	// Calculate absolute parent path for picker initialization
	$: parentPath = data.projectRoot
		? data.projectRoot.split(/[\\/]/).slice(0, -2).join('/') || '/'
		: '/';
</script>

<HeroStatic slides={heroSlidesData} />

<div class="setup-container">
	<div class="glass-pane">
		{#if step === 1}
			<div class="step auth-step">
				<div class="step-header">
					<span class="step-indicator">Step 1 of {sections.length + 1}</span>
					<h2>Admin Verification</h2>
				</div>
				<p class="intro">
					To begin setup, please upload the <strong>0-SvelteFrame-Admin.confirm</strong> file found in
					your project root. This ensures only a server administrator can modify settings.
				</p>

				<div class="upload-area">
					<input
						type="file"
						id="confirm-file"
						accept=".confirm"
						on:change={(e) => {
							const target = e.target as HTMLInputElement;
							if (target?.files) confirmationFile = target.files[0];
						}}
					/>
					<label for="confirm-file">
						<span class="icon">{confirmationFile ? '📄' : '📤'}</span>
						<span class="text"
							>{confirmationFile ? confirmationFile.name : 'Choose confirmation file...'}</span
						>
					</label>
				</div>

				<button class="primary" on:click={handleAuth} disabled={isLoading || !confirmationFile}>
					{isLoading ? 'Verifying...' : 'Verify Admin Authority'}
				</button>
			</div>
		{:else if step <= sections.length + 1}
			{@const current = sections[step - 2]}
			<div class="step config-step">
				<div class="step-header">
					<span class="step-indicator">Step {step} of {sections.length + 1}</span>
					<h2>{current.title}</h2>
					<p>{current.desc}</p>
				</div>

				{#if current.id === 'integration'}
					<div class="field-group">
						<label for="targetPath">Target Directory Path</label>
						<div class="input-wrapper row">
							<input
								type="text"
								id="targetPath"
								bind:value={targetPath}
								placeholder="/path/to/existing/site"
							/>
							<button class="secondary" on:click={() => (showDirectoryPicker = true)}>
								Browse...
							</button>
							<button
								class="secondary"
								on:click={runIntegrationPreview}
								disabled={isLoading || !targetPath}
							>
								Preview Integration
							</button>
						</div>
						<span class="hint"
							>Absolute path to the root of the site to integrate into. Leave blank to stay
							standalone.</span
						>
					</div>

					{#if showPreview}
						<div class="merge-results">
							{#if otherRoutes.length > 0}
								<div class="other-routes-warning">
									<h4>⚠️ Existing Routes Detected</h4>
									<p>The target directory already contains the following routes:</p>
									<ul class="route-list">
										{#each otherRoutes as r}
											<li><code>/src/routes/{r}</code></li>
										{/each}
									</ul>
									<p class="warning-text">
										These will be kept and merged unless you choose a <strong>Clean Install</strong
										>.
									</p>

									<label class="clean-install-toggle">
										<input type="checkbox" bind:checked={cleanInstall} />
										<span>Erase existing site (Clean Install) - <em>Protects .git</em></span>
									</label>
								</div>
							{/if}

							<h3>File Merge Preview</h3>
							<div class="results-list">
								{#each mergeResults as res}
									<div class="res-item" class:conflict={res.status === 'conflict'}>
										<span class="file-icon"
											>{res.status === 'new' ? '🆕' : res.status === 'merged' ? '✅' : '⚠️'}</span
										>
										<span class="file-name">{res.file}</span>
										<span class="file-status">{res.status}</span>
									</div>
								{/each}
							</div>
							<p class="warning">
								Some files (like hooks.server.ts) will be automatically merged. Conflicts must be
								resolved manually after setup.
							</p>
						</div>
					{/if}
				{:else}
					<div class="form-grid">
						{#each current.fields as field}
							<div class="field-group">
								<div class="label-row">
									<label for={field.key} title={field.key}>{field.label}</label>
									{#if field.action}
										<button class="text-link" on:click={() => handleAction(field.action)}>
											{field.action.label}
										</button>
									{/if}
								</div>
								<div class="input-wrapper">
									{#if field.type === 'select'}
										<select id={field.key} bind:value={config[field.key]} title={field.key}>
											{#each field.options || [] as opt}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
									{:else if field.type === 'password'}
										<input
											type="password"
											id={field.key}
											bind:value={config[field.key]}
											placeholder="••••••••"
											autocomplete="new-password"
											title={getPassTip(config[field.key])}
										/>
									{:else if field.type === 'number'}
										<input
											type="text"
											id={field.key}
											bind:value={config[field.key]}
											title={config[field.key]}
										/>
									{:else if field.type === 'url'}
										<input
											type="url"
											id={field.key}
											bind:value={config[field.key]}
											placeholder="https://..."
											title={config[field.key]}
										/>
									{:else}
										<input
											type="text"
											id={field.key}
											bind:value={config[field.key]}
											title={config[field.key]}
										/>
									{/if}
								</div>
								{#if field.hint}
									<span class="hint">{field.hint}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<div class="wizard-nav">
					<button
						class="secondary"
						on:click={prevStep}
						disabled={step === 2 && !data.isAuthenticated}>Back</button
					>
					{#if step < sections.length + 1}
						<button class="primary" on:click={nextStep}>Continue</button>
					{:else if current.id === 'integration'}
						<button
							class="cta"
							on:click={applyIntegration}
							disabled={Boolean(isLoading || (targetPath && !showPreview))}
						>
							{isLoading ? 'Applying...' : 'Apply & Continue'}
						</button>
					{:else}
						<button class="cta" on:click={handleSave} disabled={isLoading}>
							{isLoading ? 'Saving...' : 'Finalize Configuration'}
						</button>
					{/if}
				</div>
			</div>
		{:else if step === sections.length + 2}
			<div class="step success-step">
				<h2>Installation Complete!</h2>
				<p class="intro">
					SvelteFrame has been successfully configured and integrated. You can now access your
					portal and start building.
				</p>

				<div class="next-steps">
					<a href="/svelteframe/portal" class="card">
						<span class="icon">🚀</span>
						<div class="card-text">
							<h3>Go to Portal</h3>
							<p>Access the management interface.</p>
						</div>
					</a>
				</div>
			</div>
		{/if}

		{#if status}
			<div class="status-toast" class:error={status.includes('failed') || status.includes('Error')}>
				{status}
			</div>
		{/if}

		{#if showDirectoryPicker}
			<div class="modal-overlay" on:click={() => (showDirectoryPicker = false)}>
				<div class="modal-content" on:click|stopPropagation>
					<div class="modal-header">
						<h3>Select Target Directory</h3>
						<button class="close-btn" on:click={() => (showDirectoryPicker = false)}>×</button>
					</div>
					<div class="picker-wrapper">
						<FilePicker
							absolutePath={parentPath}
							allowFolderSelection={true}
							showFiles={false}
							confirmButtonLabel="Select Target"
							on:select={handleDirectorySelect}
							on:reauth={() => (step = 1)}
						/>
					</div>
				</div>
			</div>
		{/if}

		{#if showTurnstileWalkthrough}
			<FloatingToolWindow
				title="Cloudflare Turnstile Setup"
				visible={true}
				width={500}
				height={600}
				on:close={() => (showTurnstileWalkthrough = false)}
			>
				<div class="walkthrough-content">
					<p>
						Setting up Cloudflare Turnstile is a simple process that provides bot protection for
						your forms without forcing users to solve frustrating puzzles.
					</p>

					<h3>1. Create a Free Account</h3>
					<ul>
						<li>
							<strong>Sign Up:</strong> Visit the
							<a href="https://dash.cloudflare.com/sign-up" target="_blank"
								>Cloudflare Sign Up page</a
							> and enter your email.
						</li>
						<li><strong>Verify Email:</strong> Check your inbox for a verification link.</li>
						<li><strong>Select Plan:</strong> Choose the Free plan during onboarding.</li>
					</ul>

					<h3>2. Configure Your Turnstile Widget</h3>
					<ul>
						<li>Look for <strong>Turnstile</strong> in the left-hand sidebar menu.</li>
						<li>Click <strong>Add Widget</strong> or <strong>Create Site</strong>.</li>
						<li><strong>Name & Domain:</strong> Enter a name and your website's URL (Hostname).</li>
						<li>
							<strong>Choose Widget Mode:</strong>
							<ul>
								<li><em>Managed (Recommended):</em> Cloudflare handles interaction.</li>
								<li><em>Non-interactive:</em> Subtle loading bar only.</li>
								<li><em>Invisible:</em> Runs entirely in background.</li>
							</ul>
						</li>
						<li>Click <strong>Create</strong> to generate your keys.</li>
					</ul>

					<h3>3. Retrieve and Use Your API Keys</h3>
					<p>Copy and paste <strong>these keys</strong> into the setup form:</p>
					<ul>
						<li><strong>Site Key:</strong> Public key for frontend.</li>
						<li><strong>Secret Key:</strong> Private key for server validation.</li>
					</ul>

					<h3>4. Integration</h3>
					<p>
						SvelteFrame is already configured, but to use the feature in custom pages, you must
						embed the client-side JavaScript on your form and implement server-side validation to
						verify the tokens generated by the widget.
					</p>
					<p>Example references in codebase:</p>
					<ul>
						<li>Frontend: <code>src/routes/svelteframe/auth/register/+page.svelte</code></li>
						<li>
							Backend: <code>src/routes/svelteframe/auth/register/initiate/+server.ts</code>
						</li>
					</ul>
					<p>
						Test your setup by visiting your form in an incognito window to ensure the widget
						appears and allows submissions correctly.
					</p>
				</div>
			</FloatingToolWindow>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		background: #0f172a;
		margin: 0;
		color: #f8fafc;
	}

	.setup-container {
		display: flex;
		justify-content: center;
		padding: 4rem 1rem;
		min-height: 100vh;
	}

	.glass-pane {
		background: rgba(30, 41, 59, 0.7);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1.5rem;
		width: 100%;
		max-width: 800px;
		padding: 3rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		position: relative;
	}

	h2 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(to right, #60a5fa, #a78bfa);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	p.intro {
		color: #94a3b8;
		line-height: 1.6;
		margin-bottom: 2rem;
	}

	/* Auth Step */
	.upload-area {
		margin-bottom: 2rem;
	}

	.upload-area input {
		display: none;
	}

	.upload-area label {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		border: 2px dashed rgba(255, 255, 255, 0.2);
		border-radius: 1rem;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.upload-area label:hover {
		border-color: #60a5fa;
		background: rgba(96, 165, 250, 0.05);
	}

	.upload-area .icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	/* Form Styling */
	.step-header {
		margin-bottom: 2.5rem;
	}
	.step-indicator {
		display: block;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		color: #60a5fa;
		margin-bottom: 0.5rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	@media (min-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.field-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #cbd5e1;
		cursor: help;
	}
	.text-link {
		background: none;
		border: none;
		color: #60a5fa;
		font-size: 0.75rem;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		font-weight: normal;
		width: auto;
	}
	.text-link:hover {
		color: #93c5fd;
	}

	input {
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		color: white;
		width: 100%;
		box-sizing: border-box;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #60a5fa;
		box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
	}

	.hint {
		font-size: 0.75rem;
		color: #cbd5e1;
		font-style: italic;
		background: rgba(0, 0, 0, 0.2);
		padding: 2px 6px;
		border-radius: 4px;
		display: inline-block;
	}

	/* Navigation */
	.wizard-nav {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	button {
		padding: 0.75rem 2rem;
		border-radius: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	button.primary {
		background: #2563eb;
		color: white;
		width: 100%;
	}

	button.primary:hover:not(:disabled) {
		background: #1d4ed8;
		transform: translateY(-1px);
	}

	button.secondary {
		background: transparent;
		color: #94a3b8;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	button.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		color: white;
	}

	button.cta {
		background: linear-gradient(135deg, #2563eb, #7c3aed);
		color: white;
		box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.status-toast {
		position: absolute;
		bottom: -4rem;
		left: 0;
		right: 0;
		padding: 1rem;
		background: #059669;
		color: white;
		border-radius: 0.75rem;
		text-align: center;
		animation: slideUp 0.3s ease;
	}

	.status-toast.error {
		background: #dc2626;
	}

	/* Integration Preview */
	.input-wrapper.row {
		display: flex;
		gap: 1rem;
	}
	.merge-results {
		margin-top: 2rem;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.4);
		border-radius: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}
	.merge-results h3 {
		font-size: 1rem;
		margin-top: 0;
		color: #94a3b8;
	}
	.results-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	.res-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}
	.res-item.conflict {
		border-left: 3px solid #ef4444;
	}
	.file-status {
		margin-left: auto;
		text-transform: uppercase;
		font-size: 0.7rem;
		font-weight: 700;
		color: #64748b;
	}
	.warning {
		font-size: 0.75rem;
		color: #f59e0b;
		margin: 0;
	}

	.other-routes-warning {
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		padding: 1.25rem;
		border-radius: 0.75rem;
		margin-bottom: 2rem;
	}
	.other-routes-warning h4 {
		margin: 0 0 0.5rem 0;
		color: #f59e0b;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.route-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
		padding: 0;
		list-style: none;
	}
	.route-list code {
		background: rgba(0, 0, 0, 0.2);
		padding: 0.2rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.8rem;
		color: #e2e8f0;
	}
	.warning-text {
		font-size: 0.85rem;
		color: #94a3b8;
	}
	.clean-install-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1.25rem;
		padding: 0.75rem;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.5rem;
		cursor: pointer;
		color: #f87171;
		font-weight: 600;
		transition: all 0.2s;
	}
	.clean-install-toggle:hover {
		background: rgba(239, 68, 68, 0.25);
	}
	.clean-install-toggle input {
		width: 1.25rem;
		height: 1.25rem;
	}

	/* Success Step */
	.next-steps {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		margin-top: 2rem;
	}
	.card {
		display: flex;
		gap: 1.25rem;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	.card:hover {
		background: rgba(255, 255, 255, 0.06);
		transform: translateY(-2px);
		border-color: #60a5fa;
	}
	.card .icon {
		font-size: 2rem;
	}
	.card h3 {
		margin: 0 0 0.25rem 0;
		font-size: 1.125rem;
	}
	.card p {
		margin: 0;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	/* Modal Styling */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.modal-content {
		background: #1e293b;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1rem;
		width: 90%;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}
	.modal-header {
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.modal-header h3 {
		margin: 0;
		color: #60a5fa;
	}
	.close-btn {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 1.5rem;
		cursor: pointer;
	}
	.picker-wrapper {
		flex: 1;
		min-height: 400px;
		overflow: hidden;
	}

	.walkthrough-content {
		padding: 1.5rem;
		color: #94a3b8;
		overflow-y: auto;
		height: 100%;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.walkthrough-content h3 {
		color: #60a5fa;
		margin: 1.5rem 0 0.5rem 0;
		font-size: 1.1rem;
	}
	.walkthrough-content ul {
		margin: 0.5rem 0;
		padding-left: 1.2rem;
	}
	.walkthrough-content li {
		margin-bottom: 0.4rem;
	}
	.walkthrough-content a {
		color: #60a5fa;
		text-decoration: underline;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
