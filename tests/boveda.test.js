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


