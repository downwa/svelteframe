<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { PUBLIC_CKEDITOR_LICENSE_KEY } from '$env/static/public';

	export let data = '';
	export let height = 'auto';
	let editorElement: HTMLElement;
	let editorInstance: any = null;

	const dispatch = createEventDispatcher();

	// --- Helper Functions for BARESPAN handling ---

	function preprocessData(html: string): string {
		if (!html) return '';
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// 1. Handle Bare Text Nodes (e.g. inside <title>)
			const textNodes: Node[] = [];
			doc.body.childNodes.forEach((node) => {
				if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '') {
					textNodes.push(node);
				}
			});

			textNodes.forEach((node) => {
				const p = doc.createElement('p');
				p.setAttribute('data-sp-field-type', 'PLAIN_TEXT');
				p.textContent = node.textContent;
				(node as ChildNode).replaceWith(p);
			});

			// 2. Handle Bare Spans
			// Find ALL spans in the document
			const allSpans = doc.body.querySelectorAll('span');
			let modified = textNodes.length > 0;

			allSpans.forEach((span) => {
				// Check if the parent is NOT a paragraph
				// We want to protect spans that are direct children of body, div, etc.
				// from being permanently wrapped in <p> by CKEditor
				if (span.parentElement?.tagName !== 'P' && !span.hasAttribute('data-sp-field-type')) {
					span.setAttribute('data-sp-field-type', 'BARESPAN');
					modified = true;
				}
			});

			return modified ? doc.body.innerHTML : html;
		} catch (e) {
			console.error('Error in preprocessData', e);
			return html;
		}
	}

	function postprocessData(html: string): string {
		if (!html) return '';
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// Check paragraphs
			const paragraphs = doc.body.querySelectorAll('p');
			let modified = false;

			paragraphs.forEach((p) => {
				// 1. Check for PLAIN_TEXT marker
				if (p.getAttribute('data-sp-field-type') === 'PLAIN_TEXT') {
					// Unwrap: replace P with its text content
					const text = doc.createTextNode(p.textContent || '');
					p.replaceWith(text);
					modified = true;
					return; // Done with this P
				}

				// 2. Check for BARESPAN inside
				const span = p.querySelector('span[data-sp-field-type="BARESPAN"]');
				// If we find a marked span inside a paragraph, we unwrap the paragraph
				// This preserves the span and any sibling text/nodes that CKEditor might have wrapped
				if (span && p.contains(span)) {
					// Remove the marker attribute so it's clean in storage
					span.removeAttribute('data-sp-field-type');

					// Unwrap: Replace the P with all its children
					while (p.firstChild) {
						p.parentNode?.insertBefore(p.firstChild, p);
					}
					p.remove();

					modified = true;
				}
			});

			let finalHtml = modified ? doc.body.innerHTML : html;

			// Remove quotes from attributes that are exactly wrapped in {}
			// e.g. alt="{foo.bar}" -> alt={foo.bar}
			// But keep alt="foo {bar}"
			finalHtml = finalHtml.replace(/(\s+[\w-:]+)="\{([^"]*)\}"/g, '$1={$2}');

			return finalHtml;
		} catch (e) {
			console.error('Error in postprocessData', e);
			return html;
		}
	}

	onMount(async () => {
		// 1. Import everything from 'ckeditor5'
		const CK = await import('ckeditor5');

		// 2. Import CSS
		await import('ckeditor5/ckeditor5.css');
		await import('./ckstyle.css');

		const editorConfig = {
			toolbar: {
				items: [
					'undo',
					'redo',
					'|',
					'sourceEditing',
					'showBlocks',
					'fullscreen',
					'|',
					'heading',
					'style',
					'|',
					'fontSize',
					'fontFamily',
					'fontColor',
					'fontBackgroundColor',
					'|',
					'bold',
					'italic',
					'underline',
					'strikethrough',
					'subscript',
					'superscript',
					'code',
					'|',
					'horizontalLine',
					'link',
					'insertImageViaUrl',
					'mediaEmbed',
					'insertTable',
					'highlight',
					'blockQuote',
					'codeBlock',
					'|',
					'alignment',
					'|',
					'bulletedList',
					'numberedList',
					'todoList',
					'outdent',
					'indent'
				],
				shouldNotGroupWhenFull: false
			},
			plugins: [
				CK.Alignment,
				CK.Autoformat,
				CK.AutoImage,
				CK.AutoLink,
				CK.Autosave,
				CK.BalloonToolbar,
				CK.BlockQuote,
				CK.BlockToolbar,
				CK.Bold,
				CK.CloudServices,
				CK.Code,
				CK.CodeBlock,
				CK.Essentials,
				CK.FontBackgroundColor,
				CK.FontColor,
				CK.FontFamily,
				CK.FontSize,
				CK.Fullscreen,
				CK.GeneralHtmlSupport,
				CK.Heading,
				CK.Highlight,
				CK.HorizontalLine,
				CK.HtmlComment,
				CK.ImageBlock,
				CK.ImageCaption,
				CK.ImageInline,
				CK.ImageInsertViaUrl,
				CK.ImageStyle,
				CK.ImageTextAlternative,
				CK.ImageToolbar,
				CK.ImageUpload,
				CK.Indent,
				CK.IndentBlock,
				CK.Italic,
				CK.Link,
				CK.LinkImage,
				CK.List,
				CK.MediaEmbed,
				CK.Mention,
				CK.Paragraph,
				CK.PasteFromMarkdownExperimental,
				CK.ShowBlocks,
				CK.SourceEditing,
				CK.Strikethrough,
				CK.Style,
				CK.Subscript,
				CK.Superscript,
				CK.Table,
				CK.TableCaption,
				CK.TableToolbar,
				CK.TextTransformation,
				CK.TodoList,
				CK.Underline
			],
			balloonToolbar: ['bold', 'italic', '|', 'link', '|', 'bulletedList', 'numberedList'],
			blockToolbar: [
				'fontSize',
				'fontColor',
				'fontBackgroundColor',
				'|',
				'bold',
				'italic',
				'|',
				'link',
				'insertTable',
				'|',
				'bulletedList',
				'numberedList',
				'outdent',
				'indent'
			],
			fontFamily: { supportAllValues: true },
			fontSize: {
				options: [10, 12, 14, 'default', 18, 20, 22],
				supportAllValues: true
			},
			fullscreen: {
				onEnterCallback: (container: any) =>
					container.classList.add(
						'editor-container',
						'editor-container_classic-editor',
						'editor-container_include-style',
						'editor-container_include-block-toolbar',
						'editor-container_include-fullscreen',
						'main-container'
					)
			},
			heading: {
				options: [
					{ model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
					{ model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
					{ model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
					{ model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
					{ model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
					{ model: 'heading5', view: 'h5', title: 'Heading 5', class: 'ck-heading_heading5' },
					{ model: 'heading6', view: 'h6', title: 'Heading 6', class: 'ck-heading_heading6' }
				]
			},
			htmlSupport: {
				allow: [{ name: /^.*$/, styles: true, attributes: true, classes: true }],
				disallow: [
					{
						name: 'script'
					}
				]
			},
			image: {
				toolbar: [
					'toggleImageCaption',
					'imageTextAlternative',
					'|',
					'imageStyle:inline',
					'imageStyle:wrapText',
					'imageStyle:breakText'
				]
			},
			initialData: preprocessData(data),
			licenseKey: PUBLIC_CKEDITOR_LICENSE_KEY,
			link: {
				addTargetToExternalLinks: true,
				defaultProtocol: 'https://',
				decorators: {
					toggleDownloadable: {
						mode: 'manual',
						label: 'Downloadable',
						attributes: { download: 'file' }
					}
				}
			},
			mention: {
				feeds: [{ marker: '@', feed: [] }]
			},
			menuBar: { isVisible: true },
			placeholder: 'Type or paste your content here!',
			style: {
				definitions: [
					{ name: 'Article category', element: 'h3', classes: ['category'] },
					{ name: 'Title', element: 'h2', classes: ['document-title'] },
					{ name: 'Subtitle', element: 'h3', classes: ['document-subtitle'] },
					{ name: 'Info box', element: 'p', classes: ['info-box'] },
					{ name: 'CTA Link Primary', element: 'a', classes: ['button', 'button--green'] },
					{ name: 'CTA Link Secondary', element: 'a', classes: ['button', 'button--black'] },
					{ name: 'Marker', element: 'span', classes: ['marker'] },
					{ name: 'Spoiler', element: 'span', classes: ['spoiler'] }
				]
			},
			table: {
				contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
			}
		};

		CK.ClassicEditor.create(editorElement, editorConfig as any)
			.then((instance) => {
				editorInstance = instance;

				editorInstance.model.document.on('change:data', (evt, batch) => {
					const rawData = editorInstance.getData();
					const processedData = postprocessData(rawData);
					// Only update if different?
					// Avoiding infinite loop controlled by the reactive block below
					data = processedData;

					// batch.isTransparent is true for initial load and normalization
					// We only want to notify the parent of a change if it's a real user action
					if (!batch.isTransparent) {
						dispatch('change');
					} else {
						console.log('[ManualCKEditor] Batch is transparent, not dispatching change');
					}
				});

				// Dimension logging for resize tracking
				const targetWindow = editorElement.closest('.floating-window') as HTMLElement;
				if (targetWindow) {
					const ro = new ResizeObserver((entries) => {
						for (const entry of entries) {
							// Use the window's actual bounding rect for width stabilization
							const winRect = targetWindow.getBoundingClientRect();
							const width = winRect.width;
							const height = winRect.height;
							//console.log('[ManualCKEditor] Window resized:', { width, height });

							if (editorElement) {
								const wrapper = editorElement.closest('.editor-container__editor') as HTMLElement;
								if (wrapper) {
									wrapper.style.width = width + 'px';
									wrapper.style.minWidth = width + 'px';
									wrapper.style.maxWidth = width + 'px';
								}
							}
						}
					});
					ro.observe(targetWindow);
				}
			})
			.catch((error) => {
				console.error(error);
			});
	});

	onDestroy(() => {
		if (editorInstance) {
			editorInstance.destroy();
			editorInstance = null;
		}
	});

	// Reactive update from parent
	$: if (editorInstance && data !== undefined) {
		const currentData = postprocessData(editorInstance.getData());
		// If the data passed in (data) is different from what we think the editor has (normalized),
		// then update the editor.
		// Note: editorInstance.getData() returns wrapped content. postprocess returns unwrapped.
		// So we compare unwrapped vs unwrapped.
		if (data !== currentData) {
			const isFocused = editorInstance.editing?.view?.document?.isFocused;
			if (!isFocused) {
				const processedInput = preprocessData(data);
				editorInstance.setData(processedInput);
			}
		}
	}
</script>

<div class="main-container" style="height: {height === '100%' ? '100%' : height}; flex: 1;">
	<div
		class="editor-container editor-container_classic-editor editor-container_include-style editor-container_include-block-toolbar editor-container_include-fullscreen"
	>
		<div class="editor-container__editor">
			<div bind:this={editorElement}></div>
		</div>
	</div>
</div>

<style>
	.main-container {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		width: 100%;
		flex: 1;
	}
	.editor-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}
	.editor-container__editor {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}
	:global(.ck-editor) {
		display: flex !important;
		flex-direction: column !important;
		height: 100% !important;
		width: 100% !important;
		min-height: 0;
	}
	:global(.ck-editor__main) {
		flex: 1 !important;
		overflow: auto !important;
	}
</style>
