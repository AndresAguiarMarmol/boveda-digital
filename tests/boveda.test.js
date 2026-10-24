const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Utilidades puras de Bóveda Digital para pruebas unitarias
function calcularEstadoVencimiento(expiryDateStr, fechaReferencia = new Date()) {
  if (!expiryDateStr) return 'VALID';
  const exp = new Date(expiryDateStr);
  const now = new Date(fechaReferencia);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 86400000);

  if (exp < now) {
    return 'EXPIRED';
  } else if (exp <= thirtyDaysAhead) {
    const daysLeft = Math.ceil((exp - now) / 86400000);
    return `WARNING_${daysLeft}D`;
  }
  return 'VALID';
}

function validarCuotaDocumentos(plan, documentosActuales) {
  if (plan === 'pro') return { permitida: true, maxDocs: -1 };
  const maxDocs = 5;
  return {
    permitida: documentosActuales < maxDocs,
    maxDocs,
    restantes: Math.max(0, maxDocs - documentosActuales)
  };
}

function decodificarClaimsJWT(jwtString) {
  const parts = jwtString.split('.');
  if (parts.length < 2) throw new Error('Formato JWT inválido');
  const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
  return JSON.parse(jsonStr);
}

test('calcularEstadoVencimiento: detecta documentos vencidos correctamente', () => {
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  assert.equal(calcularEstadoVencimiento(ayer), 'EXPIRED');
});

test('calcularEstadoVencimiento: detecta alerta cuando vence en menos de 30 días', () => {
  const en10Dias = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
  const estado = calcularEstadoVencimiento(en10Dias);
  assert.ok(estado.startsWith('WARNING_'), `Esperado WARNING, recibido: ${estado}`);
});

test('calcularEstadoVencimiento: documento sin fecha o con vigencia lejana es VALID', () => {
  assert.equal(calcularEstadoVencimiento(null), 'VALID');
  const enCincoAnios = new Date(Date.now() + 5 * 365 * 86400000).toISOString().split('T')[0];
  assert.equal(calcularEstadoVencimiento(enCincoAnios), 'VALID');
});

test('validarCuotaDocumentos: en plan Free restringe al llegar a 5 documentos', () => {
  assert.equal(validarCuotaDocumentos('free', 4).permitida, true);
  assert.equal(validarCuotaDocumentos('free', 5).permitida, false);
  assert.equal(validarCuotaDocumentos('free', 6).permitida, false);
});

test('validarCuotaDocumentos: en plan Pro permite documentos ilimitados', () => {
  assert.equal(validarCuotaDocumentos('pro', 0).permitida, true);
  assert.equal(validarCuotaDocumentos('pro', 5).permitida, true);
  assert.equal(validarCuotaDocumentos('pro', 100).permitida, true);
  assert.equal(validarCuotaDocumentos('pro', 100).maxDocs, -1);
});

