<!-- src/lib/components/HeroStatic.svelte -->
<script lang="ts">
	// --- Script section remains unchanged ---
	import { onMount, onDestroy } from 'svelte';
	import type { HeroSlide, ImageSource } from '../_pubcomponents/Hero.types';

	// --- Props ---
	export let slides: HeroSlide[] = [];
	export let staticHeadingText: string = '';

	//import placeholderImage from '../lib/assets/images/placeholder-image.svg';
	// Create a constant containing the SVG markup as a string
	const placeholderSvg = `<svg width="1000" height="1000" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1000" height="1000" fill="#DBDBDB"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M600 440C600 428.954 591.046 420 580 420H420C408.954 420 400 428.954 400 440V560C400 571.046 408.954 580 420 580H580C591.046 580 600 571.046 600 560V440ZM475 450C483.284 450 490 456.716 490 465C490 473.284 483.284 480 475 480C466.716 480 460 473.284 460 465C460 456.716 466.716 450 475 450ZM565 550C567.761 550 570 547.762 570 545V541.6C569.993 540.519 569.643 539.469 569 538.6L526.5 481.9C525.533 480.677 524.059 479.964 522.5 479.964C520.941 479.964 519.467 480.677 518.5 481.9L489.7 519.1C488.746 520.347 487.27 521.085 485.7 521.1C484.227 521.102 482.832 520.441 481.9 519.3L467.4 501.8C466.437 500.644 465.005 499.983 463.5 500C462.127 500.144 460.868 500.827 460 501.9L431.1 538.6C430.387 539.437 429.996 540.501 430 541.6V545C430 547.762 432.239 550 435 550H565Z" fill="black" fill-opacity="0.15"/>
</svg>`;

	// The constant below now creates a Data URI that CSS can use
	const PLACEHOLDER_IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent(placeholderSvg)}`;

	// --- Constants ---
	//const PLACEHOLDER_IMAGE_SRC = placeholderImage;
	const PLACEHOLDER_DELAY_MS = 1000; // Delay before showing placeholder

	// --- State ---
	let currentSlide: HeroSlide | null = null;
	let windowWidth: number = 0;
	// Initialize with empty string - shows background-color initially
	let displayedBgImage: string = '';
	let imageLoader: HTMLImageElement | null = null;
	let loadingSrc: string | null = null;
	let placeholderTimerId: ReturnType<typeof setTimeout> | null = null;

	// --- Helper ---
	function clearPlaceholderTimer() {
		if (placeholderTimerId) {
			clearTimeout(placeholderTimerId);
			placeholderTimerId = null;
		}
	}

	// --- Reactive Updates ---
	$: {
		if (slides && slides.length > 0) {
			const newSlide = slides[0];
			// Check if the core slide data actually changed
			if (
				newSlide?.headingPhrase !== currentSlide?.headingPhrase ||
				newSlide?.bgImageSrc !== currentSlide?.bgImageSrc
			) {
				const previousImage = displayedBgImage !== PLACEHOLDER_IMAGE_SRC ? displayedBgImage : '';
				currentSlide = newSlide;
				clearPlaceholderTimer();
				// Trigger update if width is known, passing previous image
				if (windowWidth > 0 && currentSlide) {
					updateDisplayedImage(currentSlide, windowWidth, previousImage);
				}
			} else if (
				newSlide &&
				currentSlide &&
				JSON.stringify(newSlide.bgImageSet) !== JSON.stringify(currentSlide.bgImageSet)
			) {
				// Handle cases where only bgImageSet might change (less common)
				const previousImage = displayedBgImage !== PLACEHOLDER_IMAGE_SRC ? displayedBgImage : '';
				currentSlide = newSlide; // Update slide reference
				clearPlaceholderTimer();
				if (windowWidth > 0 && currentSlide) {
					updateDisplayedImage(currentSlide, windowWidth, previousImage);
				}
			}

			if (slides.length > 1) {
				console.warn(
					'HeroStatic component received more than one slide. It will only display the first one.'
				);
			}
		} else {
			// Handle slide removal
			if (currentSlide !== null) {
				currentSlide = null;
				clearPlaceholderTimer();
				// Reset to empty when no slide, showing background color
				displayedBgImage = '';
				loadingSrc = null;
				if (imageLoader) {
					imageLoader.onload = null;
					imageLoader.onerror = null;
					imageLoader = null;
				}
			}
			// Only warn if slides array was previously non-empty or is explicitly empty/invalid
			if (!slides || slides.length === 0) {
				console.warn(
					"HeroStatic component received an empty or invalid 'slides' array. Expected one slide."
				);
			}
		}
	}

	// Update the displayed background image on width change
	$: if (currentSlide && windowWidth > 0) {
		// Pass the current image (which might be the previous actual image or placeholder)
		updateDisplayedImage(currentSlide, windowWidth, displayedBgImage);
	}

	// --- Logic ---
	function selectBestImageSource(slide: HeroSlide, width: number): string {
		if (slide.bgImageSet && slide.bgImageSet.length > 0) {
			// Ensure sorted descending by minWidth in data source!
			const bestFit = slide.bgImageSet.find((source) => width >= source.minWidth);
			if (bestFit) {
				return bestFit.src;
			}
		}
		// Fallback to bgImageSrc if available, otherwise empty string
		return slide.bgImageSrc ?? '';
	}

	/**
	 * Updates the background image, keeping the previous image visible
	 * until the new one loads or the placeholder delay expires.
	 * @param slide The current slide data.
	 * @param width The current window width.
	 * @param currentDisplayedSrc The URL currently set in displayedBgImage.
	 */
	function updateDisplayedImage(slide: HeroSlide, width: number, currentDisplayedSrc: string) {
		const targetSrc = selectBestImageSource(slide, width);

		// If target is empty or invalid, reset to empty background
		if (!targetSrc) {
			clearPlaceholderTimer();
			loadingSrc = null;
			displayedBgImage = '';
			if (imageLoader) {
				imageLoader.onload = null;
				imageLoader.onerror = null;
				imageLoader = null;
			}
			return;
		}

		// If target is already displayed, or currently loading, do nothing
		if (targetSrc === currentDisplayedSrc || targetSrc === loadingSrc) {
			return;
		}

		// Clean up previous loader/timer
		clearPlaceholderTimer();
		if (imageLoader) {
			imageLoader.onload = null;
			imageLoader.onerror = null;
			imageLoader = null;
		}

		// Set loading state
		loadingSrc = targetSrc;

		// --- Delayed Placeholder Logic ---
		// Keep the current image visible (if it's not the placeholder)
		// displayedBgImage = currentDisplayedSrc !== PLACEHOLDER_IMAGE_SRC ? currentDisplayedSrc : '';
		// ^ This line is implicitly handled because we only update displayedBgImage on load/error/timer

		// Start timer to potentially show placeholder
		placeholderTimerId = setTimeout(() => {
			if (loadingSrc === targetSrc) {
				// Only show placeholder if the current displayed image isn't the target yet
				if (displayedBgImage !== targetSrc) {
					displayedBgImage = PLACEHOLDER_IMAGE_SRC;
				}
			}
			placeholderTimerId = null; // Timer has fired
		}, PLACEHOLDER_DELAY_MS);
		// --------------------------------

		imageLoader = new Image();

		imageLoader.onload = () => {
			clearPlaceholderTimer(); // Image loaded, no need for placeholder timer
			if (loadingSrc === targetSrc) {
				displayedBgImage = targetSrc; // Show the loaded image
				loadingSrc = null;
				imageLoader = null;
			} else {
				// A different load has started, clean up this loader if necessary
				if (imageLoader?.src === targetSrc) {
					imageLoader = null;
				}
			}
		};

		imageLoader.onerror = () => {
			clearPlaceholderTimer(); // Error occurred, no need for placeholder timer
			if (loadingSrc === targetSrc) {
				console.error(`[HeroStatic] Failed to load image: ${targetSrc}. Showing placeholder.`);
				// Show placeholder on error, even if previous image was showing
				displayedBgImage = PLACEHOLDER_IMAGE_SRC;
				loadingSrc = null;
				imageLoader = null;
			} else {
				// A different load has started, clean up this loader if necessary
				if (imageLoader?.src === targetSrc) {
					imageLoader = null;
				}
			}
		};

		imageLoader.src = targetSrc;
	}

	// --- Lifecycle ---
	let resizeObserver: ResizeObserver | null = null;
	let handleResizeFn: (() => void) | null = null; // Store listener function for removal

	onMount(() => {
		if (typeof window !== 'undefined') {
			windowWidth = window.innerWidth;

			if (typeof ResizeObserver !== 'undefined') {
				resizeObserver = new ResizeObserver((entries) => {
					if (entries && entries.length > 0) {
						const newWidth = entries[0].contentRect?.width ?? window.innerWidth;
						if (newWidth !== windowWidth) {
							windowWidth = newWidth; // Triggers reactive update $:
						}
					} else {
						const newWidth = window.innerWidth;
						if (newWidth !== windowWidth) {
							windowWidth = newWidth; // Triggers reactive update $:
						}
					}
				});
				resizeObserver.observe(document.body);
			} else {
				// Fallback listener
				handleResizeFn = () => {
					const newWidth = window.innerWidth;
					if (newWidth !== windowWidth) {
						windowWidth = newWidth; // Triggers reactive update $:
					}
				};
				window.addEventListener('resize', handleResizeFn);
			}
			// Initial image load trigger if slide is already present
			if (currentSlide) {
				// Initial load, no previous image to pass explicitly
				updateDisplayedImage(currentSlide, windowWidth, '');
			}
		}
	});

	onDestroy(() => {
		clearPlaceholderTimer(); // Clear timer on destroy
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
		// Remove listener if it was used
		if (handleResizeFn) {
			window.removeEventListener('resize', handleResizeFn);
		}

		// Cleanup image loader
		if (imageLoader) {
			imageLoader.onload = null;
			imageLoader.onerror = null;
		}
		loadingSrc = null;
	});
</script>

<div data-sp-component="HeroStatic">
	{#if currentSlide}
		<section class="hero-static-container" aria-labelledby="hero-static-heading">
			<div
				class="background-image-container"
				style="background-image: {displayedBgImage ? `url('${displayedBgImage}')` : 'none'};"
				role="img"
				aria-label={currentSlide.bgImageAlt}
			>
				<div class="background-overlay"></div>
			</div>

			<div class="hero-content-positioner">
				<div class="hero-content">
					<h1 class="hero-heading" id="hero-static-heading">
						{#if staticHeadingText}
							<span class="static-part">{staticHeadingText}</span>
						{/if}
						<span class="dynamic-part">{currentSlide.headingPhrase}</span>
					</h1>
					{#if currentSlide.subText}
						<p class="hero-subtext">{currentSlide.subText}</p>
					{/if}
				</div>
			</div>
		</section>
	{:else}
		<!-- Fallback when no slide data -->
		<section class="hero-static-container hero-static-empty">
			<div
				class="background-image-container"
				style="background-image: none;"
				role="img"
				aria-label="Loading background"
			>
				<div class="background-overlay"></div>
			</div>
			<div class="hero-content-positioner" style="z-index: 2;">
				<p>Loading hero content...</p>
			</div>
		</section>
	{/if}
</div>

<style>
	/* ... other styles ... */
	.hero-static-container {
		position: relative;
		min-height: 20vh; /* Adjust as needed */
		padding-top: 70px; /* Match header height */
		box-sizing: border-box;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #ffffff;
		/* Ensure background color is set for initial state */
		background-color: #182338;
	}

	.hero-static-empty {
		min-height: 250px;
		text-align: center;
	}

	.background-image-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		background-size: cover;
		background-position: center center;
		/* Ensure background color shows if image is 'none' */
		background-color: transparent; /* Or inherit from parent */
		transition: background-image 0.3s ease-in-out;
	}

	.background-overlay {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.35); /* Adjust darkness */
		z-index: 1;
		pointer-events: none;
	}

	.hero-content-positioner {
		position: relative;
		z-index: 2;
		width: 100%;
		max-width: 1280px; /* container-large */
		padding: 4rem 2rem; /* page-padding */
		box-sizing: border-box;
		text-align: left;
	}

	.hero-content {
		max-width: 900px; /* max-width-large */
		width: 100%;
		text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6);
	}

	.hero-heading {
		/* --- UPDATED FONT STYLES --- */
		font-family: Copperplate, sans-serif; /* Use Copperplate font */
		font-size: clamp(2rem, 6vw, 3.2rem); /* Keep responsive size */
		font-weight: 400; /* Set requested weight */
		/* --- END UPDATED --- */
		line-height: 1.2;
		margin: 0 0 0.5em 0;
		color: #ffffff;
	}

	.static-part {
		margin-right: 0.4em;
		/* Adjusted static part weight to match heading base weight */
		font-weight: 400;
		opacity: 0.9;
	}

	.dynamic-part {
		display: inline;
		/* Optional: If dynamic part needs different weight */
		/* font-weight: 700; */
	}

	.hero-subtext {
		/* --- UPDATED FONT STYLES --- */
		/* Use "Metrisch Medium" font (ensure quotes for space) */
		font-family: 'Metrisch Medium', sans-serif;
		font-size: clamp(1rem, 2.5vw, 1.1rem); /* Keep responsive size */
		font-weight: 500; /* Set requested weight */
		/* --- END UPDATED --- */
		line-height: 1.3rem;
		margin: 0;
		color: #f0f0f0;
		max-width: 700px;
	}

	@media (max-width: 767px) {
		.hero-static-container {
			min-height: 35vh;
			padding-top: 60px; /* Mobile header height */
		}
		.hero-content-positioner {
			padding: 3rem 1rem;
			text-align: center;
		}
		.hero-heading {
			/* Adjust clamp values if needed for new font/weight on mobile */
			font-size: clamp(1.8rem, 7vw, 2.5rem);
		}
		.hero-subtext {
			/* Adjust clamp values if needed for new font/weight on mobile */
			font-size: clamp(0.9rem, 3vw, 1.1rem);
			margin: 0 auto;
		}
	}
</style>
