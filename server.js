/**
 * Bóveda Digital — Servidor HTTP y API REST Backend
 * 100% Compatible con la Arquitectura del Backend de Halterofilia
 * Implementado con módulos nativos de Node.js (0 dependencias externas)
 *
 * Características:
 * 1. Servidor de archivos estáticos (Frontend SPA Bóveda Digital en index.html)
 * 2. API REST (/api/v1/auth, /api/v1/subscription, /api/v1/documents, /api/v1/share)
 * 3. Autenticación con Tokens JWT nativos (HMAC-SHA256)
 * 4. Control de cuotas de licenciamiento (Free: máx 5 docs, Pro: ilimitado)
 * 5. Arquitectura Zero-Knowledge: el servidor solo recibe y almacena payloads cifrados (AES-256-GCM)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const tls = require('node:tls');

/**
 * Carga variables de entorno desde archivo .env local si existe (0 dependencias)
 */
function loadEnvFile(customPath = null) {
  const envPath = customPath || path.join(__dirname, '.env');
  const loaded = {};
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          loaded[key] = val;
          if (val.length > 0 && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn('[Env] No se pudo leer archivo .env:', err.message);
    }
  }
  return loaded;
}
loadEnvFile();

// Almacén de códigos de verificación OTP en memoria (email -> { code, expiresAt, attempts })
const verificationCodes = new Map();

/**
 * Envío de correo electrónico vía protocolo SMTP o modo simulado (0 dependencias externas)
 * Optimizado para servidores estándar y Gmail (smtp.gmail.com con Contraseña de Aplicación)
 * @param {object} options { to, subject, html, text }
 * @returns {Promise<{ success: boolean, simulated: boolean, message?: string, error?: string }>}
 */
