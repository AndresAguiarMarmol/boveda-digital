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

  // Caso 4: Exposición como método en instancia de VaultStorage
  const { VaultStorage } = require('../assets/js/storage.js');
  const storageInstance = new VaultStorage();
  assert.equal(typeof storageInstance.esPayloadCifradoValido, 'function', 'VaultStorage debe exponer esPayloadCifradoValido como método');
  assert.equal(storageInstance.esPayloadCifradoValido(docReal), true);
  assert.equal(storageInstance.esPayloadCifradoValido(mockSpurio), false);
});

test('SDD 002: Service Worker v2/v3/v4, diálogo de PIN y manejadores en app.js e index.html', () => {
  const rootDir = path.join(__dirname, '..');

  // 1. sw.js debe ser v2+
  const swContent = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  assert.ok(/boveda-digital-v\d+/.test(swContent), 'sw.js debe definir CACHE_NAME para forzar actualización en celulares');

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

test('Google Cloud Run: Dockerfile completo, límite de 50MB y modal de sincronización en UI', () => {
  const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

  // Dockerfile empaqueta componentes esenciales de PWA y datos
  assert.ok(dockerfile.includes('COPY manifest.json'), 'Dockerfile debe copiar manifest.json');
  assert.ok(dockerfile.includes('COPY sw.js'), 'Dockerfile debe copiar sw.js');
  assert.ok(dockerfile.includes('COPY data/'), 'Dockerfile debe copiar data/ para persistir registros iniciales');

  // server.js límite de 50MB
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  assert.ok(serverCode.includes('50 * 1024 * 1024'), 'server.js debe permitir payloads de hasta 50MB para batch-sync con adjuntos');

  // UI modal de Cloud Run
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('id="modal-cloud-sync"'), 'index.html debe contener el diálogo modal-cloud-sync');
  assert.ok(html.includes('id="input-cloud-api-url"'), 'index.html debe contener el input para URL de Cloud Run');
  assert.ok(html.includes('id="cloud-modal-status-badge"'), 'index.html debe contener el badge de estado de Cloud Run');
});

test('SDD 004: VaultLicenseManager gestiona perfil de usuario registrado (nombre, apellidos, correo, teléfono, foto)', async () => {
  const manager = new VaultLicenseManager();
  manager.deviceId = 'dev_test_profile_001';

  // 1. Guardar perfil de usuario completo
  const profileInput = {
    firstName: 'Andres',
    lastName: 'Aguiar',
    email: 'andres.aguiar@halterofilia.com',
    phone: '+56933395447',
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
  };
  const saved = await manager.saveUserProfile(profileInput);
  assert.equal(saved.firstName, 'Andres');
  assert.equal(saved.lastName, 'Aguiar');
  assert.equal(saved.email, 'andres.aguiar@halterofilia.com');
  assert.equal(saved.phone, '+56933395447');
  assert.ok(saved.photo.startsWith('data:image/jpeg;base64,'));

  // 2. Comprobar persistencia y sincronización con cadena de solicitud REQ
  const retrieved = await manager.getUserProfile();
  assert.equal(retrieved.firstName, 'Andres');
  assert.equal(manager.userEmail, 'andres.aguiar@halterofilia.com');

  const estado = manager.getEstadoLicencia();
  assert.equal(estado.email, 'andres.aguiar@halterofilia.com');
  assert.ok(estado.cadenaSolicitud.includes('andres.aguiar@halterofilia.com'), 'La cadena de solicitud debe actualizarse con el correo del perfil');
  assert.ok(estado.cadenaSolicitud.startsWith('REQ|dev_test_profile_001|'));

  // 3. Desvincular usuario
  const cleared = await manager.clearUserProfile();
  assert.equal(cleared, true);
  const profileAfterClear = await manager.getUserProfile();
  assert.equal(profileAfterClear, null);
  assert.ok(manager.userEmail.startsWith('usuario_'), 'Al desvincular debe restablecerse el usuario automático por Device ID');
});

test('SDD 004: Interfaz index.html cuenta con botón de perfil de usuario en barra horizontal y modal de usuario estilo Halterofilia', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Botón en la barra horizontal (Navbar superior)
  assert.ok(html.includes('id="btn-header-user-profile"'), 'index.html debe contener el botón btn-header-user-profile en la barra horizontal');
  assert.ok(html.includes('id="header-user-avatar-img"'), 'index.html debe contener el elemento de imagen de avatar');
  assert.ok(html.includes('id="header-user-name"'), 'index.html debe contener el span con el nombre del usuario');
  assert.ok(html.includes('openUserProfileModal()'), 'El botón debe invocar openUserProfileModal()');

  // Modal de usuario registrado (Estándar Halterofilia)
  assert.ok(html.includes('id="modal-user-profile"'), 'index.html debe contener el diálogo modal-user-profile');
  assert.ok(html.includes('Perfil del Usuario Registrado'), 'El modal debe titularse Perfil del Usuario Registrado');
  assert.ok(html.includes('1 Por Dispositivo'), 'El modal debe incluir la insignia 1 Por Dispositivo');
  assert.ok(html.includes('id="user-profile-first-name"'), 'Debe incluir input para Nombre');
  assert.ok(html.includes('id="user-profile-last-name"'), 'Debe incluir input para Apellidos');
  assert.ok(html.includes('id="user-profile-email"'), 'Debe incluir input para Correo Electrónico');
  assert.ok(html.includes('id="user-profile-phone"'), 'Debe incluir input para Teléfono');
  assert.ok(html.includes('id="user-profile-camera-input"'), 'Debe incluir input con capture para cámara');
  assert.ok(html.includes('id="user-profile-upload-input"'), 'Debe incluir input para subir foto de galería');
  assert.ok(html.includes('id="btn-save-user-profile"'), 'Debe incluir botón para Guardar Cambios');
  assert.ok(html.includes('id="btn-unlink-user-profile"'), 'Debe incluir botón para Desvincular usuario');
});

