import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url }) => {
    console.log('[register endpoint] URL', url.href);
    const rpId = new URL(url).hostname;  // "your-deployed-domain.com"
    const rpOrigin = new URL(url).origin; // "https://your-deployed-domain.com"

    const options = {
        publicKey: {
            rp: {
                name: 'SvelteKit Passkey Demo',
                // RP ID MUST be just host (no path, no protocol)
                id: rpId
            },
            user: {
                id: 'dXNlcl9pZA', // "user_id" base64url
                name: 'user@example.com',
                displayName: 'Demo User'
            },
            challenge: 'c29tZV9yYW5kb21fY2hhbGxlbmdl',
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -35 },
                { type: 'public-key', alg: -257 }
            ],
            supportedAlgorithmIDs: [-7, -35, -257], // ES256, ES384, RS256
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',  // stronger than 'preferred'
                //authenticatorAttachment: 'platform'  // ← THIS forces Google Password Manager
            },
            extensions: {
                prf: {
                    eval: {
                        first: 'bXlzYWx0Nzg5MDEyMzQ1Nm15c2FsdDc4OTAxMjM0NTY' // "mysalt7890123456mysalt7890123456" in base64url
                    }
                }
            }
        }
    };

    console.log('[register endpoint] returning options', options);

    return new Response(JSON.stringify(options), {
        headers: { 'Content-Type': 'application/json' }
    });
};
