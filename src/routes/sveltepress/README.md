# SveltePress Starter Kit

This package contains the initial files for **SveltePress**, a SvelteKit
add-in designed to provide in-browser editing capabilities for an existing
SvelteKit project. It allows authenticated users to edit pages
(`src/routes`) and components (`src/lib/components`) based on a simple
Access Control List (ACL).

## Design Overview

-   **Self-Contained:** All SveltePress logic (UI and APIs) is located
    under `src/routes/sveltepress`, making it easy to add or remove.
-   **Authentication:** Designed for Passkeys (WebAuthn). The necessary API
    endpoints are stubbed out. User data and ACLs are stored in a top-level
    `users/` directory.
-   **UI/UX:** The main interface at `/sveltepress` mimics the VS Code
    layout with an auto-hiding menu and file explorer to maximize preview
    space.
-   **File Management:** All file system operations (reading, writing,
    listing) are handled by secure API endpoints that respect the user's
    ACL.
-   **Templating:** Includes a "New Page" feature that can use templates. A
    special workflow is included for templates containing a `<HeroStatic />`
    component, which prompts the user for images and text to dynamically
    generate the component's props.

## How to Integrate into Your Project

1.  **Copy Files:**
    -   Create the `src/routes/sveltepress` directory and populate it with
        the files provided below.
    -   Create the top-level `users` directory in your project root (at the
        same level as `src`).

2.  **Update `src/hooks.server.ts`:**
    -   You will need a `hooks.server.ts` file to manage authentication for
        the SveltePress routes. If you don't have one, create it. Add the
        logic from the provided `src/hooks.server.ts.example` file. This
        logic identifies users trying to access `/sveltepress` and will be
        the foundation for your session verification.

3.  **Update `src/app.d.ts`:**
    -   To make user data available in `event.locals`, add the provided
        `user` interface to your `app.d.ts` file. See
        `src/app.d.ts.example`.

## Installation

Install the necessary dependencies for authentication, image processing, and
the rich text editor.

```bash
npm install @simplewebauthn/server @simplewebauthn/browser sharp ckeditor5-svelte @ckeditor/ckeditor5-build-classic
  OR
bun add @simplewebauthn/server @simplewebauthn/browser sharp ckeditor5-svelte @ckeditor/ckeditor5-build-classic
```

-   `@simplewebauthn/server` & `@simplewebauthn/browser`: For implementing
    Passkey authentication.
-   `sharp`: For server-side image processing (getting dimensions for the
    Hero component).
-   `@ckeditor/ckeditor5-svelte`: The official Svelte wrapper for CKEditor 5.
-   `@ckeditor/ckeditor5-build-classic`: A pre-built version of the editor.
    You can choose other builds as needed.

## Configuration & First Run

1.  **Create a User:**
    -   In the `users/` directory, create a file like `admin.json` using
        the `admin.example.json` template.
    -   The `credentials` array will be populated automatically when you
        implement the Passkey registration flow.
    -   The default ACL `["routes/", "lib/components/"]` grants full access.

2.  **Implement Authentication:**
    -   The files under `src/routes/sveltepress/auth/` are placeholders. You
        will need to implement the Passkey registration and login logic
        using the `simplewebauthn` libraries.
    -   Update the `verifyUserSession` function (referenced in the hook) to
        securely validate the user's session cookie.

3.  **Run Your Project:**
    -   Start your SvelteKit development server: `npm run dev`.
    -   Navigate to `/sveltepress` in your browser. Once the login flow is
        working, you should be able to access the main UI.