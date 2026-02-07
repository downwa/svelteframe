// FILE: src/routes/svelteframe/auth/login/verify-authentication/+server.ts
import { json, error } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import {
  getUserByUsername,
  saveUser,
  createSession,
  encodeUsernameForCookie,
} from '$routes/svelteframe/lib/server/auth';

import {
  debugLog,
  debugError,
} from '$routes/svelteframe/lib/server/debug';

export async function POST({ request, cookies }) {
  const { username, data: assertionResponse, purpose } = await request.json();

  const user = await getUserByUsername(username);
  if (!user) {
    throw error(404, 'User not found');
  }

  // Convert the incoming credential ID from a string to a buffer for comparison
  const assertionResponseIdBuffer = isoBase64URL.toBuffer(assertionResponse.id);

  // Find the authenticator by performing a robust byte-by-byte buffer comparison
  const authenticator = user.credentials.find((cred) => {
    if (cred.credentialID.length !== assertionResponseIdBuffer.length) {
      return false;
    }
    for (let i = 0; i < cred.credentialID.length; i++) {
      if (cred.credentialID[i] !== assertionResponseIdBuffer[i]) {
        return false;
      }
    }
    return true;
  });

  if (!authenticator) {
    throw error(400, 'Could not find authenticator. Comparison failed.');
  }

  const cookieName = `${encodeUsernameForCookie(username)}_login_challenge`;
  let expectedChallenge = cookies.get(cookieName);
  if (!expectedChallenge) {
    throw error(400, 'Challenge not found or expired');
  }

  try {
    const base64URLChallenge = expectedChallenge
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const verificationInputs = {
      response: assertionResponse,
      expectedChallenge: base64URLChallenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RPID,
      credential: {
        id: authenticator.credentialID,
        publicKey: authenticator.credentialPublicKey,
        counter: authenticator.counter,
      },
      requireUserVerification: true,
      extensions: ['prf'],
    };
    debugLog('--- Inputs to verifyAuthenticationResponse ---', verificationInputs);

    const verification = await verifyAuthenticationResponse(verificationInputs);

    debugLog('--- Output of verifyAuthenticationResponse ---', verification);

    const { verified, authenticationInfo } = verification;

    if (verified) {
      // --- FIX: Logic to optionally return encryptedData ---
      // If PRF was performed, we can return the encrypted data (if it exists).
      // If PRF was NOT performed, we just log in successfully but cannot return the encrypted data
      // (which means the client cannot decrypt their profile, but they are authenticated).

      const prfResults = (authenticationInfo as any).prf;
      if (prfResults) {
        debugLog('PRF was performed during authentication.');
      } else {
        debugLog('PRF was NOT performed during authentication.');
      }

      debugLog('✅ Verification successful!');
      authenticator.counter = authenticationInfo.newCounter;
      try {
        await saveUser(user); // Save the updated counter first
        debugLog('✅ saveUser successful!');
      } catch (err) {
        debugError('❌ FAILED to save user after verification:', err);
        throw error(500, 'Failed to save user data after verification.');
      }

      cookies.delete(cookieName, { path: '/' });

      if (purpose === 'addDevice') {
        // This is a step-up auth to add a new device.
        debugLog(`Step-up auth successful for ${username}. Generating add-device token.`);
        const token = crypto.randomBytes(32).toString('hex');
        user.addDeviceToken = token;
        user.addDeviceTokenTimestamp = Date.now();
        await saveUser(user); // Save again with the new token.

        return json({ success: true, addDeviceToken: token });
      } else {
        // This is a normal login.
        debugLog(`Standard login successful for ${username}. Creating session.`);
        const sessionId = await createSession(user.username);
        cookies.set('sessionId', sessionId, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24
        });
        return json({
          success: true,
          encryptedData: user.encryptedDataBlob, // Return the blob
          iv: user.encryptedDataIV // Return the IV explicitly
        });
      }
    } else {
      debugError('❌ SILENT FAILURE: verification.verified was false.');
      throw error(400, 'Authentication verification failed.');
    }
  } catch (err: any) {
    debugError('Verification Error:', err);
    throw error(500, `Verification failed: ${err.message}`);
  }
}
