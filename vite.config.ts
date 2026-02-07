import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	define: {
		__BUILD_INFO__: JSON.stringify({
			version: 'f3ebec3',
			date: '2026-01-13',
			time: '14:35:17'
		})
	},

	server: {
		fs: {
			allow: [
				// Always allow your project root and the site subdir
				resolve(__dirname, './site'),
				resolve(__dirname, './node_modules'),
				__dirname // The monorepo/root if needed
			]
		},
		allowedHosts: [
			'yolonda-authorised-mateo.ngrok-free.dev'
		]
	},
	ssr: {
		// This configuration is correct for the production build.
		noExternal: [
			'node-html-parser',
			'authorizenet',
			'@getbrevo/brevo',
			'@simplewebauthn/server',
			'@webauthn/server',
			'nodemailer',
			'sharp',
			'svelte-email',
			'node-html-parser',
			'cheerio'
			//			'tslib'
		]
	}
});
