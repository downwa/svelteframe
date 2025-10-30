// src/lib/components/Hero.types.ts

/**
 * Represents a single source within a responsive image set.
 * The sources should ideally be provided sorted by minWidth descending
 * (largest width first) for optimal selection.
 */
export interface ImageSource {
    src: string; // URL of the image for this size
    minWidth: number; // Minimum viewport width (in pixels) this image is suitable for
  }
  
  /**
   * Represents the data for a single slide in a hero component.
   */
  export interface HeroSlide {
    // --- Responsive Background Image ---
    /**
     * @deprecated Use bgImageSet for responsive images.
     * Fallback/default background image source. Required for backward
     * compatibility and as the smallest default if bgImageSet is not provided
     * or doesn't cover all sizes.
     */
    bgImageSrc: string;
    /**
     * Optional array of image sources for different screen sizes.
     * Provide multiple objects with `src` and `minWidth`.
     * The component will select the most appropriate source based on viewport width.
     * It's recommended to sort this array by `minWidth` descending (largest first).
     * If omitted, only `bgImageSrc` will be used.
     */
    bgImageSet?: ImageSource[];
    /** Alt text for the background image (important for accessibility). */
    bgImageAlt: string;
  
    // --- Text Content ---
    /** The main heading phrase for the slide. */
    headingPhrase: string;
    /** Optional subtext displayed below the heading. */
    subText?: string;
  
    // --- Optional Button
    buttonText?: string;
    buttonLink?: string;
    progressText?: string;
  }
  
  // Example Usage (in your data source):
  /*
  const heroData: HeroSlide[] = [
    {
      // Fallback / Smallest image
      bgImageSrc: '/images/hero-background-small.jpg',
      // Responsive set (largest first is recommended)
      bgImageSet: [
        { src: '/images/hero-background-large.jpg', minWidth: 1024 },
        { src: '/images/hero-background-medium.jpg', minWidth: 768 },
        // Smallest is covered by bgImageSrc, but could be included:
        // { src: '/images/hero-background-small.jpg', minWidth: 0 },
      ],
      bgImageAlt: 'Abstract background showing network connections',
      headingPhrase: 'Connectivity',
      subText: 'Explore our high-speed network solutions.',
    }
  ];
  
  const heroDataSimple: HeroSlide[] = [
   {
      bgImageSrc: '/images/hero-background-default.jpg',
      // No bgImageSet provided, will just use bgImageSrc
      bgImageAlt: 'A default background image',
      headingPhrase: 'Simplicity',
      subText: 'Easy to set up and use.',
   }
  ]
  */
  