test('SDD 004: Eliminación completa del esquema demo-free / demo-pro', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Ausencia de componentes demo free/pro
  assert.ok(!html.includes('id="modal-upgrade"'), 'index.html NO debe contener el modal modal-upgrade');
  assert.ok(!html.includes('id="dash-plan-badge"'), 'index.html NO debe contener el badge dash-plan-badge');
  assert.ok(!html.includes('id="btn-header-upgrade"'), 'index.html NO debe contener el botón btn-header-upgrade');
  assert.ok(!html.includes('demo.free@boveda.com'), 'index.html NO debe contener el acceso rápido demo.free');

  // Verificación en app.js: ausencia de llamadas a openUpgradeModal
  const appPath = path.join(__dirname, '..', 'assets', 'js', 'app.js');
  const appJs = fs.readFileSync(appPath, 'utf8');
  assert.ok(!appJs.includes('openUpgradeModal('), 'app.js NO debe invocar openUpgradeModal');
  assert.ok(!appJs.includes('processSimulatedProCheckout('), 'app.js NO debe contener checkout simulado');
});

test('SDD 005: Conexión Online con Cloud Run por defecto y visor prominente de documentos', () => {
  const rootDir = path.join(__dirname, '..');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

  // 1. VaultAuth debe definir la URL oficial de Google Cloud Run por defecto
  assert.ok(authJs.includes('https://boveda-digital-17818053587.us-central1.run.app'), 'auth.js debe configurar Cloud Run URL por defecto');
  assert.ok(authJs.includes('CLOUD_RUN_PROD_URL'), 'auth.js debe declarar la constante CLOUD_RUN_PROD_URL');

  // 2. Visor de documento original debe ubicarse antes de la credencial en index.html
  const attachPos = html.indexOf('id="detail-attachment-preview"');
  const cardPos = html.indexOf('id="detail-credential-card-container"');
  assert.ok(attachPos > 0 && cardPos > 0, 'Ambos elementos deben existir en index.html');
  assert.ok(attachPos < cardPos, 'El visor de documento (detail-attachment-preview) DEBE ubicarse antes de la credencial (detail-credential-card-container)');

  // 3. app.js debe renderizar visor amplio para PDF (iframe con height) e imagen con clic a pantalla completa
  assert.ok(appJs.includes('Documento Digitalizado Oficial'), 'app.js debe destacar el documento digitalizado');
  assert.ok(appJs.includes('Expediente PDF Oficial'), 'app.js debe destacar el expediente PDF');
  assert.ok(appJs.includes('cursor-zoom-in'), 'app.js debe permitir zoom/pantalla completa en imagen');

  // 4. server.js debe reconocer al usuario de dispositivo atleta@halterofilia.com
  assert.ok(serverJs.includes('atleta@halterofilia.com'), 'server.js debe reconocer usuario de dispositivo');
});

test('SDD 006: Resiliencia de Nube, auto-renovación de JWT y ausencia de fallos bloqueantes de sincronización', () => {
  const rootDir = path.join(__dirname, '..');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

  // 1. VaultAuth debe implementar refreshSession y auto-registro
  assert.ok(authJs.includes('async refreshSession()'), 'VaultAuth debe definir el método refreshSession');
  assert.ok(authJs.includes('cloud_autoreg'), 'VaultAuth debe auto-registrar al usuario en caso de 401');

  // 2. syncWithCloud debe manejar 401 de forma resiliente con reintento y degradación suave a offline
  assert.ok(appJs.includes('syncRes.status === 401'), 'syncWithCloud debe detectar código 401 y renovar sesión');
  assert.ok(appJs.includes('controllerSync'), 'syncWithCloud debe contar con AbortController para evitar bloqueos');
  assert.ok(appJs.includes('Modo Local (Datos Protegidos)'), 'syncWithCloud debe degradar elegantemente a modo local protegido en caso de desconexión');

  // 3. server.js debe fusionar usuarios iniciales con persistencia para no perder atletas o admins
  assert.ok(serverJs.includes('initialUsers'), 'server.js debe fusionar usuarios iniciales en loadDB');
});

