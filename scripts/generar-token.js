#!/usr/bin/env node

/**
 * scripts/generar-token.js — Emisor Administrativo de Tokens de Activación Offline
 * Genera tokens Base64 con firma SHA-256 auténtica para Bóveda Digital.
 * 
 * Uso:
 *   node scripts/generar-token.js "REQ|<DeviceID>|<correo>" [dias_validez]
 *   node scripts/generar-token.js <DeviceID> <correo> [dias_validez]
 * 
 * Ejemplos:
 *   node scripts/generar-token.js "REQ|dev_8f21e33d|andres@correo.com" 365
 *   node scripts/generar-token.js "REQ|dev_8f21e33d|andres@correo.com" -1   (Perpetua)
 */

const {
  generarTokenDesdeCadenaSolicitud,
  generarTokenLicencia,
  validarTokenLicencia,
  LICENSE_SALT
} = require('../assets/js/license.js');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
==================================================================
  Bóveda Digital — Emisor Administrativo de Tokens Offline
==================================================================
Uso:
  node scripts/generar-token.js "REQ|<DeviceID>|<correo>" [dias]
  node scripts/generar-token.js <DeviceID> <correo> [dias]

Opciones de Días:
  365 : Licencia anual (1 año, predeterminado)
  -1  : Licencia vitalicia / perpetua (sin caducidad)
  30  : Licencia de prueba extendida (1 mes)
==================================================================
`);
    process.exit(0);
  }

  let deviceId = '';
  let email = '';
  let dias = 365;

  const arg0 = args[0].trim();
  if (arg0.toUpperCase().startsWith('REQ|')) {
    const partes = arg0.split('|');
    if (partes.length < 3) {
      console.error('Error: La cadena REQ debe contener al menos 3 partes: REQ|<DeviceID>|<correo>');
      process.exit(1);
    }
    deviceId = partes[1].trim();
    email = partes[2].trim();
    if (args[1]) {
      dias = parseInt(args[1], 10);
    }
  } else {
    deviceId = arg0;
    email = (args[1] || '').trim();
    if (!email) {
      console.error('Error: Debes proporcionar el correo/usuario asociado al Device ID.');
      console.error('Ejemplo: node scripts/generar-token.js dev_123456 mi@correo.com 365');
      process.exit(1);
    }
    if (args[2]) {
      dias = parseInt(args[2], 10);
    }
  }

  try {
    const token = await generarTokenLicencia(deviceId, email, dias);
    const validacion = await validarTokenLicencia(token, deviceId);

    console.log('\n==================================================================');
    console.log('✅ TOKEN DE ACTIVACIÓN GENERADO CON ÉXITO');
    console.log('==================================================================');
    console.log('• Device ID    :', deviceId);
    console.log('• Usuario      :', email);
    console.log('• Vigencia     :', dias === -1 ? 'Perpetua / Vitalicia' : `${dias} días (hasta ${validacion.payload.expirationDate})`);
    console.log('• Firma SHA-256:', validacion.payload ? validacion.payload.signature || 'OK' : 'OK');
    console.log('------------------------------------------------------------------');
    console.log('🔑 TOKEN BASE64 (Copiar y enviar al cliente):');
    console.log('------------------------------------------------------------------');
    console.log(token);
    console.log('==================================================================\n');
  } catch (err) {
    console.error('❌ Error al generar token:', err.message);
    process.exit(1);
  }
}

main();
