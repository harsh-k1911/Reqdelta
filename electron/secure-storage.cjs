class SecureStorageError extends Error {
  constructor() {
    super('Secure storage is unavailable. Unlock your macOS keychain and try again.');
    this.code = 'SECURE_STORAGE_UNAVAILABLE';
  }
}

function createSecureStorage(safeStorage, platform = process.platform) {
  async function checkAvailable() {
    // This project targets macOS; never fall back to an unprotected provider.
    if (platform !== 'darwin' || !await safeStorage.isAsyncEncryptionAvailable()) {
      throw new SecureStorageError();
    }
  }

  return {
    async protect(value) {
      try {
        await checkAvailable();
        return await safeStorage.encryptStringAsync(JSON.stringify(value));
      } catch {
        throw new SecureStorageError();
      }
    },
    async unprotect(bytes) {
      await checkAvailable();
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(bytes));
      const value = JSON.parse(result);
      const replacement = shouldReEncrypt ? await safeStorage.encryptStringAsync(result) : null;
      return { value, replacement };
    },
  };
}

module.exports = { createSecureStorage };
