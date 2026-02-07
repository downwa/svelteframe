<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	export let style: string = '';

	const dispatch = createEventDispatcher();

	interface CSSDeclaration {
		property: string;
		value: string;
	}
	interface CSSRule {
		selector: string;
		declarations: CSSDeclaration[];
	}

	let cssRules: CSSRule[] = [];
	let isInitialized = false;

	// --- Helper Helpers ---
	function isColor(value: string): boolean {
		if (!value) return false;
		const v = value.toLowerCase();
		return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
	}
	function getNumberAndUnit(value: string) {
		const match = value.match(/^(-?\d+\.?\d*)(px|rem|em|%|vh|vw)?$/);
		return match ? { num: parseFloat(match[1]), unit: match[2] || '' } : null;
	}
	function ensureFullHex(c: string) {
		return c.length === 4 && c.startsWith('#') ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
	}

	function parseCSS(css: string): CSSRule[] {
		const rules: CSSRule[] = [];
		const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
		const ruleRegex = /([^{]+)\{([^}]+)\}/g;
		let match;
		while ((match = ruleRegex.exec(cleanCss)) !== null) {
			const selector = match[1].trim();
			const content = match[2].trim();
			const declarations = content
				.split(';')
				.map((decl) => decl.trim())
				.filter((decl) => decl.includes(':'))
				.map((decl) => {
					const parts = decl.split(':');
					return { property: parts[0].trim(), value: parts.slice(1).join(':').trim() };
				});
			rules.push({ selector, declarations });
		}
		return rules;
	}

	function stringifyCSS(rules: CSSRule[]): string {
		return rules
			.map((rule) => {
				const decls = rule.declarations.map((d) => `  ${d.property}: ${d.value};`).join('\n');
				return `${rule.selector} {\n${decls}\n}`;
			})
			.join('\n\n');
	}

	function updateStyleFromRules() {
		style = stringifyCSS(cssRules);
		dispatch('change', { style });
	}

	function handleCSSValueChange(decl: CSSDeclaration, newValue: string) {
		decl.value = newValue;
		cssRules = [...cssRules];
		updateStyleFromRules();
	}

	function addCSSRule() {
		cssRules = [
			...cssRules,
			{ selector: '.new-rule', declarations: [{ property: 'color', value: '#000000' }] }
		];
		updateStyleFromRules();
	}

	// Initialize
	$: if (style !== undefined && !isInitialized) {
		// Only parse initially or via some reset?
		// Simple approach: if style string changes meaningfully from outside, re-parse?
		// For now, let's just parse once on mount or if rules is empty.
		if (cssRules.length === 0 && style) {
			cssRules = parseCSS(style);
			isInitialized = true;
		} else if (!style && cssRules.length === 0) {
			// Empty style is fine
			isInitialized = true;
		}
	}

	// Force re-parse if style changes externally significantly?
	// This is tricky without a loop. We'll trust the parent to not overwrite style constantly unless it's a new file.
	let lastStyle = '';
	$: if (style !== lastStyle && style !== stringifyCSS(cssRules)) {
		// External change detected
		cssRules = parseCSS(style);
		lastStyle = style;
	} else {
		lastStyle = style;
	}
</script>

<div class="css-editor-container">
	<div class="css-header">
		<span class="css-label">Structured CSS Editor</span>
		<button class="small-btn" on:click={addCSSRule}>+ Add Rule</button>
	</div>
	<div class="css-rules-list">
		{#each cssRules as rule, ruleIdx}
			<div class="css-rule-block">
				<div class="css-rule-header">
					<input
						class="css-selector-input"
						type="text"
						bind:value={rule.selector}
						on:input={updateStyleFromRules}
					/>
				</div>
				<table class="css-decls-table">
					{#each rule.declarations as decl}
						<tr>
							<td
								><input
									class="css-prop-input"
									type="text"
									bind:value={decl.property}
									on:input={updateStyleFromRules}
								/></td
							>
							<td>
								<div class="css-value-wrapper">
									{#if isColor(decl.value)}
										<input
											type="color"
											class="css-color-picker"
											value={ensureFullHex(decl.value)}
											on:input={(e) => handleCSSValueChange(decl, e.currentTarget.value)}
										/>
									{/if}
									<input
										class="css-val-input"
										type="text"
										bind:value={decl.value}
										on:input={updateStyleFromRules}
									/>
								</div>
							</td>
						</tr>
					{/each}
				</table>
			</div>
		{/each}
	</div>
</div>

<style>
	.css-editor-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
	}
	.css-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--sp-border-main, #444);
	}
	.css-label {
		font-weight: bold;
		color: var(--sp-text-main, #eee);
	}
	.small-btn {
		font-size: 0.8rem;
		padding: 2px 6px;
		cursor: pointer;
		background: var(--sp-color-secondary, #444);
		color: white;
		border: none;
		border-radius: 4px;
	}
	.css-rule-block {
		background: var(--sp-bg-header, #333);
		border: 1px solid var(--sp-border-main, #444);
		margin-bottom: 10px;
		border-radius: 4px;
	}
	.css-rule-header {
		padding: 4px 8px;
		background: var(--sp-bg-active, #2a2d2e);
	}
	.css-selector-input {
		background: none;
		border: none;
		color: var(--sp-text-selector, #d7ba7d);
		font-weight: bold;
		width: 100%;
	}
	.css-decls-table {
		width: 100%;
		padding: 4px;
	}
	.css-prop-input,
	.css-val-input {
		background: var(--sp-bg-input, #222);
		border: 1px solid var(--sp-border-main, #444);
		color: var(--sp-text-main, #ce9178);
		width: 100%;
		font-size: 0.8rem;
	}
	.css-color-picker {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--sp-border-main, #555);
		cursor: pointer;
	}
	.css-value-wrapper {
		display: flex;
		gap: 4px;
	}
</style>
