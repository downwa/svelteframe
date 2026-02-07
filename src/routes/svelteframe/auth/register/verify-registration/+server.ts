// FILE: src/routes/svelteframe/auth/register/verify-registration/+server.ts
import { json, error, redirect } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { env } from '$env/dynamic/private';
import {
  getUserByUsername,
  saveUser,
  encodeUsernameForCookie,
  saveEncryptedData,
} from '$routes/svelteframe/lib/server/auth';
import { saveKeyWrapper } from '$routes/svelteframe/lib/server/key-wrappers';
import { debugLog, debugError } from '$routes/svelteframe/lib/server/debug';

export async function POST({ request, cookies }) {
  debugLog('Received request at /verify-registration endpoint.');
  try {
    const payload = await request.json();
    const {
      username,
      data: attestationResponse,
      displayName,
      encryptedDataBlob,
      encryptedDataIV,
      keyWrapper,
    } = payload;
    debugLog('Server received verification payload for:', username);

    // Validate MEK-based payload
    if (!encryptedDataBlob || !encryptedDataIV || !keyWrapper) {
      throw error(400, 'Missing encrypted data or key wrapper');
    }

    const user = await getUserByUsername(username);
    if (!user) {
      throw error(404, 'User not found');
    }

    // --- FIX: Robust User ID handling ---
    // If user lacks an ID (legacy or creation edge case), generate one now.
    if (!user.id) {
      debugLog(`User ${username} is missing an ID. Generating one now.`);
      user.id = crypto.randomUUID();
      await saveUser(user);
    }

    const cookieName = `${encodeUsernameForCookie(username)}_registration_challenge`;
    let expectedChallenge = cookies.get(cookieName);
    if (!expectedChallenge) {
      throw error(400, 'Challenge not found or expired');
    }

    const base64URLChallenge = expectedChallenge
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: base64URLChallenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RPID,
      requireUserVerification: true,
      extensions: ['prf'],
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      debugLog('Registration Info:', registrationInfo);
      const { id, publicKey, counter } = registrationInfo.credential;
      if (!id || !publicKey) {
        console.dir(registrationInfo, { depth: null });
        throw new Error('Registration verification returned incomplete data.');
      }

      // Clean up registration session
      delete user.registrationSessionToken;
      delete user.registrationSessionTimestamp;

      // Set plaintext displayName for initial setup
      user.displayName = displayName;
      if (!user.acl) user.acl = [];

      // Add credential
      user.credentials.push({
        credentialID: id,
        credentialPublicKey: publicKey,
        counter: counter,
        transports: attestationResponse.response.transports,
        supportsPRF: keyWrapper.type === 'PRF',
      });

      // Save user first
      await saveUser(user);
      debugLog('Saved user with credential');

      // Save encrypted data blob
      await saveEncryptedData(username, encryptedDataBlob, encryptedDataIV);
      debugLog('Saved encrypted data blob');

      // Save key wrapper
      const wrapper = {
        id: crypto.randomUUID(),
        type: keyWrapper.type,
        wrappedKeyBytes: keyWrapper.wrappedKeyBytes,
        salt: keyWrapper.salt,
        credentialId: keyWrapper.credentialId,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
      await saveKeyWrapper(username, user.id, wrapper);
      debugLog('Saved key wrapper');

      cookies.delete('registration-ticket', { path: '/' });
      cookies.delete(cookieName, { path: '/' });

      // Redirect to login
      throw redirect(
        303,
        `/svelteframe/auth/login?username=${encodeURIComponent(username)}&verified=true`
      );
    } else {
      throw error(400, 'Could not verify registration');
    }
  } catch (err: any) {
    if (err.status >= 300 && err.status < 400) {
      throw err;
    }
    debugError('Verification Error:', err);
    throw error(500, `Verification failed: ${err.message}`);
  }
}
