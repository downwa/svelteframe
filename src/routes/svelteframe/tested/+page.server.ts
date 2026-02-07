import { fail } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';

export const load = async () => {
    // Read the source file
    console.log('Loading file...');
    const filePath = path.resolve('src/lib/components/Management.svelte');
    try {
        //const content = fs.readFileSync(filePath, 'utf-8');
        const content = `
<div data-sp-component="Management">
<!-- Management.svelte -->


<section class="management-section">
  <div class="page-padding-container">
    <div class="content-wrapper">
      <div class="main-grid">
        <div class="left-column">
          <h2>Meet Your Choggiung Management Team</h2>
          <p class="main-text">
            Choggiung Limited is governed by a Board of Directors made up of
            nine shareholders holding voting rights in the corporation. Terms
            of office are three years with terms rotating and three directors
            being elected annually by our shareholders.
          </p>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-number" data-sp-field-type="BARESPAN">9</span>
              <p class="stat-description">
                Board of Directors, with three elected each year
              </p>
            </div>
            <div class="stat-item">
              <span class="stat-number" data-sp-field-type="BARESPAN">400+</span>
              <p class="stat-description">
                Employees including Choggiung Ltd. and our subsidiaries
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
</div>        
        `;
        return { sourceContent: content };
    } catch (e) {
        return { sourceContent: 'Error loading file.' };
    }
};

export const actions = {
    save: async ({ request }) => {
        console.log('Saving file...');
        const data = await request.formData();
        const content = data.get('content') as string;
        console.log('Content: ' + content + '***');
        if (!content) return fail(400, { message: 'No content provided' });

        // Write to the .test file
        console.log('Writing to file...');
        const outputPath = path.resolve('src/lib/components/Management.svelte.test');
        try {
            fs.writeFileSync(outputPath, content, 'utf-8');
            console.log('Saved file with content: ' + content);
            return { success: true };
        } catch (e) {
            console.log('Failed to save file... ' + e);
            return fail(500, { message: 'Failed to write file' });
        }
    }
};
