/**
 * license.js — Sistema de Licenciamiento y Seguridad Offline (Zero-Knowledge)
 * Período de Prueba de 7 días, validación criptográfica de tokens y bloqueo estricto offline.
 * Conforme a AGENTS.md Sección 4 y Spec 003.
 */

// Constantes maestras de licenciamiento
const TRIAL_DAYS = 7;
const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000; // 604,800,000 ms
const LICENSE_SALT = "Halterofilia-SuperSecret-Salt-2026";
const CONTACT_PHONE = "+56933395447";

/**
 * Genera la cadena canónica de solicitud de activación
 * Formato: REQ|<DeviceID>|<correo>
 * @param {string} deviceId 
 * @param {string} email 
 * @returns {string}
 */
function generarCadenaSolicitud(deviceId, email) {
  const dId = (deviceId || 'dev_unknown').trim();
  let mail = (email || '').trim().toLowerCase();
  if (!mail && typeof window !== 'undefined' && window.vaultLicense?.userEmail) {
    mail = window.vaultLicense.userEmail.toLowerCase();
  }
  if (!mail) {
    mail = 'usuario@boveda.com';
  }
  return `REQ|${dId}|${mail}`;
}

/**
 * Computa la firma criptográfica SHA-256 de un payload de licencia
 * Concatenación canónica: "${deviceId}:${email}:${exp}:${salt}"
 * @param {string} deviceId 
 * @param {string} email 
 * @param {number} exp Timestamp de expiración o -1 para licencia perpetua
 * @param {string} [salt] Sal maestra
 * @returns {Promise<string>} Hash hexadecimal SHA-256
 */
async function computarFirmaLicencia(deviceId, email, exp, salt = LICENSE_SALT) {
  const dId = (deviceId || '').trim();
  const mail = (email || '').trim().toLowerCase();
  const canonicalData = `${dId}:${mail}:${exp}:${salt}`;

  // Entorno Node.js (Pruebas unitarias)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const cryptoNode = require('node:crypto');
      return cryptoNode.createHash('sha256').update(canonicalData, 'utf8').digest('hex');
    } catch (e) {
      // Continuar a fallback
    }
  }

  // Entorno Navegador (Web Crypto API)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(canonicalData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('No hay motor criptográfico disponible para computar firma de licencia.');
}

/**
 * Genera un token de activación codificado en Base64 con firma SHA-256
 * @param {string} deviceId 
 * @param {string} email 
 * @param {number} [diasValidez=365] Días de validez (-1 para vitalicia/perpetua)
 * @param {string} [salt]
 * @returns {Promise<string>} Token en Base64
 */
async function generarTokenLicencia(deviceId, email, diasValidez = 365, salt = LICENSE_SALT) {
  const dId = (deviceId || '').trim();
  const mail = (email || '').trim().toLowerCase();
  const exp = diasValidez === -1 ? -1 : (Date.now() + diasValidez * 24 * 60 * 60 * 1000);
  const signature = await computarFirmaLicencia(dId, mail, exp, salt);

  const payload = {
    deviceId: dId,
    email: mail,
    exp: exp,
    signature: signature
  };

  const jsonStr = JSON.stringify(payload);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(jsonStr, 'utf8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(jsonStr)));
}

/**
 * Valida un token de activación Base64 de forma 100% offline
 * @param {string} tokenBase64 
 * @param {string} [currentDeviceId] Device ID actual para verificar pertenencia
 * @param {string} [salt]
 * @returns {Promise<{ valido: boolean, error?: string, payload?: object }>}
 */
async function validarTokenLicencia(tokenBase64, currentDeviceId = null, salt = LICENSE_SALT) {
  if (!tokenBase64 || typeof tokenBase64 !== 'string') {
    return { valido: false, error: 'Token de activación no proporcionado o formato inválido.' };
  }

  let jsonStr = '';
  try {
    const cleanToken = tokenBase64.trim().replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(cleanToken, 'base64').toString('utf8');
    } else {
      jsonStr = decodeURIComponent(escape(atob(cleanToken)));
    }
  } catch (err) {
    return { valido: false, error: 'El formato del token no es una cadena Base64 válida.' };
  }

  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (err) {
    return { valido: false, error: 'El contenido del token no es un JSON estructurado.' };
  }

  if (!payload || typeof payload !== 'object') {
    return { valido: false, error: 'Payload de licencia nulo o incorrecto.' };
  }

  const { deviceId, email, exp, signature } = payload;

  if (!deviceId || !email || exp === undefined || !signature) {
    return { valido: false, error: 'El token carece de los campos obligatorios (deviceId, email, exp, signature).' };
  }

  // 1. Validar vinculación con el dispositivo receptor
  if (currentDeviceId && deviceId !== currentDeviceId) {
    return {
      valido: false,
      error: `Token emitido para otro dispositivo (${deviceId}). Tu Device ID actual es: ${currentDeviceId}.`
    };
  }

  // 2. Validar expiración temporal (si exp !== -1)
  if (exp !== -1 && exp < Date.now()) {
    const expDate = new Date(exp).toLocaleDateString('es-ES');
    return { valido: false, error: `Esta licencia expiró el ${expDate}.` };
  }

  // 3. Validar autenticidad de la firma SHA-256 offline
  const expectedSig = await computarFirmaLicencia(deviceId, email, exp, salt);
  if (signature.toLowerCase() !== expectedSig.toLowerCase()) {
    return { valido: false, error: 'Firma criptográfica inválida. El token ha sido alterado o es apócrifo.' };
  }

  return {
    valido: true,
    payload: {
      deviceId,
      email,
      exp,
      isPerpetual: exp === -1,
      expirationDate: exp === -1 ? 'Perpetua' : new Date(exp).toISOString()
    }
  };
}

