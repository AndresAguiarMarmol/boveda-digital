process.env.NO_DISK_PERSIST = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server, generateJWT, verifyJWT, hashPassword, db, loadEnvFile, sendEmailNotification } = require('../server.js');

// Forzar modo simulado para pruebas unitarias herméticas y rápidas
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

let testPort = 3001;
let serverInstance;

function makeRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: testPort,
        path,
        ...options
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('Servidor API: Inicialización y Suite de Endpoints', async (t) => {
  await new Promise(resolve => {
    serverInstance = server.listen(testPort, resolve);
  });

  t.after(() => {
    serverInstance.close();
  });

  await t.test('JWT: genera y valida tokens criptográficos con claims correctos', () => {
    const payload = { sub: 'usr_test_999', email: 'test@boveda.com', roles: ['user'] };
    const token = generateJWT(payload, 60);
    assert.ok(typeof token === 'string');
    assert.equal(token.split('.').length, 3);

    const verified = verifyJWT(token);
    assert.equal(verified.sub, 'usr_test_999');
    assert.equal(verified.email, 'test@boveda.com');

    // Token adulterado debe ser rechazado
    const tampered = token.slice(0, -4) + 'abcd';
    assert.equal(verifyJWT(tampered), null);
  });

  await t.test('GET /api/health: retorna estado ok y compatible con Halterofilia', async () => {
    const res = await makeRequest('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.ecosystem, 'halterofilia-compatible');
    assert.equal(res.body.zeroKnowledge, true);
  });

  await t.test('POST /api/v1/auth/login: rechaza credenciales erróneas', async () => {
    const res = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordErroneo' }
    );
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  await t.test('POST /api/v1/auth/login: autentica usuario PRO y emite token JWT', async () => {
    const res = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.subscription.plan, 'pro');
    assert.equal(res.body.user.subscription.max_docs, -1);
  });

  await t.test('POST /api/v1/auth/login: autentica usuario Free con cuota de 5 docs', async () => {
    const res = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'demo.free@boveda.com', password: 'PasswordSeguro123!' }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.subscription.plan, 'free');
    assert.equal(res.body.user.subscription.max_docs, 5);
  });

  await t.test('POST /api/v1/documents: deniega subida sin autorización JWT', async () => {
    const res = await makeRequest(
      '/api/v1/documents',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { title: 'Doc No Autorizado' }
    );
    assert.equal(res.status, 401);
  });

  await t.test('POST /api/v1/documents: almacena documento cifrado para usuario autenticado', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    const docPayload = {
      title: 'Pasaporte Cifrado',
      category: 'identidad',
      encrypted_payload: 'U2FsdGVkX1+payload...',
      iv: 'x3kd82jf91kd',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    };

    const docRes = await makeRequest(
      '/api/v1/documents',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      },
      docPayload
    );

    assert.equal(docRes.status, 201);
    assert.ok(docRes.body.document.id);
    assert.equal(docRes.body.document.title, 'Pasaporte Cifrado');

    // Comprobar que aparece en GET /api/v1/documents
    const listRes = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.documents.length >= 1);
  });

  await t.test('POST /api/v1/share/create: genera enlace temporal seguro efímero', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    const shareRes = await makeRequest(
      '/api/v1/share/create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      },
      {
        encrypted_payload: 'U2FsdGVkX1efimero...',
        iv: 'iv_aleatorio_99',
        durationHours: 12
      }
    );

    assert.equal(shareRes.status, 201);
    assert.ok(shareRes.body.shareToken);

    // Consultar el enlace generado
    const getShareRes = await makeRequest(`/api/v1/share/${shareRes.body.shareToken}`, {
      method: 'GET'
    });
    assert.equal(getShareRes.status, 200);
    assert.equal(getShareRes.body.encrypted_payload, 'U2FsdGVkX1efimero...');
  });

  await t.test('POST /api/v1/documents/batch-sync: sincroniza en lote documentos Zero-Knowledge', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    const batchDocs = [
      {
        id: 'doc_batch_sync_001',
        title: 'Contrato Notarial Cifrado',
        category: 'residencia',
        encrypted_payload: 'U2FsdGVkX1_notarial_payload',
        iv: 'iv_batch_001',
        checksum: 'checksum_001'
      },
      {
        id: 'doc_batch_sync_002',
        title: 'Certificado Médico Cifrado',
        category: 'salud',
        encrypted_payload: 'U2FsdGVkX1_salud_payload',
        iv: 'iv_batch_002',
        checksum: 'checksum_002'
      }
    ];

    const syncRes = await makeRequest(
      '/api/v1/documents/batch-sync',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      },
      { documents: batchDocs }
    );

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.status, 'synced');
    assert.equal(syncRes.body.syncedCount, 2);

    // Verificar que ambos documentos existen en la lista remota
    const listRes = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.documents.some(d => d.id === 'doc_batch_sync_001'));
    assert.ok(listRes.body.documents.some(d => d.id === 'doc_batch_sync_002'));
  });

  await t.test('DELETE /api/v1/documents/:id: elimina documento cifrado en la nube', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    // Eliminar el documento creado previamente en batch-sync
    const deleteRes = await makeRequest('/api/v1/documents/doc_batch_sync_001', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);
    assert.equal(deleteRes.body.id, 'doc_batch_sync_001');

    // Intentar eliminarlo de nuevo debe retornar 404
    const deleteAgainRes = await makeRequest('/api/v1/documents/doc_batch_sync_001', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(deleteAgainRes.status, 404);
  });

  await t.test('POST /api/v1/license/generate: genera token de activación compatible desde endpoint administrativo', async () => {
    const res = await makeRequest(
      '/api/v1/license/generate',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { cadenaSolicitud: 'REQ|dev_backend_test|admin@halterofilia.com', diasValidez: 365 }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'Debe devolver el token Base64');
    assert.equal(res.body.payload.deviceId, 'dev_backend_test');
    assert.equal(res.body.payload.email, 'admin@halterofilia.com');
  });

  await t.test('SDD 007: POST /api/v1/auth/send-verification-code genera código OTP y valida sintaxis', async () => {
    // 1. Rechazar sin email o formato inválido
    const badRes = await makeRequest(
      '/api/v1/auth/send-verification-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'correo-invalido-sin-arroba' }
    );
    assert.equal(badRes.status, 400);

    // 2. Generación exitosa de código de 6 dígitos
    const sendRes = await makeRequest(
      '/api/v1/auth/send-verification-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'nuevo.usuario@ejemplo.com', fullName: 'Nuevo Usuario' }
    );
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.body.success, true);
    assert.equal(sendRes.body.email, 'nuevo.usuario@ejemplo.com');
    assert.ok(sendRes.body.code, 'Debe devolver código en modo simulado para tests');
    assert.equal(sendRes.body.code.length, 6);
    assert.match(sendRes.body.code, /^[0-9]{6}$/);
  });

  await t.test('SDD 007: POST /api/v1/auth/verify-code valida códigos correctos y rechaza incorrectos o reusados', async () => {
    // 1. Generar código para pruebas
    const sendRes = await makeRequest(
      '/api/v1/auth/send-verification-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'verif.test@ejemplo.com' }
    );
    const validCode = sendRes.body.code;

    // 2. Probar código erróneo
    const wrongRes = await makeRequest(
      '/api/v1/auth/verify-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'verif.test@ejemplo.com', code: '000000' }
    );
    assert.equal(wrongRes.status, 400);

    // 3. Probar código correcto
    const correctRes = await makeRequest(
      '/api/v1/auth/verify-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'verif.test@ejemplo.com', code: validCode }
    );
    assert.equal(correctRes.status, 200);
    assert.equal(correctRes.body.success, true);
    assert.equal(correctRes.body.verified, true);

    // 4. Reuso del código debe ser rechazado inmediatamente
    const reuseRes = await makeRequest(
      '/api/v1/auth/verify-code',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'verif.test@ejemplo.com', code: validCode }
    );
    assert.equal(reuseRes.status, 400);
  });

  await t.test('SDD 008: loadEnvFile parsea .env nativamente sin dependencias externas', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const os = require('node:os');

    const tempEnvPath = path.join(os.tmpdir(), `test_${Date.now()}.env`);
    fs.writeFileSync(tempEnvPath, [
      '# Archivo de prueba',
      'SMTP_TEST_HOST=smtp.gmail.com',
      'SMTP_TEST_PORT=465',
      'SMTP_TEST_PASS="abcd efgh ijkl mnop"',
      'EMPTY_VAL=',
      'PLAIN_VAL=hello_world'
    ].join('\n'), 'utf8');

    const envMap = loadEnvFile(tempEnvPath);
    try { fs.unlinkSync(tempEnvPath); } catch {}

    assert.equal(envMap.SMTP_TEST_HOST, 'smtp.gmail.com');
    assert.equal(envMap.SMTP_TEST_PORT, '465');
    assert.equal(envMap.SMTP_TEST_PASS, 'abcd efgh ijkl mnop');
    assert.equal(envMap.EMPTY_VAL, '');
    assert.equal(envMap.PLAIN_VAL, 'hello_world');
  });

  await t.test('SDD 008: sendEmailNotification retorna modo simulado seguro si faltan credenciales', async () => {
    const oldHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;

    const result = await sendEmailNotification({
      to: 'usuario.test@ejemplo.com',
      subject: 'Código de Prueba',
      text: 'Tu código es 123456',
      html: '<b>123456</b>'
    });

    if (oldHost) process.env.SMTP_HOST = oldHost;

    assert.equal(result.simulated, true);
    assert.ok(result.messageId.startsWith('<simulated-'));
  });

  await t.test('SDD 012: Dos dispositivos (PC y Celular) comparten la misma BD de documentos, gavetas y crypto_salt', async () => {
    // Dispositivo 1 (PC): inicia sesión con el correo personal autenticado
    const loginPc = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.aguiar.marmol@gmail.com', password: 'PasswordSeguro123!' }
    );
    assert.equal(loginPc.status, 200);
    const tokenPc = loginPc.body.accessToken;

    // Dispositivo 2 (Celular): inicia sesión con usuario de dispositivo o correo corporativo
    const loginMobile = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    assert.equal(loginMobile.status, 200);
    const tokenMobile = loginMobile.body.accessToken;

    // Ambos dispositivos deben recibir exactamente el mismo crypto_salt maestro
    assert.equal(loginPc.body.user.crypto_salt, '226000658459336d4184642799fc8498');
    assert.equal(loginMobile.body.user.crypto_salt, loginPc.body.user.crypto_salt);

    // Subir documento desde PC
    const newDocId = 'doc_multidevice_sync_test';
    const syncPcRes = await makeRequest(
      '/api/v1/documents/batch-sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenPc}` }
      },
      {
        documents: [{
          id: newDocId,
          title: 'Documento Sincronizado PC a Celular',
          category: 'identidad',
          encrypted_payload: 'h9+Mv5yJkO1a+l5h7F9z0Bq2RealEncryptedBase64Payload==',
          iv: 'dGVzdF9pdl8xMg==',
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        }],
        customDrawers: {
          gaveta_viajes_test: { id: 'gaveta_viajes_test', label: 'Viajes', drawerNumber: 7, isCustom: true }
        }
      }
    );
    assert.equal(syncPcRes.status, 200);

    // Consultar desde el Celular: debe ver inmediatamente el documento y la gaveta creados en la PC
    const getMobileRes = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMobile}` }
    });
    assert.equal(getMobileRes.status, 200);
    assert.ok(getMobileRes.body.documents.some(d => d.id === newDocId), 'El celular debe recibir el documento creado en la PC');
    assert.ok(getMobileRes.body.customDrawers && getMobileRes.body.customDrawers.gaveta_viajes_test, 'El celular debe recibir las gavetas personalizadas de la PC');

    // Eliminar el documento de prueba desde el Celular y comprobar propagación a PC
    const delMobileRes = await makeRequest(`/api/v1/documents/${newDocId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMobile}` }
    });
    assert.equal(delMobileRes.status, 200);

    const getPcAfterDel = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenPc}` }
    });
    assert.ok(!getPcAfterDel.body.documents.some(d => d.id === newDocId), 'La eliminación en el celular debe reflejarse en la PC');
    assert.ok(getPcAfterDel.body.deletedIds.includes(newDocId), 'deletedIds debe incluir el ID eliminado para limpiar IndexedDB local');
  });
});