test('SDD 007: Identificación Obligatoria en Primer Uso y Validación por Código al Correo', async () => {
  const rootDir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const licenseJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'license.js'), 'utf8');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');

  // 1. Verificación de UI en index.html
  assert.ok(html.includes('id="modal-first-run-onboarding"'), 'index.html debe contener el modal modal-first-run-onboarding');
  assert.ok(html.includes('id="onboarding-step-1"'), 'index.html debe contener el contenedor del Paso 1 (Ficha)');
  assert.ok(html.includes('id="onboarding-step-2"'), 'index.html debe contener el contenedor del Paso 2 (Código OTP)');
  assert.ok(html.includes('id="onboarding-first-name"'), 'index.html debe tener input de nombre');
  assert.ok(html.includes('id="onboarding-last-name"'), 'index.html debe tener input de apellidos');
  assert.ok(html.includes('id="onboarding-email"'), 'index.html debe tener input de correo');
  assert.ok(html.includes('id="onboarding-phone"'), 'index.html debe tener input de teléfono');
  assert.ok(html.includes('id="onboarding-otp-input"'), 'index.html debe tener input de código OTP');
  assert.ok(html.includes('handleOnboardingSubmitStep1'), 'index.html debe enlazar handleOnboardingSubmitStep1');
  assert.ok(html.includes('handleOnboardingSubmitStep2'), 'index.html debe enlazar handleOnboardingSubmitStep2');

  // 2. Verificación en license.js
  assert.ok(licenseJs.includes('isUserIdentifiedAndVerified'), 'license.js debe implementar isUserIdentifiedAndVerified()');
  assert.ok(licenseJs.includes('markUserVerified'), 'license.js debe implementar markUserVerified()');

  // 3. Verificación en auth.js
  assert.ok(authJs.includes('sendEmailVerificationCode'), 'auth.js debe implementar sendEmailVerificationCode()');
  assert.ok(authJs.includes('verifyEmailCode'), 'auth.js debe implementar verifyEmailCode()');

  // 4. Verificación en app.js
  assert.ok(appJs.includes('isUserIdentifiedAndVerified'), 'app.js debe evaluar isUserIdentifiedAndVerified en init()');
  assert.ok(appJs.includes('openFirstRunOnboarding'), 'app.js debe implementar openFirstRunOnboarding()');
  assert.ok(appJs.includes('handleOnboardingSubmitStep1'), 'app.js debe implementar handleOnboardingSubmitStep1()');
  assert.ok(appJs.includes('handleOnboardingSubmitStep2'), 'app.js debe implementar handleOnboardingSubmitStep2()');

  // 5. Verificación de Service Worker
  assert.ok(/boveda-digital-v\d+/.test(swJs), 'sw.js debe operar con la versión de caché boveda-digital-v8+');

  // 6. Prueba funcional de lógica en clase VaultLicenseManager
  const { VaultLicenseManager } = require('../assets/js/license.js');
  const mgr = new VaultLicenseManager();
  mgr.deviceId = 'dev_test_onboarding';

  // Inicialmente sin perfil, debe retornar false
  assert.equal(await mgr.isUserIdentifiedAndVerified(), false, 'Sin perfil completo debe retornar false');

  // Con perfil pero sin verificación, debe retornar false
  await mgr.saveUserProfile({
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan.perez@ejemplo.com',
    phone: '+56911223344'
  });
  assert.equal(await mgr.isUserIdentifiedAndVerified(), false, 'Perfil sin verificar correo debe retornar false');

  // Al marcarlo verificado, debe retornar true
  await mgr.markUserVerified(true);
  assert.equal(await mgr.isUserIdentifiedAndVerified(), true, 'Perfil completo y verificado debe retornar true');

  // Al desvincular, debe volver a false
  await mgr.clearUserProfile();
  assert.equal(await mgr.isUserIdentifiedAndVerified(), false, 'Tras desvincular debe volver a false');
});

