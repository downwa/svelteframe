<!-- FILE: src/routes/svelteframe/_components/TestEditor.svelte -->
<script>
	import { onMount } from 'svelte';
	import { PUBLIC_CKEDITOR_LICENSE_KEY } from '$env/static/public';

	export let initialData = '';
	let editorElement;
	let editorInstance;

	// This function allows the parent to "pull" data out
	export const getData = () => {
		//console.log('getData: ', editorInstance?.getData());
		return editorInstance ? editorInstance.getData() : '';
	};

	onMount(async () => {
		// 1. Import everything from 'ckeditor5'
		const CK = await import('ckeditor5');

		// 2. Import CSS (Vite will handle these)
		await import('ckeditor5/ckeditor5.css');
		// Ensure the path to your ckstyle.css is correct relative to this file
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
				//				CK.Markdown,
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
				//CK.Title,
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
				onEnterCallback: (container) =>
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
				allow: [{ name: /^.*$/, styles: true, attributes: true, classes: true }]
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
			initialData,
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

		CK.ClassicEditor.create(editorElement, editorConfig)
			.then((instance) => {
				editorInstance = instance;
			})
			.catch((error) => {
				console.error(error);
			});
	});
</script>

<div class="main-container" style="margin-top: 100px;">
	<div
		class="editor-container editor-container_classic-editor editor-container_include-style editor-container_include-block-toolbar editor-container_include-fullscreen"
	>
		<div class="editor-container__editor">
			<div bind:this={editorElement}></div>
		</div>
	</div>
</div>
