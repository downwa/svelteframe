export const load = async ({ locals }) => {
    if (locals.user) {
        /*
          virtual:svelteframe/edit/html
          virtual:svelteframe/edit/script-props
          virtual:svelteframe/edit/style
        */
        // const { hasPermission } = await import('$routes/svelteframe/lib/client/access');
        // const canEditAny = hasPermission(locals.user, 'src/routes/svelteframe/', 'W');
        // console.log('canEditAny', canEditAny);
        return {
            user: {
                username: locals.user.username,
                displayName: locals.user.displayName,
                preferences: locals.user.preferences || {},
                permissions: locals.user.permissions,
                acl: locals.user.acl // Include ACLs so client-side checks work
            }
        };
    }
    return { user: null };
};
