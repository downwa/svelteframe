import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			'$routes': 'src/routes'
		},
		// Updated CSRF configuration to address the deprecation warning.
		// SvelteKit automatically trusts your own app's origin,
		// so an empty array here is often sufficient unless you have
		// specific subdomains you need to allow POSTs from.
		csrf: {
			trustedOrigins: [] 
		}
	}
};

export default config;
