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
 * Computa el hash SHA-256 de una cadena UTF-8
 * @param {string} rawStr
 * @returns {Promise<string>} Hash hexadecimal de 64 caracteres
 */
async function computarHashSHA256(rawStr) {
  // Entorno Node.js (Pruebas unitarias y scripts de backend)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const cryptoNode = require('node:crypto');
      return cryptoNode.createHash('sha256').update(rawStr, 'utf8').digest('hex');
    } catch (e) {
      // Continuar a fallback
    }
  }

  // Entorno Navegador (Web Crypto API)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(rawStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('No hay motor criptográfico disponible para computar firma de licencia.');
}

/**
 * Computa la firma criptográfica SHA-256 de un payload de licencia
 * Concatenación canónica estándar: "${deviceId}|${email}|${exp}|${salt}" (100% compatible con generador de Halterofilia)
 * @param {string} deviceId 
 * @param {string} email 
 * @param {number|string} exp Timestamp de expiración o -1 para licencia perpetua
 * @param {string} [salt] Sal maestra
 * @param {string} [delimiter] Delimitador (| o :)
 * @returns {Promise<string>} Hash hexadecimal SHA-256
 */
async function computarFirmaLicencia(deviceId, email, exp, salt = LICENSE_SALT, delimiter = '|') {
  const dId = (deviceId || '').trim().toLowerCase();
  const mail = (email || '').trim().toLowerCase();
  const expVal = (exp !== undefined && exp !== null) ? exp.toString().trim() : '-1';
  const canonicalData = `${dId}${delimiter}${mail}${delimiter}${expVal}${delimiter}${salt}`;
  return await computarHashSHA256(canonicalData);
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
  const dId = (deviceId || '').trim().toLowerCase();
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
 * Genera un token de activación directamente desde la cadena de solicitud REQ|<DeviceID>|<correo>
 * @param {string} cadenaSolicitud 
 * @param {number} [diasValidez=365]
 * @returns {Promise<string>} Token en Base64
 */
async function generarTokenDesdeCadenaSolicitud(cadenaSolicitud, diasValidez = 365) {
  if (!cadenaSolicitud || typeof cadenaSolicitud !== 'string') {
    throw new Error('Cadena de solicitud no válida. Formato esperado: REQ|<DeviceID>|<correo>');
  }
  const partes = cadenaSolicitud.trim().split('|');
  if (partes.length < 3 || partes[0].trim().toUpperCase() !== 'REQ') {
    throw new Error('Formato de solicitud inválido. Debe tener la estructura: REQ|<DeviceID>|<correo>');
  }
  const deviceId = partes[1].trim();
  const email = partes[2].trim();
  return await generarTokenLicencia(deviceId, email, diasValidez);
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

  let cleanToken = tokenBase64.trim();
  // Limpiar posibles comillas de inicio/fin (del copiado en consolas o chats)
  if ((cleanToken.startsWith('"') && cleanToken.endsWith('"')) || 
      (cleanToken.startsWith("'") && cleanToken.endsWith("'"))) {
    cleanToken = cleanToken.slice(1, -1).trim();
  }
  cleanToken = cleanToken.replace(/\s+/g, '');

  let jsonStr = '';
  try {
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

  const dId = (deviceId || '').trim().toLowerCase();
  const mail = (email || '').trim().toLowerCase();
  const curDevId = (currentDeviceId || '').trim().toLowerCase();

  // 1. Validar vinculación con el dispositivo receptor (insensible a mayúsculas/minúsculas)
  if (curDevId && dId !== curDevId) {
    return {
      valido: false,
      error: `Token emitido para otro dispositivo (${deviceId}). Tu Device ID actual es: ${currentDeviceId}.`
    };
  }

  // 2. Validar expiración temporal (si exp !== -1 y no es perpetua por días altos como 9999)
  const expNum = typeof exp === 'string' ? parseInt(exp, 10) : exp;
  const isPerpetual = expNum === -1 || expNum >= (Date.now() + 2500 * 24 * 60 * 60 * 1000);
  if (!isPerpetual && expNum < Date.now()) {
    const expDate = new Date(expNum).toLocaleDateString('es-ES');
    return { valido: false, error: `Esta licencia expiró el ${expDate}.` };
  }

  // 3. Validar autenticidad de la firma SHA-256 offline (compatible con Halterofilia y Bóveda Digital)
  const expVal = (exp !== undefined && exp !== null) ? exp.toString().trim() : '-1';
  const rawDevId = (deviceId || '').trim();
  const rawEmail = (email || '').trim();

  // Candidatos de firma admitidos:
  // 1. Estándar Halterofilia con pipes normalizados (${dId}|${mail}|${expVal}|${salt})
  // 2. Estándar Halterofilia con pipes literales (${rawDevId}|${rawEmail}|${expVal}|${salt})
  // 3. Formato canónico con dos puntos (${dId}:${mail}:${expVal}:${salt})
  // 4. Formato literal con dos puntos (${rawDevId}:${rawEmail}:${expVal}:${salt})
  const candidateSignatures = [
    await computarHashSHA256(`${dId}|${mail}|${expVal}|${salt}`),
    await computarHashSHA256(`${rawDevId}|${rawEmail}|${expVal}|${salt}`),
    await computarHashSHA256(`${dId}:${mail}:${expVal}:${salt}`),
    await computarHashSHA256(`${rawDevId}:${rawEmail}:${expVal}:${salt}`)
  ];

  if (payload.expiryDate) {
    const expDateVal = payload.expiryDate.toString().trim();
    candidateSignatures.push(await computarHashSHA256(`${dId}|${mail}|${expDateVal}|${salt}`));
    candidateSignatures.push(await computarHashSHA256(`${rawDevId}|${rawEmail}|${expDateVal}|${salt}`));
  }

  const sigClean = signature.trim().toLowerCase();
  const isSignatureValid = candidateSignatures.some(cand => cand.toLowerCase() === sigClean);

  if (!isSignatureValid) {
    return { valido: false, error: 'Firma criptográfica inválida. El token ha sido alterado o es apócrifo.' };
  }

  return {
    valido: true,
    payload: {
      deviceId: dId,
      email: (email || '').trim().toLowerCase(),
      exp: expNum,
      isPerpetual: isPerpetual,
      expirationDate: isPerpetual ? 'Perpetua' : new Date(expNum).toISOString()
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
    this.userVerified = false;
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

    // 2. Cargar perfil de usuario registrado si existe
    await this.getUserProfile();

    // Resolver o generar el Usuario Asociado persistente priorizando el usuario autenticado
    let userEmail = this.userProfile?.email || null;
    if ((!userEmail || this._isPlaceholderEmail(userEmail)) && typeof window !== 'undefined' && window.vaultAuth?.currentUser?.email) {
      const authMail = window.vaultAuth.currentUser.email.trim().toLowerCase();
      if (!this._isPlaceholderEmail(authMail)) {
        userEmail = authMail;
      }
    }
    if (!userEmail && typeof localStorage !== 'undefined') {
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
    this.userEmail = this.getAuthenticatedEmail(userEmail);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vault_user_email', this.userEmail);
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_email', this.userEmail);
    }

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

    // 5. Cargar estado de usuario verificado
    let isVerif = false;
    if (typeof localStorage !== 'undefined') {
      isVerif = localStorage.getItem('vault_user_verified') === 'true';
    }
    if (!isVerif && typeof window !== 'undefined' && window.vaultStorage) {
      isVerif = (await window.vaultStorage.getSetting('vault_user_verified')) === true;
    }
    this.userVerified = isVerif;

    // 6. Evaluar vigencia del Período de Prueba de 7 días
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
   * Obtiene el perfil de usuario registrado para este dispositivo
   * @returns {Promise<{ firstName: string, lastName: string, email: string, phone: string, photo: string|null, updatedAt: string }|null>}
   */
  async getUserProfile() {
    let profile = this.userProfile || null;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vault_user_profile');
      if (stored) {
        try { profile = JSON.parse(stored); } catch (e) {}
      }
    }
    if (!profile && typeof window !== 'undefined' && window.vaultStorage) {
      const stored = await window.vaultStorage.getSetting('vault_user_profile');
      if (stored) {
        profile = typeof stored === 'string' ? JSON.parse(stored) : stored;
      }
    }
    this.userProfile = profile;
    return profile;
  }

  /**
   * Guarda y sincroniza el perfil del usuario registrado
   * @param {object} profileData 
   * @returns {Promise<object>}
   */
  async saveUserProfile(profileData = {}) {
    const cleanEmail = (profileData.email || this.userEmail || '').trim().toLowerCase();
    const cleanFirstName = (profileData.firstName || '').trim();
    const cleanLastName = (profileData.lastName || '').trim();
    const cleanPhone = (profileData.phone || '').trim();
    const photo = profileData.photo || null;

    const profile = {
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail,
      phone: cleanPhone,
      photo: photo,
      updatedAt: new Date().toISOString()
    };

    this.userProfile = profile;

    if (cleanEmail) {
      await this.setUserEmail(cleanEmail);
    }

    const jsonStr = JSON.stringify(profile);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vault_user_profile', jsonStr);
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_profile', profile);
    }

    return profile;
  }

  /**
   * Desvincula y limpia el perfil de usuario registrado en este dispositivo
   * @returns {Promise<boolean>}
   */
  async clearUserProfile() {
    this.userProfile = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('vault_user_profile');
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_profile', null);
    }

    // Restablecer correo asociado automático por Device ID
    const shortId = (this.deviceId || 'dev_unknown').replace('dev_', '').substring(0, 8);
    const defaultEmail = `usuario_${shortId}@boveda.com`;
    await this.setUserEmail(defaultEmail);

    this.userVerified = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('vault_user_verified');
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_verified', false);
    }
    return true;
  }

  /**
   * Determina si el usuario ya completó la identificación de su ficha y verificó su correo
   * @returns {Promise<boolean>}
   */
  async isUserIdentifiedAndVerified() {
    const profile = await this.getUserProfile();
    const hasRequiredFields = profile && 
      Boolean(profile.firstName && profile.firstName.trim()) &&
      Boolean(profile.lastName && profile.lastName.trim()) &&
      Boolean(profile.email && profile.email.trim()) &&
      Boolean(profile.phone && profile.phone.trim());

    if (!hasRequiredFields) return false;

    if (this.userVerified) return true;

    let verified = false;
    if (typeof localStorage !== 'undefined') {
      verified = localStorage.getItem('vault_user_verified') === 'true';
    }
    if (!verified && typeof window !== 'undefined' && window.vaultStorage) {
      verified = (await window.vaultStorage.getSetting('vault_user_verified')) === true;
    }
    this.userVerified = verified;
    return verified;
  }

  /**
   * Marca el estado de verificación del usuario
   * @param {boolean} verified 
   */
  async markUserVerified(verified = true) {
    this.userVerified = verified;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vault_user_verified', verified ? 'true' : 'false');
    }
    if (typeof window !== 'undefined' && window.vaultStorage) {
      await window.vaultStorage.setSetting('vault_user_verified', verified);
    }
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
   * Determina si un correo corresponde a un valor genérico o de plantilla
   * @param {string} email
   * @returns {boolean}
   */
  _isPlaceholderEmail(email) {
    if (!email || typeof email !== 'string') return true;
    const clean = email.trim().toLowerCase();
    if (!clean) return true;
    const placeholders = [
      'su-usuario@dominio.com',
      'atleta@halterofilia.com',
      'atleta@alterofilia.com',
      'usuario@correo.com',
      'usuario@boveda.com'
    ];
    if (placeholders.includes(clean)) return true;
    if (/^usuario_[a-z0-9_]+@boveda\.com$/.test(clean)) return true;
    return false;
  }

  /**
   * Resuelve el correo electrónico del usuario autenticado
   * @param {string|null} [explicitEmail]
   * @returns {string}
   */
  getAuthenticatedEmail(explicitEmail = null) {
    const cleanExplicit = (explicitEmail && typeof explicitEmail === 'string') ? explicitEmail.trim().toLowerCase() : '';
    const profileEmail = (this.userProfile?.email && typeof this.userProfile.email === 'string') ? this.userProfile.email.trim().toLowerCase() : '';
    const authUserEmail = (typeof window !== 'undefined' && window.vaultAuth?.currentUser?.email) ? window.vaultAuth.currentUser.email.trim().toLowerCase() : '';
    const storedEmail = (this.userEmail && typeof this.userEmail === 'string') ? this.userEmail.trim().toLowerCase() : '';

    // 1. Si se proporcionó un correo explícito válido que NO es placeholder
    if (cleanExplicit && !this._isPlaceholderEmail(cleanExplicit)) {
      if (cleanExplicit === 'andres.pro@boveda.com' && profileEmail && !this._isPlaceholderEmail(profileEmail)) {
        return profileEmail;
      }
      return cleanExplicit;
    }

    // 2. Correo del perfil de usuario autenticado/verificado en el dispositivo
    if (profileEmail && !this._isPlaceholderEmail(profileEmail)) {
      return profileEmail;
    }

    // 3. Correo de la sesión activa en VaultAuth
    if (authUserEmail && !this._isPlaceholderEmail(authUserEmail)) {
      return authUserEmail;
    }

    // 4. Correo persistido en el gestor de licencias
    if (storedEmail && !this._isPlaceholderEmail(storedEmail)) {
      return storedEmail;
    }

    // 5. Contingencia en caso de que solo exista un valor por defecto
    return cleanExplicit || profileEmail || authUserEmail || storedEmail ||
      (this.deviceId ? `usuario_${this.deviceId.replace('dev_', '').substring(0, 8)}@boveda.com` : 'usuario@boveda.com');
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

    const effectiveEmail = this.getAuthenticatedEmail(email);
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
  window.generarTokenDesdeCadenaSolicitud = generarTokenDesdeCadenaSolicitud;
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
    generarTokenDesdeCadenaSolicitud,
    validarTokenLicencia,
    VaultLicenseManager
  };
}
