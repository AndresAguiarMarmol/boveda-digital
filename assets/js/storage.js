/**
 * Bóveda Digital — Almacenamiento Local Offline (IndexedDB)
 * Proporciona persistencia 100% offline para documentos cifrados, adjuntos y registros de auditoría.
 */

class VaultStorage {
  constructor() {
    this.dbName = 'BovedaDigitalDB';
    this.version = 1;
    this.db = null;
    this._initPromise = this._init();
  }

  async _init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Almacén de Documentos Cifrados
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('user_id', 'user_id', { unique: false });
          docStore.createIndex('category', 'category', { unique: false });
          docStore.createIndex('expiry_date', 'expiry_date', { unique: false });
          docStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Almacén de Ajustes y Perfil Local
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Almacén de Auditoría de Seguridad
        if (!db.objectStoreNames.contains('audit_log')) {
          const auditStore = db.createObjectStore('audit_log', { keyPath: 'id', autoIncrement: true });
          auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[VaultStorage] Error al inicializar IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getDB() {
    if (!this.db) {
      await this._initPromise;
    }
    return this.db;
  }

  /**
   * Guarda o actualiza un documento cifrado en IndexedDB
   * @param {object} doc 
   */
  async saveDocument(doc) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const request = store.put(doc);

      request.onsuccess = () => resolve(doc);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todos los documentos cifrados de un usuario
   * @param {string} userId 
   * @returns {Promise<Array>}
   */
  async getAllDocuments(userId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene un documento por su ID
   * @param {string} id 
   */
  async getDocument(id) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Elimina un documento por ID
   * @param {string} id 
   */
  async deleteDocument(id) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Guarda una configuración o metadato en almacén 'settings'
   * @param {string} key 
   * @param {any} value 
   */
  async setSetting(key, value) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Lee una configuración del almacén 'settings'
   * @param {string} key 
   */
  async getSetting(key) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Registra un evento de seguridad en el log de auditoría
   */
  async logAuditEvent(userId, action, details = {}) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('audit_log', 'readwrite');
      const store = tx.objectStore('audit_log');
      store.add({
        user_id: userId,
        action,
        details,
        timestamp: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * Limpia toda la base de datos local (Cierre de sesión total / Borrado de bóveda)
   */
  async clearAll() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['documents', 'settings', 'audit_log'], 'readwrite');
      tx.objectStore('documents').clear();
      tx.objectStore('settings').clear();
      tx.objectStore('audit_log').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Instancia global
window.vaultStorage = new VaultStorage();
