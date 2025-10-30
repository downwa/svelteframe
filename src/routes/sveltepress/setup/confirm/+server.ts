import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

const CONFIRMATION_FILE = '0-SveltePress-Admin.confirm';

function ensureEnvVar(env: string, key: string, value: string): string {
  if (!value) return env; // Skip empty values

  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (env.match(pattern)) {
    // Variable already present, leave unchanged
    return env;
  }

  // Append new variable
  if (env.length && !env.endsWith('\n')) env += '\n';
  env += `${key}="${value}"\n`;
  return env;
}

function addValuesToEnv(vars: Record<string, string>) {
  const envPath = path.resolve('.env');
  let env = '';
  if (fs.existsSync(envPath)) {
    env = fs.readFileSync(envPath, 'utf-8');
  }

  for (const [key, value] of Object.entries(vars)) {
    env = ensureEnvVar(env, key, value);
  }

  fs.writeFileSync(envPath, env, 'utf-8');
}

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.formData();
  const uploaded = data.get('file');
  const email = data.get('email')?.toString() ?? '';

  if (!(uploaded && email)) {
    return new Response(JSON.stringify({ message: 'Missing file or email' }), { status: 400 });
  }

  if (!(uploaded instanceof File)) {
    return new Response(JSON.stringify({ message: 'Uploaded value is not a file' }), { status: 400 });
  }

  const confirmationPath = path.resolve(CONFIRMATION_FILE);

  if (!fs.existsSync(confirmationPath)) {
    return new Response(JSON.stringify({ message: 'Confirmation file not found on server' }), { status: 500 });
  }

  const uploadedBuffer = Buffer.from(await uploaded.arrayBuffer());
  const originalBuffer = fs.readFileSync(confirmationPath);

  if (!uploadedBuffer.equals(originalBuffer)) {
    return new Response(JSON.stringify({ message: 'File does not match!' }), { status: 400 });
  }

  // Gather additional variables from form data
  const varsToAdd: Record<string, string> = {
    ADMINUSER: email,
    MAIL_SERVER: data.get('MAIL_SERVER')?.toString().trim() ?? '',
    MAIL_PORT: data.get('MAIL_PORT')?.toString().trim() ?? '',
    MAIL_USER: data.get('MAIL_USER')?.toString().trim() ?? '',
    MAIL_PASS: data.get('MAIL_PASS')?.toString().trim() ?? '',
    EMAIL_FROM_ADDRESS: data.get('EMAIL_FROM_ADDRESS')?.toString().trim() ?? '',
    ADMIN_DISPLAY_NAME: data.get('ADMIN_DISPLAY_NAME')?.toString().trim() ?? '',
    RPID: data.get('RPID')?.toString().trim() ?? '',
    ORIGINPORT: data.get('ORIGINPORT')?.toString().trim() ?? '',
    ORIGIN: data.get('ORIGIN')?.toString().trim() ?? ''
  };

  addValuesToEnv(varsToAdd);

  // Add any other post-setup logic here (e.g., send activation email)

  return new Response(
    JSON.stringify({
      message: `Admin confirmed. Activation link will be sent to ${email}`
    }),
    { status: 200 }
  );
};
