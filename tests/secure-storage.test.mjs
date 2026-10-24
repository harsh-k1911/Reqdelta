import { describe, expect, it, vi } from 'vitest';
import storageModule from '../electron/secure-storage.cjs';

const { createSecureStorage } = storageModule;
const nativeStorage = () => ({
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async () => Buffer.from('native ciphertext')),
  decryptStringAsync: vi.fn(async () => ({ result: '{"version":1}', shouldReEncrypt: false })),
});

describe('macOS secure storage adapter', () => {
  it('serializes into the native encryptor and deserializes its decrypted result', async () => {
    const native = nativeStorage();
    const storage = createSecureStorage(native, 'darwin');
    expect(await storage.protect({ version: 1 })).toEqual(Buffer.from('native ciphertext'));
    expect(native.encryptStringAsync).toHaveBeenCalledWith('{"version":1}');
    const result = await storage.unprotect(new Uint8Array([1, 2, 3]));
    expect(native.decryptStringAsync).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(result).toEqual({ value: { version: 1 }, replacement: null });
  });

  it('refuses writes when macOS protection is unavailable and never uses a plaintext fallback', async () => {
    const native = nativeStorage();
    native.isAsyncEncryptionAvailable.mockResolvedValue(false);
    const storage = createSecureStorage(native, 'darwin');
    await expect(storage.protect({ secret: 'do not expose this' })).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
    await expect(storage.unprotect(Buffer.from('ciphertext'))).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
    expect(native.encryptStringAsync).not.toHaveBeenCalled();
    expect(native.decryptStringAsync).not.toHaveBeenCalled();
  });

  it('does not enable this macOS-only feature on an unreviewed platform', async () => {
    const native = nativeStorage();
    await expect(createSecureStorage(native, 'linux').protect({})).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
    expect(native.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('replaces native encryption errors with a message that does not repeat the request', async () => {
    const native = nativeStorage();
    native.encryptStringAsync.mockRejectedValue(new Error('secret from native error'));
    await expect(createSecureStorage(native, 'darwin').protect({})).rejects.toThrow('Secure storage is unavailable. Unlock your macOS keychain and try again.');
  });

  it('produces replacement ciphertext when the native decryptor requests key rotation', async () => {
    const native = nativeStorage();
    native.decryptStringAsync.mockResolvedValue({ result: '{"version":1}', shouldReEncrypt: true });
    const result = await createSecureStorage(native, 'darwin').unprotect(Buffer.from('old ciphertext'));
    expect(native.encryptStringAsync).toHaveBeenCalledWith('{"version":1}');
    expect(result.replacement).toEqual(Buffer.from('native ciphertext'));
  });
});
