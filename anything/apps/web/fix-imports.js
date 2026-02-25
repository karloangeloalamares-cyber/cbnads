import fs from 'fs/promises';
import path from 'path';

const API_DIR = path.resolve('src/app/api');

async function fixImports(dir) {
    const files = await fs.readdir(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            await fixImports(fullPath);
        } else if (file.name.endsWith('.js') || file.name.endsWith('.ts')) {
            let content = await fs.readFile(fullPath, 'utf8');

            // Calculate relative path from this file to src/app/api
            const relativeToApi = path.relative(path.dirname(fullPath), API_DIR);

            // Replace @/app/api/utils/sql
            content = content.replace(/@\/app\/api\/utils\/sql/g,
                relativeToApi ? `${relativeToApi}/utils/sql`.replace(/\\/g, '/') : './utils/sql');

            // Replace @/app/api/utils/recalculate-advertiser-spend
            content = content.replace(/@\/app\/api\/utils\/recalculate-advertiser-spend/g,
                relativeToApi ? `${relativeToApi}/utils/recalculate-advertiser-spend`.replace(/\\/g, '/') : './utils/recalculate-advertiser-spend');

            // Replace @/app/api/utils/update-advertiser-next-ad
            content = content.replace(/@\/app\/api\/utils\/update-advertiser-next-ad/g,
                relativeToApi ? `${relativeToApi}/utils/update-advertiser-next-ad`.replace(/\\/g, '/') : './utils/update-advertiser-next-ad');

            // Replace @/app/api/utils/send-email
            content = content.replace(/@\/app\/api\/utils\/send-email/g,
                relativeToApi ? `${relativeToApi}/utils/send-email`.replace(/\\/g, '/') : './utils/send-email');

            // Replace @/auth
            const relativeToSrc = path.relative(path.dirname(fullPath), path.resolve('src'));
            content = content.replace(/@\/auth/g, `${relativeToSrc}/auth`.replace(/\\/g, '/'));

            await fs.writeFile(fullPath, content, 'utf8');
        }
    }
}

fixImports(API_DIR).then(() => console.log('Done fixing imports!')).catch(console.error);
