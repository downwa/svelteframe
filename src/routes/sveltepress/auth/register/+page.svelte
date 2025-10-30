<!-- FILE: src/routes/sveltepress/auth/register/+page.svelte -->
<script lang="ts">
  import { startRegistration } from '@simplewebauthn/browser';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { debugLog } from '$routes/sveltepress/lib/server/debug';

  let username = '';
  let errorMsg = '';
  let successMsg = '';
  let isLoading = false;
  let isVerifiedFlow = false;
  // The isSuccess flag is no longer needed.

  onMount(() => {
    const params = $page.url.searchParams;
    if (params.get('verified') === 'true') {
      isVerifiedFlow = true;
      username = params.get('username') || '';
      successMsg =
        'Email verified! Now, create your passkey to finish setting up your account.';
    }
  });

  async function handleRegister() {
    errorMsg = '';
    isLoading = true;

    try {
      debugLog('Step 1: Fetching registration options from server...');
      const resOptions = await fetch(
        `/sveltepress/auth/register/generate-options`,
        { method: 'POST' },
      );
      const options = await resOptions.json();
      if (!resOptions.ok) {
        throw new Error(options.error || 'Could not get registration options.');
      }
      debugLog('Step 2: Received options. Now showing browser passkey prompt...');

      const attestation = await startRegistration({ optionsJSON: options });
      debugLog('Step 3: Passkey created in browser. Now sending to server for verification...');

      const verificationRes = await fetch(`/sveltepress/auth/register/verify-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, data: attestation }),
      });

      // SvelteKit's fetch will automatically follow the redirect from the server.
      // If the fetch completes without throwing an error, it means the redirect
      // was successful and the browser is already navigating.
      debugLog('Step 4: Verification sent. verificationRes:',verificationRes);
      if (!verificationRes.ok) {
        const errorData = await verificationRes.json();
        throw new Error(errorData.error || 'Could not verify registration.');
      }
      document.location.href='/sveltepress/auth/login?username='+encodeURIComponent(username)+'&verified=true';
    } catch (err: any) {
      isLoading = false;
      if (err.name === 'InvalidStateError') {
        errorMsg =
          'This authenticator has likely already been registered. Try logging in.';
      } else {
        errorMsg = `Could not create passkey: ${err.message}`;
      }
      alert(`An error occurred: ${errorMsg}`);
      console.error(err);
    } finally {
      // This will only run if an error occurs, re-enabling the button.
      isLoading = false;
    }
  }
</script>

<div class="auth-container">
  <h1>
    {#if isVerifiedFlow}
      Create Your Passkey
    {:else}
      Register for SveltePress
    {/if}
  </h1>
  {#if successMsg}
    <p class="success">{successMsg}</p>
  {/if}

  <form on:submit|preventDefault={handleRegister}>
    <label>
      Username (Email)
      <input
        type="text"
        bind:value={username}
        placeholder="Enter username"
        disabled={isLoading || !isVerifiedFlow}
        readonly={isVerifiedFlow}
      />
    </label>
    <button type="submit" disabled={isLoading || !isVerifiedFlow}>
      {#if isLoading}
        Creating Passkey...
      {:else if isVerifiedFlow}
        Create Passkey
      {:else}
        Register
      {/if}
    </button>
  </form>

  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  {#if !isVerifiedFlow}
    <a href="/sveltepress/auth/login">Already have an account? Login</a>
  {/if}
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
    max-width: 350px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(100%, 300px);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
    font-size: 0.9rem;
    color: #ccc;
  }
  input {
    background-color: #3c3c3c;
    color: #f0f0f0;
    border: 1px solid #555;
    padding: 10px;
    border-radius: 4px;
    font-size: 1rem;
  }
  input[readonly] {
    background-color: #2a2a2a;
    color: #888;
    cursor: not-allowed;
  }
  input::placeholder {
    color: #888;
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