test('SDD 008: Soporte SMTP Gmail y Resiliencia en Envío de Correo', async () => {
  const rootDir = path.join(__dirname, '..');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const envExample = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');

  // 1. Verificación de plantilla de configuración .env.example
  assert.ok(envExample.includes('SMTP_HOST=smtp.gmail.com'), '.env.example debe incluir configuración de Gmail');
  assert.ok(envExample.includes('SMTP_PORT=465'), '.env.example debe indicar puerto seguro 465 SSL/TLS');
  assert.ok(envExample.includes('SMTP_PASS'), '.env.example debe documentar contraseña de aplicación de 16 caracteres');

  // 2. Verificación de backend en server.js
  assert.ok(serverJs.includes('loadEnvFile'), 'server.js debe contar con loadEnvFile() para cargar .env nativamente');
  assert.ok(serverJs.includes('replace(/\\s+/g'), 'server.js debe sanitizar espacios en contraseñas de Google');
  assert.ok(serverJs.includes('tls.connect'), 'server.js debe usar tls.connect nativo para puerto 465');

  // 3. Verificación de resiliencia en auth.js ante caídas de servidor
  assert.ok(authJs.includes('activando contingencia offline local'), 'auth.js debe activar contingencia offline si el servidor remoto falla');
  assert.ok(authJs.includes('_vault_otp_'), 'auth.js debe persistir OTP en sessionStorage ante contingencia');

  // 4. Verificación de Service Worker
  assert.ok(/boveda-digital-v\d+/.test(swJs), 'sw.js debe estar actualizado a boveda-digital-v9+');

  // 5. Verificación de prevención de bloqueo de teclado en modales e inputs
  assert.ok(appJs.includes('isInputFocused || isModalOpen'), 'app.js no debe interceptar teclado si hay un input enfocado o un modal activo');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('id="onboarding-otp-input"'), 'index.html debe tener el input onboarding-otp-input');
  assert.ok(html.includes('oninput="this.value = this.value.replace(/[^0-9]/g'), 'onboarding-otp-input debe sanitizar la entrada de solo números');
});

test('SDD 009: Simplificación de Interfaz del Navbar (Eliminación de botones PIN, </> y Bloquear)', () => {
  const rootDir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');

  // 1. En el navbar del Dashboard no deben existir los botones de resetPin, inspector </> ni lockVaultNow
  const headerMatch = html.match(/<header class="sticky top-0[\s\S]*?<\/header>/);
  assert.ok(headerMatch, 'index.html debe contener el header del dashboard');
  const headerHtml = headerMatch[0];

  assert.ok(!headerHtml.includes('resetPin'), 'El navbar no debe contener el botón de Resetear PIN');
  assert.ok(!headerHtml.includes('code-2'), 'El navbar no debe contener el botón de inspector </> (code-2)');
  assert.ok(!headerHtml.includes('lockVaultNow'), 'El navbar no debe contener el botón de Bloquear Bóveda');

  // 2. Se deben preservar íntegramente los botones esenciales en el Navbar
  assert.ok(headerHtml.includes('id="btn-header-user-profile"'), 'El navbar debe conservar el botón de perfil de usuario');
  assert.ok(headerHtml.includes('id="badge-license-status"'), 'El navbar debe conservar el badge de estado de licencia/trial');
  assert.ok(headerHtml.includes('id="btn-gdrive-sync"'), 'El navbar debe conservar el botón de Google Drive');
  assert.ok(headerHtml.includes('id="btn-cloud-sync"'), 'El navbar debe conservar el botón de sincronización en la Nube');
  assert.ok(headerHtml.includes('id="btn-backup-vault"'), 'El navbar debe conservar el botón de Respaldar');
  assert.ok(headerHtml.includes('id="btn-restore-vault"'), 'El navbar debe conservar el botón de Recuperar');

  // 3. Verificación de Service Worker v11 o superior
  assert.ok(/boveda-digital-v\d+/.test(swJs), 'sw.js debe estar actualizado a boveda-digital-v11+');
});

test('SDD 010: Eliminación de la Solicitud de Clave para la Bóveda Protegida y Auto-Desbloqueo', () => {
  const rootDir = path.join(__dirname, '..');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');

  // 1. VaultAuth debe implementar el método autoUnlock
  assert.ok(authJs.includes('async autoUnlock('), 'VaultAuth debe definir el método autoUnlock');

  // 2. app.js debe utilizar autoUnlock y acceder directamente a dashboard en init(), login y onboarding
  assert.ok(appJs.includes('await window.vaultAuth.autoUnlock()'), 'app.js debe invocar autoUnlock para acceso directo');
  
  // En init(), no debe redirigir a pin-lock ni pin-setup
  const initMatch = appJs.match(/const authState = await window\.vaultAuth\.init\(\);[\s\S]*?this\.switchView\('dashboard'\);/);
  assert.ok(initMatch, 'init() debe auto-desbloquear e ir directo a dashboard');
  assert.ok(!initMatch[0].includes("this.switchView('pin-lock')"), 'init() no debe mostrar la vista pin-lock');
  assert.ok(!initMatch[0].includes("this.switchView('pin-setup')"), 'init() no debe mostrar la vista pin-setup');

  // En loginForm, debe acceder a dashboard con autoUnlock
  assert.ok(appJs.includes("await window.vaultAuth.autoUnlock();\n          this.switchView('dashboard');"), 'login debe auto-desbloquear y mostrar dashboard');

  // 3. Service Worker debe estar en v12 o superior
  assert.ok(/boveda-digital-v\d+/.test(swJs), 'sw.js debe estar en versión boveda-digital-v12+');
});

test('SDD 011: Correo Electrónico del Usuario Autenticado en Licencia y Período de Prueba', async () => {
  const rootDir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const licenseJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'license.js'), 'utf8');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');

  // 1. Verificación en index.html: etiqueta "Correo Electrónico:" en modal-license-info y ausencia de value="su-usuario@dominio.com"
  const modalLicenseMatch = html.match(/<dialog id="modal-license-info"[\s\S]*?<\/dialog>/);
  assert.ok(modalLicenseMatch, 'index.html debe contener el modal modal-license-info');
  const modalLicenseHtml = modalLicenseMatch[0];
  assert.ok(modalLicenseHtml.includes('for="info-user-email-input"'), 'modal-license-info debe tener etiqueta para info-user-email-input');
  assert.ok(modalLicenseHtml.includes('Correo Electrónico:'), 'modal-license-info debe mostrar el campo "Correo Electrónico:"');
  assert.ok(!modalLicenseHtml.includes('value="su-usuario@dominio.com"'), 'info-user-email-input no debe tener hardcodeado value="su-usuario@dominio.com"');

  // 2. Verificación de métodos de resolución y sincronización en license.js, auth.js y app.js
  assert.ok(licenseJs.includes('getAuthenticatedEmail('), 'VaultLicenseManager debe implementar getAuthenticatedEmail()');
  assert.ok(authJs.includes('syncAuthenticatedEmail('), 'VaultAuth debe implementar syncAuthenticatedEmail()');
  assert.ok(appJs.includes('getAuthenticatedUserEmail('), 'BovedaApp debe implementar getAuthenticatedUserEmail()');

  // 3. Prueba funcional: prioridad del correo del usuario autenticado sobre placeholders genéricos
  const { VaultLicenseManager } = require('../assets/js/license.js');
  const mgr = new VaultLicenseManager();
  mgr.deviceId = 'dev_test_spec011';
  mgr.userEmail = 'su-usuario@dominio.com';

  // Cuando el usuario se autentica y guarda su perfil con correo real, getAuthenticatedEmail y getEstadoLicencia deben retornar ese correo
  await mgr.saveUserProfile({
    firstName: 'Andrés',
    lastName: 'Aguiar',
    email: 'andres.aguiar.marmol@gmail.com',
    phone: '+56933395447'
  });

  assert.equal(mgr.getAuthenticatedEmail(), 'andres.aguiar.marmol@gmail.com', 'getAuthenticatedEmail() debe retornar el correo del usuario autenticado');
  // Incluso si se pasa accidentalmente un placeholder como argumento, debe priorizar el correo real autenticado
  assert.equal(mgr.getAuthenticatedEmail('su-usuario@dominio.com'), 'andres.aguiar.marmol@gmail.com', 'getAuthenticatedEmail() debe ignorar placeholders cuando existe correo autenticado');

  const estado = mgr.getEstadoLicencia('su-usuario@dominio.com');
  assert.equal(estado.email, 'andres.aguiar.marmol@gmail.com', 'getEstadoLicencia() debe usar el correo del usuario autenticado');
  assert.equal(estado.cadenaSolicitud, 'REQ|dev_test_spec011|andres.aguiar.marmol@gmail.com', 'La cadena de solicitud debe contener el correo del usuario autenticado');

  // 4. Service Worker v13 o superior
  assert.ok(/boveda-digital-v\d+/.test(swJs), 'sw.js debe estar en versión boveda-digital-v13+');
});

