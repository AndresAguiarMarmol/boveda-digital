/**
 * Bóveda Digital — Módulo Criptográfico Zero-Knowledge
 * Utiliza Web Crypto API nativa del navegador:
 * - PBKDF2 (100,000 iteraciones, HMAC-SHA256) para derivación de claves maestras.
 * - AES-GCM (256 bits) para cifrado simétrico en reposo con Vector de Inicialización (IV) de 96 bits.
 * - SHA-256 para verificación de integridad de datos.
 */

class VaultCrypto {
  constructor() {
    this.subtle = window.crypto && window.crypto.subtle;
    if (!this.subtle) {
      console.warn('[VaultCrypto] Web Crypto API no disponible directamente en este contexto.');
    }
  }

  /**
   * Genera una cadena aleatoria criptográfica o Salt
   * @param {number} lengthBytes 
   * @returns {string} Hexadecimal
   */
  generateRandomSalt(lengthBytes = 16) {
    const array = new Uint8Array(lengthBytes);
    window.crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Genera un Vector de Inicialización único de 12 bytes (96 bits) para AES-GCM
   * @returns {Uint8Array}
   */
  generateIV() {
    const iv = new Uint8Array(12);
    window.crypto.getRandomValues(iv);
    return iv;
  }

  /**
   * Convierte ArrayBuffer a Base64
   */
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Convierte Base64 a Uint8Array
   */
  base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Calcula el hash SHA-256 de una cadena de texto o buffer
   * @param {string|ArrayBuffer} data 
   * @returns {Promise<string>} Hexadecimal
   */
  async sha256(data) {
    let buffer;
    if (typeof data === 'string') {
      buffer = new TextEncoder().encode(data);
    } else {
      buffer = data;
    }
    const hashBuffer = await this.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Deriva una clave AES-GCM de 256 bits a partir de un PIN/Passphrase y un Salt de usuario
   * @param {string} pin - PIN o clave maestra
   * @param {string} saltHex - Salt en hexadecimal único por usuario
   * @returns {Promise<CryptoKey>}
   */
  async deriveKeyFromPin(pin, saltHex) {
    const enc = new TextEncoder();
    const pinBuffer = enc.encode(pin);
    const saltBuffer = new Uint8Array(
      saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    // Importar clave base
    const baseKey = await this.subtle.importKey(
      'raw',
      pinBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Derivar clave AES-GCM de 256 bits
    return await this.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Cifra un objeto JSON o texto plano con AES-GCM
   * @param {CryptoKey|any} arg1 Clave o datos
   * @param {object|string|CryptoKey} arg2 Datos o clave
   * @returns {Promise<{ ciphertext: string, iv: string, checksum: string }>}
   */
  async encrypt(arg1, arg2) {
    let key, data;
    if (arg1 && typeof arg1 === 'object' && (arg1.algorithm || arg1.type === 'secret')) {
      key = arg1;
      data = arg2;
    } else if (arg2 && typeof arg2 === 'object' && (arg2.algorithm || arg2.type === 'secret')) {
      key = arg2;
      data = arg1;
    } else {
      key = arg1;
      data = arg2;
    }

    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    const enc = new TextEncoder();
    const encodedData = enc.encode(jsonString);
    const iv = this.generateIV();

    const encryptedBuffer = await this.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encodedData
    );

    const ciphertext = this.bufferToBase64(encryptedBuffer);
    const ivBase64 = this.bufferToBase64(iv);
    const checksum = await this.sha256(encryptedBuffer);

    return {
      ciphertext,
      iv: ivBase64,
      checksum
    };
  }

  /**
   * Descifra un payload cifrado con AES-GCM (soporta orden polimórfico y objetos documento)
   * @param {CryptoKey|any} arg1 Clave, documento o ciphertext
   * @param {string|CryptoKey} arg2 Ciphertext o Clave
   * @param {string} [arg3] IV en Base64
   * @returns {Promise<any>} Objeto original o texto
   */
  async decrypt(arg1, arg2, arg3) {
    let key, ciphertextBase64, ivBase64;

    // Caso 1: Firma estándar (key, ciphertext, iv)
    if (arg1 && typeof arg1 === 'object' && (arg1.algorithm || arg1.type === 'secret')) {
      key = arg1;
      if (typeof arg2 === 'object' && arg2 !== null) {
        ciphertextBase64 = arg2.encrypted_payload || arg2.encryptedPayload || arg2.ciphertext;
        ivBase64 = arg2.iv || arg3;
      } else {
        ciphertextBase64 = arg2;
        ivBase64 = arg3;
      }
    }
    // Caso 2: Argumentos invertidos (doc o ciphertext, key, [iv])
    else if (arg2 && typeof arg2 === 'object' && (arg2.algorithm || arg2.type === 'secret')) {
      key = arg2;
      if (typeof arg1 === 'object' && arg1 !== null) {
        ciphertextBase64 = arg1.encrypted_payload || arg1.encryptedPayload || arg1.ciphertext;
        ivBase64 = arg1.iv || arg3;
      } else {
        ciphertextBase64 = arg1;
        ivBase64 = arg3;
      }
    } else {
      key = arg1;
      ciphertextBase64 = arg2;
      ivBase64 = arg3;
    }

    if (!ciphertextBase64 || !ivBase64) {
      throw new Error('Parámetros de descifrado insuficientes (ciphertext o IV faltante)');
    }

    const encryptedBytes = this.base64ToBuffer(ciphertextBase64);
    const ivBytes = this.base64ToBuffer(ivBase64);

    const decryptedBuffer = await this.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes
      },
      key,
      encryptedBytes
    );

    const dec = new TextDecoder();
    const decryptedText = dec.decode(decryptedBuffer);

    try {
      return JSON.parse(decryptedText);
    } catch {
      return decryptedText;
    }
  }

  /**
   * Cifra un archivo binario (Blob o File)
   * @param {CryptoKey} key 
   * @param {Blob|File} file 
   * @returns {Promise<{ ciphertext: string, iv: string, checksum: string, mimeType: string, name: string }>}
   */
  async encryptFile(key, file) {
    const arrayBuffer = await file.arrayBuffer();
    const iv = this.generateIV();

    const encryptedBuffer = await this.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      arrayBuffer
    );

    return {
      ciphertext: this.bufferToBase64(encryptedBuffer),
      iv: this.bufferToBase64(iv),
      checksum: await this.sha256(encryptedBuffer),
      mimeType: file.type || 'application/octet-stream',
      name: file.name || 'documento_adjunto'
    };
  }

  /**
   * Descifra un archivo binario devolviendo un Blob listo para previsualizar o descargar
   * @param {CryptoKey} key 
   * @param {string} ciphertextBase64 
   * @param {string} ivBase64 
   * @param {string} mimeType 
   * @returns {Promise<Blob>}
   */
  async decryptFile(key, ciphertextBase64, ivBase64, mimeType = 'application/octet-stream') {
    const encryptedBytes = this.base64ToBuffer(ciphertextBase64);
    const ivBytes = this.base64ToBuffer(ivBase64);

    const decryptedBuffer = await this.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      encryptedBytes
    );

    return new Blob([decryptedBuffer], { type: mimeType });
  }
}

// Instancia global
window.vaultCrypto = new VaultCrypto();
