// src/routes/svelteframe/testprf/store.ts
let storedCredentialIdBase64url: string | null = null;

export const getStoredCredentialId = () => storedCredentialIdBase64url;
export const setStoredCredentialId = (id: string | null) => {
    storedCredentialIdBase64url = id;
};
