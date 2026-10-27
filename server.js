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

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'boveda_digital_secret_key_halterofilia_2026';

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'vault_cloud.json');

// Base de datos para el servidor (con persistencia a disco)
const db = {
  users: [
    {
      id: 'usr_pro_001',
      email: 'andres.pro@boveda.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Andrés Aguiar (PRO)',
      plan: 'pro',
      cryptoSalt: '226000658459336d4184642799fc8498'
    },
    {
      id: 'usr_free_002',
      email: 'demo.free@boveda.com',
      passwordHash: hashPassword('PasswordSeguro123!'),
      fullName: 'Usuario Demo (Free)',
      plan: 'free'
    }
  ],
  documents: new Map(), // key: user_id, value: Array de docs cifrados
  shares: new Map()     // key: token, value: payload efímero
};

function saveDB() {
  if (process.env.NO_DISK_PERSIST === 'true') return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serialized = {
      users: db.users,
      documents: Object.fromEntries(db.documents),
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
        db.users = parsed.users;
      }
      if (parsed.documents) {
        db.documents = new Map(Object.entries(parsed.documents));
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

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
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
          crypto_salt: user.cryptoSalt || 'ae8713595fed1e759db1062454187513',
          subscription: {
            plan: user.plan,
            status: 'active',
            max_docs: isPro ? -1 : 5,
            cloud_sync_enabled: isPro,
            expires_at: new Date(Date.now() + 365 * 86400000).toISOString()
          }
        };

        const accessToken = generateJWT(claims, 3600);
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

        const newUser = {
          id: 'usr_' + crypto.randomUUID(),
          email: normalizedEmail,
          passwordHash: hashPassword(password),
          fullName: full_name || normalizedEmail.split('@')[0].toUpperCase(),
          plan: 'free',
          cryptoSalt: crypto.randomBytes(16).toString('hex')
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
            plan: 'free',
            status: 'active',
            max_docs: 5,
            cloud_sync_enabled: false,
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
          }
        };

        const accessToken = generateJWT(claims, 3600);
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

        // Simulación de renovación de token de acceso
        const token = extractBearerToken(req);
        const currentPayload = token ? verifyJWT(token) : null;
        const sub = currentPayload ? currentPayload.sub : 'usr_refreshed';

        const refreshedToken = generateJWT({
          sub,
          apps: ['halterofilia', 'boveda_digital']
        }, 3600);

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

      // 7. GET /api/v1/documents (Listar documentos cifrados en nube)
      if (pathname === '/api/v1/documents' && req.method === 'GET') {
        const userDocs = db.documents.get(authUser.sub) || [];
        return sendJSON(res, 200, { documents: userDocs });
      }

      // 8. POST /api/v1/documents (Subir o sincronizar documento cifrado)
      if (pathname === '/api/v1/documents' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const userDocs = db.documents.get(authUser.sub) || [];

        // Validar cuota en Plan Free (máximo 5 documentos)
        const isFree = (authUser.subscription && authUser.subscription.plan === 'free');
        if (isFree && userDocs.length >= 5) {
          return sendJSON(res, 403, {
            error: 'Límite alcanzado: El Plan Gratuito permite un máximo de 5 documentos. Actualiza a PRO para almacenamiento ilimitado.'
          });
        }

        const newDoc = {
          id: body.id || 'doc_' + crypto.randomUUID(),
          user_id: authUser.sub,
          encrypted_payload: body.encrypted_payload,
          iv: body.iv,
          checksum: body.checksum,
          category: body.category || 'identidad',
          title: body.title || 'Documento Cifrado',
          expiry_date: body.expiry_date || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        userDocs.push(newDoc);
        db.documents.set(authUser.sub, userDocs);
        saveDB();

        return sendJSON(res, 201, { document: newDoc });
      }

      // 9. POST /api/v1/documents/batch-sync (Sincronización en lote Zero-Knowledge)
      if (pathname === '/api/v1/documents/batch-sync' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { documents = [] } = body;

        let userDocs = db.documents.get(authUser.sub) || [];
        // Fusionar documentos
        documents.forEach(doc => {
          const idx = userDocs.findIndex(d => d.id === doc.id);
          if (idx >= 0) {
            userDocs[idx] = { ...userDocs[idx], ...doc, updated_at: new Date().toISOString() };
          } else {
            userDocs.push({ ...doc, user_id: authUser.sub, updated_at: new Date().toISOString() });
          }
        });

        db.documents.set(authUser.sub, userDocs);
        saveDB();
        return sendJSON(res, 200, { syncedCount: documents.length, status: 'synced' });
      }

      // 10. DELETE /api/v1/documents/:id (Eliminar documento cifrado en nube)
      if (pathname.startsWith('/api/v1/documents/') && req.method === 'DELETE') {
        const docId = pathname.replace('/api/v1/documents/', '').trim();
        let userDocs = db.documents.get(authUser.sub) || [];
        const initialLen = userDocs.length;
        userDocs = userDocs.filter(d => d.id !== docId);

        if (userDocs.length === initialLen) {
          return sendJSON(res, 404, { error: 'Documento no encontrado o no pertenece al usuario' });
        }

        db.documents.set(authUser.sub, userDocs);
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
  generateJWT,
  verifyJWT,
  hashPassword
};
