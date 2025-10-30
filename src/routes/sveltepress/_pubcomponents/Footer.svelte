<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

	// State to control the visibility of the accessibility modal
	let showAccessibilityModal = false;

	/**
	 * Opens the accessibility modal.
	 */
	function openAccessibilityModal() {
		showAccessibilityModal = true;
	}

	/**
	 * Closes the accessibility modal.
	 */
	function closeAccessibilityModal() {
		showAccessibilityModal = false;
	}

	// Basic keyboard accessibility for closing the modal with Escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showAccessibilityModal) {
			closeAccessibilityModal();
		}
	}

	// Add event listener when component is mounted, remove when unmounted
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
    if (browser) {
		  window.removeEventListener('keydown', handleKeydown);
    }
	});
</script>

<div data-sp-component="Footer">
<!-- The component wraps the entire section -->
<!-- The light grey background is applied here -->
<section class="footer-section-wrapper">
	<!-- Increased left and right padding - kept this from previous request -->
	<div class="footer-content-container extra-horizontal-padding">
		<!-- Pre-footer animal stencils -->
		<!-- Further reduced space above and below stencils -->
		<div class="footer_pre-footer minimal-vertical-spacing">
			<div class="prefooter_stencil-wrapper">
				<!-- Updated grid layout for stencils -->
				<div class="stencil-art_grid-three-wide">
					<span><!-- left margin --></span>
(Include e.g. three stencil art images here)
					<span><!-- right margin (implicit) --></span>
				</div>
			</div>
		</div>

		<!-- Main footer content area -->
		<div class="container-large">
			<!-- Reduced vertical padding around the top section -->
			<div class="padding-vertical reduced-section-padding">
				<!-- Increased margin-bottom here to increase space after paragraph -->
				<div class="padding-bottom padding-xxlarge top-section-spacing-increased">
					<!-- Top section: Logo/Links and Address -->
					<!-- Kept 60/40 grid columns for space distribution -->
					<div class="footer8_top-wrapper menu-paragraph-layout">
						<!-- This wrapper holds the Logo and the Link List, stacked vertically -->
						<div class="footer8_left-wrapper">
							<!-- Logo Link - Using the new SVG -->
							<a href="/" aria-current="page" class="footer8_logo-link">
								<!-- Removed srcset and width/sizes as they are not needed for SVG scaling -->
								<!-- Logo size controlled by CSS max-width -->
(Example company logo here)
							</a>
							<!-- Navigation Links - Horizontal and Bold on Desktop, Vertical on Mobile -->
							<div class="footer8_link-list">
								<a href="/shareholders/overview" class="footer8_link">Shareholders</a>
								<a href="/subsidiaries/overview" class="footer8_link">Subsidiaries</a>
								
								<a href="/careers" class="footer8_link">Careers</a>
								<a href="/contact" class="footer8_link">Contact</a>
							</div>
						</div>
						<!-- Address / Description - Text is black -->
						<!-- On desktop, this is the second column (40%). On mobile, it stacks below -->
						<div class="footer8_address-block">
							<div class="margin-bottom margin-tiny">
								<div class="text-size-large"><strong>Example Company Name</strong></div>
							</div>
							<!-- Wrapped paragraph content to control its width -->
							<div class="paragraph-max-width">
