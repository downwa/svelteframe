import { streamText, generateText, convertToModelMessages } from 'ai';
import { createOpenAI } from "@ai-sdk/openai";
import { OPENROUTER_API_KEY } from "$env/static/private";
import { PUBLIC_SITE_URL, PUBLIC_SITE_NAME } from "$env/static/public";
import fs from 'node:fs/promises';
import path from 'path';
import { hasPermission } from '$routes/svelteframe/lib/client/access';
import { writeFileAtomic, createBackup } from '$routes/svelteframe/lib/server/file-utils';
import { getFullPageContext, ensureFlexibleMessages, getAllPageFiles } from './context-helper';
import { AI_MODELS } from '$routes/svelteframe/lib/AImodels';

// Configure OpenRouter as the provider
const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
});

// Helper for quiet debug logging
async function writeDebugInfo(data: any) {
    try {
        const debugPath = path.resolve('data/lastAIresult.json');
        await fs.writeFile(debugPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.warn('Failed to write debug info:', e);
    }
}

export const POST = async ({ request, locals }) => {
    const req = await request.json();
    const { messages, data } = req;

    console.log('voice-edit: req received: ', req?.messages?.[0]?.parts?.[0]?.text);
    //console.dir(req, { depth: null, colors: true });

    // Robust path detection: check data.path, top-level path (from body transport), or context tag
    let pagePath = data?.path || req.path;

    if (!pagePath && messages[0]?.parts?.[0]?.text) {
        const text = messages[0].parts[0].text;
        const contextMatch = text.match(/\[VOICE_EDIT_CONTEXT:\s*(.*?)\]/);
        if (contextMatch) {
            pagePath = contextMatch[1];
        }
    }

    // Read user's preferred model from their preferences
    let selectedModelId = AI_MODELS[0].id;
    if (locals.user?.preferences?.voiceEditModel) {
        selectedModelId = locals.user.preferences.voiceEditModel;
    }

    if (!locals.user) return new Response('Unauthorized', { status: 401 });
    if (!pagePath) {
        console.error('Critical Error: Missing page path in voice-edit API call');
        return new Response('Missing page path', { status: 400 });
    }

    // Clean up the first message's context tag so the AI sees clean history
    if (messages[0]?.parts?.[0]?.text) {
        messages[0].parts[0].text = messages[0].parts[0].text.replace(/\[VOICE_EDIT_CONTEXT:.*?\]\nUSER_REQUEST:\s*/, "");
    }

    console.log('voice-edit: action=', data?.action || 'chat', 'path=', pagePath);
    if (data?.action === 'execute') {
        // 1. Gather fresh context (including layout)
        const contextMap = await getFullPageContext(pagePath, locals.user);

        let codeStr = "\nSOURCE CODE CONTEXT:\n";
        for (const [f, content] of Object.entries(contextMap)) {
            codeStr += `\n[FILE: ${f}]\n${content}\n[/FILE]\n`;
        }

        // 2. Flatten messages
        const modelMessages = await convertToModelMessages(ensureFlexibleMessages(messages) as any);

        console.log('--- Calling generateText (execution) ---', JSON.stringify(modelMessages));
        //await writeDebugInfo({ type: 'execute_request', modelMessages });

        // 3. Generate changes
        const { text } = await generateText({
            model: openrouter(selectedModelId),
            system: `You are a system-level file editor.
The user has authorized the following changes based on the source code context below. 

RULES:
1. You may modify HTML and CSS in .svelte files
2. You may modify imported constants, data arrays, and configuration values if needed for appearance changes
3. Do NOT modify function logic, event handlers, or reactive statements in <script> tags
4. If changing the appearance requires modifying an imported constant (e.g., colors, text, image paths, data arrays), you MAY do so

Output the FULL updated source code for EACH file you modify. 
Format: [FILE: absolute_path]...[/FILE].
Do NOT explain. Do NOT give advice. Do NOT use markdown code blocks outside of the FILE tags.

${codeStr}`,
            messages: modelMessages as any,
            headers: {
                "HTTP-Referer": PUBLIC_SITE_URL,
                "X-Title": PUBLIC_SITE_NAME,
            },
        });

        console.log('--- GenerateText results generated ---');
        await writeDebugInfo({ type: 'execute_result', text });
        console.log('PERFORMING CHANGES...');

        // 4. Cleanup AI output and apply changes (with backups and permission checks)
        // Strip outer markdown blocks if present
        let cleanText = text.trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
        }

        // More resilient regex: capture everything until the next [FILE: tag, explicit [/FILE], or end of string
        const fileBlockRegex = /\[FILE:\s*(.*?)\]\n?([\s\S]*?)(?=\[FILE:|\[\/FILE\]|$)/g;
        let match;
        const modifiedFiles: string[] = [];

        while ((match = fileBlockRegex.exec(cleanText)) !== null) {
            const targetPath = match[1].trim();
            let newContent = match[2].trim();

            // Internal cleanup: strip any markdown code blocks the AI might have nested inside FILE tags
            if (newContent.startsWith('```')) {
                newContent = newContent.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
            }

            console.log(`Processing file block: ${targetPath}`);
            // Resilient path matching: normalize paths to ensure matching despite separator differences
            const matchedKey = Object.keys(contextMap).find(k =>
                path.resolve(k).toLowerCase() === path.resolve(targetPath).toLowerCase()
            );

            console.log(`Matched key: ${matchedKey || 'NONE'}`);

            if (matchedKey) {
                if (!hasPermission(locals.user, matchedKey, 'W')) {
                    console.log(`User ${locals.user.username} does not have permission to write to ${matchedKey}`);
                    continue;
                }

                const originalContent = contextMap[matchedKey];
                console.log(`Original content length: ${originalContent.length}`);
                console.log(`New content length: ${newContent.length}`);

                await createBackup(matchedKey);
                await writeFileAtomic(matchedKey, newContent);
                console.log(`Successfully wrote to ${matchedKey}`);
                modifiedFiles.push(path.basename(matchedKey));
            } else {
                console.warn(`File block found but path not in context: ${targetPath}`);
            }
        }

        return new Response(JSON.stringify({ success: true, modified: modifiedFiles }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    else if (data?.action === 'undo') {
        const filePaths = await getAllPageFiles(pagePath);
        const restoredFiles: string[] = [];
        const oldBackupsFound: string[] = [];
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // 1. First pass: Identify backups and check ages
        const backupsToRestore: { target: string, backup: string }[] = [];

        for (const filePath of filePaths) {
            const dir = path.dirname(filePath);
            const fileName = path.basename(filePath);

            try {
                const files = await fs.readdir(dir);
                const backups = files.filter(f => f.startsWith('backup-') && f.endsWith('_' + fileName)).sort();

                if (backups.length > 0) {
                    const latestBackup = backups[backups.length - 1];
                    const backupFullPath = path.join(dir, latestBackup);

                    const stats = await fs.stat(backupFullPath);
                    if (now - stats.mtimeMs > oneDay) {
                        oldBackupsFound.push(fileName);
                    }

                    backupsToRestore.push({ target: filePath, backup: backupFullPath });
                }
            } catch (e) {
                console.warn(`Failed to find backup for ${filePath}:`, e);
            }
        }

        // 2. Safety check: If old backups found and not confirmed, ask for confirmation
        if (oldBackupsFound.length > 0 && !data?.confirm) {
            return new Response(JSON.stringify({
                success: false,
                status: 'confirm_required',
                message: `The following backups are more than 24h old: ${oldBackupsFound.join(', ')}. Undo anyway?`
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        // 3. Perform restoration and delete the backup file (multilevel undo)
        for (const item of backupsToRestore) {
            try {
                if (!hasPermission(locals.user, item.target, 'W')) continue;

                const content = await fs.readFile(item.backup, 'utf-8');
                await writeFileAtomic(item.target, content);

                // Delete the backup after successful restoration to enable multilevel undo
                await fs.unlink(item.backup);

                restoredFiles.push(path.basename(item.target));
            } catch (e) {
                console.error(`Restoration failed for ${item.target}:`, e);
            }
        }

        return new Response(JSON.stringify({
            success: restoredFiles.length > 0,
            message: restoredFiles.length > 0 ? `Restored: ${restoredFiles.join(', ')}` : 'No backups found'
        }));
    }
    else {
        // DEFAULT ACTION: Chat (Planning)
        const contextMap = await getFullPageContext(pagePath, locals.user);
        let codeStr = "\nSOURCE CODE CONTEXT:\n";
        for (const [f, content] of Object.entries(contextMap)) {
            codeStr += `\n[FILE: ${f}]\n${content}\n[/FILE]\n`;
        }

        const modelMessages = await convertToModelMessages(ensureFlexibleMessages(messages) as any);

        const result = streamText({
            model: openrouter(selectedModelId),
            system: `You are a Web Editor AI. 
            Phase: PLANNING. 
            The source code of the files you can edit is provided below. 
            
            RULES:
            1. You can modify HTML and CSS in .svelte files
            2. You can modify imported constants, data arrays, and configuration values if needed for appearance changes
            3. Do NOT modify function logic, event handlers, or reactive statements in <script> tags
            4. Identify the file(s) to edit and summarize your plan
            5. Do NOT provide code snippets or "copy-paste" advice
            6. Confirm the plan so the user can click "Make it so"
            
            ${codeStr}`,
            messages: modelMessages as any,
            headers: {
                "HTTP-Referer": PUBLIC_SITE_URL,
                "X-Title": PUBLIC_SITE_NAME,
            },
        });

        return result.toUIMessageStreamResponse();
    }
};