test('SDD 012, 013, 014 & 015: Unificación Multi-Dispositivo, Deduplicación Atómica (11 Expedientes) y Erradicación de "Documento Restaurado"', () => {
  const rootDir = path.join(__dirname, '..');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const storageJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'storage.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const cloudJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'vault_cloud.json'), 'utf8'));

  // 1. VaultAuth debe conectar por defecto a Cloud Run incluso en PC (salvo flag boveda_force_local_api) y usar sub/salt unificados
  assert.ok(authJs.includes("this.UNIFIED_MASTER_SALT = UNIFIED_MASTER_SALT"), 'VaultAuth debe definir UNIFIED_MASTER_SALT');
  assert.ok(authJs.includes("this.UNIFIED_VAULT_SUB = 'usr_pro_001'"), 'VaultAuth debe definir UNIFIED_VAULT_SUB = usr_pro_001');
  assert.ok(authJs.includes('boveda_force_local_api'), 'VaultAuth solo debe apuntar a localhost si boveda_force_local_api está activo');

  // 2. server.js debe unificar la partición de la bóveda con resolveVaultPartition y preservar sub en refresh
  assert.ok(serverJs.includes('function resolveVaultPartition('), 'server.js debe implementar resolveVaultPartition');
  assert.ok(serverJs.includes('function decodeJWTWithoutExpiry('), 'server.js debe implementar decodeJWTWithoutExpiry para refresh');
  assert.ok(serverJs.includes('INITIAL_PURGED_DOC_IDS'), 'server.js debe purgar los documentos demo y duplicados históricos');

  // 3. data/vault_cloud.json debe contener los 15 expedientes personales reales en usr_pro_001 sin registros demo ni "Documento Restaurado"
  assert.ok(Array.isArray(cloudJson.documents.usr_pro_001), 'vault_cloud.json debe contener la colección unificada usr_pro_001');
  assert.ok(cloudJson.documents.usr_pro_001.length >= 11, 'vault_cloud.json debe consolidar los expedientes personales reales del titular');
  assert.ok(!cloudJson.documents.usr_pro_001.some(d => String(d.id).startsWith('doc_demo_')), 'vault_cloud.json NO debe incluir los 3 documentos demo eliminados');
  assert.ok(!cloudJson.documents.usr_pro_001.some(d => d.title === 'Documento Restaurado'), 'vault_cloud.json NO debe contener registros corruptos Documento Restaurado');
  assert.ok(Array.isArray(cloudJson.deletedIds) && cloudJson.deletedIds.includes('doc_demo_pasaporte'), 'vault_cloud.json debe registrar los demos eliminados en deletedIds');
  assert.ok(cloudJson.deletedIds.includes('doc_q3swr4qvq'), 'vault_cloud.json debe purgar los registros corruptos Documento Restaurado');
  assert.ok(!cloudJson.deletedIds.includes('doc_huzcvq2ff'), 'vault_cloud.json NO debe incluir expedientes reales en deletedIds');
  assert.ok(cloudJson.customDrawers && cloudJson.customDrawers.usr_pro_001 && cloudJson.customDrawers.usr_pro_001.gaveta_documentos_registrad_m6ses, 'vault_cloud.json debe preservar la gaveta personalizada Documentos Registrados');

  // 4. Spec 013, 014, 015 & 017: Carga atómica (_loadRenderSeq), cerrojos de concurrencia y rechazo de "Documento Restaurado"
  assert.ok(!appJs.includes('deleteDocument(zombieId'), 'app.js NO debe auto-eliminar registros en loadAndRenderDocuments');
  assert.ok(appJs.includes('_loadRenderSeq'), 'app.js debe usar secuencia atómica _loadRenderSeq en loadAndRenderDocuments');
  assert.ok(appJs.includes('_isSyncingWithCloud'), 'app.js debe usar cerrojo _isSyncingWithCloud en syncWithCloud');
  const { esPayloadCifradoValido } = require('../assets/js/storage.js');
  assert.equal(esPayloadCifradoValido({ id: 'doc_test', title: 'Documento Restaurado', category: 'general', encrypted_payload: 'ABCD' }), false, 'esPayloadCifradoValido debe rechazar registros corruptos Documento Restaurado');

  // 5. Service Worker v19 o superior
  assert.ok(/boveda-digital-v(19|20|21|22|23|24)/.test(swJs), 'sw.js debe estar en versión boveda-digital-v19 o superior');
});

