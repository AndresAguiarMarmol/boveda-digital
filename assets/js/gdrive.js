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

  /**
   * Ejecuta el motor documental de la skill `archivar-documentos` (SKILL.md)
   * sobre texto OCR y retorna el esquema JSON normalizado para Google Drive.
   * @param {string} ocrText
   * @param {object} [opciones]
   */
  procesarTextoOCR(ocrText, opciones = {}) {
    return procesarTextoOCRParaDrive(ocrText, opciones);
  }
}

/**
 * Elimina tildes/diacríticos y normaliza espacios a guiones bajos para rutas y nombres de archivo en Google Drive (Regla 4 SKILL.md)
 * @param {string} str
 * @returns {string}
 */
function normalizarSegmentoDrive(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Motor de procesamiento documental (Skill: `archivar-documentos` v1.0.0 — .agents/skills/sdd/SKILL.md)
 * Recibe texto no estructurado procedente de OCR y genera el esquema JSON estricto
 * para normalizar su almacenamiento en Google Drive.
 *
 * @param {string} ocrText Texto procedente de OCR (PDF, recibo, factura, contrato, etc.)
 * @param {object} [opciones] Opciones adicionales ({ ext: 'pdf', fechaFallback: 'YYYY-MM-DD' })
 * @returns {{
 *   tipo_documento: string,
 *   categoria: string,
 *   emisor: string,
 *   fecha_emision: string,
 *   monto_total: number,
 *   moneda: string,
 *   folio: string|null,
 *   nombre_archivo: string,
 *   ruta_drive: string
 * }}
 */
function procesarTextoOCRParaDrive(ocrText = '', opciones = {}) {
  const raw = String(ocrText || '').trim();
  const lower = raw.toLowerCase();
  const ext = String(opciones.ext || 'pdf').replace(/^\.+/, '').toLowerCase() || 'pdf';

  // 1. Detectar tipo_documento: "factura | boleta | contrato | comprobante | otro"
  let tipo_documento = 'otro';
  if (/\bfactura\b/i.test(raw)) {
    tipo_documento = 'factura';
  } else if (/\bboleta\b/i.test(raw)) {
    tipo_documento = 'boleta';
  } else if (/\b(contrato|arriendo|alquiler|escritura|anexo)\b/i.test(raw)) {
    tipo_documento = 'contrato';
  } else if (/\b(comprobante|recibo|voucher|transferencia|pago|bono)\b/i.test(raw)) {
    tipo_documento = 'comprobante';
  }

  // 2. Detectar categoria: "servicios | salud | finanzas | compras | vehiculo | hogar | impuestos"
  let categoria = 'servicios';
  if (/\b(clinica|hospital|medic[oa]|salud|isapre|fonasa|farmacia|consulta|laboratorio|dental|bono)\b/i.test(raw)) {
    categoria = 'salud';
  } else if (/\b(sii|impuesto|tesoreria|contribuciones|f29|f22|declaracion)\b/i.test(raw)) {
    categoria = 'impuestos';
  } else if (/\b(vehiculo|automovil|patente|permiso de circulacion|soap|licencia de conducir|revision tecnica|peaje|autopista)\b/i.test(raw)) {
    categoria = 'vehiculo';
  } else if (/\b(arriendo|alquiler|gasto comun|condominio|inmobiliaria|vivienda|hogar|departamento)\b/i.test(raw)) {
    categoria = 'hogar';
  } else if (/\b(banco|tarjeta|credito|estado de cuenta|inversion|transferencia|finanzas|hipotecario|mutuo)\b/i.test(raw)) {
    categoria = 'finanzas';
  } else if (/\b(enel|aguas|metrogas|movistar|entel|wom|vtr|claro|luz|agua|gas|electricidad|internet|telefonia|suministro)\b/i.test(raw)) {
    categoria = 'servicios';
  } else if (/\b(tienda|supermercado|retail|falabella|ripley|paris|mercado libre|compra)\b/i.test(raw)) {
    categoria = 'compras';
  } else if (tipo_documento === 'contrato') {
    categoria = 'hogar';
  } else if (tipo_documento === 'comprobante') {
    categoria = 'finanzas';
  }

  // 3. Regla 1 — Fechas: Formato ISO-8601 (YYYY-MM-DD), priorizando fecha de emisión
  const mesesMap = {
    enero: '01', ene: '01',
    febrero: '02', feb: '02',
    marzo: '03', mar: '03',
    abril: '04', abr: '04',
    mayo: '05', may: '05',
    junio: '06', jun: '06',
    julio: '07', jul: '07',
    agosto: '08', ago: '08',
    septiembre: '09', setiembre: '09', sep: '09',
    octubre: '10', oct: '10',
    noviembre: '11', nov: '11',
    diciembre: '12', dic: '12'
  };

  let fecha_emision = '';
  const isoMatch = raw.match(/\b(20\d{2}|19\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  const dmySlashMatch = raw.match(/\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2}|19\d{2})\b/);
  const textDateMatch = lower.match(/\b(0?[1-9]|[12]\d|3[01])\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(20\d{2}|19\d{2})\b/);

  if (isoMatch) {
    fecha_emision = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  } else if (textDateMatch) {
    const dd = String(textDateMatch[1]).padStart(2, '0');
    const mm = mesesMap[textDateMatch[2]] || '01';
    const yyyy = textDateMatch[3];
    fecha_emision = `${yyyy}-${mm}-${dd}`;
  } else if (dmySlashMatch) {
    const dd = String(dmySlashMatch[1]).padStart(2, '0');
    const mm = String(dmySlashMatch[2]).padStart(2, '0');
    const yyyy = dmySlashMatch[3];
    fecha_emision = `${yyyy}-${mm}-${dd}`;
  } else {
    fecha_emision = opciones.fechaFallback || new Date().toISOString().split('T')[0];
  }

  // 4. Regla 2 — Moneda (CLP | USD | EUR) y Monto limpio
  let moneda = 'CLP';
  if (/\b(usd|us\$|dolares|d[oó]lares)\b/i.test(raw)) {
    moneda = 'USD';
  } else if (/\b(eur|€|euros)\b/i.test(raw)) {
    moneda = 'EUR';
  }

  let monto_total = 0.0;
  const montoLabeledMatch = raw.match(/(?:total(?:\s+a\s+pagar)?|monto(?:\s+total|\s+cancelado|\s+pagado)?|importe|valor|a\s+pagar)\s*[:=]?\s*(?:CLP|USD|EUR|US\$|\$|€)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i)
    || raw.match(/(?:US\$|\$|€)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,}(?:[.,][0-9]{1,2})?)/);

  if (montoLabeledMatch && montoLabeledMatch[1]) {
    let numStr = montoLabeledMatch[1].trim();
    if (moneda === 'CLP') {
      // En CLP los puntos o comas seguidos de 3 dígitos son separadores de miles
      numStr = numStr.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    } else {
      // En USD / EUR si hay puntos de miles y coma decimal o viceversa
      if (numStr.includes(',') && numStr.includes('.')) {
        if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
          numStr = numStr.replace(/\./g, '').replace(',', '.');
        } else {
          numStr = numStr.replace(/,/g, '');
        }
      } else if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
        numStr = numStr.replace(/\./g, '');
      } else {
        numStr = numStr.replace(',', '.');
      }
    }
    const parsedMonto = parseFloat(numStr);
    if (!Number.isNaN(parsedMonto)) {
      monto_total = parsedMonto;
    }
  }

  // 5. Extraer Folio
  let folio = null;
  const folioMatch = raw.match(/(?:folio|boleta(?:\s+electr[oó]nica)?|factura(?:\s+electr[oó]nica)?|comprobante|documento|n[º°o]|nro\.?|#)\s*(?:n[º°o]|nro\.?|#|:)?\s*([A-Z0-9-]{3,20})/i);
  if (folioMatch && folioMatch[1]) {
    const candidate = folioMatch[1].replace(/^-+|-+$/g, '');
    if (/\d/.test(candidate)) {
      folio = candidate;
    }
  }

  // 6. Extraer Emisor
  let emisorRaw = '';
  const emisorLabeled = raw.match(/(?:emisor|raz[oó]n\s+social|entidad|empresa|prestador|proveedor)\s*[:=]\s*([^\n\r|-]{3,60})/i);
  if (emisorLabeled && emisorLabeled[1]) {
    emisorRaw = emisorLabeled[1].trim();
  } else {
    // Tomar el primer segmento de texto representativo antes de ' - ' o salto de línea
    const firstChunk = raw.split(/\r?\n|\s+-\s+/)[0] || '';
    const cleanedChunk = firstChunk
      .replace(/\b(?:S\.?\s*A\.?|S\.?\s*P\.?\s*A\.?|LTDA\.?|E\.?\s*I\.?\s*R\.?\s*L\.?)(?=\s|\.|$)/gi, '')
      .replace(/R\.?U\.?T\.?\s*[0-9.]+-[0-9kK]/gi, '')
      .replace(/[.\s]+$/, '')
      .trim();
    if (cleanedChunk.length >= 3 && cleanedChunk.length <= 65) {
      emisorRaw = cleanedChunk;
    }
  }
  if (!emisorRaw) {
    emisorRaw = 'Entidad Emisora';
  }
  // Normalizar capitalización legible sin tildes para el campo emisor y segmentos
  const emisorClean = emisorRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s.&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const year = (fecha_emision.split('-')[0] || new Date().getFullYear().toString());
  const emisorSlug = normalizarSegmentoDrive(emisorClean) || 'Entidad_Emisora';
  const categoriaSlug = normalizarSegmentoDrive(categoria) || 'servicios';
  const folioSlug = normalizarSegmentoDrive(folio || 'SIN_FOLIO') || 'SIN_FOLIO';

  // Regla 3: Jerarquía Drive: Documentos/[YYYY]/[Categoria]/[Emisor]
  const ruta_drive = `Documentos/${year}/${categoriaSlug}/${emisorSlug}`;
  // Regla 4: Nomenclatura: YYYY-MM-DD_[Categoria]_[Emisor]_[Folio].[ext]
  const nombre_archivo = `${fecha_emision}_${categoriaSlug}_${emisorSlug}_${folioSlug}.${ext}`;

  return {
    tipo_documento,
    categoria,
    emisor: emisorClean,
    fecha_emision,
    monto_total,
    moneda,
    folio,
    nombre_archivo,
    ruta_drive
  };
}

// Exponer instancia global en navegador
if (typeof window !== 'undefined') {
  window.vaultGoogleDrive = new VaultGoogleDrive();
  window.procesarTextoOCRParaDrive = procesarTextoOCRParaDrive;
  window.normalizarSegmentoDrive = normalizarSegmentoDrive;
}

// Exportar para pruebas unitarias en Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VaultGoogleDrive,
    procesarTextoOCRParaDrive,
    normalizarSegmentoDrive
  };
}