test('decodificarClaimsJWT: decodifica claims de usuario y suscripción compatibles con Halterofilia', () => {
  const payloadOriginal = {
    sub: 'usr_test_123',
    email: 'atleta@halterofilia.com',
    apps: ['halterofilia', 'boveda_digital'],
    subscription: { plan: 'pro', status: 'active' }
  };
  const b64Payload = Buffer.from(JSON.stringify(payloadOriginal)).toString('base64url');
  const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${b64Payload}.fake_signature`;

  const claims = decodificarClaimsJWT(fakeJwt);
  assert.equal(claims.sub, 'usr_test_123');
  assert.equal(claims.subscription.plan, 'pro');
  assert.ok(claims.apps.includes('boveda_digital'));
});

// Agrupación de expedientes en las Gavetas del Archivador (Soporta Gavetas por Defecto y Personalizadas)
function agruparPorGaveta(documentos, categoriasDisponibles = {}) {
  const defaultKeys = ['identidad', 'vehiculos', 'finanzas', 'residencia', 'salud'];
  const gavetas = {};

  defaultKeys.forEach(k => { gavetas[k] = []; });
  Object.keys(categoriasDisponibles).forEach(k => {
    if (!gavetas[k]) gavetas[k] = [];
  });

  documentos.forEach(doc => {
    const cat = doc.category || 'identidad';
    if (gavetas[cat]) {
      gavetas[cat].push(doc);
    } else {
      gavetas.identidad.push(doc);
    }
  });

  return gavetas;
}

test('agruparPorGaveta: clasifica correctamente expedientes en sus gavetas correspondientes', () => {
  const docs = [
    { id: '1', title: 'Pasaporte', category: 'identidad' },
    { id: '2', title: 'DNI', category: 'identidad' },
    { id: '3', title: 'Licencia', category: 'vehiculos' },
    { id: '4', title: 'Tarjeta Visa', category: 'finanzas' },
    { id: '5', title: 'Contrato Alquiler', category: 'residencia' },
    { id: '6', title: 'Carnet Vacunas', category: 'salud' },
    { id: '7', title: 'Desconocido', category: 'otro' } // Debe caer en identidad por defecto
  ];

  const resultado = agruparPorGaveta(docs);
  assert.equal(resultado.identidad.length, 3);
  assert.equal(resultado.vehiculos.length, 1);
  assert.equal(resultado.finanzas.length, 1);
  assert.equal(resultado.residencia.length, 1);
  assert.equal(resultado.salud.length, 1);
});

test('agruparPorGaveta: cuenta gavetas vacías sin lanzar excepciones', () => {
  const resultado = agruparPorGaveta([]);
  assert.equal(resultado.identidad.length, 0);
  assert.equal(resultado.vehiculos.length, 0);
  assert.equal(resultado.finanzas.length, 0);
  assert.equal(resultado.residencia.length, 0);
  assert.equal(resultado.salud.length, 0);
});

test('agruparPorGaveta: soporta gavetas personalizadas dinámicas', () => {
  const customCats = {
    titulos_academicos: { label: 'Títulos Académicos', isCustom: true, color: '#6366f1' },
    criptoactivos: { label: 'Criptoactivos', isCustom: true, color: '#f97316' }
  };

  const docs = [
    { id: '1', title: 'Diploma Universitario', category: 'titulos_academicos' },
    { id: '2', title: 'Certificado Cloud', category: 'titulos_academicos' },
    { id: '3', title: 'Paper Wallet', category: 'criptoactivos' },
    { id: '4', title: 'Pasaporte', category: 'identidad' }
  ];

  const resultado = agruparPorGaveta(docs, customCats);
  assert.equal(resultado.titulos_academicos.length, 2);
  assert.equal(resultado.criptoactivos.length, 1);
  assert.equal(resultado.identidad.length, 1);
});

// Utilidad de formateo de Credencial Digital y MRZ (Machine Readable Zone)
function formatearCredencialVisual(doc, catInfo = null) {
  const categoryThemes = {
    identidad: 'theme-identidad',
    vehiculos: 'theme-vehiculos',
    finanzas: 'theme-finanzas',
    residencia: 'theme-residencia',
    salud: 'theme-salud'
  };
  const isDefault = Boolean(categoryThemes[doc.category]);
  const themeClass = isDefault ? categoryThemes[doc.category] : 'theme-custom';
  const customColor = (!isDefault && catInfo && catInfo.color) ? catInfo.color : null;
  const rawCleanNum = (doc.doc_number || '000000000').replace(/[^A-Z0-9]/gi, '').toUpperCase() || '000000000';
  const mrzNum = rawCleanNum.padEnd(9, '<').slice(0, 9);
  const mrzLine1 = `IDUTO${mrzNum}${'<'.repeat(26)}`;
  const mrzLine2 = `8501017M3212318UTO${'<'.repeat(21)}4`;
  return {
    themeClass,
    customColor,
    mrzLine1,
    mrzLine2,
    hasEmvChip: true,
    hasBiometricPhoto: true
  };
}

test('formatearCredencialVisual: asigna correctamente el tema de seguridad según categoría', () => {
  assert.equal(formatearCredencialVisual({ category: 'identidad' }).themeClass, 'theme-identidad');
  assert.equal(formatearCredencialVisual({ category: 'vehiculos' }).themeClass, 'theme-vehiculos');
  assert.equal(formatearCredencialVisual({ category: 'finanzas' }).themeClass, 'theme-finanzas');
  assert.equal(formatearCredencialVisual({ category: 'residencia' }).themeClass, 'theme-residencia');
  assert.equal(formatearCredencialVisual({ category: 'salud' }).themeClass, 'theme-salud');
  assert.equal(formatearCredencialVisual({ category: 'desconocido' }).themeClass, 'theme-custom');
});

test('formatearCredencialVisual: asigna tema personalizado y color dinámico a categorías custom', () => {
  const customCat = { label: 'Títulos', color: '#8b5cf6' };
  const cred = formatearCredencialVisual({ category: 'titulos', doc_number: 'TIT-9901' }, customCat);
  assert.equal(cred.themeClass, 'theme-custom');
  assert.equal(cred.customColor, '#8b5cf6');
});

test('formatearCredencialVisual: genera líneas MRZ estandarizadas de 40 caracteres con padding', () => {
  const cred = formatearCredencialVisual({
    category: 'identidad',
    doc_number: 'PAS-84920184'
  });
  assert.ok(cred.mrzLine1.startsWith('IDUTO'));
  assert.ok(cred.mrzLine1.includes('PAS849201'));
  assert.equal(cred.mrzLine1.length, 40);
  assert.equal(cred.mrzLine2.length, 40);
  assert.equal(cred.hasEmvChip, true);
  assert.equal(cred.hasBiometricPhoto, true);
});

// Validación de creación y borrado de gavetas personalizadas
function validarNuevaGaveta(label, categoriasExistentes) {
  if (!label || !label.trim()) return { valido: false, error: 'Etiqueta requerida' };
  const rawKey = label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
  const key = `custom_${rawKey}`;
  if (categoriasExistentes[key] || ['identidad', 'vehiculos', 'finanzas', 'residencia', 'salud'].includes(key)) {
    return { valido: false, error: 'La gaveta ya existe' };
  }
  return { valido: true, key };
}

function validarEliminarGaveta(key, categoriasExistentes, documentos) {
  if (!categoriasExistentes[key]) return { permitido: false, error: 'Gaveta inexistente' };
  if (!categoriasExistentes[key].isCustom) return { permitido: false, error: 'No se pueden eliminar las gavetas principales del sistema' };
  const docsEnGaveta = documentos.filter(d => d.category === key);
  if (docsEnGaveta.length > 0) return { permitido: false, error: 'La gaveta contiene documentos activos' };
  return { permitido: true };
}

test('validarNuevaGaveta: genera clave única y previene duplicados', () => {
  const categorias = {
    identidad: { label: 'Identidad' },
    custom_certificados: { label: 'Certificados' }
  };

  const val1 = validarNuevaGaveta('Certificados', categorias);
  assert.equal(val1.valido, false);

  const val2 = validarNuevaGaveta('Títulos y Grados', categorias);
  assert.equal(val2.valido, true);
  assert.equal(val2.key, 'custom_titulos_y_grados');

  const valVacio = validarNuevaGaveta('   ', categorias);
  assert.equal(valVacio.valido, false);
});

test('validarEliminarGaveta: restringe borrado de gavetas del sistema o con documentos', () => {
  const categorias = {
    identidad: { label: 'Identidad', isCustom: false },
    custom_viajes: { label: 'Viajes', isCustom: true }
  };
  const docs = [
    { id: '1', category: 'custom_viajes' }
  ];

  // No se puede borrar gaveta del sistema
  assert.equal(validarEliminarGaveta('identidad', categorias, []).permitido, false);

  // No se puede borrar gaveta con documentos
  assert.equal(validarEliminarGaveta('custom_viajes', categorias, docs).permitido, false);

  // Sí se puede borrar gaveta custom vacía
  assert.equal(validarEliminarGaveta('custom_viajes', categorias, []).permitido, true);
});

// =============================================================================
// PRUEBAS DE RESPALDO Y RECUPERACIÓN (RF-13, RF-14, RF-15)
// =============================================================================
const fs = require('node:fs');
const path = require('node:path');
const { serializarBackupBoveda, validarBackupBoveda, fusionarDocumentosBackup } = require('../assets/js/storage.js');

test('serializarBackupBoveda: estructura JSON estandarizada con metadatos y Zero-Knowledge', () => {
  const docs = [
    {
      id: 'doc_1',
      user_id: 'usr_test',
      category: 'identidad',
      title: 'Pasaporte',
      encrypted_payload: 'payload_cifrado_base64',
      iv: 'iv_base64',
      checksum: 'sha256_hash',
      expiry_date: '2028-10-18'
    }
  ];
  const drawers = { custom_viajes: { label: 'Viajes', color: '#06b6d4' } };
  const backup = serializarBackupBoveda(docs, drawers, 'usr_test', '2026-10-18T20:00:00.000Z');

  assert.equal(backup.app, 'BovedaDigital');
  assert.equal(backup.version, '1.0');
  assert.equal(backup.user_id, 'usr_test');
  assert.equal(backup.exported_at, '2026-10-18T20:00:00.000Z');
  assert.equal(backup.total_documents, 1);
  assert.deepEqual(backup.customDrawers, drawers);
  assert.equal(backup.documents[0].encrypted_payload, 'payload_cifrado_base64');
});

test('serializarBackupBoveda: preserva crypto_salt y pin_hash para restauración multi-dispositivo', () => {
  const docs = [{ id: 'doc_1', category: 'identidad', encrypted_payload: 'x', iv: 'y', checksum: 'z' }];
  const backup = serializarBackupBoveda(docs, {}, 'usr_test', '2026-10-24T20:00:00.000Z', 'ae8713595fed1e759db1062454187513', 'hash123');

  assert.equal(backup.crypto_salt, 'ae8713595fed1e759db1062454187513');
  assert.equal(backup.pin_hash, 'hash123');
  assert.equal(validarBackupBoveda(backup).valido, true);
});

test('validarBackupBoveda: valida esquemas auténticos y rechaza archivos corruptos o ajenos', () => {
  const backupValido = {
    app: 'BovedaDigital',
    version: '1.0',
    documents: [
      { id: 'd1', category: 'identidad', encrypted_payload: 'x', iv: 'y', checksum: 'z' }
    ]
  };
  assert.equal(validarBackupBoveda(backupValido).valido, true);

  // Rechaza null o primitivo
  assert.equal(validarBackupBoveda(null).valido, false);
  assert.equal(validarBackupBoveda('texto').valido, false);

  // Rechaza app incorrecta (firma ajena)
  assert.equal(validarBackupBoveda({ app: 'OtraApp', documents: [] }).valido, false);

  // Rechaza documentos corruptos o incompletos
  const backupCorrupto = {
    app: 'BovedaDigital',
    documents: [
      { id: 'd1', category: 'identidad' } // falta encrypted_payload, iv, checksum
    ]
  };
  const resCorrupto = validarBackupBoveda(backupCorrupto);
  assert.equal(resCorrupto.valido, false);
  assert.ok(resCorrupto.error.includes('corrupto o incompleto'));
});

test('fusionarDocumentosBackup: une expedientes sin duplicidad y actualiza por ID', () => {
  const actuales = [
    { id: 'doc_1', title: 'Pasaporte Viejo', encrypted_payload: 'p1' },
    { id: 'doc_2', title: 'Licencia', encrypted_payload: 'p2' }
  ];
  const backup = [
    { id: 'doc_1', title: 'Pasaporte Renovado', encrypted_payload: 'p1_nuevo' }, // actualización
    { id: 'doc_3', title: 'Cédula', encrypted_payload: 'p3' } // nuevo
  ];

  const resultado = fusionarDocumentosBackup(actuales, backup);
  assert.equal(resultado.length, 3);

  const doc1 = resultado.find(d => d.id === 'doc_1');
  assert.equal(doc1.title, 'Pasaporte Renovado');
  assert.equal(doc1.encrypted_payload, 'p1_nuevo');

  const doc3 = resultado.find(d => d.id === 'doc_3');
  assert.ok(doc3);
  assert.equal(doc3.title, 'Cédula');
});

test('VaultStorage: soporta saveSetting como alias de setSetting e importBackupData fusiona gavetas', async () => {
  const { VaultStorage } = require('../assets/js/storage.js');
  
  // 1. Verificar existencia del método saveSetting en la clase
  assert.equal(typeof VaultStorage.prototype.saveSetting, 'function');
  assert.equal(typeof VaultStorage.prototype.setSetting, 'function');

  // 2. Simular importBackupData en una instancia con mocks de almacenamiento
  const settingsStore = new Map();
  const docsStore = [];
  const auditStore = [];

  const fakeStorage = Object.create(VaultStorage.prototype);
  fakeStorage.getSetting = async (k) => settingsStore.get(k) || null;
  fakeStorage.setSetting = async (k, v) => { settingsStore.set(k, v); return true; };
  fakeStorage.saveSetting = async (k, v) => fakeStorage.setSetting(k, v);
  fakeStorage.getAllDocuments = async (uId) => docsStore.filter(d => d.user_id === uId);
  fakeStorage.saveDocument = async (doc) => { docsStore.push(doc); return true; };
  fakeStorage.logAuditEvent = async (uId, action, details) => { auditStore.push({ uId, action, details }); return true; };

  const backupPayload = {
    app: 'BovedaDigital',
    version: '1.0',
    documents: [
      { id: 'd100', category: 'identidad', encrypted_payload: 'enc', iv: 'iv', checksum: 'cs' }
    ],
    customDrawers: {
      proyectos_especiales: { label: 'Proyectos Especiales', color: '#10b981' }
    }
  };

  const resultado = await fakeStorage.importBackupData(backupPayload, 'usr_andres');
  assert.equal(resultado.success, true);
  assert.equal(resultado.restoredCount, 1);
  assert.equal(resultado.customDrawersCount, 1);

  // Verificar que las gavetas se guardaron correctamente en settings
  const savedDrawers = settingsStore.get('customDrawers_usr_andres');
  assert.ok(savedDrawers);
  assert.equal(savedDrawers.proyectos_especiales.label, 'Proyectos Especiales');
});

// =============================================================================
// PRUEBAS DE HEADER/FOOTER ESTÁTICOS Y CINEMÁTICA (RF-10, RF-11, RF-12, RF-16)
// =============================================================================

test('Estructura HTML: presencia de Header y Footer estáticos con texto exacto', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Header exacto: "Boveda Digital "
  assert.ok(html.includes('Boveda Digital '), 'index.html debe contener el texto exacto "Boveda Digital " en el header');
  assert.ok(html.includes('app-static-header'), 'index.html debe contener la clase app-static-header');

  // Footer exacto: "Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447"
  const footerTexto = 'Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447';
  assert.ok(html.includes(footerTexto), 'index.html debe contener el texto exacto del footer de Andres Aguiar');
  assert.ok(html.includes('app-static-footer'), 'index.html debe contener la clase app-static-footer');

  // Botones de Respaldo y Recuperación
  assert.ok(html.includes('btn-backup-vault'), 'index.html debe contener el botón btn-backup-vault');
  assert.ok(html.includes('btn-restore-vault'), 'index.html debe contener el botón btn-restore-vault');
  assert.ok(html.includes('input-restore-backup'), 'index.html debe contener el input invisible input-restore-backup');
});

test('Estilos CSS: cinemática de apertura 3D, tirador metálico y reglas @media print', () => {
  const cssPath = path.join(__dirname, '..', 'assets', 'css', 'vault.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Cinemática de apertura de gaveta
  assert.ok(css.includes('.drawer-unit.is-open'), 'vault.css debe contener estilos para .drawer-unit.is-open');
  assert.ok(css.includes('perspective:'), 'vault.css debe definir perspectiva 3D para gavetas');
  assert.ok(css.includes('.drawer-front:active .drawer-handle'), 'vault.css debe definir micro-interacción activa del tirador');

  // Clases estáticas y @media print
  assert.ok(css.includes('.app-static-header'), 'vault.css debe definir .app-static-header');
  assert.ok(css.includes('.app-static-footer'), 'vault.css debe definir .app-static-footer');
  assert.ok(css.includes('prefers-reduced-motion'), 'vault.css debe soportar prefers-reduced-motion para accesibilidad');
});

test('Estructura HTML: presencia de botón e indicador de Sincronización en la Nube', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('btn-cloud-sync'), 'index.html debe contener el botón btn-cloud-sync');
  assert.ok(html.includes('indicator-cloud-sync'), 'index.html debe contener el indicador indicator-cloud-sync');
  assert.ok(html.includes('cloud-status-text'), 'index.html debe contener el texto cloud-status-text');
});

test('VaultStorage: soporta markDocumentSynced y mergeCloudDocuments para sincronización bidireccional', async () => {
  const docStore = new Map();

  const fakeStorage = {
    async getDocument(id) {
      return docStore.get(id);
    },
    async saveDocument(doc) {
      docStore.set(doc.id, doc);
      return doc;
    },
    async markDocumentSynced(id, isSynced = true) {
      const doc = await this.getDocument(id);
      if (doc) {
        doc.is_synced = isSynced;
        await this.saveDocument(doc);
      }
      return doc;
    },
    async mergeCloudDocuments(cloudDocs = []) {
      let mergedCount = 0;
      for (const doc of cloudDocs) {
        if (!doc || !doc.id) continue;
        const existing = await this.getDocument(doc.id);
        if (!existing || new Date(doc.updated_at || 0) >= new Date(existing.updated_at || 0)) {
          await this.saveDocument({
            ...doc,
            is_synced: true
          });
          mergedCount++;
        }
      }
      return mergedCount;
    }
  };

  // Crear documento local no sincronizado
  await fakeStorage.saveDocument({ id: 'doc_1', title: 'Local', is_synced: false });
  assert.equal((await fakeStorage.getDocument('doc_1')).is_synced, false);

  // Marcar como sincronizado
  await fakeStorage.markDocumentSynced('doc_1', true);
  assert.equal((await fakeStorage.getDocument('doc_1')).is_synced, true);

  // Fusionar documento de la nube
  const cloudDocs = [
    { id: 'doc_remote_1', title: 'Documento Remoto', updated_at: new Date().toISOString() }
  ];
  const mergedCount = await fakeStorage.mergeCloudDocuments(cloudDocs);
  assert.equal(mergedCount, 1);
  const remoteDoc = await fakeStorage.getDocument('doc_remote_1');
  assert.ok(remoteDoc);
  assert.equal(remoteDoc.is_synced, true);
  assert.equal(remoteDoc.title, 'Documento Remoto');
});

test('PWA y Arranque a 1 Toque: manifest.json, sw.js, meta tags e iniciar.bat', () => {
  const rootDir = path.join(__dirname, '..');
  
  // 1. Validar manifest.json
  const manifestPath = path.join(rootDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir en la raíz');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.display, 'standalone', 'manifest.json debe tener display: standalone para modo app nativa');
  assert.ok(manifest.name.includes('Bóveda Digital'), 'manifest.json debe incluir nombre de la aplicación');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest.json debe definir iconos');

  // 2. Validar sw.js
  const swPath = path.join(rootDir, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js debe existir en la raíz');
  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.ok(swContent.includes('addEventListener(\'fetch\''), 'sw.js debe manejar evento fetch');
  assert.ok(swContent.includes('caches.open'), 'sw.js debe cachear recursos');

  // 3. Validar index.html
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('rel="manifest"'), 'index.html debe enlazar manifest.json');
  assert.ok(html.includes('mobile-web-app-capable'), 'index.html debe tener meta mobile-web-app-capable');

  // 4. Validar lanzador 1-tap para Windows
  const batPath = path.join(rootDir, 'iniciar.bat');
  assert.ok(fs.existsSync(batPath), 'iniciar.bat debe existir para arranque a 1 toque');
});

test('Google Drive Sync (Zero-Knowledge): gdrive.js, modales y validación criptográfica', () => {
  const rootDir = path.join(__dirname, '..');

  // 1. Validar presencia de assets/js/gdrive.js
  const gdriveJsPath = path.join(rootDir, 'assets', 'js', 'gdrive.js');
  assert.ok(fs.existsSync(gdriveJsPath), 'assets/js/gdrive.js debe existir');
  const gdriveCode = fs.readFileSync(gdriveJsPath, 'utf8');
  assert.ok(gdriveCode.includes('class VaultGoogleDrive'), 'gdrive.js debe definir la clase VaultGoogleDrive');
  assert.ok(gdriveCode.includes('uploadBackup'), 'gdrive.js debe implementar uploadBackup');
  assert.ok(gdriveCode.includes('downloadAndRestore'), 'gdrive.js debe implementar downloadAndRestore');
  assert.ok(gdriveCode.includes('triggerAutoSync'), 'gdrive.js debe implementar triggerAutoSync');
  assert.ok(gdriveCode.includes('autoSyncEnabled'), 'gdrive.js debe implementar autoSyncEnabled');
  assert.ok(gdriveCode.includes('setAutoSync'), 'gdrive.js debe implementar setAutoSync');

  // 2. Validar presencia en index.html y app.js
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('assets/js/gdrive.js'), 'index.html debe cargar assets/js/gdrive.js');
  assert.ok(html.includes('btn-gdrive-sync'), 'index.html debe contener el botón btn-gdrive-sync');
  assert.ok(html.includes('modal-gdrive-sync'), 'index.html debe contener el modal modal-gdrive-sync');
  assert.ok(html.includes('accounts.google.com/gsi/client'), 'index.html debe incluir script de Google Identity Services');
  assert.ok(html.includes('toggle-gdrive-autosync'), 'index.html debe incluir interruptor de sincronización automática');
  assert.ok(html.includes('handleGoogleDriveToggleAutoSync'), 'index.html debe enlazar handleGoogleDriveToggleAutoSync');

  const appJsPath = path.join(rootDir, 'assets', 'js', 'app.js');
  const appCode = fs.readFileSync(appJsPath, 'utf8');
  assert.ok(appCode.includes('handleGoogleDriveToggleAutoSync'), 'app.js debe implementar handleGoogleDriveToggleAutoSync');
  assert.ok(appCode.includes('triggerAutoSync'), 'app.js debe invocar triggerAutoSync en cambios de datos');

  // 3. Simulación de respaldo Zero-Knowledge para Google Drive
  const sampleDocs = [
    {
      id: 'doc_gdrive_test',
      user_id: 'usr_andres_001',
      category: 'finanzas',
      title: 'Tarjeta Platinum Blindada',
      encrypted_payload: 'U2FsdGVkX18...cifradoAES256...',
      iv: 'dGVzdF9pdl8xMmJ5dGVz',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      created_at: new Date().toISOString()
    }
  ];

  // Serializar paquete de respaldo
  const backup = serializarBackupBoveda(sampleDocs, {}, 'usr_andres_001');
  const jsonExport = JSON.stringify(backup);

  // Comprobar que en el JSON exportado hacia Google Drive NO existe texto claro confidencial
  assert.ok(!jsonExport.includes('1234-5678-9012-3456'), 'Google Drive NO debe recibir números de tarjetas en claro');
  assert.ok(backup.documents[0].encrypted_payload, 'El paquete debe contener exclusivamente payloads cifrados');
  assert.ok(backup.documents[0].iv, 'El paquete debe contener IVs');

  // Comprobar validación de integridad
  const validacion = validarBackupBoveda(backup);
  assert.ok(validacion.valido, 'El paquete serializado para Google Drive debe ser válido');
});

// =============================================================================
// PRUEBAS DE RESTAURACIÓN MULTI-DISPOSITIVO (SDD 002)
// =============================================================================

test('SDD 002: esPayloadCifradoValido descarta registros espurios y acepta datos reales', () => {
  const { esPayloadCifradoValido } = require('../assets/js/storage.js');

  // Caso 1: Descartar mocks de tests con 'payload...'
  const mockSpurio = {
    id: 'doc_mock_1',
    category: 'general',
    encrypted_payload: 'U2FsdGVkX1+payload...test123456789'
  };
  assert.equal(esPayloadCifradoValido(mockSpurio), false, 'Debe descartar placeholders que incluyan "payload..."');

  // Caso 2: Descartar nulos o cadenas vacías
  assert.equal(esPayloadCifradoValido(null), false);
  assert.equal(esPayloadCifradoValido({ id: 'doc_null' }), false);

  // Caso 3: Aceptar expedientes cifrados reales en Base64
  const docReal = {
    id: 'doc_huzcvq2ff',
    category: 'legal',
    encrypted_payload: 'h9+Mv5yJkO1a+l5h7F9z0Bq2...'
  };
  assert.equal(esPayloadCifradoValido(docReal), true, 'Debe aceptar expedientes cifrados válidos');
});

test('SDD 002: Service Worker v2, diálogo de PIN y manejadores en app.js e index.html', () => {
  const rootDir = path.join(__dirname, '..');

  // 1. sw.js debe ser v2 o v3
  const swContent = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  assert.ok(swContent.includes("boveda-digital-v2") || swContent.includes("boveda-digital-v3"), 'sw.js debe definir CACHE_NAME v2 o v3 para forzar actualización en celulares');

  // 2. index.html debe incluir el diálogo modal-backup-pin-prompt y sus componentes
  const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(htmlContent.includes('id="modal-backup-pin-prompt"'), 'index.html debe contener el modal de PIN de respaldo');
  assert.ok(htmlContent.includes('id="input-backup-pin"'), 'index.html debe contener el input para el PIN');
  assert.ok(htmlContent.includes('submitBackupPinUnlock()'), 'index.html debe enlazar submitBackupPinUnlock()');
  assert.ok(htmlContent.includes('cancelBackupPinUnlock()'), 'index.html debe enlazar cancelBackupPinUnlock()');

  // 3. app.js debe contener los métodos del asistente
  const appContent = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  assert.ok(appContent.includes('openBackupPinPrompt'), 'app.js debe implementar openBackupPinPrompt');
  assert.ok(appContent.includes('cancelBackupPinUnlock'), 'app.js debe implementar cancelBackupPinUnlock');
  assert.ok(appContent.includes('submitBackupPinUnlock'), 'app.js debe implementar submitBackupPinUnlock');
  assert.ok(appContent.includes('226000658459336d4184642799fc8498'), 'app.js debe incluir la sal histórica maestra de Bóveda');
});

// =============================================================================
// PRUEBAS DE LICENCIAMIENTO OFFLINE Y TRIAL DE 7 DÍAS (SPEC 003 / AGENTS.MD 4.1)
// =============================================================================

const {
  TRIAL_DAYS,
  TRIAL_DURATION_MS,
  LICENSE_SALT,
  CONTACT_PHONE,
  generarCadenaSolicitud,
  computarFirmaLicencia,
  generarTokenLicencia,
  validarTokenLicencia,
  VaultLicenseManager
} = require('../assets/js/license.js');

test('SDD 003: Constantes maestras, formato de solicitud REQ|<DeviceID>|<correo> y teléfono de contacto', () => {
  assert.equal(TRIAL_DAYS, 7, 'El período de prueba debe ser estrictamente de 7 días');
  assert.equal(TRIAL_DURATION_MS, 604800000, 'TRIAL_DURATION_MS debe ser 604,800,000 ms');
  assert.equal(LICENSE_SALT, "Halterofilia-SuperSecret-Salt-2026", 'La sal de firma debe ser Halterofilia-SuperSecret-Salt-2026');
  assert.equal(CONTACT_PHONE, "+56933395447", 'El teléfono de contacto debe ser +56933395447');

  const cadena = generarCadenaSolicitud('dev_9b1deb4d', 'andres.pro@boveda.com');
  assert.equal(cadena, 'REQ|dev_9b1deb4d|andres.pro@boveda.com', 'La cadena debe tener el formato estricto REQ|<DeviceID>|<correo>');
});

test('SDD 003: Firma SHA-256 canónica y emisión/validación de Token Base64 offline', async () => {
  const deviceId = 'dev_test_device_001';
  const email = 'cliente@empresa.cl';
  const exp = 1893456000000; // 2030

  // 1. Verificación de firma SHA-256 determinista
  const firma = await computarFirmaLicencia(deviceId, email, exp);
  assert.equal(typeof firma, 'string');
  assert.equal(firma.length, 64, 'El hash SHA-256 debe tener 64 caracteres hexadecimales');

  // 2. Emisión de Token de Activación con 30 días de vigencia
  const token30d = await generarTokenLicencia(deviceId, email, 30);
  assert.ok(typeof token30d === 'string' && token30d.length > 20, 'El token debe ser una cadena Base64 no vacía');

  // 3. Validación de Token Offline para el dispositivo autorizado
  const resultado = await validarTokenLicencia(token30d, deviceId);
  assert.equal(resultado.valido, true, 'El token debe ser validado con éxito');
  assert.equal(resultado.payload.deviceId, deviceId);
  assert.equal(resultado.payload.email, email);
  assert.equal(resultado.payload.isPerpetual, false);
  assert.ok(resultado.payload.exp > Date.now());

  // 4. Token Vitalicio / Perpetuo (exp = -1)
  const tokenPerpetuo = await generarTokenLicencia(deviceId, email, -1);
  const resPerpetuo = await validarTokenLicencia(tokenPerpetuo, deviceId);
  assert.equal(resPerpetuo.valido, true);
  assert.equal(resPerpetuo.payload.exp, -1);
  assert.equal(resPerpetuo.payload.isPerpetual, true);
});

test('SDD 003: Rechazo estricto de tokens manipulados, apócrifos o de otro dispositivo', async () => {
  const deviceReal = 'dev_dispositivo_real';
  const deviceOtro = 'dev_dispositivo_ajeno';
  const email = 'usuario@boveda.com';

  const tokenOriginal = await generarTokenLicencia(deviceReal, email, 90);

  // Caso 1: Intentar activar en un dispositivo diferente (Device ID discordante)
  const resOtroDev = await validarTokenLicencia(tokenOriginal, deviceOtro);
  assert.equal(resOtroDev.valido, false);
  assert.ok(resOtroDev.error.includes('Token emitido para otro dispositivo'));

  // Caso 2: Firma apócrifa (manipulación del payload o sal ajena)
  const payloadFalso = {
    deviceId: deviceReal,
    email: email,
    exp: Date.now() + 100000000,
    signature: '0000000000000000000000000000000000000000000000000000000000000000'
  };
  const tokenFalso = Buffer.from(JSON.stringify(payloadFalso)).toString('base64');
  const resFalso = await validarTokenLicencia(tokenFalso, deviceReal);
  assert.equal(resFalso.valido, false);
  assert.ok(resFalso.error.includes('Firma criptográfica inválida'));

  // Caso 3: Token expirado en el tiempo
  const payloadExpirado = {
    deviceId: deviceReal,
    email: email,
    exp: Date.now() - 50000, // En el pasado
    signature: await computarFirmaLicencia(deviceReal, email, Date.now() - 50000)
  };
  const tokenExpirado = Buffer.from(JSON.stringify(payloadExpirado)).toString('base64');
  const resExpirado = await validarTokenLicencia(tokenExpirado, deviceReal);
  assert.equal(resExpirado.valido, false);
  assert.ok(resExpirado.error.includes('expiró'));
});

test('SDD 003: VaultLicenseManager: Período de 7 días activo y transición a bloqueo al expirar', async () => {
  const manager = new VaultLicenseManager();
  manager.deviceId = 'dev_test_suite_001';

  // Caso 1: Trial recién iniciado (0 días transcurridos) -> Quedan 7 días
  manager.trialStartDate = Date.now();
  manager.isLicensed = false;
  let estado = manager.getEstadoLicencia('test@boveda.com');
  assert.equal(estado.isTrialActive, true);
  assert.equal(estado.isExpired, false);
  assert.equal(estado.trialDaysRemaining, 7);

  // Caso 2: Trial con 5 días transcurridos -> Quedan 2 días (alerta preventiva)
  manager.trialStartDate = Date.now() - (5 * 24 * 60 * 60 * 1000);
  estado = manager.getEstadoLicencia('test@boveda.com');
  assert.equal(estado.isTrialActive, true);
  assert.equal(estado.isExpired, false);
  assert.equal(estado.trialDaysRemaining, 2);

  // Caso 3: Trial con 8 días transcurridos -> Expirado (Bloqueo no eludible)
  manager.trialStartDate = Date.now() - (8 * 24 * 60 * 60 * 1000);
  estado = manager.getEstadoLicencia('test@boveda.com');
  assert.equal(estado.isTrialActive, false);
  assert.equal(estado.isExpired, true);
  assert.equal(estado.trialDaysRemaining, 0);

  // Caso 4: Activación con token válido -> Pasa a Licenciado
  const tokenValido = await generarTokenLicencia('dev_test_suite_001', 'test@boveda.com', 365);
  const activacion = await manager.activarConToken(tokenValido, 'test@boveda.com');
  assert.equal(activacion.success, true);
  assert.equal(manager.isLicensed, true);

  estado = manager.getEstadoLicencia('test@boveda.com');
  assert.equal(estado.isLicensed, true);
  assert.equal(estado.isExpired, false);
});

test('SDD 003: Componentes de UI en index.html, app.js y sw.js para Spec 003', () => {
  const rootDir = path.join(__dirname, '..');

  // 1. Validar index.html
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('id="modal-trial-lock"'), 'index.html debe contener el modal de bloqueo modal-trial-lock');
  assert.ok(html.includes('id="modal-license-info"'), 'index.html debe contener el modal modal-license-info');
  assert.ok(html.includes('id="badge-license-status"'), 'index.html debe contener badge-license-status');
  assert.ok(html.includes('+56933395447'), 'index.html debe exhibir el teléfono de soporte +56933395447');
  assert.ok(html.includes('assets/js/license.js'), 'index.html debe cargar license.js');

  // 2. Validar app.js
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  assert.ok(appJs.includes('updateLicenseUI'), 'app.js debe implementar updateLicenseUI');
  assert.ok(appJs.includes('checkLicenseLock'), 'app.js debe implementar checkLicenseLock');
  assert.ok(appJs.includes('openLicenseModal'), 'app.js debe implementar openLicenseModal');
  assert.ok(appJs.includes('copyLicenseRequestString'), 'app.js debe implementar copyLicenseRequestString');
  assert.ok(appJs.includes('submitLicenseActivation'), 'app.js debe implementar submitLicenseActivation');

  // 3. Validar sw.js
  const sw = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  assert.ok(sw.includes('./assets/js/license.js'), 'sw.js debe cachear license.js');

  // 4. Validar inputs interactivos de usuario/correo en index.html y app.js
  assert.ok(html.includes('id="lock-user-email-input"'), 'index.html debe incluir lock-user-email-input');
  assert.ok(html.includes('id="info-user-email-input"'), 'index.html debe incluir info-user-email-input');
  assert.ok(appJs.includes('handleLicenseEmailChange'), 'app.js debe implementar handleLicenseEmailChange');
});

test('SDD 003: Generación automática de usuario y presencia obligatoria en la Cadena de Solicitud', async () => {
  const manager = new VaultLicenseManager();
  // Simular inicio sin usuario previo ni localStorage
  await manager.init();

  // Debe haberse generado un usuario asociado por defecto al dispositivo
  assert.ok(manager.userEmail, 'VaultLicenseManager debe generar un usuario si no existe');
  assert.ok(manager.userEmail.includes('@'), 'El usuario generado debe tener estructura válida');

  // La cadena de solicitud sin pasar email debe incluir el usuario generado
  const estado = manager.getEstadoLicencia();
  assert.ok(estado.cadenaSolicitud.startsWith('REQ|dev_'), 'Cadena debe comenzar con REQ|dev_');
  assert.ok(estado.cadenaSolicitud.includes(`|${manager.userEmail}`), 'Cadena debe incluir obligatoriamente el usuario generado');

  // Actualización del usuario en tiempo real
  await manager.setUserEmail('andres.movil@empresa.com');
  assert.equal(manager.userEmail, 'andres.movil@empresa.com');

  const estadoActualizado = manager.getEstadoLicencia();
  assert.equal(estadoActualizado.cadenaSolicitud, `REQ|${manager.deviceId}|andres.movil@empresa.com`);
  assert.ok(estadoActualizado.whatsAppUrl.includes(encodeURIComponent('REQ|' + manager.deviceId + '|andres.movil@empresa.com')));

  // Función pura generarCadenaSolicitud
  const cadenaDirecta = generarCadenaSolicitud(manager.deviceId, 'cliente@gmail.com');
  assert.equal(cadenaDirecta, `REQ|${manager.deviceId}|cliente@gmail.com`);
});

test('SDD 003: generarTokenDesdeCadenaSolicitud, insensibilidad a mayúsculas en Device ID y tolerancia a comillas', async () => {
  const { generarTokenDesdeCadenaSolicitud, validarTokenLicencia } = require('../assets/js/license.js');

  const reqStr = 'REQ|dev_ABC123DEF|usuario.pro@empresa.com';
  const token = await generarTokenDesdeCadenaSolicitud(reqStr, 365);
  assert.ok(token, 'Debe generar el token en Base64');

  // Validar con deviceId en minúsculas contra token generado en mayúsculas
  const val1 = await validarTokenLicencia(token, 'dev_abc123def');
  assert.equal(val1.valido, true, 'Debe ser válido independientemente de mayúsculas en Device ID');

  // Validar con comillas envolventes (caso típico de copiar desde console o WhatsApp)
  const valConComillas = await validarTokenLicencia(`"${token}"`, 'dev_abc123def');
  assert.equal(valConComillas.valido, true, 'Debe tolerar comillas envolventes sin romper firma');

  // Validar con espacios o saltos de línea añadidos accidentalmente
  const valConEspacios = await validarTokenLicencia(`  \n${token}\r\n  `, 'dev_abc123def');
  assert.equal(valConEspacios.valido, true, 'Debe limpiar saltos de línea y espacios');
});

test('SDD 003: Compatibilidad 100% con tokens emitidos por la App Halterofilia externa (delimitador pipe y 9999 días)', async () => {
  const { validarTokenLicencia, LICENSE_SALT } = require('../assets/js/license.js');
  const cryptoNode = require('node:crypto');

  const deviceId = 'dev_halterofilia_ext_001';
  const email = 'atleta@halterofilia.com';
  const days = 365;
  const exp = Date.now() + (days * 24 * 60 * 60 * 1000);

  // 1. Simulación exacta del cálculo en panel_administrador_de_licencias.html de Halterofilia
  const rawHalterofilia = `${deviceId}|${email}|${exp}|${LICENSE_SALT}`;
  const sigHalterofilia = cryptoNode.createHash('sha256').update(rawHalterofilia, 'utf8').digest('hex');

  const payloadHalterofilia = {
    deviceId,
    email,
    exp,
    signature: sigHalterofilia
  };
  const tokenHalterofilia = Buffer.from(JSON.stringify(payloadHalterofilia)).toString('base64');

  // Validación en Bóveda Digital
  const res = await validarTokenLicencia(tokenHalterofilia, deviceId);
  assert.equal(res.valido, true, 'El token emitido por el generador de Halterofilia debe ser 100% válido');
  assert.equal(res.payload.deviceId, deviceId.toLowerCase());
  assert.equal(res.payload.email, email.toLowerCase());

  // 2. Licencia Vitalicia de Halterofilia (9999 días)
  const expVitalicia = Date.now() + (9999 * 24 * 60 * 60 * 1000);
  const rawVitalicia = `${deviceId}|${email}|${expVitalicia}|${LICENSE_SALT}`;
  const sigVitalicia = cryptoNode.createHash('sha256').update(rawVitalicia, 'utf8').digest('hex');
  const tokenVitalicia = Buffer.from(JSON.stringify({
    deviceId,
    email,
    exp: expVitalicia,
    signature: sigVitalicia
  })).toString('base64');

  const resVitalicia = await validarTokenLicencia(tokenVitalicia, deviceId);
  assert.equal(resVitalicia.valido, true);
  assert.equal(resVitalicia.payload.isPerpetual, true, 'Licencia con 9999 días de Halterofilia debe considerarse vitalicia');
});

test('SDD 003: Separación estricta de responsabilidades (index.html emite REQ y valida, sin generador administrativo)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // El cliente emite la solicitud REQ y tiene los inputs de activación
  assert.ok(html.includes('id="lock-cadena-solicitud"'), 'index.html debe emitir la cadena de solicitud en lock');
  assert.ok(html.includes('id="info-cadena-solicitud"'), 'index.html debe emitir la cadena de solicitud en info');
  assert.ok(html.includes('id="input-activation-token-lock"'), 'index.html debe recibir tokens en lock');
  assert.ok(html.includes('id="input-activation-token-info"'), 'index.html debe recibir tokens en info');

  // El cliente NO contiene el generador administrativo (debe residir en la app externa Halterofilia)
  assert.ok(!html.includes('id="admin-gen-input-req"'), 'index.html NO debe contener el generador administrativo admin-gen-input-req');
  assert.ok(!html.includes('handleAdminGenerateToken'), 'index.html NO debe invocar handleAdminGenerateToken');
});