/**
 * Gestor Autónomo de Licencias y Período de Prueba Offline
 */
class VaultLicenseManager {
  constructor() {
    this.deviceId = null;
    this.userEmail = null;
    this.trialStartDate = null;
    this.licenseData = null;
    this.isLicensed = false;
    this.isTrialActive = true;
    this.isExpired = false;
  }

  /**
   * Inicializa el estado de licencia y el Device ID persistente
   */
  async init() {
    // 1. Resolver o generar Device ID único persistente
    let devId = null;
    if (typeof localStorage !== 'undefined') {
      devId = localStorage.getItem('vault_device_id');
    }
    if (!devId && typeof window !== 'undefined' && window.vaultStorage) {
      devId = await window.vaultStorage.getSetting('vault_device_id');
    }

    if (!devId) {
      // Generar nuevo identificador único del dispositivo
      devId = 'dev_' + this._generateRandomUUID();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vault_device_id', devId);
      }
      if (typeof window !== 'undefined' && window.vaultStorage) {
        await window.vaultStorage.setSetting('vault_device_id', devId);
      }
    }
    this.deviceId = devId;

    // 2. Resolver o generar el Usuario Asociado persistente
    let userEmail = null;
    if (typeof localStorage !== 'undefined') {
      userEmail = localStorage.getItem('vault_user_email');
    }
    if (!userEmail && typeof window !== 'undefined' && window.vaultStorage) {
      userEmail = await window.vaultStorage.getSetting('vault_user_email');
    }
    if (!userEmail && typeof window !== 'undefined' && window.vaultAuth?.currentUser?.email) {
      userEmail = window.vaultAuth.currentUser.email;
    }
    if (!userEmail) {
      // Generar usuario único y legible automáticamente para este dispositivo
      const shortId = devId.replace('dev_', '').substring(0, 8);
      userEmail = `usuario_${shortId}@boveda.com`;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vault_user_email', userEmail);
      }
      if (typeof window !== 'undefined' && window.vaultStorage) {
        await window.vaultStorage.setSetting('vault_user_email', userEmail);
      }
    }
    this.userEmail = userEmail;

    // 3. Resolver o inicializar fecha de inicio del Trial (7 días)
    let trialStart = null;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vault_trial_start');
      if (stored) trialStart = parseInt(stored, 10);
    }
    if (!trialStart && typeof window !== 'undefined' && window.vaultStorage) {
      const stored = await window.vaultStorage.getSetting('vault_trial_start');
      if (stored) trialStart = parseInt(stored, 10);
    }

    if (!trialStart || isNaN(trialStart)) {
      trialStart = Date.now();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vault_trial_start', trialStart.toString());
      }
      if (typeof window !== 'undefined' && window.vaultStorage) {
        await window.vaultStorage.setSetting('vault_trial_start', trialStart);
      }
    }
    this.trialStartDate = trialStart;

    // 4. Comprobar si existe un Token de Activación guardado
    let savedToken = null;
    if (typeof localStorage !== 'undefined') {
      savedToken = localStorage.getItem('vault_license_token');
    }
    if (!savedToken && typeof window !== 'undefined' && window.vaultStorage) {
      savedToken = await window.vaultStorage.getSetting('vault_license_token');
    }

    if (savedToken) {
      const validacion = await validarTokenLicencia(savedToken, this.deviceId);
      if (validacion.valido) {
        this.isLicensed = true;
        this.licenseData = validacion.payload;
        if (validacion.payload?.email) {
          this.userEmail = validacion.payload.email;
        }
        this.isTrialActive = false;
        this.isExpired = false;
        return this.getEstadoLicencia();
      } else {
        console.warn('[VaultLicense] Token guardado no es válido o expiró:', validacion.error);
      }
    }

    // 5. Evaluar vigencia del Período de Prueba de 7 días
    this._recalcularEstadoTrial();
    return this.getEstadoLicencia();
  }

  /**
   * Actualiza y persiste el usuario o correo asociado a la licencia
   * @param {string} email 
   */
  async setUserEmail(email) {
    if (!email || typeof email !== 'string') return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    this.userEmail = cleanEmail;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vault_user_email', cleanEmail);
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_email', cleanEmail);
    }
    return this.getEstadoLicencia(cleanEmail);
  }

  /**
   * Recalcula si el trial sigue activo o si ya expiró
   * @private
   */
  _recalcularEstadoTrial() {
    if (this.isLicensed) {
      this.isTrialActive = false;
      this.isExpired = false;
      return;
    }

    const elapsed = Date.now() - (this.trialStartDate || Date.now());
    if (elapsed < TRIAL_DURATION_MS) {
      this.isTrialActive = true;
      this.isExpired = false;
    } else {
      this.isTrialActive = false;
      this.isExpired = true;
    }
  }

  /**
   * Retorna el estado consolidado de la licencia
   * @param {string} [email]
   * @returns {object}
   */
  getEstadoLicencia(email = null) {
    this._recalcularEstadoTrial();

    const now = Date.now();
    const elapsed = now - (this.trialStartDate || now);
    const msRemaining = Math.max(0, TRIAL_DURATION_MS - elapsed);
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));

    const effectiveEmail = (email && email.trim().toLowerCase()) ||
                           (typeof window !== 'undefined' && window.vaultAuth?.currentUser?.email) ||
                           this.userEmail ||
                           (this.deviceId ? `usuario_${this.deviceId.replace('dev_', '').substring(0, 8)}@boveda.com` : 'usuario@boveda.com');
    const cadena = generarCadenaSolicitud(this.deviceId, effectiveEmail);

    return {
      deviceId: this.deviceId,
      email: effectiveEmail,
      isLicensed: this.isLicensed,
      isTrialActive: this.isTrialActive,
      isExpired: this.isExpired,
      trialDaysRemaining: daysRemaining,
      trialHoursRemaining: hoursRemaining,
      trialMsRemaining: msRemaining,
      cadenaSolicitud: cadena,
      contactPhone: CONTACT_PHONE,
      whatsAppUrl: `https://wa.me/56933395447?text=${encodeURIComponent(`Hola, solicito activar mi Bóveda Digital: ${cadena}`)}`,
      licenseData: this.licenseData
    };
  }

  /**
   * Activa la bóveda ingresando un token Base64 de activación offline
   * @param {string} tokenBase64 
   * @param {string} [email]
   * @returns {Promise<{ success: boolean, message: string, payload?: object }>}
   */
  async activarConToken(tokenBase64, email = null) {
    const validacion = await validarTokenLicencia(tokenBase64, this.deviceId);
    if (!validacion.valido) {
      return {
        success: false,
        message: validacion.error || 'Token inválido.'
      };
    }

    // Persistir token de activación
    this.licenseData = validacion.payload;
    if (validacion.payload?.email) {
      this.userEmail = validacion.payload.email.toLowerCase();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vault_user_email', this.userEmail);
      }
      if (typeof window !== 'undefined' && window.vaultStorage) {
        await window.vaultStorage.setSetting('vault_user_email', this.userEmail);
      }
    }
    this.isLicensed = true;
    this.isTrialActive = false;
    this.isExpired = false;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vault_license_token', tokenBase64.trim());
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_license_token', tokenBase64.trim());
      await window.vaultStorage.setSetting('vault_license_data', validacion.payload);
    }

    return {
      success: true,
      message: '¡Licencia activada con éxito! Tu dispositivo cuenta con acceso habilitado.',
      payload: validacion.payload
    };
  }

  /**
   * Genera un UUID pseudoaleatorio compatible con navegador y Node.js
   * @private
   */
  _generateRandomUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    let d = Date.now();
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).slice(0, 16);
  }
}

// Instancia global en navegador
if (typeof window !== 'undefined') {
  window.VaultLicenseManager = VaultLicenseManager;
  window.vaultLicense = new VaultLicenseManager();
  window.generarCadenaSolicitud = generarCadenaSolicitud;
  window.computarFirmaLicencia = computarFirmaLicencia;
  window.generarTokenLicencia = generarTokenLicencia;
  window.validarTokenLicencia = validarTokenLicencia;
}

// Exportación para suite de pruebas en Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRIAL_DAYS,
    TRIAL_DURATION_MS,
    LICENSE_SALT,
    CONTACT_PHONE,
    generarCadenaSolicitud,
    computarFirmaLicencia,
    generarTokenLicencia,
    validarTokenLicencia,
    VaultLicenseManager
  };
}
