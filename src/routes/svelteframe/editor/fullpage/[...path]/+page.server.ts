import { error } from '@sveltejs/kit';
import path from 'path-browserify';

export async function load({ params, locals }) {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    const hasAnyPermission =
        user.permissions?.canEditHtml ||
        user.permissions?.canEditProps ||
        user.permissions?.canEditStyle ||
        user.permissions?.canEditSource;

    if (!hasAnyPermission) {
        console.log('User has no permissions', user.permissions);
        throw error(403, 'Forbidden');
    }

    const filePath = params.path;
    if (!filePath) {
        throw error(400, 'File path is required');
    }

    return {
        filePath,
        user
    };
}