Description of Example Company Here
							</div>
						</div>
					</div>
				</div>

				<!-- Horizontal Rule -->
				<!-- Removed margin-top class, space controlled by margin-bottom above -->
				<div class="line-divider"></div>

				<!-- Bottom section: Legal, Copyright, Designed by - Now closer to divider and Black -->
				<!-- Reduced padding-top to move away from the line by half of previous double -->
				<div class="padding-top reduced-doubled-padding-top">
					<!-- Adjusted layout for bottom wrapper -->
					<div class="footer8_bottom-wrapper bottom-section-layout">
						<!-- Left part of bottom wrapper (Legal Links/Accessibility) -->
						<!-- Added margin-right to create space after Legal links -->
						<div class="footer8_legal-list legal-list-spacing">
							<!-- Accessibility Statement Link (Triggers Modal) -->
							<!-- Darken and underline text -->
							<div class="footer8_link-icon-container accessibility-link-styled">
								<div class="fa-inline fa-padding-right icon-embed-xsmall">
									<!-- SVG for Accessibility icon - fill="currentColor" will pick up text color -->
									<svg
										xmlns="http://www.w3.org/2000/svg"
										height="16"
										width="16"
										viewBox="0 0 512 512"
										fill="currentColor"
									>
										<path
											d="M176 32a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm0 80A56 56 0 1 0 176 0a56 56 0 1 0 0 112zm-32.4 96c-2-8.6-10.5-14-19.1-12.1C53.2 212.1 0 275.8 0 352c0 88.4 71.6 160 160 160c69.7 0 128.9-44.5 150.9-106.7c2.9-8.3-1.4-17.5-9.8-20.4s-17.5 1.4-20.4 9.8C263.1 444.4 215.7 480 160 480C89.3 480 32 422.7 32 352c0-60.9 42.5-111.9 99.5-124.8c8.6-2 14-10.5 12.1-19.1zm56-51.6c-2-8.6-10.5-14-19.1-12.1s-14 10.5-12.1 19.1l34.3 151.1c5 21.9 24.4 37.4 46.8 37.4H358.1l59.6 119.2c1.9 3.8 5.2 6.7 9.3 8s8.4 1 12.2-.9l64-32c7.9-4 11.1-13.6 7.2-21.5s-13.6-11.1-21.5-7.2l-49.7 24.8L386.7 337.7c-5.4-10.8-16.5-17.7-28.6-17.7H249.5c-7.5 0-13.9-5.2-15.6-12.5L215 224H352c8.8 0 16-7.2 16-16s-7.2-16-16-16H207.7l-8.1-35.5z"
										></path>
									</svg>
								</div>
								<button class="footer8_legal-link" on:click={openAccessibilityModal}>
									Accessibility Statement
								</button>
							</div>
						</div>

						<!-- Right part of bottom wrapper (Designed by and Copyright) -->
						<!-- mobile-spacing-top is kept as it might be needed for small screen stacking -->
						<div class="footer8_credit-area mobile-spacing-top credit-area-spacing">
							<!-- Designed by link -->
							<!-- Reduced gap for icon and text, ensuring entirely orange logo -->
							<div class="footer8_link-icon-container os-link-container reduced-icon-text-gap orange-logo-fill">
