import { promises as fs } from 'fs';
import path from 'path';
import { json } from '@sveltejs/kit';

export async function GET() {
  const templatesDir = 'src/routes/sveltepress/templates';
  try {
    const files = await fs.readdir(templatesDir);
    const templateNames = files
      .filter((file) => file.endsWith('.svelte'))
      .map((file) => file.replace('.svelte', ''));
    return json(templateNames);
  } catch (error) {
    console.error('Could not read templates directory:', error);
    return json([]);
  }
}