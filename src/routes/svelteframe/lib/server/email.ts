// FILE: src/routes/svelteframe/lib/server/email.ts
import { env } from '$env/dynamic/private';
import type { User } from './auth';
import { debugLog } from './debug';
import { render } from 'svelte/server';
import { convert } from 'html-to-text';

// Default template for account verification
import VerifyAccount from '../assets/templates/VerifyAccountEmail.svelte';

const DEFAULT_SUBJECT = 'Confirm Your SvelteFrame Account';

// Graph token cache
let graphToken: string | null = null;
let tokenExpiry = 0;

// Get OAuth token for Graph (caches for ~1hr)
async function getGraphToken(): Promise<string> {
  if (graphToken && Date.now() < tokenExpiry) {
    return graphToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${env.MSGRAPH_TENID}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.MSGRAPH_APPID!,
      client_secret: env.MSGRAPH_SECRET!,
      scope: 'https://graph.microsoft.com/.default'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Graph token failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  graphToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000 * 0.9); // 90% of expiry
  return graphToken;
}

// Send via Microsoft Graph (replaces Nodemailer)
async function sendGraphEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const token = await getGraphToken();
  const sender = env.MAIL_USER!; // fileserver@choggiung.com

  const message = {
    message: {
      subject: params.subject,
      body: { 
        contentType: 'HTML' as const, 
        content: params.html 
      },
      toRecipients: [{ 
        emailAddress: { address: params.to } 
      }]
    },
    saveToSentItems: true
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph send failed: ${res.status} ${err}`);
  }

  return { success: true };
}

/**
 * Generic email sender using a Svelte template component.
 *
 * @param user The user object containing their email and display name.
 * @param props Props passed into the Svelte email component.
 * @param options Optional overrides for subject and template.
 */
export async function sendTemplatedEmail<
  TProps extends Record<string, unknown> = Record<string, unknown>
>(user: User, props: TProps, options?: {
  subject?: string;
  template?: typeof VerifyAccount;
}) {
  const Template = options?.template ?? VerifyAccount;
  const subject = options?.subject ?? DEFAULT_SUBJECT;

  const { body } = render(Template, { props });
  const text = convert(body, {
    selectors: [
      {
        selector: 'a',
        format: 'inlineTag'
      }
    ],
    wordwrap: false,
    preserveNewlines: true
  });

  try {
    // Check Graph env vars first
    if (!env.MSGRAPH_TENID || !env.MSGRAPH_APPID || 
        !env.MSGRAPH_SECRET || !env.MAIL_USER) {
      throw new Error('MSGRAPH_TENID, MSGRAPH_APPID, MSGRAPH_SECRET, or MAIL_USER not configured');
    }

    await sendGraphEmail({ to: user.username, subject, html: body, text });
    debugLog('Graph email sent to', user.username, subject);
    return { success: true };
  } catch (error) {
    debugLog('Error sending Graph email', String(error));
    return { success: false, error: String(error) };
  }
}

/**
 * Backwards-compatible helper for the original verification email.
 *
 * @param user The user object containing their email and display name.
 * @param verifyUrl The unique verification URL they need to click.
 */
export async function sendVerificationEmail(user: User, verifyUrl: string) {
  return sendTemplatedEmail(
    user,
    { user, verifyUrl },
    {
      subject: DEFAULT_SUBJECT,
      template: VerifyAccount
    }
  );
}
