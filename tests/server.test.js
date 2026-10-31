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

  await t.test('SDD 017: DELETE /api/v1/documents/:id purga réplicas con idéntica categoría y título sin dejar duplicados', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    const twinId1 = 'doc_twin_test_001';
    const twinId2 = 'doc_twin_test_002';

    // Subir dos documentos que comparten categoría y título (réplicas)
    await makeRequest(
      '/api/v1/documents',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
      {
        id: twinId1,
        category: 'identidad',
        title: 'Certificado de Residencia Test',
        encrypted_payload: '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',
        iv: 'vzVtVTcoRaXpqcb8',
        checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    );

    await makeRequest(
      '/api/v1/documents',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
      {
        id: twinId2,
        category: 'identidad',
        title: 'Certificado de Residencia Test ', // con espacio extra
        encrypted_payload: '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',
        iv: 'vzVtVTcoRaXpqcb8',
        checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    );

    // Listar: ambos deben estar inicialmente
    const listBefore = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.ok(listBefore.body.documents.some(d => d.id === twinId1));
    assert.ok(listBefore.body.documents.some(d => d.id === twinId2));

    // Eliminar por twinId1: debe purgar automáticamente twinId1 Y twinId2 por tener categoría y título idénticos
    const delRes = await makeRequest(`/api/v1/documents/${twinId1}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(delRes.status, 200);

    const listAfter = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.ok(!listAfter.body.documents.some(d => d.id === twinId1), 'twinId1 debe haber sido eliminado');
    assert.ok(!listAfter.body.documents.some(d => d.id === twinId2), 'twinId2 debe haber sido purgado como réplica');
    assert.ok(listAfter.body.deletedIds.includes(twinId1), 'twinId1 debe estar registrado en deletedIds');
    assert.ok(listAfter.body.deletedIds.includes(twinId2), 'twinId2 debe estar registrado en deletedIds');
  });

  await t.test('SDD 018: POST /api/v1/documents/batch-sync des-tombstonea documentos eliminados y limpia db.deletedIds', async () => {
    const loginRes = await makeRequest(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'andres.pro@boveda.com', password: 'PasswordSeguro123!' }
    );
    const token = loginRes.body.accessToken;

    const restoreDocId = 'doc_batch_sync_restore_018';

    // 1. Crear documento y luego eliminarlo para que quede en db.deletedIds
    await makeRequest(
      '/api/v1/documents',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
      {
        id: restoreDocId,
        category: 'finanzas',
        title: 'Documento Para Eliminar y Restaurar 018',
        encrypted_payload: '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',
        iv: 'vzVtVTcoRaXpqcb8',
        checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    );

    await makeRequest(`/api/v1/documents/${restoreDocId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const listDeleted = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.ok(listDeleted.body.deletedIds.includes(restoreDocId), 'restoreDocId debe estar en deletedIds tras DELETE');

    // 2. Subir en batch-sync simulando restauración de respaldo
    const restoreRes = await makeRequest(
      '/api/v1/documents/batch-sync',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
      {
        documents: [{
          id: restoreDocId,
          category: 'finanzas',
          title: 'Documento Para Eliminar y Restaurar 018',
          encrypted_payload: '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',
          iv: 'vzVtVTcoRaXpqcb8',
          checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        }]
      }
    );

    assert.equal(restoreRes.status, 200);
    assert.ok(!restoreRes.body.deletedIds.includes(restoreDocId), 'restoreDocId no debe estar en deletedIds tras batch-sync restaurador');

    const listRestored = await makeRequest('/api/v1/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.ok(listRestored.body.documents.some(d => d.id === restoreDocId), 'restoreDocId debe volver a aparecer en los documentos activos');
  });
});