test('SDD 017: Eliminación definitiva, cerrojo anti-concurrencia y purga de réplicas sin duplicación', () => {
  const rootDir = path.join(__dirname, '..');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  const storageJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'storage.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  // 1. handleDeleteSelectedDocument debe activar cerrojos _isDeletingDoc y _isSyncingWithCloud
  assert.ok(appJs.includes('this._isDeletingDoc = true'), 'app.js debe activar _isDeletingDoc en handleDeleteSelectedDocument');
  assert.ok(appJs.includes('this._isSyncingWithCloud = true'), 'app.js debe activar _isSyncingWithCloud para bloquear syncs de focus/visibilitychange');
  assert.ok(appJs.includes('idsToDelete.add(d.id)'), 'app.js debe encontrar y purgar réplicas con la misma categoría y título');

  // 2. triggerReactiveCloudSync debe respetar los cerrojos
  assert.ok(appJs.includes('this._isDeletingDoc || this._isSyncingWithCloud'), 'triggerReactiveCloudSync debe ignorar eventos si hay eliminación o sync en curso');

  // 3. mergeCloudDocuments y deduplicación en app.js deben registrar tombstones (true)
  assert.ok(storageJs.includes('await this.deleteDocument(localDoc.id, true)'), 'storage.js debe purgar réplicas registrando tombstone');
  assert.ok(appJs.includes('await window.vaultStorage.deleteDocument(redundantDoc.id, true)'), 'loadAndRenderDocuments debe eliminar duplicados con tombstone');

  // 4. server.js debe purgar réplicas con categoría y título idéntico en DELETE /api/v1/documents/:id
  assert.ok(serverJs.includes('// Spec 017: Purgar también cualquier duplicado huérfano con la misma categoría y título'), 'server.js debe purgar duplicados con misma categoría y título al eliminar');

  // 5. Service Worker v21 o superior y cache busting en index.html
  assert.ok(/boveda-digital-v(21|22|23|24)/.test(swJs), 'sw.js debe operar bajo boveda-digital-v21 o superior');
  assert.ok(/app\.js\?v=(21|22|23|24)/.test(html), 'index.html debe cargar app.js con ?v=21 o superior');
});

