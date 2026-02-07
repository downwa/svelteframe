// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{html,js,svelte,ts}' // Ensure this scans your Svelte files
	],
	theme: {
		extend: {
			// Example: If you wanted to ensure your 3-column layout starts at 992px
			// and 2-column at 768px, you could define custom screens
			// or just use Tailwind's defaults (md: 768px, lg: 1024px).
			// For your specific request:
			// md: 768px (for 1 to 2 columns)
			// lg: 992px (for 2 to 3 columns) - you'd need a custom 'lg' or new name
			//
			// screens: {
			//   'md': '768px', // Default
			//   'lg': '992px', // Custom for your 3-column requirement
			//   'xl': '1280px', // Default
			// }
			// If you do this, your grid classes would be:
			// grid-cols-1 lg:grid-cols-3 md:grid-cols-2
			// (Order matters for overrides: smallest to largest, or be explicit)
			// For simplicity with standard Tailwind, we used md:grid-cols-2 and lg:grid-cols-3 (1024px)
		}
	},
	plugins: []
};