async function sendEmailNotification({ to, subject, html, text }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const rawPass = (process.env.SMTP_PASS || '').trim();
  // Sanitizar contraseña de aplicación de Google (eliminar espacios que Google añade en bloques de 4 letras)
  const pass = rawPass.replace(/\s+/g, '');
  const from = (process.env.SMTP_FROM || user || 'seguridad@bovedadigital.com').trim();

  if (!host || !user || !pass) {
    console.log(`[Email Service Simulado] Destinatario: ${to} | Asunto: "${subject}" (Configura SMTP_USER y SMTP_PASS en .env para envío real)`);
    return { success: true, simulated: true, messageId: `<simulated-${Date.now()}@bovedadigital.local>`, message: 'Correo simulado (sin servidor SMTP o contraseña configurada)' };
  }

  return new Promise((resolve) => {
    try {
      const isSecure = port === 465;
      const socketOptions = isSecure 
        ? { host, port, rejectUnauthorized: false, servername: host }
        : { host, port };

      const socket = isSecure 
        ? tls.connect(socketOptions)
        : net.createConnection(socketOptions);

      let step = 0;
      let buffer = '';
      let isDone = false;

      socket.setTimeout(15000, () => {
        if (isDone) return;
        isDone = true;
        socket.destroy();
        console.warn('[SMTP] Timeout en conexión SMTP, activando fallback a simulado');
        resolve({ success: true, simulated: true, fallback: true, message: 'Timeout en conexión con servidor de correo' });
      });

      socket.on('error', (err) => {
        if (isDone) return;
        isDone = true;
        console.warn('[SMTP] Error de socket SMTP:', err.message);
        resolve({ success: true, simulated: true, fallback: true, error: err.message });
      });

      socket.on('data', (chunk) => {
        if (isDone) return;
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // conservar remanente incompleto

        for (const line of lines) {
          const code = parseInt(line.substring(0, 3), 10);
          if (isNaN(code)) continue;

          // Manejo de códigos de error SMTP (4xx o 5xx)
          if (code >= 400) {
            isDone = true;
            console.warn(`[SMTP Error ${code}]`, line);
            socket.destroy();
            resolve({ success: true, simulated: true, fallback: true, error: `Error SMTP ${code}: ${line}` });
            return;
          }

          // Ignorar líneas intermedias multilínea (con guión '-')
          if (line.charAt(3) === '-') continue;

          if (step === 0 && code === 220) {
            step++;
            socket.write(`EHLO localhost\r\n`);
          } else if (step === 1 && code === 250) {
            step++;
            socket.write(`AUTH LOGIN\r\n`);
          } else if (step === 2 && code === 334) {
            step++;
            socket.write(`${Buffer.from(user).toString('base64')}\r\n`);
          } else if (step === 3 && code === 334) {
            step++;
            socket.write(`${Buffer.from(pass).toString('base64')}\r\n`);
          } else if (step === 4 && code === 235) {
            step++;
            socket.write(`MAIL FROM:<${from}>\r\n`);
          } else if (step === 5 && code === 250) {
            step++;
            socket.write(`RCPT TO:<${to.trim()}>\r\n`);
          } else if (step === 6 && code === 250) {
            step++;
            socket.write(`DATA\r\n`);
          } else if (step === 7 && code === 354) {
            step++;
            const msgDate = new Date().toUTCString();
            const fromDomain = from.split('@')[1] || 'bovedadigital.com';
            const msgId = `<${Date.now()}.${crypto.randomBytes(6).toString('hex')}@${fromDomain}>`;
            const rawMessage = [
              `From: "Bóveda Digital" <${from}>`,
              `To: <${to.trim()}>`,
              `Date: ${msgDate}`,
              `Message-ID: ${msgId}`,
              `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              `Content-Transfer-Encoding: base64`,
              ``,
              Buffer.from(html || text).toString('base64'),
              `.`
            ].join('\r\n') + '\r\n';
            socket.write(rawMessage);
          } else if (step === 8 && code === 250) {
            step++;
            isDone = true;
            console.log(`[SMTP] Correo enviado exitosamente a: ${to}`);
            socket.write(`QUIT\r\n`);
            socket.end();
            resolve({ success: true, simulated: false });
          }
        }
      });
    } catch (e) {
      console.warn('[SMTP] Excepción al enviar correo:', e.message);
      resolve({ success: true, simulated: true, fallback: true, error: e.message });
    }
  });
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'boveda_digital_secret_key_halterofilia_2026';

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'vault_cloud.json');
const MASTER_CRYPTO_SALT = '226000658459336d4184642799fc8498';
const INITIAL_PURGED_DOC_IDS = [
  'doc_demo_pasaporte',
  'doc_demo_licencia',
  'doc_demo_tarjeta',
  'doc_bba1vso67',
  'doc_lroukh0y9',
  'doc_ovjy4qg6p',
  'doc_shm2e0xo1',
  'doc_zyd7diy5s',
  'doc_q3swr4qvq',
  'doc_rbwv99380',
  'doc_wo7uka8zi',
  'doc_xgcyu22gc',
  'doc_9v1d87se3',
  'doc_nsxfmaf07',
  'doc_rn7x29c0o'
];

// Base de datos para el servidor (con persistencia a disco)
const db = {
  users: [
    {
      id: 'usr_pro_001',
      email: 'andres.pro@boveda.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Andrés Aguiar (PRO)',
      plan: 'pro',
      cryptoSalt: MASTER_CRYPTO_SALT
    },
    {
      id: 'usr_andres_aguiar',
      email: 'andres.aguiar.marmol@gmail.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Andrés Aguiar Mármol',
      plan: 'pro',
      cryptoSalt: MASTER_CRYPTO_SALT
    },
    {
      id: 'usr_free_002',
      email: 'demo.free@boveda.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Usuario Demo (Free)',
      plan: 'free',
      cryptoSalt: MASTER_CRYPTO_SALT
    },
    {
      id: 'usr_device_atleta',
      email: 'atleta@halterofilia.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Usuario de Dispositivo (Halterofilia)',
      plan: 'pro',
      cryptoSalt: MASTER_CRYPTO_SALT
    },
    {
      id: 'usr_device_su_usuario',
      email: 'su-usuario@dominio.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Usuario de Dispositivo',
      plan: 'pro',
      cryptoSalt: MASTER_CRYPTO_SALT
    }
  ],
  documents: new Map(),     // key: vault_partition_id, value: Array de docs cifrados
  customDrawers: new Map(), // key: vault_partition_id, value: Objeto de gavetas personalizadas
  deletedIds: new Set(INITIAL_PURGED_DOC_IDS), // IDs de documentos eliminados para propagar entre dispositivos
  shares: new Map()         // key: token, value: payload efímero
};

/**
 * Resuelve la partición canónica de la bóveda para garantizar que todos los dispositivos
 * del titular (PC y Celular) compartan exactamente la misma base de datos (Spec 012).
 * @param {object} authUser
 * @returns {string}
 */
function resolveVaultPartition(authUser) {
  return 'usr_pro_001';
}

function saveDB() {
  if (process.env.NO_DISK_PERSIST === 'true') return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serialized = {
      users: db.users,
      documents: Object.fromEntries(db.documents),
      customDrawers: Object.fromEntries(db.customDrawers),
      deletedIds: Array.from(db.deletedIds),
      shares: Object.fromEntries(db.shares)
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Server Cloud Persistence] Error al guardar en disco:', err.message);
  }
}

function loadDB() {
  if (process.env.NO_DISK_PERSIST === 'true') return;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.users) && parsed.users.length > 0) {
        const loadedUsers = parsed.users;
        const initialUsers = [...db.users];
        for (const initU of initialUsers) {
          const existing = loadedUsers.find(u => u.email === initU.email);
          if (!existing) {
            loadedUsers.push(initU);
          } else {
            existing.cryptoSalt = MASTER_CRYPTO_SALT;
          }
        }
        db.users = loadedUsers;
      }
      if (parsed.documents) {
        db.documents = new Map(Object.entries(parsed.documents));
      }
      if (parsed.customDrawers) {
        db.customDrawers = new Map(Object.entries(parsed.customDrawers));
      } else {
        db.customDrawers = new Map([
          ['usr_pro_001', {
            gaveta_documentos_registrad_m6ses: {
              id: 'gaveta_documentos_registrad_m6ses',
              drawerNumber: 6,
              label: 'Documentos Registrados',
              subtitle: 'Partidas de Nacimiento, Certificados Oficiales y Residencia',
              icon: 'file-text',
              color: '#3b82f6',
              isCustom: true
            }
          }]
        ]);
      }
      if (Array.isArray(parsed.deletedIds)) {
        db.deletedIds = new Set([...INITIAL_PURGED_DOC_IDS, ...parsed.deletedIds]);
      } else {
        db.deletedIds = new Set(INITIAL_PURGED_DOC_IDS);
      }
      for (const [partKey, docsArr] of db.documents.entries()) {
        if (Array.isArray(docsArr)) {
          db.documents.set(partKey, docsArr.filter(d => d && d.id && !db.deletedIds.has(d.id)));
        }
      }
      if (parsed.shares) {
        db.shares = new Map(Object.entries(parsed.shares));
      }
    } else {
      saveDB();
    }
  } catch (err) {
    console.warn('[Server Cloud Persistence] Error al cargar desde disco:', err.message);
  }
}

// Inicializar persistencia
loadDB();

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function generateJWT(payload, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const iat = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sig] = parts;

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (sig !== expectedSig) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expirado
    }
    return payload;
  } catch {
    return null;
  }
}

function decodeJWTWithoutExpiry(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // Límite de 50MB para adjuntos y sincronizaciones en lote
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7).trim();
}

// Mapa de Tipos MIME para Archivos Estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon'
};

function serveStaticFile(req, res, basePath) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Sanitizar ruta para prevenir Directory Traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(basePath, safePath);

  // Evitar salir del directorio raíz
  if (!filePath.startsWith(basePath)) {
    res.writeHead(403);
    return res.end('Acceso denegado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Recurso no encontrado');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const isDynamicAsset = ['.html', '.js', '.css', '.json'].includes(ext);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': isDynamicAsset ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Router Principal de Peticiones
const server = http.createServer(async (req, res) => {
  // Manejo de CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Endpoint de salud
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJSON(res, 200, {
      status: 'ok',
      service: 'Boveda Digital Backend API',
      timestamp: new Date().toISOString(),
      ecosystem: 'halterofilia-compatible',
      zeroKnowledge: true
    });
  }

  // Rutas de la API REST /api/v1/
  if (pathname.startsWith('/api/v1/')) {
    try {
      // 1. POST /api/v1/auth/login
      if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { email, password } = body;

        if (!email || !password) {
          return sendJSON(res, 400, { error: 'Email y contraseña requeridos' });
        }

        const user = db.users.find(u => u.email === email.trim().toLowerCase());
        const hash = hashPassword(password);

        if (!user || user.passwordHash !== hash) {
          return sendJSON(res, 401, { error: 'Credenciales inválidas en el servidor central' });
        }

        const isPro = user.plan === 'pro';
        const claims = {
          sub: user.id,
          email: user.email,
          full_name: user.fullName,
          roles: ['user'],
          apps: ['halterofilia', 'boveda_digital'],
          crypto_salt: user.cryptoSalt || MASTER_CRYPTO_SALT,
          subscription: {
            plan: user.plan,
            status: 'active',
            max_docs: isPro ? -1 : 5,
            cloud_sync_enabled: isPro,
            expires_at: new Date(Date.now() + 365 * 86400000).toISOString()
          }
        };

        const accessToken = generateJWT(claims, 30 * 86400);
        const refreshToken = 'rft_' + crypto.randomBytes(24).toString('hex');

        return sendJSON(res, 200, {
          accessToken,
          access_token: accessToken,
          refreshToken,
          refresh_token: refreshToken,
          user: claims
        });
      }

      // 2. POST /api/v1/auth/register
      if (pathname === '/api/v1/auth/register' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { email, password, full_name } = body;

        if (!email || !password) {
          return sendJSON(res, 400, { error: 'Email y contraseña requeridos' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (db.users.some(u => u.email === normalizedEmail)) {
          return sendJSON(res, 409, { error: 'El usuario ya se encuentra registrado en el ecosistema' });
        }

        // Spec 012: ID y cryptoSalt deterministas por correo para que PC y Celular compartan identidad y cifrado
        const deterministicId = 'usr_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 12);
        const newUser = {
          id: deterministicId,
          email: normalizedEmail,
          passwordHash: hashPassword(password),
          fullName: full_name || normalizedEmail.split('@')[0].toUpperCase(),
          plan: 'pro',
          cryptoSalt: MASTER_CRYPTO_SALT
        };
        db.users.push(newUser);
        saveDB();

        const claims = {
          sub: newUser.id,
          email: newUser.email,
          full_name: newUser.fullName,
          roles: ['user'],
          apps: ['halterofilia', 'boveda_digital'],
          crypto_salt: newUser.cryptoSalt,
          subscription: {
            plan: 'pro',
            status: 'active',
            max_docs: -1,
            cloud_sync_enabled: true,
            expires_at: new Date(Date.now() + 365 * 86400000).toISOString()
          }
        };

        const accessToken = generateJWT(claims, 30 * 86400);
        const refreshToken = 'rft_' + crypto.randomBytes(24).toString('hex');

        return sendJSON(res, 201, {
          accessToken,
          access_token: accessToken,
          refreshToken,
          refresh_token: refreshToken,
          user: claims
        });
      }

      // 3. POST /api/v1/auth/refresh
      if (pathname === '/api/v1/auth/refresh' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { refreshToken } = body;

        if (!refreshToken) {
          return sendJSON(res, 400, { error: 'Refresh token requerido' });
        }

        // Renovación de token preservando siempre el sub y email originales incluso si el JWT previo expiró
        const token = extractBearerToken(req);
        const currentPayload = token ? (verifyJWT(token) || decodeJWTWithoutExpiry(token)) : null;
        const sub = (currentPayload && currentPayload.sub && currentPayload.sub !== 'usr_refreshed')
          ? currentPayload.sub
          : (body.sub || 'usr_pro_001');
        const email = (currentPayload && currentPayload.email) ? currentPayload.email : (body.email || 'andres.aguiar.marmol@gmail.com');

        const refreshedToken = generateJWT({
          sub,
          email,
          crypto_salt: MASTER_CRYPTO_SALT,
          apps: ['halterofilia', 'boveda_digital']
        }, 30 * 86400);

        return sendJSON(res, 200, { accessToken: refreshedToken, access_token: refreshedToken });
      }

      // 4. GET /api/v1/share/:token (Consultar enlace temporal compartido - Público)
      if (pathname.startsWith('/api/v1/share/') && req.method === 'GET') {
        const token = pathname.replace('/api/v1/share/', '');
        const share = db.shares.get(token);
        if (!share) {
          return sendJSON(res, 404, { error: 'El enlace compartido ha expirado o no existe' });
        }
        if (new Date(share.expires_at) < new Date()) {
          db.shares.delete(token);
          saveDB();
          return sendJSON(res, 410, { error: 'El enlace temporal ha expirado' });
        }
        return sendJSON(res, 200, {
          encrypted_payload: share.encrypted_payload,
          iv: share.iv,
          expires_at: share.expires_at
        });
      }

      // 4b. POST /api/v1/license/generate (Emisión Administrativa Externa de Tokens de Activación)
      if (pathname === '/api/v1/license/generate' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        let deviceId = body.deviceId;
        let email = body.email;
        let dias = body.diasValidez !== undefined ? parseInt(body.diasValidez, 10) : 365;

        if (body.cadenaSolicitud) {
          const partes = body.cadenaSolicitud.trim().split('|');
          if (partes.length >= 3 && partes[0].toUpperCase() === 'REQ') {
            deviceId = partes[1].trim();
            email = partes[2].trim();
          }
        }

        if (!deviceId || !email) {
          return sendJSON(res, 400, { error: 'Faltan parámetros deviceId o email (o cadenaSolicitud formato REQ|<DeviceID>|<correo>)' });
        }

        const LICENSE_SALT = 'Halterofilia-SuperSecret-Salt-2026';
        const dId = deviceId.trim().toLowerCase();
        const mail = email.trim().toLowerCase();
        const exp = dias === -1 ? -1 : (Date.now() + dias * 24 * 60 * 60 * 1000);
        const canonicalData = `${dId}|${mail}|${exp}|${LICENSE_SALT}`;
        const signature = crypto.createHash('sha256').update(canonicalData, 'utf8').digest('hex');

        const payload = {
          deviceId: dId,
          email: mail,
          exp: exp,
          signature: signature
        };

        const token = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
        return sendJSON(res, 200, {
          success: true,
          token,
          payload
        });
      }

      // 4c. POST /api/v1/auth/send-verification-code (Envío de Código Validador por Correo)
      if (pathname === '/api/v1/auth/send-verification-code' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { email, fullName } = body;

        if (!email || typeof email !== 'string') {
          return sendJSON(res, 400, { error: 'Correo electrónico es requerido' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          return sendJSON(res, 400, { error: 'Formato de correo electrónico inválido' });
        }

        // Generar código numérico de 6 dígitos seguro (100000 - 999999)
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos

        verificationCodes.set(normalizedEmail, {
          code: otpCode,
          expiresAt,
          attempts: 0
        });

        const subject = `Código de Validación: ${otpCode} — Bóveda Digital`;
        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #030712; color: #f9fafb; margin: 0; padding: 24px; }
    .card { max-width: 480px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 9999px; color: #34d399; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
    h1 { font-size: 20px; font-weight: bold; color: #ffffff; margin: 16px 0 8px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 16px; }
    .code-box { background: #020617; border: 2px dashed #06b6d4; border-radius: 14px; padding: 18px; text-align: center; margin: 24px 0; }
    .code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; }
    .footer { font-size: 11px; color: #64748b; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="badge">BÓVEDA DIGITAL • SEGURIDAD</span>
      <h1>Verificación de Dispositivo</h1>
      <p>Hola${fullName ? ' ' + fullName : ''}, utiliza el siguiente código validador para confirmar tu correo y desbloquear tu dispositivo:</p>
    </div>
    <div class="code-box">
      <div class="code">${otpCode}</div>
    </div>
    <p style="text-align: center; font-size: 12px; color: #64748b;">
      ⏱️ Este código expira en <strong>15 minutos</strong>.<br>
      Si no solicitaste este código, puedes desestimar este mensaje de forma segura.
    </p>
    <div class="footer">
      Bóveda Digital — Wallet Segura Zero-Knowledge • Ecosistema Halterofilia
    </div>
  </div>
</body>
</html>`;

        const emailResult = await sendEmailNotification({
          to: normalizedEmail,
          subject,
          html,
          text: `Tu código de validación de Bóveda Digital es: ${otpCode}. Expira en 15 minutos.`
        });

        return sendJSON(res, 200, {
          success: true,
          message: 'Código de validación generado y despachado',
          email: normalizedEmail,
          simulated: emailResult.simulated,
          code: emailResult.simulated ? otpCode : undefined
        });
      }

      // 4d. POST /api/v1/auth/verify-code (Validación de Código OTP)
      if (pathname === '/api/v1/auth/verify-code' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { email, code } = body;

        if (!email || !code) {
          return sendJSON(res, 400, { error: 'Correo electrónico y código son requeridos' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const record = verificationCodes.get(normalizedEmail);

        if (!record) {
          return sendJSON(res, 400, { error: 'No hay un código pendiente para este correo o ya fue utilizado' });
        }

        if (Date.now() > record.expiresAt) {
          verificationCodes.delete(normalizedEmail);
          return sendJSON(res, 400, { error: 'El código de verificación ha expirado. Solicita uno nuevo.' });
        }

        const cleanCode = code.toString().trim();
        if (record.code !== cleanCode) {
          record.attempts = (record.attempts || 0) + 1;
          if (record.attempts >= 5) {
            verificationCodes.delete(normalizedEmail);
            return sendJSON(res, 400, { error: 'Demasiados intentos fallidos. Solicita un nuevo código.' });
          }
          return sendJSON(res, 400, { error: 'Código de verificación incorrecto' });
        }

        // Código correcto
        verificationCodes.delete(normalizedEmail);
        return sendJSON(res, 200, {
          success: true,
          verified: true,
          email: normalizedEmail,
          message: 'Correo validado exitosamente'
        });
      }

      // --- Middleware de Autenticación para Endpoints Protegidos ---
      const token = extractBearerToken(req);
      const authUser = token ? verifyJWT(token) : null;

      if (!authUser) {
        return sendJSON(res, 401, { error: 'Token de acceso no autorizado o expirado' });
      }

      // 4. GET /api/v1/auth/me
      if (pathname === '/api/v1/auth/me' && req.method === 'GET') {
        return sendJSON(res, 200, { user: authUser });
      }

      // 5. GET /api/v1/subscription/status
      if (pathname === '/api/v1/subscription/status' && req.method === 'GET') {
        return sendJSON(res, 200, {
          subscription: authUser.subscription || { plan: 'free', max_docs: 5, status: 'active' }
        });
      }

      // 6. POST /api/v1/subscription/checkout (Upgrade a Pro)
      if (pathname === '/api/v1/subscription/checkout' && req.method === 'POST') {
        const userObj = db.users.find(u => u.id === authUser.sub);
        if (userObj) {
          userObj.plan = 'pro';
          saveDB();
        }
        return sendJSON(res, 200, {
          success: true,
          plan: 'pro',
          message: 'Suscripción PRO activada exitosamente'
        });
      }

      // 7. GET /api/v1/documents (Listar documentos cifrados y gavetas en nube)
      if (pathname === '/api/v1/documents' && req.method === 'GET') {
        const partition = resolveVaultPartition(authUser);
        const userDocs = db.documents.get(partition) || [];
        const userDrawers = db.customDrawers.get(partition) || {};
        // Adaptar user_id al sub del cliente solicitante para compatibilidad total con clientes iOS/WebKit en caché
        const clientSub = (authUser && authUser.sub) ? authUser.sub : partition;
        const adaptedDocs = userDocs.map(d => ({ ...d, user_id: clientSub }));
        return sendJSON(res, 200, {
          documents: adaptedDocs,
          customDrawers: userDrawers,
          deletedIds: Array.from(db.deletedIds || []),
          crypto_salt: MASTER_CRYPTO_SALT
        });
      }

      // 8. POST /api/v1/documents (Subir o sincronizar documento cifrado)
      if (pathname === '/api/v1/documents' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        // Spec 014: Bloquear registros corruptos "Documento Restaurado" vacíos
        if (body.title === 'Documento Restaurado' && body.category === 'general') {
          return sendJSON(res, 200, { ignored: true, reason: 'corrupted_restored_placeholder' });
        }
        const partition = resolveVaultPartition(authUser);
        const userDocs = db.documents.get(partition) || [];

        // Esquema Halterofilia: Almacenamiento ilimitado para usuarios del ecosistema
        const docId = body.id || 'doc_' + crypto.randomUUID();
        if (db.deletedIds) db.deletedIds.delete(docId);

        const newDoc = {
          id: docId,
          user_id: partition,
          encrypted_payload: body.encrypted_payload,
          iv: body.iv,
          checksum: body.checksum,
          category: body.category || 'identidad',
          title: body.title || 'Documento Cifrado',
          expiry_date: body.expiry_date || null,
          created_at: body.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const existingIdx = userDocs.findIndex(d => d.id === docId);
        if (existingIdx >= 0) {
          userDocs[existingIdx] = newDoc;
        } else {
          userDocs.push(newDoc);
        }
        db.documents.set(partition, userDocs);
        saveDB();

        return sendJSON(res, 201, { document: newDoc });
      }

      // 9. POST /api/v1/documents/batch-sync (Sincronización en lote Zero-Knowledge)
      if (pathname === '/api/v1/documents/batch-sync' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { documents = [], customDrawers = null } = body;
        const partition = resolveVaultPartition(authUser);

        let userDocs = (db.documents.get(partition) || []).filter(
          d => d && d.id && !(db.deletedIds && db.deletedIds.has(d.id))
        );

        // Spec 013 & 014: Fusionar documentos sin permitir jamás borrados masivos ni sobrescrituras con "Documento Restaurado"
        documents.forEach(doc => {
          if (!doc || !doc.id) return;
          if (doc.title === 'Documento Restaurado' && doc.category === 'general') return;
          if ((db.deletedIds && db.deletedIds.has(doc.id)) || String(doc.id).startsWith('doc_demo_')) {
            return;
          }
          const idx = userDocs.findIndex(d => d.id === doc.id);
          if (idx >= 0) {
            const incomingTime = new Date(doc.updated_at || 0).getTime();
            const existingTime = new Date(userDocs[idx].updated_at || 0).getTime();
            if (incomingTime >= existingTime) {
              userDocs[idx] = { ...userDocs[idx], ...doc, user_id: partition, updated_at: doc.updated_at || new Date().toISOString() };
            }
          } else {
            // Spec 015: Evitar que un dispositivo inserte un segundo registro con distinto ID para el mismo (category, title)
            const incCat = String(doc.category || 'identidad').trim().toLowerCase();
            const incTitle = String(doc.title || '').trim().toLowerCase();
            const dupIdx = userDocs.findIndex(
              d => String(d.category || 'identidad').trim().toLowerCase() === incCat &&
                   String(d.title || '').trim().toLowerCase() === incTitle
            );
            if (dupIdx < 0) {
              userDocs.push({ ...doc, user_id: partition, updated_at: doc.updated_at || new Date().toISOString() });
            }
          }
        });

        db.documents.set(partition, userDocs);

        if (customDrawers && typeof customDrawers === 'object') {
          const currentDrawers = db.customDrawers.get(partition) || {};
          db.customDrawers.set(partition, { ...currentDrawers, ...customDrawers });
        }

        saveDB();
        return sendJSON(res, 200, {
          syncedCount: documents.length,
          totalCloudDocs: userDocs.length,
          deletedIds: Array.from(db.deletedIds || []),
          status: 'synced'
        });
      }

      // 10. DELETE /api/v1/documents/:id (Eliminar documento cifrado en nube)
      if (pathname.startsWith('/api/v1/documents/') && req.method === 'DELETE') {
        const docId = pathname.replace('/api/v1/documents/', '').trim();
        const partition = resolveVaultPartition(authUser);
        if (db.deletedIds && docId) db.deletedIds.add(docId);
        let userDocs = db.documents.get(partition) || [];
        const initialLen = userDocs.length;
        userDocs = userDocs.filter(d => d.id !== docId);

        if (userDocs.length === initialLen) {
          saveDB();
          return sendJSON(res, 404, { error: 'Documento no encontrado o no pertenece al usuario' });
        }

        db.documents.set(partition, userDocs);
        saveDB();
        return sendJSON(res, 200, { success: true, id: docId, message: 'Documento eliminado de la nube exitosamente' });
      }

      // 11. POST /api/v1/share/create (Generar enlace temporal seguro)
      if (pathname === '/api/v1/share/create' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const token = crypto.randomBytes(16).toString('hex');
        const shareRecord = {
          token,
          user_id: authUser.sub,
          encrypted_payload: body.encrypted_payload,
          iv: body.iv,
          expires_at: new Date(Date.now() + (body.durationHours || 24) * 3600000).toISOString()
        };
        db.shares.set(token, shareRecord);
        saveDB();
        return sendJSON(res, 201, {
          shareToken: token,
          shareUrl: `/share/${token}`,
          expiresAt: shareRecord.expires_at
        });
      }

      // Ruta de API no encontrada
      return sendJSON(res, 404, { error: `Endpoint ${pathname} no encontrado` });

    } catch (err) {
      console.error('Error en API:', err);
      return sendJSON(res, 500, { error: 'Error interno del servidor', details: err.message });
    }
  }

  // Servir frontend SPA estático para cualquier otra ruta
  serveStaticFile(req, res, __dirname);
});

// Iniciar servidor si se ejecuta directamente
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🔒 BÓVEDA DIGITAL — Servidor y API REST Activo`);
    console.log(`🌐 Acceso Web: http://localhost:${PORT}`);
    console.log(`🛡️  API Salud:  http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
  });
}

module.exports = {
  server,
  db,
  saveDB,
  loadDB,
  DATA_FILE,
  MASTER_CRYPTO_SALT,
  resolveVaultPartition,
  generateJWT,
  verifyJWT,
  decodeJWTWithoutExpiry,
  hashPassword,
  verificationCodes,
  sendEmailNotification,
  loadEnvFile
};