(Include designer icon and link here)
							</div>
							<!-- Copyright text -->
							<div class="footer8_credit-text">© Example Company Name. All rights reserved.</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Accessibility Modal Component -->
{#if showAccessibilityModal}
	<div class="modal1_component" role="dialog" aria-modal="true" aria-labelledby="modal-title">
		<button type="button" class="modal1_background-overlay" on:click={closeAccessibilityModal} aria-label="Close dialog"></button>
		<div class="modal1_content-wrapper">
			<div class="margin-bottom margin-large">
				<div class="text-align-center">
					<div class="max-width-large align-center">
						<div class="margin-bottom margin-xsmall">
							<h2 id="modal-title" style="margin:0;padding:0;">Example Company Name</h2>
						</div>
						<p class="heading-small" style="margin:0;padding:0;">Accessibility Statement</p>
						<div class="margin-top margin-medium">
							<div class="accessibility-text w-richtext">
								<p>
									At Example Company Name, we are committed to ensuring digital accessibility for people with
									disabilities. We are continually improving the user experience for everyone and
									applying the relevant accessibility standards.
								</p>
								<p class="heading-small" style="margin:0; padding:0;">Compliance Status</p>
								<p>‍We strive to conform to WCAG 2.1 Level AA accessibility standards to the best of our
									ability. However, despite our efforts, some parts of our website may not be fully
									accessible at this time. If you encounter any such issues, please let us know.</p>
								<p class="heading-small" style="margin:0;padding:0;">Accessibility Features</p>
								<p>‍Our website includes features such as screen reader compatibility and alternative
									text for images to enhance navigation for users with visual impairments. We also
									provide a support line dedicated to assisting our shareholders with any
									accessibility concerns.</p>
								<p class="heading-small" style="margin:0;padding:0;">Feedback</p>
								<p>‍We welcome your feedback on the accessibility of our website. Please let us know if
									you encounter accessibility barriers on Example Company Name's website:</p>
								<ul role="list">
									<li><strong>Phone&nbsp;</strong>: <a class="contactlink" href="tel:123-456-7890">123-456-7890</a></li>
									<li>
										<strong>Email&nbsp;&nbsp;&nbsp;</strong>: <a class="contactlink" target="_new" href="mailto:contact@example.com"
											>contact@example.com</a
										>
									</li>
								</ul>
								<p class="heading-small" style="margin:0;padding:0;">Contact</p>
								<p>‍For any additional inquiries or concerns about our accessibility policy and
									initiatives, please contact us at the phone number or email address listed
									above.</p>
								<p>‍</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
    <!-- Close button is inside content wrapper for better positioning context -->
    <button class="modal1_close-button" aria-label="Close accessibility statement modal" on:click={closeAccessibilityModal}>
<svg
  width="32"
  height="32"
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  class="hide-mobile-landscape"
  aria-hidden="true"
>
  <path
    d="M24.056 23.5004L23.5004 24.056C23.1935 24.3628 22.696 24.3628 22.3892 24.056L16 17.6668L9.61078 24.056C9.30394 24.3628 8.80645 24.3628 8.49961 24.056L7.94403 23.5004C7.63719 23.1936 7.63719 22.6961 7.94403 22.3892L14.3332 16L7.94403 9.61081C7.63719 9.30397 7.63719 8.80648 7.94403 8.49964L8.49961 7.94406C8.80645 7.63721 9.30394 7.63721 9.61078 7.94406L16 14.3333L22.3892 7.94404C22.6961 7.6372 23.1935 7.6372 23.5004 7.94404L24.056 8.49963C24.3628 8.80647 24.3628 9.30395 24.056 9.61079L17.6667 16L24.056 22.3892C24.3628 22.6961 24.3628 23.1936 24.056 23.5004Z"
    fill="white"
  />
</svg>

      <!-- img src="/images/icon_close-modal.svg" loading="lazy" alt="" class="show-mobile-landscape" / -->
    </button>
	</div>
{/if}
</div>

<style>
  #modal-title {
    font-size: 3rem;
  }
  .heading-small {
    font-size: 1.5rem;
  }
  a:link.contactlink,
  a:visited.contactlink {
    color: rgb(74, 119, 180); /* light blue */
  }

  a:hover.contactlink {
    color: rgb(201, 107, 60);
  }


	/* --- General Layout & Spacing --- */
	.footer-section-wrapper {
		width: 100%;
		background-color: #f2f2f2; /* Light grey background */
		color: #333; /* Set a default dark text color for the section */
		/* Adjusted padding below */
		padding-top: 2rem; /* Further reduced top padding */
		padding-bottom: 4rem; /* Increased bottom padding */
	}

	/* Increased left and right padding for the main content container */
	.footer-content-container.extra-horizontal-padding {
		max-width: 1200px; /* Example max width */
		margin-left: auto;
		margin-right: auto;
		padding-left: 40px; /* Doubled padding */
		padding-right: 40px; /* Doubled padding */
		width: 100%;
		box-sizing: border-box; /* Include padding in width calculation */
		overflow-x: hidden; /* Prevent horizontal scrollbar */
	}


	/* Standard padding classes (adjust values as needed based on original site) */
	/* Renamed/adjusted padding classes for clarity and consistency */
	.padding-vertical.reduced-section-padding {
		padding-top: 2rem; /* Reduced padding top for top section content */
		padding-bottom: 2rem; /* Reduced padding bottom for top section content */
	}

	/* Keeping original padding classes for clarity if they are used elsewhere */
	/* .padding-vertical.padding-xxlarge { padding-top: 8rem; padding-bottom: 8rem; } */
	/* .padding-bottom.padding-xxlarge { padding-bottom: 8rem; } */
	/* .padding-top.padding-medium { padding-top: 2rem; } */
	/* .padding-top.padding-small { padding-top: 1rem; } */


	/* --- Pre-footer Stencils --- */
	.footer_pre-footer {
		/* Default margin bottom */
		margin-bottom: 4rem;
		position: relative;
	}

	/* Minimal vertical space for stencils */
	.footer_pre-footer.minimal-vertical-spacing {
		margin-bottom: 0.5rem; /* Kept reduced margin below */
		padding-top: 0; /* Removed top padding */
		/* If space above is still too much, it's likely from the component above */
	}


	.prefooter_stencil-wrapper {
		/*overflow: hidden;*/
	}

	/* Updated grid layout for stencils */
	.stencil-art_grid-three-wide {
		display: grid;
		/* Updated grid columns to include margin spans */
		grid-template-columns: 1fr minmax(200px, 0.5fr) minmax(200px, 0.5fr) minmax(200px, 0.5fr) 1fr;
		gap: 0rem; /* Removed gap, spacing controlled by columns */
		justify-items: center;
		align-items: center;
	}

	/* Responsive stencil grid for mobile */
	@media (max-width: 767px) {
		.stencil-art_grid-three-wide {
			/* Adjust columns for smaller screens */
			grid-template-columns: 0.5fr minmax(100px, 0.25fr) minmax(100px, 0.25fr) minmax(100px, 0.25fr) 0.5fr;
		}
	}


	.stencil-art_image {
		max-width: 100%;
		height: auto;
		/* Removed blue filter to allow original PNG colors */
		transition: transform 1.5s ease; /* Smooth transition for hover effect */
		pointer-events: auto; /* Enable pointer events for hover */
		display: block; /* Ensure proper display for scaling */
		/* No max-width set here to allow natural scaling */
	}

	/* Responsive stencil image size */
	@media (max-width: 767px) {
		.stencil-art_image {
			/* Reduce size on mobile */
			transform: scale(0.8); /* Example: scale down to 80% */
			/* Adjust hover effect if needed for mobile */
			&:hover {
				transform: scale(1); /* Scale back to 100% on hover (or slightly larger) */
			}
		}
	}

	.stencil-art_image:hover {
		transform: scale(1.2); /* Grow by 20% on hover (desktop) */
	}


	/* --- Top Section (Logo, Links, Address) --- */

	/* Top Wrapper - Desktop (> 767px) - Grid Columns */
	.footer8_top-wrapper {
		display: grid;
		grid-template-columns: 1fr 1fr; /* Default two equal columns */
		gap: 4rem; /* Space between columns */
		align-items: start; /* Align items to the top of the grid cell */
	}

	/* Kept 60/40 column widths for desktop (> 767px) */
	.footer8_top-wrapper.menu-paragraph-layout {
		grid-template-columns: 60% 40%; /* Left 60%, Right 40% */
	}

	/* Increased margin-bottom to increase space after this section */
	.top-section-spacing-increased {
		/* This class is on the container div */
		margin-bottom: 6rem; /* Increased space after paragraph (before divider) */
	}


	/* Tablet & Mobile Stacking (< 992px) */
	@media (max-width: 991px) {
		.footer8_top-wrapper {
			/* Use single column grid for stacking */
			display: grid;
			grid-template-columns: 1fr;
			gap: 2rem; /* Adjust gap if needed */
		}
		/* Reset specific layout class if needed */
		.footer8_top-wrapper.menu-paragraph-layout {
			grid-template-columns: 1fr; /* Ensure single column */
		}
        /* Ensure paragraph takes full width when stacked */
        .footer8_address-block .paragraph-max-width {
            max-width: 100%;
        }
	}


	/* Left Wrapper (Logo and Link List) - Stacked Vertically */
	.footer8_left-wrapper {
		display: flex;
		flex-direction: column; /* Stack logo and link list */
		gap: 2rem; /* Space between logo and link list */
	}

	/* Address Block - Placeholder class for clarity */
	.footer8_address-block {
		/* No specific flex/grid needed here unless content within needs layout */
	}

	/* Added class to control paragraph width */
	.footer8_address-block .paragraph-max-width {
		max-width: 70%; /* Narrow the paragraph to 70% of its container width */
		/* Add responsiveness if needed */
		@media (max-width: 767px) {
			max-width: 100%; /* Allow full width on mobile */
		}
	}


	.footer8_logo-link {
		display: inline-block; /* Or block */
		/* margin-bottom controlled by parent .footer8_left-wrapper gap */
	}

	.footer8_logo-link img {
		max-width: 308px; /* Match original width constraint */
		height: auto;
		display: block;
		width: 100%; /* Ensure SVG scales within its container */
	}


	/* Navigation Links - Horizontal and Bold on Desktop, Vertical on Mobile */
	.footer8_link-list {
		display: flex; /* Use flexbox */
		flex-direction: row; /* Horizontal layout by default (desktop) */
		flex-wrap: wrap; /* Allow wrapping if links are too long for the container */
		gap: 1.5rem; /* Space between horizontal links */
	}

	/* Navigation Links - Mobile (< 768px) - Stacked Vertically */
	@media (max-width: 767px) {
		.footer8_link-list {
			flex-direction: column; /* Stack links vertically */
			gap: 0.75rem; /* Use smaller gap when stacked */
		}
    /* Allow links to wrap */
    .footer8_link {
      white-space: normal;
    }
		/* Adjust margin below top section */
		.top-section-spacing-increased {
			margin-bottom: 4rem; /* Adjust space for mobile if needed */
		}
    /* Ensure paragraph takes full width (redundant but safe) */
    .footer8_address-block .paragraph-max-width {
        max-width: 100%;
    }    
	}

	.footer8_link {
		color: #333; /* Black text color */
		text-decoration: none;
		font-size: 1rem; /* Adjust size */
		line-height: 1.5; /* Adjust line height */
		transition: color 0.2s ease; /* Smooth hover effect */
		white-space: nowrap; /* Prevent links from breaking mid-word */
		font-weight: bold; /* Make links bold */
	}

	.footer8_link:hover {
		color: #c96b3c; /* Accent color on hover */
		text-decoration: underline; /* Add underline on hover */
	}


	/* --- Divider --- */
	.line-divider {
		height: 1px;
		background-color: #000; /* Black line color */
		/* Margin-top controlled by margin-bottom on section above */
		margin-top: 0;
		margin-bottom: 0; /* Margin bottom handled by padding below */
	}


	/* --- Bottom Section (Legal, Copyright, Designed by) --- */

	/* Reduced padding top for the bottom section (half of previous double) */
	.padding-top.reduced-doubled-padding-top {
		padding-top: 2rem; /* Reduced padding top (half of previous 4rem) */
	}


	.footer8_bottom-wrapper {
		display: flex; /* Use flexbox for horizontal layout */
		justify-content: space-between; /* Default: Space out items */
		align-items: center; /* Vertically align items */
		/* Add responsiveness - stack on smaller screens */
		@media (max-width: 767px) {
			flex-direction: column; /* Stack items vertically */
			align-items: flex-start; /* Align stacked items to the left */
			gap: 1rem; /* Space between stacked items */
		}
	}

	/* Adjusted layout for bottom wrapper on desktop */
	.footer8_bottom-wrapper.bottom-section-layout {
		justify-content: space-between; /* Space out items as originally */
		gap: unset; /* Remove the single large gap */
		/* On mobile, the original stacking behavior should still work */
	}


	.footer8_legal-list {
		display: flex; /* Use flexbox for horizontal legal links */
		gap: 1.5rem; /* Restored space between legal links */
		align-items: center;
		flex-wrap: wrap; /* Allow items to wrap */
		color: inherit; /* Inherit color from .footer-section-wrapper (black) */
		/* Removed margin-right: auto */
		/* margin-right: auto; */
		/* Adjust margin-right to control space before the credit area */
		/* margin-right: 3rem; */
	}

	/* Added class to control space after Legal links (on the list itself) */
	.footer8_legal-list.legal-list-spacing {
		margin-right: 2rem; /* Added margin right to create space after the list */
	}


	/* Style for the button acting as a link */
	.footer8_legal-link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: inherit; /* Inherit color from parent */
		text-decoration: none; /* Default: no underline */
		font-size: 0.875rem; /* Adjust size */
		transition: color 0.2s ease;
		/* Add focus styles for accessibility */
		&:focus-visible {
			outline: 2px solid #c96b3c;
			outline-offset: 2px;
			border-radius: 4px;
		}
	}

	.footer8_legal-link:hover {
		color: #c96b3c; /* Accent color on hover */
		text-decoration: underline; /* Add underline on hover */
	}

	/* Darken and underline Accessibility Statement text */
	.accessibility-link-styled .footer8_legal-link {
		font-weight: bold; /* Darken (make bold) */
		text-decoration: underline; /* Underline */
	}


	.footer8_link-icon-container {
		display: flex; /* Use flexbox to align icon and text */
		gap: 0.5rem; /* Default space between icon and text */
		align-items: center;
		color: inherit; /* Ensure icons get the inherited color */
	}

	/* Container for the Designer link to apply specific SVG coloring */
	.os-link-container {
		/* No specific layout needed here, controlled by its parent .footer8_credit-area */
	}

	/* Reduced gap between Designer icon and text */
	.os-link-container.reduced-icon-text-gap {
		gap: 0.25rem; /* Reduced gap */
	}

	/* Ensure Designer SVG is entirely orange */
	.os-link-container .icon-embed-xsmall svg {
		/* Removing inherited color/fill to let the SVG's internal fills work,
           then setting the fill explicitly below */
		fill: unset;
		color: unset;
	}

	/* Specific fills for Designer SVG paths to make it entirely orange */
	.os-link-container .fa-secondary {
		fill: #c96b3c; /* Apply Designer color */
		opacity: 0.4; /* Keep original opacity on secondary path */
	}

	.os-link-container .fa-primary {
		fill: #c96b3c; /* Apply Designer primary color */
	}


	.fa-inline {
		/* Style for SVG icons */
		display: inline-block;
		vertical-align: middle;
		/* Color is set by parent or fill="currentColor" */
	}

	.fa-padding-right {
		margin-right: 0.5rem; /* Space after icon */
	}

	.icon-embed-xsmall {
		width: 16px; /* Match icon size */
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0; /* Prevent icon from shrinking */
	}

	.footer8_credit-area {
		display: flex; /* Use flexbox for horizontal layout */
		gap: 1.5rem; /* Default gap between items */
		align-items: center;
		/* Add responsiveness */
		@media (max-width: 767px) {
			flex-direction: column; /* Stack items vertically */
			align-items: flex-start; /* Align stacked items left */
			gap: 1rem; /* Reduce gap */
		}
	}

	/* mobile-spacing-top might still be relevant if the credit area stacks below legal on mobile */
	.mobile-spacing-top {
		@media (max-width: 767px) {
			margin-top: 1rem; /* Add top margin when stacked */
		}
	}

	/* Added class to control space after the Designed by link (on the container) */
	.credit-area-spacing .os-link-container {
		margin-right: 2rem; /* Add space after the Designer link */
	}


	.os-backlink {
		/* Specific styles for the Designer link */
		color: inherit; /* Inherit color from parent */
	}

	.footer8_credit-text {
		color: inherit; /* Inherit color from parent */
		font-size: 0.875rem; /* Adjust size */
	}

	/* --- Utility Classes (Adjust as needed) --- */
	.text-size-large {
		font-size: 1.25rem;
	}

	.margin-bottom {
		margin-bottom: 1rem;
	}
	.margin-bottom.margin-tiny {
		margin-bottom: 0.5rem;
	}
	.margin-bottom.margin-xsmall {
		margin-bottom: 0.75rem;
	}
	.margin-bottom.margin-large {
		margin-bottom: 2rem;
	}

	.margin-top {
		margin-top: 1rem;
	}
	.margin-top.margin-medium {
		margin-top: 1.5rem;
	}

	.text-align-center {
		text-align: left;
	}

	.max-width-large {
		max-width: 800px;
	}

	.align-center {
		margin-left: auto;
		margin-right: auto;
	}

	.w-richtext {
		/* Basic styling for rich text content */
		line-height: 1.6;
		color: #333; /* Adjust text color for modal content */
	}

	.w-richtext p {
		margin-bottom: 1em;
	}

	.w-richtext strong {
		font-weight: bold;
	}

	.w-richtext ul {
		list-style: disc;
		margin-left: 20px;
		margin-bottom: 1em;
	}

	.w-richtext li {
		margin-bottom: 0.5em;
	}

	.w-richtext a {
		color: #c96b3c; /* Link color */
		text-decoration: underline;
	}

	/* --- Modal Styles --- */
	.modal1_component {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex; /* Use flexbox to center content */
		justify-content: center; /* Center horizontally */
		align-items: center; /* Center vertically */
		z-index: 1000; /* Ensure modal is on top */
		padding: 20px; /* Padding around modal content */
		box-sizing: border-box;
		/* Add transitions for fade-in effect */
		opacity: 1; /* Or start from 0 and animate in */
		transition: opacity 0.3s ease;
	}

	.modal1_background-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.3); /* Semi-transparent dark overlay */
		z-index: -1; /* Place behind modal content */
		/* Add fade-in for overlay if desired */
		transition: opacity 0.3s ease;
	}

	.modal1_content-wrapper {
		background-color: #fff; /* White background for modal content */
		xmax-width: 800px; /* Adjust max width as needed */
    max-width: 80vw; /* Adjust max width as needed */
		width: 100%;
		padding: 60px; /* Padding inside the modal content box */
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Add shadow */
		border-radius: 8px; /* Rounded corners */
		position: relative; /* Needed for close button absolute positioning */
		z-index: 1; /* Ensure content is above overlay */
		max-height: 80vh; /* Limit height to prevent overflow */
		overflow-y: auto; /* Add scrollbar if content is too tall */
		/* Add transition for slide-in effect if desired */
		transform: translateY(0); /* Or start from 100% and animate in */
		transition: transform 0.3s ease;
	}

  .modal1_content-wrapper .accessibility-text.w-richtext {
    text-align: left;
  }

  .modal1_content-wrapper .w-richtext ul {
    text-align: left;
  }

  .modal1_content-wrapper .w-richtext li {
    text-align: left;
  }

	/* Original Webflow inline style suggested a slide-up animation: */
	/* style="transform: translate3d(0px, 100%, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(0deg) rotateZ(0deg) skew(0deg, 0deg); transform-style: preserve-3d;" */
	/* If you want this animation, you would need to manage state and apply
       the initial transform when hidden, and the final transform when shown,
       allowing CSS transitions to handle the interpolation.
       For simplicity, the current version just appears/disappears. */


	.modal1_close-button {
		position: absolute;
		top: 12vh; /* Adjust position */
		right: 14vw; /* Adjust position */
		background-color: rgb(74, 119, 180); /* Blue background */
		border: none;
		cursor: pointer;
		padding: 0px;
		z-index: 1001; /* Ensure button is above content */
    border-radius: 8px; /* Rounded square corners */
    line-height: 0; /* Prevent extra space around image */    
		/* Add focus styles for accessibility */
		&:focus-visible {
			outline: 2px solid #c96b3c;
			outline-offset: 2px;
			border-radius: 4px;
		}
	}

	.modal1_close-button img {
		display: block;
		width: 32px; /* Adjust icon size */
		height: 32px;
	}

	.hide-mobile-landscape {
		display: block; /* Default: show on desktop */
	}

	/* Responsive styles for modal close button icons */
	@media (max-width: 479px) { /* Adjust breakpoint as needed */
		.hide-mobile-landscape {
			display: none;
		}
	}

	/* Styles for rich text within the modal */
	.accessibility-text.w-richtext {
		/* Adjust styles if different from general w-richtext */
    text-align: left;
	}

</style>

