/**
 * Electron safeStorage 加密适配（README 8.6.2）。
 * 只在 Electron 主进程装配；测试用内存假实现（secrets-store.test.ts）。
 */
import { safeStorage } from 'electron';
import type { SecretEncryptor } from './secrets-store';

export const electronSecretEncryptor: SecretEncryptor = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
};
