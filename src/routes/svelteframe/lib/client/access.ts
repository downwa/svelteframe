import type { User } from '$routes/svelteframe/lib/server/auth';


export function normalizePath(p: string): string {
    if (p.startsWith('virtual:svelteframe/')) {
        // Treat virtual svelteframe features as children of the svelteframe route for ACL inheritance
        return (
            '/routes/svelteframe/__virtual__/' +
            p.substring('virtual:svelteframe/'.length)
        );
    }
    if (p.startsWith('virtual:')) return p; // Other virtual paths (if any) stay as is

    let norm = p.replace(/\\/g, '/');
    if (norm.startsWith('src/')) {
        norm = norm.substring(3);
    }
    if (!norm.startsWith('/')) {
        norm = '/' + norm;
    }
    return norm;
}

export function hasPermission(
    user: User,
    targetPath: string,
    requiredPermission: 'R' | 'W'
): boolean {
    //console.log('checking permission for', targetPath);
    if (!user?.acl) return false;
    const normalizedTargetPath = normalizePath(targetPath);
    let hasRead = false;
    let hasWrite = false;

    for (const acl of user.acl) {
        if (acl.permission !== 'D') continue;
        const normalizedAclPath = normalizePath(acl.path);
        const isDirectoryRule = normalizedAclPath.endsWith('/');
        if (isDirectoryRule) {
            if (normalizedTargetPath.startsWith(normalizedAclPath)) return false;
        } else {
            if (normalizedTargetPath === normalizedAclPath) return false;
        }
    }
    for (const acl of user.acl) {
        const normalizedAclPath = normalizePath(acl.path);
        const isDirectoryRule = normalizedAclPath.endsWith('/');
        let match = false;
        if (isDirectoryRule) {
            if (normalizedTargetPath.startsWith(normalizedAclPath)) match = true;
        } else {
            if (normalizedTargetPath === normalizedAclPath) match = true;
        }
        if (match) {
            if (acl.permission === 'W') hasWrite = true;
            if (acl.permission === 'R') hasRead = true;
        }
    }
    if (requiredPermission === 'W') return hasWrite;
    if (requiredPermission === 'R') return hasWrite || hasRead;
    return false;
}

