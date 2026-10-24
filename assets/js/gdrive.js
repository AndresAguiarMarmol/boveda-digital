/**
 * gdrive.js — Integración de Respaldo y Sincronización con Google Drive (Zero-Knowledge)
 * 
 * Permite almacenar y restaurar copias de seguridad de la Bóveda directamente en
 * Google Drive del usuario sin exponer documentos en texto claro (únicamente
 * payloads cifrados con AES-256-GCM y hashes SHA-256).
 */

class VaultGoogleDrive {
  constructor() {
    this.clientId = '';
    this.accessToken = null;
    this.tokenClient = null;
    this.tokenExpiry = 0;
    this.isConnected = false;
    this.lastBackupTime = null;
    this.backupFileName = 'boveda_digital_backup.json';
    this.appFolder = 'drive.file'; // Scope mínimo: solo archivos creados por esta app
    this.autoSyncEnabled = true; // Sincronización automática activada por defecto al conectar
    this.isSyncing = false;
    this._autoSyncTimer = null;
  }

  /**
   * Inicializa la configuración desde IndexedDB
   */
  async init() {
    if (!window.vaultStorage) return;
    try {
      this.clientId = (await window.vaultStorage.getSetting('gdrive_client_id')) || '';
      this.lastBackupTime = await window.vaultStorage.getSetting('gdrive_last_backup');
      const savedToken = await window.vaultStorage.getSetting('gdrive_token');
      const savedExpiry = await window.vaultStorage.getSetting('gdrive_token_expiry');
      const savedAutoSync = await window.vaultStorage.getSetting('gdrive_auto_sync');

      if (savedAutoSync !== null && savedAutoSync !== undefined) {
        this.autoSyncEnabled = Boolean(savedAutoSync);
      }

      if (savedToken && savedExpiry && Date.now() < Number(savedExpiry)) {
        this.accessToken = savedToken;
        this.tokenExpiry = Number(savedExpiry);
        this.isConnected = true;
      }
    } catch (err) {
      console.warn('[GoogleDrive] Error al cargar configuración previa:', err);
    }
  }

  /**
   * Habilita o deshabilita la sincronización automática con Google Drive
   * @param {boolean} enabled
   */
  async setAutoSync(enabled) {
    this.autoSyncEnabled = Boolean(enabled);
    if (window.vaultStorage) {
      await window.vaultStorage.setSetting('gdrive_auto_sync', this.autoSyncEnabled);
    }
  }

  /**
   * Actualiza el Client ID de Google OAuth
   * @param {string} clientId 
   */
  async setClientId(clientId) {
    this.clientId = (clientId || '').trim();
    if (window.vaultStorage) {
      await window.vaultStorage.setSetting('gdrive_client_id', this.clientId);
    }
    this.tokenClient = null; // Re-inicializar token client
  }

  /**
   * Conecta con Google Drive usando Google Identity Services (GIS)
   * @param {{silent?: boolean, prompt?: string}} [options]
   * @returns {Promise<boolean>}
   */
  async connect(options = {}) {
    // Si ya existe token válido
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      this.isConnected = true;
      return true;
    }

    const promptMode = options.silent ? '' : (options.prompt || 'consent');

