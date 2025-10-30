<!-- FILE: src/routes/sveltepress/auth/login/+page.svelte -->
<script lang="ts">
  import { startAuthentication } from '@simplewebauthn/browser';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  export let data; // From +page.server.ts
  $: pageTitle = `SveltePress Login (${data.siteName})`;

  let username = '';
  let errorMsg = '';
  let successMsg = '';
  let isLoading = false;
  let rememberMe = false;

  function setCookie(name: string, value: string, days: number) {
    let expires = '';
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + (value || '') + expires + '; path=/';
  }

  function getCookie(name: string): string | null {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  onMount(() => {
    const rememberedUser = getCookie('sveltepress_username');
    if (rememberedUser) {
      username = rememberedUser;
      rememberMe = true;
    }
    const urlUsername = $page.url.searchParams.get('username');
    if (urlUsername) {
      username = urlUsername;
    }
    if ($page.url.searchParams.get('verified') === 'true') {
      successMsg =
        'You have successfully created a Passkey and can login with it.';
    }
  });

  async function handleLogin() {
    errorMsg = '';
    isLoading = true;
    if (!username) {
      errorMsg = 'Username is required.';
      isLoading = false;
      return;
    }

    try {
      const resOptions = await fetch(
        `/sveltepress/auth/login/generate-options`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        },
      );
      const options = await resOptions.json();

      if (!resOptions.ok) {
        throw new Error(options.error || 'Failed to get login options.');
      }

      const compatibleOptions = {
        ...options,
        rpId: options.rpId || 'localhost',
      };

      const assertion = await startAuthentication({ optionsJSON: compatibleOptions });
      const verificationRes = await fetch(
        `/sveltepress/auth/login/verify-authentication`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, data: assertion }),
        },
      );
      const verificationBody = await verificationRes.json(); // Get body regardless of status

      if (verificationRes.ok) {
        if (rememberMe) {
          setCookie('sveltepress_username', username, 30);
        } else {
          setCookie('sveltepress_username', '', -1);
        }
        // --- FIX: Simply reload the page. The hook will handle the redirect. ---
        window.location.reload();
      } else {
        throw new Error(verificationBody.message || 'Login verification failed.');
      }
    } catch (err: any) {
      errorMsg = err.message;
      console.error(err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="auth-container">
  <h1>{pageTitle}</h1>
  <form on:submit|preventDefault={handleLogin}>
    <input
      type="text"
      bind:value={username}
      placeholder="Enter username (email)"
      disabled={isLoading}
    />
    <label class="remember-me">
      <input type="checkbox" bind:checked={rememberMe} />
      Remember me
    </label>
    <button type="submit" disabled={isLoading}>
      {#if isLoading}Logging in...{:else}Login with Passkey{/if}
    </button>
  </form>
  {#if successMsg}
    <p class="success">{successMsg}</p>
  {/if}
  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}
  <a href="/sveltepress/auth/register">Create an account</a>
</div>

<style>
  .auth-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1.25rem;
    padding: 2rem;
    box-sizing: border-box;
  }
  h1 {
    color: #e0e0e0;
  }
  p {
    color: #a0a0a0;
    text-align: center;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(100%, 300px);
  }
  input[type='text'] {
    background-color: #3c3c3c;
    color: #f0f0f0;
    border: 1px solid #555;
    padding: 10px;
    border-radius: 4px;
    font-size: 1rem;
  }
  input::placeholder {
    color: #888;
  }
  .remember-me {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #ccc;
    cursor: pointer;
  }
  .remember-me input {
    margin: 0;
  }
  button {
    background-color: #0e639c;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  button:hover {
    background-color: #157ac0;
  }
  .error,
  .success {
    padding: 10px;
    border-radius: 4px;
    width: min(100%, 300px);
    text-align: center;
  }
  .error {
    color: #ff6b6b;
    background-color: rgba(255, 107, 107, 0.1);
    border: 1px solid #ff6b6b;
  }
  .success {
    color: #a5d6a7;
    background-color: rgba(165, 214, 167, 0.1);
    border: 1px solid #a5d6a7;
  }
  a {
    color: #3794ff;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>