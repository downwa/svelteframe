// FILE: src/routes/sveltepress/lib/server/email.ts
import * as Brevo from '@getbrevo/brevo';
//import { MAIL_SERVER, MAIL_PORT, MAIL_USER, MAIL_PASS, BREVO_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { User } from './auth';
import { debugLog } from './debug';
import nodemailer from 'nodemailer';
import { convert } from 'html-to-text';
//import { render } from 'svelte-email';
import { render } from 'svelte/server';
import VerifyAccount from '../assets/templates/VerifyAccountEmail.svelte';

if(env.BREVO_API_KEY) {
  // Configure the Brevo API client
  const api = new Brevo.TransactionalEmailsApi();
  api.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    env.BREVO_API_KEY
  );
}

/**
 * Sends a verification email to a new user.
 * @param user The user object containing their email and display name.
 * @param verifyUrl The unique verification URL they need to click.
 */
export async function sendVerificationEmail(user: User, verifyUrl: string) {
  const { body } = render(
    VerifyAccount, { props: { user, verifyUrl } }
  );
  // Use body as `html` property in your SMTP or Brevo send logic
    // 2. Generate plain text from HTML, preserving HTML <a> tags in text
  const text = convert(body, {
      selectors: [
          {
              selector: 'a',
              format: 'inlineTag' // Leaves the HTML tag in the text output
          }
      ],
      wordwrap: false,
      preserveNewlines: true
  });

  const SUBJECT = 'Confirm Your SveltePress Account';

  try {
      if (env.MAIL_SERVER) {
        // --- SMTP via Nodemailer ---
        const transporter = nodemailer.createTransport({
            host: env.MAIL_SERVER,
            port: parseInt(env.MAIL_PORT ?? '587'),
            secure: false,
            auth: {
                user: env.MAIL_USER,
                pass: env.MAIL_PASS
            }
        });
        await transporter.sendMail({
            from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS || env.MAIL_USER}>`,
            to: user.username,
            subject: SUBJECT,
            text,
            html: body
        });
        debugLog('Verification email sent to', user.username, text);
        return { success: true };
      } else if (env.BREVO_API_KEY) {
          // --- BREVO ---
          const api = new Brevo.TransactionalEmailsApi();
          api.setApiKey(
            Brevo.TransactionalEmailsApiApiKeys.apiKey,
            env.BREVO_API_KEY
          );
          // const api = new TransactionalEmailsApi();
          // api.setApiKey(env.BREVO_API_KEY);

          const smtpEmail = new Brevo.SendSmtpEmail();
          //const smtpEmail = new SendSmtpEmail();
          smtpEmail.to = [{ email: user.username, name: user.displayName }];
          smtpEmail.sender = {
              email: env.EMAIL_FROM_ADDRESS,
              name: env.EMAIL_FROM_NAME
          };
          smtpEmail.subject = SUBJECT;
          smtpEmail.htmlContent = body;
          smtpEmail.textContent = text;

          await api.sendTransacEmail(smtpEmail);
          debugLog('Verification email sent to', user.username, text);
          return { success: true };
      } else {
        throw new Error('No MAIL_SERVER or BREVO_API_KEY configured.');
      }
  } catch (error) {
      return { success: false, error: String(error) };
  }
}