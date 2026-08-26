import { describe, it, expect } from 'vitest';
import { encryptData, decryptData, getEncryptionKey } from './cryptoStorage.ts';

describe('AES-256-GCM Encrypted Storage Utility (محرك تشفير التخزين المحلي)', () => {

  it('should encrypt a mock state object, decrypt it, and return identical data', () => {
    const mockState = {
      inMemoryEmployees: [
        {
          id: 1,
          full_name: 'عمر محمود سلمان محيميد',
          job_title: 'معاون رئيس مبرمجين',
          salary: 910000,
          phone: '07701784629',
          national_id: '111111'
        },
        {
          id: 2,
          full_name: 'حيدر جاسم كاظم',
          job_title: 'رئيس مهندسين',
          salary: 1050000
        }
      ],
      systemSettingsStore: {
        platformName: 'نظام إدارة الموارد البشرية والرواتب',
        monthlyRegularLeaveDays: 2.5
      }
    };

    const originalJson = JSON.stringify(mockState, null, 2);

    // 1. Encrypt the data
    const encryptedPayload = encryptData(originalJson);

    // Verify it is a valid encrypted payload format
    expect(typeof encryptedPayload).toBe('string');
    const parsedPayload = JSON.parse(encryptedPayload);
    expect(parsedPayload.version).toBe('aes-256-gcm');
    expect(parsedPayload.iv).toBeDefined();
    expect(parsedPayload.authTag).toBeDefined();
    expect(parsedPayload.data).toBeDefined();

    // Verify no plain-text employee information is exposed in ciphertext
    expect(encryptedPayload.includes('عمر محمود سلمان')).toBe(false);
    expect(encryptedPayload.includes('07701784629')).toBe(false);
    expect(encryptedPayload.includes('111111')).toBe(false);

    // 2. Decrypt the payload
    const decryptedJson = decryptData(encryptedPayload);
    const restoredState = JSON.parse(decryptedJson);

    // 3. Assert deep equality
    expect(restoredState).toEqual(mockState);
  });

  it('should correctly encrypt and decrypt with a custom 32-byte hex key', () => {
    const customKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const keyBuffer = getEncryptionKey(customKeyHex);

    const testMessage = JSON.stringify({ secret: 'بيانات حساسة خاصة برواتب الموظفين لعام 2026' });

    const cipher = encryptData(testMessage, keyBuffer);
    const decrypted = decryptData(cipher, keyBuffer);

    expect(decrypted).toBe(testMessage);
  });

  it('should gracefully handle legacy unencrypted JSON payload for migration', () => {
    const legacyState = {
      inMemoryEmployees: [{ id: 1, full_name: 'سجل قديم غير مشفر' }],
      genericMemoryStores: {}
    };
    const legacyJson = JSON.stringify(legacyState);

    const result = decryptData(legacyJson);
    expect(result).toBe(legacyJson);
  });

  it('should reject malformed or tampered encrypted payloads', () => {
    const validJson = JSON.stringify({ data: 'test' });
    const encrypted = JSON.parse(encryptData(validJson));

    // Tamper with ciphertext
    encrypted.data = 'abcd' + encrypted.data.slice(4);
    const tamperedPayload = JSON.stringify(encrypted);

    expect(() => {
      decryptData(tamperedPayload);
    }).toThrow();
  });

});
