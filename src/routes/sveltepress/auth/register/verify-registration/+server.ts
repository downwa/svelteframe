// FILE: src/routes/sveltepress/auth/register/verify-registration/+server.ts
import { json, error, redirect } from '@sveltejs/kit'; // Import redirect
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { env } from '$env/dynamic/private';
import {
  getUserByUsername,
  saveUser,
  encodeUsernameForCookie,
} from '$routes/sveltepress/lib/server/auth';
import {
  debugLog,
  debugError,
} from '$routes/sveltepress/lib/server/debug';

export async function POST({ request, cookies }) {
  debugLog('Received request at /verify-registration endpoint.');
  try {
    const payload = await request.json();
    const { username, data: attestationResponse } = payload;
    debugLog('Server received verification payload:', payload);

    const user = await getUserByUsername(username);
    if (!user) {
      throw error(404, 'User not found');
    }

    const cookieName = `${encodeUsernameForCookie(
      username,
    )}_registration_challenge`;
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
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      debugLog('Registration Info:', registrationInfo);
      const { id, publicKey, counter } = registrationInfo.credential;
      if (!id || !publicKey) {
        console.dir(registrationInfo, { depth: null });
        throw new Error('Registration verification returned incomplete data.');
      }

      delete user.registrationSessionToken;
      delete user.registrationSessionTimestamp;
      user.credentials.push({
        credentialID: id,
        credentialPublicKey: publicKey,
        counter: counter,
        transports: attestationResponse.response.transports,
      });

      // Schedule the save operation to happen after a delay.
      // This gives the redirect response time to be sent and processed by the client
      // before the file write triggers the HMR reload.
      // setTimeout(async () => {
      //   debugLog('Server is now saving the user file post-redirect...');
      await saveUser(user);
      //   debugLog('Server has finished saving the user file.');
      // }, 10000); // 10-second delay for debugging

      cookies.delete('registration-ticket', { path: '/' });
      cookies.delete(cookieName, { path: '/' });

      // Throw the redirect immediately.
      throw redirect(
        303,
        `/sveltepress/auth/login?username=${encodeURIComponent(username)}&verified=true`,
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