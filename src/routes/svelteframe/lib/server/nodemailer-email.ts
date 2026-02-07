// FILE: src/routes/svelteframe/lib/server/email.ts
import { env } from '$env/dynamic/private';
import type { User } from './auth';
import { debugLog } from './debug';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer'); // Using Nodemailer only; Brevo is used via its SMTP relay when BREVO_API_KEY is set.

import { convert } from 'html-to-text';
import { render } from 'svelte/server';

// Default template for account verification
import VerifyAccount from '../assets/templates/VerifyAccountEmail.svelte';

const DEFAULT_SUBJECT = 'Confirm Your SvelteFrame Account';

function createTransporter() {
  const isBrevo = Boolean(env.BREVO_SMTP_KEY);

  // Choose host: Brevo relay if using Brevo, otherwise configured MAIL_SERVER
  const host = isBrevo ? 'smtp-relay.brevo.com' : env.MAIL_SERVER;
  if (!host) { throw new Error('No MAIL_SERVER or BREVO_SMTP_KEY configured.'); }

  // Brevo SMTP login is often account email.  secure is false for port 587.
  console.log('Creating email transporter using host:', host, 'user:', env.MAIL_USER,
    'isBrevo:', isBrevo, 'port:', env.MAIL_PORT, 'secure:', false,
    'pass:', isBrevo ? env.BREVO_SMTP_KEY : env.MAIL_PASS);
  return nodemailer.createTransport({
    host,
    port: env.MAIL_PORT ? parseInt(env.MAIL_PORT, 10) : 587,
    secure: false,
    auth: {
      user: env.MAIL_USER,
      pass: isBrevo ? env.BREVO_SMTP_KEY : env.MAIL_PASS
    }
  });
}


// --- NEW: Helper for Brevo API ---
async function sendBrevoApi(
  apiKey: string,
  params: { to: string; subject: string; html: string; text: string }
) {
  const senderEmail = env.EMAIL_FROM_ADDRESS || env.MAIL_USER || 'no-reply@new.choggiung.com';
  const senderName = env.EMAIL_FROM_NAME || 'SvelteFrame';

  debugLog(`Sending via Brevo API from ${senderEmail} to ${params.to} using key ${apiKey}`);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    debugLog('Brevo API Error:', response.status, errText);
    throw new Error(`Brevo API returned ${response.status}: ${errText}`);
  }

  debugLog('Brevo API success');
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

  // --- MODIFIED: Check for Brevo API usage ---
  // The user might put the API key in BREVO_SMTP_KEY or BREVO_API_KEY
  const brevoKey = env.BREVO_API_KEY || env.BREVO_SMTP_KEY;
  const isBrevo = Boolean(brevoKey);

  try {
    if (isBrevo) {
      await sendBrevoApi(brevoKey!, {
        to: user.username,
        subject,
        html: body,
        text
      });
      debugLog('Email sent to', user.username, subject, '(via Brevo API)');
      return { success: true };
    }

    // Fallback to Nodemailer for other SMTP servers
    const transporter = createTransporter();
    const fromAddress = env.EMAIL_FROM_ADDRESS || env.MAIL_USER || 'no-reply@example.com';

    await transporter.sendMail({
      from: `"${env.EMAIL_FROM_NAME || 'SvelteFrame'}" <${fromAddress}>`,
      to: user.username,
      subject,
      text,
      html: body
    });

    debugLog('Email sent to', user.username, subject, '(via SMTP)');
    return { success: true };
  } catch (error) {
    debugLog('Error sending email', String(error));
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
