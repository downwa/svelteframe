// FILE: src/routes/svelteframe/lib/client/crypto.ts

/**
 * Helper to convert ArrayBuffer/Uint8Array to Base64 (browser-compatible).
 */
function bufferToBase64(buffer: Uint8Array | ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Helper to convert Base64 to Uint8Array (browser-compatible).
 */
export function base64ToBuffer(base64: string): Uint8Array {
    // Replace URL-safe characters with standard Base64 characters
    let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if missing
    const pad = standardBase64.length % 4;
    if (pad) {
        standardBase64 += '='.repeat(4 - pad);
    }

    const binary_string = window.atob(standardBase64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

// ============================================================================
// MASTER ENCRYPTION KEY (MEK) FUNCTIONS
// ============================================================================

/**
 * Generates a new Master Encryption Key (MEK).
 * This key is used to encrypt user data and is itself wrapped by PRF or password.
 * 
 * @returns A CryptoKey suitable for encryption/decryption and key wrapping
 */
export async function generateMasterKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable - needed for wrapping
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

/**
 * Exports a CryptoKey to raw bytes for storage/transmission.
 * 
 * @param key - The CryptoKey to export
 * @returns Base64-encoded key bytes
 */
export async function exportKeyAsBase64(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return bufferToBase64(new Uint8Array(exported));
}

/**
 * Imports a CryptoKey from raw bytes.
 * 
 * @param base64Key - Base64-encoded key bytes
 * @returns A CryptoKey
 */
export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
    const keyBytes = base64ToBuffer(base64Key);
    return await window.crypto.subtle.importKey(
        'raw',
        keyBytes.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

// ============================================================================
// PRF-BASED KEY WRAPPING
// ============================================================================

/**
 * Derives a 256-bit AES-GCM key from the PRF output using HKDF.
 * This key is used to wrap/unwrap the MEK.
 * 
 * @param prfOutput - The ArrayBuffer from the WebAuthn PRF extension
 * @returns A CryptoKey suitable for key wrapping
 */
async function deriveKeyFromPRF(prfOutput: ArrayBuffer): Promise<CryptoKey> {
    // Import the PRF output as a raw key material for HKDF
    const baseKey = await window.crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, [
        'deriveKey',
    ]);

    // Derive the actual AES-GCM wrapping key
    const wrappingKey = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: new Uint8Array(), // No salt needed for this simple case
            info: new TextEncoder().encode('SvelteFrame MEK Wrapping Key'), // Domain separation
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false, // not extractable
        ['wrapKey', 'unwrapKey']
    );

    return wrappingKey;
}

/**
 * Wraps (encrypts) the MEK using PRF output.
 * 
 * @param mek - The Master Encryption Key to wrap
 * @param prfOutput - The PRF output from WebAuthn
 * @returns Base64-encoded wrapped key
 */
export async function wrapKeyWithPRF(mek: CryptoKey, prfOutput: ArrayBuffer): Promise<string> {
    const wrappingKey = await deriveKeyFromPRF(prfOutput);

    const wrapped = await window.crypto.subtle.wrapKey('raw', mek, wrappingKey, {
        name: 'AES-GCM',
        iv: new Uint8Array(12), // Zero IV is acceptable for key wrapping with unique keys
    });

    return bufferToBase64(new Uint8Array(wrapped));
}

/**
 * Unwraps (decrypts) the MEK using PRF output.
 * 
 * @param wrappedKeyBase64 - Base64-encoded wrapped key
 * @param prfOutput - The PRF output from WebAuthn
 * @returns The unwrapped Master Encryption Key
 */
export async function unwrapKeyWithPRF(
    wrappedKeyBase64: string,
    prfOutput: ArrayBuffer
): Promise<CryptoKey> {
    const wrappingKey = await deriveKeyFromPRF(prfOutput);
    const wrappedKeyBytes = base64ToBuffer(wrappedKeyBase64);

    const unwrapped = await window.crypto.subtle.unwrapKey(
        'raw',
        wrappedKeyBytes.buffer as ArrayBuffer,
        wrappingKey,
        {
            name: 'AES-GCM',
            iv: new Uint8Array(12),
        },
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    return unwrapped;
}

// ============================================================================
// PASSWORD-BASED KEY WRAPPING
// ============================================================================

/**
 * Derives a key from a password using PBKDF2.
 * 
 * @param password - The user's password
 * @param salt - Salt for key derivation (generate new for wrapping, use existing for unwrapping)
 * @returns The derived wrapping key and the salt used
 */
async function deriveKeyFromPassword(
    password: string,
    salt?: Uint8Array
): Promise<{ wrappingKey: CryptoKey; salt: Uint8Array }> {
    const actualSalt = salt || window.crypto.getRandomValues(new Uint8Array(16));

    // Import password as key material
    const passwordKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    // Derive wrapping key using PBKDF2
    const wrappingKey = await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: actualSalt.buffer as ArrayBuffer,
            iterations: 100000, // High iteration count for security
            hash: 'SHA-256',
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
    );

    return { wrappingKey, salt: actualSalt };
}

/**
 * Wraps (encrypts) the MEK using a password.
 * 
 * @param mek - The Master Encryption Key to wrap
 * @param password - The user's recovery password
 * @returns Object containing the wrapped key and salt (both Base64-encoded)
 */
export async function wrapKeyWithPassword(
    mek: CryptoKey,
    password: string
): Promise<{ wrappedKey: string; salt: string }> {
    const { wrappingKey, salt } = await deriveKeyFromPassword(password);

    const wrapped = await window.crypto.subtle.wrapKey('raw', mek, wrappingKey, {
        name: 'AES-GCM',
        iv: new Uint8Array(12),
    });

    return {
        wrappedKey: bufferToBase64(new Uint8Array(wrapped)),
        salt: bufferToBase64(salt),
    };
}

/**
 * Unwraps (decrypts) the MEK using a password.
 * 
 * @param wrappedKeyBase64 - Base64-encoded wrapped key
 * @param password - The user's recovery password
 * @param saltBase64 - Base64-encoded salt
 * @returns The unwrapped Master Encryption Key
 */
export async function unwrapKeyWithPassword(
    wrappedKeyBase64: string,
    password: string,
    saltBase64: string
): Promise<CryptoKey> {
    const salt = base64ToBuffer(saltBase64);
    const { wrappingKey } = await deriveKeyFromPassword(password, salt);
    const wrappedKeyBytes = base64ToBuffer(wrappedKeyBase64);

    const unwrapped = await window.crypto.subtle.unwrapKey(
        'raw',
        wrappedKeyBytes.buffer as ArrayBuffer,
        wrappingKey,
        {
            name: 'AES-GCM',
            iv: new Uint8Array(12),
        },
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    return unwrapped;
}

// ============================================================================
// DATA ENCRYPTION/DECRYPTION (using MEK)
// ============================================================================

/**
 * Encrypts a data object using the MEK.
 * 
 * @param key - The Master Encryption Key
 * @param data - The JSON object to encrypt
 * @returns A Base64 string containing the IV and the ciphertext
 */
export async function encryptData(key: CryptoKey, data: object): Promise<string> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV is standard for AES-GCM
    const encodedData = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        encodedData
    );

    // Prepend the IV to the ciphertext for storage, then Base64 encode
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return bufferToBase64(combined);
}

/**
 * Decrypts a data object using the MEK.
 * 
 * @param key - The Master Encryption Key
 * @param encryptedData - The Base64 string OR Uint8Array (IV + Ciphertext)
 * @returns The decrypted JSON object
 */
export async function decryptData<T>(key: CryptoKey, encryptedData: string | Uint8Array): Promise<T> {
    let combined: Uint8Array;

    if (typeof encryptedData === 'string') {
        combined = base64ToBuffer(encryptedData);
    } else {
        combined = encryptedData;
    }

    // Extract the IV (first 12 bytes) and the ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedData = await window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        ciphertext
    );

    return JSON.parse(new TextDecoder().decode(decryptedData));
}

// ============================================================================
// LEGACY FUNCTIONS (for backward compatibility with old PRF-direct encryption)
// ============================================================================

/**
 * @deprecated Use generateMasterKey + wrapKeyWithPRF instead
 * Derives a 256-bit AES-GCM key from the PRF output using HKDF.
 * @param prfOutput The ArrayBuffer from the WebAuthn PRF extension.
 * @returns A CryptoKey suitable for encryption/decryption.
 */
export async function deriveKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
    // Import the PRF output as a raw key material for HKDF
    const baseKey = await window.crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, [
        'deriveKey',
    ]);

    // Derive the actual AES-GCM encryption key
    const encryptionKey = await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: new Uint8Array(), // No salt needed for this simple case
            info: new TextEncoder().encode('SvelteFrame User Data Encryption'), // Domain separation
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true, // The key can be exported (false is safer, but not strictly needed here)
        ['encrypt', 'decrypt']
    );

    return encryptionKey;
}