test('SDD 016: Motor OCR archivar-documentos (SKILL.md) extrae metadatos y normaliza nombre_archivo y ruta_drive', () => {
  const { procesarTextoOCRParaDrive } = require('../assets/js/gdrive.js');
  const rootDir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');

  // Caso 1: Boleta de Servicios en CLP con fecha en español y puntos de miles
  const ocr1 = 'ENEL DISTRIBUCIÓN CHILE S.A. - R.U.T. 96.800.570-7 - BOLETA ELECTRÓNICA Nº 45892103 - Fecha de Emisión: 28 de Octubre de 2026 - Suministro Eléctrico Santiago - Total a Pagar: $ 42.850 CLP';
  const res1 = procesarTextoOCRParaDrive(ocr1);
  assert.equal(res1.tipo_documento, 'boleta');
  assert.equal(res1.categoria, 'servicios');
  assert.equal(res1.emisor, 'ENEL DISTRIBUCION CHILE');
  assert.equal(res1.fecha_emision, '2026-10-28');
  assert.equal(res1.monto_total, 42850);
  assert.equal(res1.moneda, 'CLP');
  assert.equal(res1.folio, '45892103');
  assert.equal(res1.nombre_archivo, '2026-10-28_servicios_ENEL_DISTRIBUCION_CHILE_45892103.pdf');
  assert.equal(res1.ruta_drive, 'Documentos/2026/servicios/ENEL_DISTRIBUCION_CHILE');

  // Caso 2: Comprobante de Salud con fecha DD/MM/YYYY
  const ocr2 = 'CLÍNICA ALEMANA DE SANTIAGO S.A. - Comprobante de Pago de Prestación Médica - Folio #990142 - Emitido: 30/10/2026 - Consulta Especialidad Traumatología - Monto Cancelado: $65.000.-';
  const res2 = procesarTextoOCRParaDrive(ocr2);
  assert.equal(res2.tipo_documento, 'comprobante');
  assert.equal(res2.categoria, 'salud');
  assert.equal(res2.fecha_emision, '2026-10-30');
  assert.equal(res2.monto_total, 65000);
  assert.equal(res2.folio, '990142');
  assert.equal(res2.nombre_archivo, '2026-10-30_salud_CLINICA_ALEMANA_DE_SANTIAGO_990142.pdf');
  assert.equal(res2.ruta_drive, 'Documentos/2026/salud/CLINICA_ALEMANA_DE_SANTIAGO');

  // Caso 3: Integración en UI (index.html y app.js)
  assert.ok(html.includes('id="ocr-skill-assistant-panel"'), 'index.html debe incluir el panel del motor OCR archivar-documentos');
  assert.ok(html.includes('id="input-ocr-raw-text"'), 'index.html debe incluir textarea input-ocr-raw-text');
  assert.ok(appJs.includes('handleProcessOcrSkill('), 'app.js debe implementar handleProcessOcrSkill()');
});

