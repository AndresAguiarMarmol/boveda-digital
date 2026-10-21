const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server, generateJWT, verifyJWT, hashPassword, db } = require('../server.js');

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
});
