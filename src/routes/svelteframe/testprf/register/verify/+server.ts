import type { RequestHandler } from './$types';
import { setStoredCredentialId } from '../../store';

export const POST: RequestHandler = async ({ request, url }) => {
    const body = await request.json();
    console.log('[register verify] url.pathname:', url.pathname);
    console.log('[register verify] body', body);

    // In a real app, verify attestation; here we just remember the credential ID.
    setStoredCredentialId(body.rawId);
    console.log('[register verify] storedCredentialIdBase64url =', body.rawId);

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
