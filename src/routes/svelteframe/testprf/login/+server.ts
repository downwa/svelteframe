import type { RequestHandler } from './$types';
import { getStoredCredentialId } from '../store';

export const POST: RequestHandler = async ({ url }) => {
    const rpId = new URL(url).hostname;  // "your-deployed-domain.com"
    const rpOrigin = new URL(url).origin; // "https://your-deployed-domain.com"
    console.log('[login endpoint] URL', url.href);

    // Use stored credential ID from register/verify, or fallback to dummy ID
    const storedCredentialIdBase64url = getStoredCredentialId() ?? 'dGVzdF9jcmVkZW50aWFsX2lk';

    const options = {
        publicKey: {
            challenge: 'YW5vdGhlcl9yYW5kb21fY2hhbGxlbmdl',
            timeout: 60000,
            rpId: rpId,
            userVerification: 'required',  // stronger than 'preferred'
            authenticatorAttachment: 'platform',  // ← THIS forces Google Password Manager
            allowCredentials: [
                {
                    type: 'public-key',
                    id: storedCredentialIdBase64url
                }
            ],
            extensions: {
                prf: {
                    eval: {
                        first: 'bXlzYWx0Nzg5MDEyMzQ1Nm15c2FsdDc4OTAxMjM0NTY' // "mysalt7890123456mysalt7890123456" in base64url
                    }
                }
            }
        }
    };

    console.log('[login endpoint] returning options', options);

    return new Response(JSON.stringify(options), {
        headers: { 'Content-Type': 'application/json' }
    });
};