    // Comprobar si Google Identity Services está cargado
    if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.oauth2) {
      if (!this.clientId) {
        throw new Error('Por favor ingresa tu Google OAuth Client ID en la configuración.');
      }

      return new Promise((resolve, reject) => {
        try {
          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: async (resp) => {
              if (resp.error) {
                this.isConnected = false;
                reject(new Error(resp.error_description || resp.error));
                return;
              }

              this.accessToken = resp.access_token;
              this.tokenExpiry = Date.now() + (Number(resp.expires_in) * 1000);
              this.isConnected = true;

              if (window.vaultStorage) {
                await window.vaultStorage.setSetting('gdrive_token', this.accessToken);
                await window.vaultStorage.setSetting('gdrive_token_expiry', this.tokenExpiry);
              }
              resolve(true);
            }
          });

          this.tokenClient.requestAccessToken({ prompt: promptMode });
        } catch (err) {
          reject(err);
        }
      });
    }

    // Modo Demostración / Sandbox Local si no hay conexión externa de Google
    return new Promise((resolve) => {
      setTimeout(async () => {
        this.accessToken = 'mock_gdrive_token_' + Date.now();
        this.tokenExpiry = Date.now() + 3600000;
        this.isConnected = true;
        if (window.vaultStorage) {
          await window.vaultStorage.setSetting('gdrive_token', this.accessToken);
          await window.vaultStorage.setSetting('gdrive_token_expiry', this.tokenExpiry);
        }
        resolve(true);
      }, 600);
    });
  }

  /**
   * Desconecta la cuenta de Google Drive
   */
  async disconnect() {
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.isConnected = false;
    if (this._autoSyncTimer) {
      clearTimeout(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
    if (window.vaultStorage) {
      await window.vaultStorage.setSetting('gdrive_token', null);
      await window.vaultStorage.setSetting('gdrive_token_expiry', null);
    }
  }

  /**
   * Dispara una sincronización automática en segundo plano debounced (1.5s)
   * hacia Google Drive sin bloquear la interfaz.
   * @param {string} userId
   * @param {string} reason
   */
  triggerAutoSync(userId, reason = 'auto') {
    if (!this.isConnected || !this.autoSyncEnabled) {
      return;
    }

    if (this._autoSyncTimer) {
      clearTimeout(this._autoSyncTimer);
    }

    this._autoSyncTimer = setTimeout(async () => {
      try {
        this.isSyncing = true;
        if (window.bovedaApp) {
          window.bovedaApp.updateGoogleDriveUI('syncing');
        }

        const res = await this.uploadBackup(userId);
        this.isSyncing = false;

        if (window.bovedaApp) {
          window.bovedaApp.updateGoogleDriveUI('synced');
          console.log(`[GoogleDrive] Sincronización automática exitosa (${reason}): ${res.docsCount} documentos`);
        }
      } catch (err) {
        this.isSyncing = false;
        console.warn(`[GoogleDrive] Aviso en sincronización automática (${reason}):`, err.message);
        if (window.bovedaApp) {
          window.bovedaApp.updateGoogleDriveUI('error');
        }
      }
    }, 1500);
  }

  /**
   * Sube el paquete de respaldo cifrado Zero-Knowledge a Google Drive
   * @param {string} userId 
   * @returns {Promise<{success: boolean, timestamp: string}>}
   */
  async uploadBackup(userId) {
    if (!this.isConnected || !this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.connect({ silent: true });
    }

    if (!window.vaultStorage) {
      throw new Error('Almacenamiento local no disponible');
    }

    // 1. Exportar datos cifrados locales (AES-256-GCM + IVs + gavetas + Salt Zero-Knowledge)
    const salt = window.vaultAuth?.salt || await window.vaultStorage.getSetting('userSalt') || '';
    const pinHash = await window.vaultStorage.getSetting('vaultPinHash_' + (window.vaultAuth?.currentUser?.email || 'default')) || '';
    const backupData = await window.vaultStorage.exportBackupData(userId, salt, pinHash);
    const backupJson = JSON.stringify(backupData, null, 2);

    // 2. Si estamos en modo real con Google API
    if (this.accessToken && !this.accessToken.startsWith('mock_gdrive_')) {
      const existingFileId = await this._findBackupFileId();

      const metadata = {
        name: this.backupFileName,
        mimeType: 'application/json',
        description: 'Bóveda Digital - Respaldo Cifrado Zero-Knowledge AES-256'
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        backupJson +
        closeDelimiter;

      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (existingFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error Google Drive (${res.status})`);
      }
    } else {
      // Modo Mock / Sandbox: simular guardado persistente local
      localStorage.setItem('mock_gdrive_cloud_file', backupJson);
    }

    this.lastBackupTime = new Date().toISOString();
    if (window.vaultStorage) {
      await window.vaultStorage.setSetting('gdrive_last_backup', this.lastBackupTime);
    }

    return {
      success: true,
      timestamp: this.lastBackupTime,
      docsCount: backupData.documents.length
    };
  }

  /**
   * Descarga el respaldo cifrado desde Google Drive y lo fusiona en IndexedDB
   * @param {string} userId 
   * @returns {Promise<{success: boolean, mergedCount: number}>}
   */
  async downloadAndRestore(userId) {
    if (!this.isConnected || !this.accessToken) {
      await this.connect();
    }

    let backupJson = '';

    if (this.accessToken && !this.accessToken.startsWith('mock_gdrive_')) {
      const fileId = await this._findBackupFileId();
      if (!fileId) {
        throw new Error('No se encontró ningún archivo de respaldo "boveda_digital_backup.json" en tu Google Drive.');
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!res.ok) {
        throw new Error(`Error al descargar archivo desde Google Drive (${res.status})`);
      }

      backupJson = await res.text();
    } else {
      backupJson = localStorage.getItem('mock_gdrive_cloud_file');
      if (!backupJson) {
        throw new Error('No hay respaldo guardado en el almacenamiento simulado de Google Drive. Sube uno primero.');
      }
    }

    const backupData = JSON.parse(backupJson);
    const result = await window.vaultStorage.importBackupData(backupData, userId);

    return {
      success: true,
      mergedCount: result.totalDocs || result.restoredCount || 0,
      timestamp: backupData.metadata?.exported_at || backupData.exported_at,
      backupData
    };
  }

  /**
   * Busca el ID del archivo de respaldo en Google Drive
   * @private
   */
  async _findBackupFileId() {
    const q = encodeURIComponent(`name = '${this.backupFileName}' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }
}

// Exponer instancia global
window.vaultGoogleDrive = new VaultGoogleDrive();