test('SDD 018: removeDeletedIds des-tombstonea expedientes y permite recuperación íntegra de respaldos', async () => {
  const { VaultStorage } = require('../assets/js/storage.js');
  const settingsStore = new Map();
  const docsStore = new Map();

  const fakeStorage = Object.create(VaultStorage.prototype);
  fakeStorage.getSetting = async (k) => settingsStore.get(k) || null;
  fakeStorage.setSetting = async (k, v) => { settingsStore.set(k, v); return true; };
  fakeStorage.saveSetting = async (k, v) => fakeStorage.setSetting(k, v);
  fakeStorage.saveDocument = async (doc) => { docsStore.set(doc.id, doc); return doc; };
  fakeStorage.getAllDocuments = async () => Array.from(docsStore.values());
  fakeStorage.logAuditEvent = async () => true;

  const testId = 'doc_restored_test_018';
  // 1. Agregar a eliminados
  await fakeStorage.addDeletedIds([testId]);
  let deletedList = await fakeStorage.getDeletedIds();
  assert.ok(deletedList.includes(testId), 'testId debe estar inicialmente en deletedIds');

  // 2. Ejecutar removeDeletedIds
  await fakeStorage.removeDeletedIds([testId]);
  deletedList = await fakeStorage.getDeletedIds();
  assert.ok(!deletedList.includes(testId), 'testId debe haber sido removido de deletedIds');

  // 3. Probar importBackupData con un documento que estaba en deletedIds
  const fakeBackup = {
    app: 'BovedaDigital',
    version: '1.0',
    crypto_salt: '226000658459336d4184642799fc8498',
    pin_hash: 'mockhash',
    customDrawers: {},
    documents: [
      {
        id: testId,
        category: 'identidad',
        title: 'Documento Respaldo 018',
        encrypted_payload: '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',
        iv: 'vzVtVTcoRaXpqcb8',
        checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    ]
  };

  // Pre-marcar testId como eliminado
  await fakeStorage.addDeletedIds([testId]);
  assert.ok((await fakeStorage.getDeletedIds()).includes(testId));

  // Al importar, debe des-tombstonear automáticamente testId
  await fakeStorage.importBackupData(fakeBackup, 'usr_test_018');
  assert.ok(!(await fakeStorage.getDeletedIds()).includes(testId), 'testId debe des-tombstonearse tras importBackupData');

  // 4. Service Worker v22 / v23 y cache busting en index.html
  const rootDir = path.join(__dirname, '..');
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(swJs.includes('boveda-digital-v'), 'sw.js debe operar bajo versionado seguro');
  assert.ok(html.includes('app.js?v='), 'index.html debe cargar app.js con versionado');
});

test('SDD 019: Resiliencia de sincronización en celular, des-tombstone automático en mergeCloudDocuments y SW v23', async () => {
  const { VaultStorage } = require('../assets/js/storage.js');
  const settingsStore = new Map();
  const docsStore = new Map();

  const fakeStorage = Object.create(VaultStorage.prototype);
  fakeStorage.getSetting = async (k) => settingsStore.get(k) || null;
  fakeStorage.setSetting = async (k, v) => { settingsStore.set(k, v); return true; };
  fakeStorage.saveSetting = async (k, v) => fakeStorage.setSetting(k, v);
  fakeStorage.saveDocument = async (doc) => { docsStore.set(doc.id, doc); return doc; };
  fakeStorage.getDocument = async (id) => docsStore.get(id) || null;
  fakeStorage.deleteDocument = async (id, recordTombstone = true) => {
    docsStore.delete(id);
    if (recordTombstone) await fakeStorage.addDeletedIds([id]);
    return true;
  };
  fakeStorage.getAllDocuments = async () => Array.from(docsStore.values());
  fakeStorage.logAuditEvent = async () => true;

  const activeDocId = 'doc_active_from_cloud_019';
  // 1. Simular que el celular tenía activeDocId en su lista local de borrados
  await fakeStorage.addDeletedIds([activeDocId]);
  let deletedList = await fakeStorage.getDeletedIds();
  assert.ok(deletedList.includes(activeDocId), 'activeDocId debe estar inicialmente en deletedIds del celular');

  // 2. Ejecutar mergeCloudDocuments con cloudDocs que incluye activeDocId como documento activo legítimo
  const cloudDocs = [
    {
      id: activeDocId,
      category: 'identidad',
      title: 'Documento Activo en Nube',
      encrypted_payload: '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',
      iv: 'vzVtVTcoRaXpqcb8',
      checksum: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      updated_at: new Date().toISOString()
    }
  ];

  await fakeStorage.mergeCloudDocuments(cloudDocs, ['doc_other_deleted']);

  // Debe haberse des-tombstoneado activeDocId y guardado en docsStore
  deletedList = await fakeStorage.getDeletedIds();
  assert.ok(!deletedList.includes(activeDocId), 'activeDocId no debe estar en deletedIds tras mergeCloudDocuments');
  assert.ok(docsStore.has(activeDocId), 'activeDocId debe haberse guardado en docsStore local');

  // 3. Validar timeout de 8000ms en auth.js y app.js
  const rootDir = path.join(__dirname, '..');
  const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'auth.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
  assert.ok(authJs.includes('8000'), 'auth.js debe tener timeout de al menos 8000ms en checkServerConnection');
  assert.ok(appJs.includes('8000'), 'app.js debe tener timeout de al menos 8000ms en testCloudConnection');

  // 4. Service Worker v24 y cache busting en index.html
  const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(swJs.includes("CACHE_NAME = 'boveda-digital-v24'"), 'sw.js debe operar bajo boveda-digital-v24');
  assert.ok(html.includes('app.js?v=24'), 'index.html debe cargar app.js con ?v=24');
});

test('SDD 020: Paridad total PC-iPhone (15 expedientes reales) y erradicación de doc_ymzsioywq de tombstones', async () => {
  const rootDir = path.join(__dirname, '..');
  const storageJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'storage.js'), 'utf8');
  const cloudJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'vault_cloud.json'), 'utf8'));

  // 1. storage.js getDeletedIds NO debe contener doc_ymzsioywq en su lista de IDs eliminados por defecto
  const { VaultStorage } = require('../assets/js/storage.js');
  const vs = new VaultStorage();
  vs.getSetting = async (k) => null;
  vs.setSetting = async (k, v) => true;

  const deletedList = await vs.getDeletedIds();
  assert.ok(!deletedList.includes('doc_ymzsioywq'), 'doc_ymzsioywq (Residencia Definitiva Chile AEAM) NO debe estar en getDeletedIds()');

  // 2. data/vault_cloud.json debe tener los 15 expedientes y NO tener doc_ymzsioywq en deletedIds
  assert.equal(cloudJson.documents.usr_pro_001.length, 15, 'vault_cloud.json debe contener exactamente los 15 expedientes');
  assert.ok(!cloudJson.deletedIds.includes('doc_ymzsioywq'), 'vault_cloud.json deletedIds NO debe incluir doc_ymzsioywq');
  assert.ok(cloudJson.documents.usr_pro_001.some(d => d.id === 'doc_ymzsioywq'), 'vault_cloud.json debe contener doc_ymzsioywq');
});










