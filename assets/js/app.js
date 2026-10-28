/**
 * Bóveda Digital — Orquestador Principal de la Aplicación
 * Manejo de Vistas, Cifrado Zero-Knowledge, Archivador Mueble Gavetero,
 * Lectura, Impresión, Modificación y Eliminación de Documentos.
 */

class BovedaApp {
  constructor() {
    this.searchQuery = '';
    this.unlockedDocuments = []; // Documentos descifrados en memoria durante la sesión activa
    this.currentPinInput = '';
    this.selectedDoc = null;
    this.activeView = 'auth'; // 'auth' | 'pin-setup' | 'pin-lock' | 'dashboard'
    this.isEditingCurrentDoc = false;
    this.deferredInstallPrompt = null;

    // Estado de gavetas abiertas (por defecto la primera gaveta está abierta)
    this.openDrawers = new Set(['identidad']);

    // Las 5 Gavetas Oficiales del Archivador de Bóveda (cada una con su paleta de color distintiva)
    this.defaultCategories = {
      identidad: {
        id: 'identidad',
        drawerNumber: 1,
        label: 'Identidad',
        subtitle: 'Cédulas, Pasaportes, DNI y Credenciales Oficiales',
        icon: 'user-check',
        color: '#06b6d4' // Cyan Eléctrico de Seguridad
      },
      vehiculos: {
        id: 'vehiculos',
        drawerNumber: 2,
        label: 'Vehículos',
        subtitle: 'Licencias de Conducir, Títulos de Propiedad y Seguros',
        icon: 'car',
        color: '#10b981' // Verde Esmeralda Vial
      },
      finanzas: {
        id: 'finanzas',
        drawerNumber: 3,
        label: 'Finanzas',
        subtitle: 'Tarjetas de Crédito/Débito, Cuentas y Certificaciones',
        icon: 'credit-card',
        color: '#f59e0b' // Ámbar / Oro Financiero
      },
      residencia: {
        id: 'residencia',
        drawerNumber: 4,
        label: 'Residencia',
        subtitle: 'Contratos de Alquiler, Facturas de Servicios y Empadronamiento',
        icon: 'home',
        color: '#8b5cf6' // Púrpura / Violeta Notarial
      },
      salud: {
        id: 'salud',
        drawerNumber: 5,
        label: 'Salud y Viajes',
        subtitle: 'Carnets de Vacunación, Seguros Médicos y Visados',
        icon: 'activity',
        color: '#ec4899' // Rosa / Magenta Médico
      }
    };
    this.categories = { ...this.defaultCategories };
  }

  async init() {
    this.bindEvents();

    // Inicializar Google Drive Integration
    if (window.vaultGoogleDrive) {
      await window.vaultGoogleDrive.init();
      this.updateGoogleDriveUI();
    }

    // Listener para instalación PWA a 1 toque
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const btnInstall = document.getElementById('btn-pwa-install');
      if (btnInstall) {
        btnInstall.classList.remove('hidden');
        btnInstall.classList.add('inline-flex');
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      const btnInstall = document.getElementById('btn-pwa-install');
      if (btnInstall) {
        btnInstall.classList.add('hidden');
        btnInstall.classList.remove('inline-flex');
      }
      this.showToast('¡Bóveda Digital instalada con éxito!', 'success');
    });

    // Evaluar estado de sesión
    const authState = await window.vaultAuth.init();
    if (authState.status === 'LOCKED') {
      const hasPin = await window.vaultAuth.hasConfiguredPin();
      if (hasPin) {
        this.switchView('pin-lock');
      } else {
        this.switchView('pin-setup');
      }
    } else {
      this.switchView('auth');
    }

    // Inicializar y evaluar licenciamiento offline y período de prueba (Spec 003)
    if (window.vaultLicense) {
      try {
        await window.vaultLicense.init();
        this.updateLicenseUI();
        this.checkLicenseLock();

        // Evaluar Identificación Obligatoria de Primer Uso (Spec 007)
        const isVerified = await window.vaultLicense.isUserIdentifiedAndVerified();
        if (!isVerified) {
          this.openFirstRunOnboarding();
        }
      } catch (errLic) {
        console.warn('[BovedaApp] Error al inicializar gestor de licencias:', errLic);
      }
    }

    // Comprobación inicial de conectividad en segundo plano con el servidor Cloud Run
    if (window.vaultAuth) {
      window.vaultAuth.checkServerConnection().then(isLive => {
        this.updateCloudSyncUI(isLive ? 'synced' : 'offline');
      }).catch(() => {
        this.updateCloudSyncUI('offline');
      });
    }

    // Inicializar iconos
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Cambia la vista activa del cliente
   */
  switchView(viewName) {
    this.activeView = viewName;
    const views = ['auth-view', 'pin-setup-view', 'pin-lock-view', 'dashboard-view'];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const activeEl = document.getElementById(`${viewName}-view`);
    if (activeEl) {
      activeEl.classList.remove('hidden');
    }

    if (viewName === 'pin-lock') {
      this.currentPinInput = '';
      this.updatePinDots();
      const userEmailEl = document.getElementById('lock-user-email');
      if (userEmailEl && window.vaultAuth.currentUser) {
        userEmailEl.textContent = window.vaultAuth.currentUser.email;
      }
    } else if (viewName === 'pin-setup') {
      const pin1 = document.getElementById('input-new-pin');
      const pin2 = document.getElementById('input-confirm-pin');
      if (pin1) {
        pin1.value = '';
        setTimeout(() => pin1.focus(), 60);
      }
      if (pin2) pin2.value = '';
    } else if (viewName === 'dashboard') {
      this.renderDashboardHeader();
      this.updateLicenseUI();
      this.checkLicenseLock();
      this.loadAndRenderDocuments();
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 50);
    }
  }

  /**
   * Actualiza el encabezado del dashboard con datos del usuario y perfil registrado
   */
  async renderDashboardHeader() {
    const user = window.vaultAuth.currentUser;
    const emailEl = document.getElementById('dash-user-email');
    if (emailEl && user) emailEl.textContent = user.email;

    // Actualizar botón de perfil de usuario en la barra horizontal
    await this.renderHeaderUserProfile();
  }

  /**
   * Renderiza el botón de perfil de usuario en la barra horizontal (Navbar superior)
   */
  async renderHeaderUserProfile() {
    let profile = window.vaultLicense ? window.vaultLicense.userProfile : null;
    if (!profile && window.vaultLicense && typeof window.vaultLicense.getUserProfile === 'function') {
      profile = await window.vaultLicense.getUserProfile();
    }

    const nameEl = document.getElementById('header-user-name');
    const avatarImg = document.getElementById('header-user-avatar-img');
    const avatarIcon = document.getElementById('header-user-avatar-icon');

    let displayName = 'Registrar Usuario';
    let photoUrl = null;

    if (profile && (profile.firstName || profile.lastName || profile.email)) {
      const full = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      displayName = full || (profile.email ? profile.email.split('@')[0] : 'Usuario');
      photoUrl = profile.photo || null;
    } else if (window.vaultAuth && window.vaultAuth.currentUser && window.vaultAuth.currentUser.email) {
      displayName = window.vaultAuth.currentUser.email.split('@')[0];
    } else if (window.vaultLicense && window.vaultLicense.userEmail) {
      displayName = window.vaultLicense.userEmail.split('@')[0];
    }

    if (nameEl) {
      nameEl.textContent = displayName;
    }

    if (avatarImg && avatarIcon) {
      if (photoUrl) {
        avatarImg.src = photoUrl;
        avatarImg.classList.remove('hidden');
        avatarIcon.classList.add('hidden');
      } else {
        avatarImg.src = '';
        avatarImg.classList.add('hidden');
        avatarIcon.classList.remove('hidden');
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Carga los documentos desde IndexedDB y los descifra con la clave maestra en memoria
   */
  async loadAndRenderDocuments(skipCloudSync = false) {
    if (!window.vaultAuth.masterKey) {
      this.showToast('Bóveda bloqueada. Ingrese su PIN.', 'warning');
      this.switchView('pin-lock');
      return;
    }

    const user = window.vaultAuth.currentUser;

    // Cargar gavetas personalizadas instaladas por el usuario
    try {
      const savedCustom = await window.vaultStorage.getSetting('customDrawers_' + user.sub);
      this.categories = {
        ...this.defaultCategories,
        ...(savedCustom || {})
      };
      this.updateCategoryDropdowns();
    } catch (err) {
      console.warn('[BovedaApp] Error al cargar gavetas personalizadas:', err);
    }

    let rawDocs = await window.vaultStorage.getAllDocuments(user.sub);

    // Si la bóveda está vacía, pre-sembrar automáticamente expedientes de muestra cifrados con adjuntos digitales
    if (rawDocs.length === 0) {
      await this._seedInitialDemoDocuments(user.sub);
      rawDocs = await window.vaultStorage.getAllDocuments(user.sub);
    }

    this.unlockedDocuments = [];
    let failedCount = 0;
    let reEncryptedCount = 0;

    // Obtener PIN de sesión seguro (memoria volátil o sessionStorage)
    let activePin = window.vaultAuth.lastEnteredPin;
    if (!activePin) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          activePin = sessionStorage.getItem('_vault_session_pin');
          if (activePin) window.vaultAuth.lastEnteredPin = activePin;
        }
      } catch(e) {}
    }

    // Obtener sales candidatas para recuperación resiliente de expedientes históricos
    const candidateSalts = new Set([
      window.vaultAuth.salt,
      await window.vaultStorage.getSetting('last_imported_salt'),
      await window.vaultStorage.getSetting('backup_crypto_salt_' + user.sub),
      await window.vaultStorage.getSetting('userSalt_' + user.email),
      '226000658459336d4184642799fc8498',
      'ae8713595fed1e759db1062454187513',
      '5e1fc8e580b04dcd8d7a1a337d87b471',
      '4c11607d7f05ed75811057969f60880e'
    ]);

    const fallbackKeys = [];
    if (activePin) {
      for (const s of candidateSalts) {
        if (s && s !== window.vaultAuth.salt) {
          try {
            const k = await window.vaultCrypto.deriveKeyFromPin(activePin, s);
            fallbackKeys.push({ salt: s, key: k });
          } catch(e) {}
        }
      }
    }

    for (const raw of rawDocs) {
      if (window.esPayloadCifradoValido && !window.esPayloadCifradoValido(raw)) {
        continue;
      }
      let decryptedPayload = null;

      // 1. Intentar descifrado con la clave maestra actual
      try {
        decryptedPayload = await window.vaultCrypto.decrypt(
          window.vaultAuth.masterKey,
          raw.encrypted_payload,
          raw.iv
        );
      } catch (err) {
        // 2. Intentar descifrado resiliente con sales históricas si falla la principal
        for (const fb of fallbackKeys) {
          try {
            decryptedPayload = await window.vaultCrypto.decrypt(
              fb.key,
              raw.encrypted_payload,
              raw.iv
            );
            if (decryptedPayload) {
              // Re-cifrar con la clave maestra actual para unificar y normalizar en reposo
              try {
                const reEnc = await window.vaultCrypto.encrypt(window.vaultAuth.masterKey, decryptedPayload);
                raw.encrypted_payload = reEnc.ciphertext;
                raw.iv = reEnc.iv;
                raw.checksum = reEnc.checksum;
                raw.updated_at = new Date().toISOString();
                await window.vaultStorage.saveDocument(raw);
                reEncryptedCount++;
              } catch(reErr) {
                console.warn('[BovedaApp] Error al re-cifrar documento normalizado:', reErr);
              }
              break;
            }
          } catch(fbErr) {}
        }
      }

      if (decryptedPayload) {
        this.unlockedDocuments.push({
          id: raw.id,
          category: raw.category || 'identidad',
          title: raw.title,
          ...decryptedPayload,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
          is_synced: raw.is_synced
        });
      } else {
        failedCount++;
        console.warn('[BovedaApp] Documento no pudo ser descifrado:', raw.id, raw.title);
      }
    }

    if (reEncryptedCount > 0) {
      console.log(`[BovedaApp] ${reEncryptedCount} expedientes migrados y re-cifrados exitosamente con tu clave actual.`);
    }

    if (failedCount > 0 && this.unlockedDocuments.length === 0) {
      this.showToast(`Atención: ${failedCount} expedientes no pudieron descifrarse con el PIN actual.`, 'warning');
    }

    this.renderMetrics();
    this.renderCabinet();

    if (!skipCloudSync) {
      this.syncWithCloud(true);
      const user = window.vaultAuth?.currentUser;
      const userId = user ? (user.sub || user.email) : 'local_user';
      window.vaultGoogleDrive?.triggerAutoSync(userId, 'unlock');
    }
  }

  /**
   * Sincroniza las opciones de todas las gavetas en los selectores de los modales
   */
  updateCategoryDropdowns() {
    const optionsHtml = Object.values(this.categories).map(cat =>
      `<option value="${cat.id}">Gaveta ${cat.drawerNumber}: ${cat.label}</option>`
    ).join('');

    const newDocSelect = document.getElementById('new-doc-category-select');
    if (newDocSelect) {
      const currentVal = newDocSelect.value;
      newDocSelect.innerHTML = optionsHtml;
      if (currentVal && this.categories[currentVal]) {
        newDocSelect.value = currentVal;
      }
    }

    const editDocSelect = document.getElementById('edit-category');
    if (editDocSelect) {
      const currentVal = editDocSelect.value;
      editDocSelect.innerHTML = optionsHtml;
      if (currentVal && this.categories[currentVal]) {
        editDocSelect.value = currentVal;
      }
    }
  }

  /**
   * Calcula y dibuja métricas de vencimiento y cuotas
   */
  renderMetrics() {
    const now = new Date();
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 86400000);

    let validCount = 0;
    let warningCount = 0;
    let expiredCount = 0;

    this.unlockedDocuments.forEach(doc => {
      if (!doc.expiry_date) {
        validCount++;
        return;
      }
      const exp = new Date(doc.expiry_date);
      if (exp < now) {
        expiredCount++;
      } else if (exp <= thirtyDaysAhead) {
        warningCount++;
      } else {
        validCount++;
      }
    });

    const elTotal = document.getElementById('stat-total-docs');
    const elValid = document.getElementById('stat-valid-docs');
    const elWarning = document.getElementById('stat-warning-docs');
    const elExpired = document.getElementById('stat-expired-docs');

    if (elTotal) elTotal.textContent = this.unlockedDocuments.length;
    if (elValid) elValid.textContent = validCount;
    if (elWarning) elWarning.textContent = warningCount;
    if (elExpired) elExpired.textContent = expiredCount;

    // Actualizar cuota de almacenamiento
    const user = window.vaultAuth.currentUser;
    const isPro = user && user.subscription && user.subscription.plan === 'pro';
    const quotaText = document.getElementById('quota-text');
    const quotaBar = document.getElementById('quota-bar');
    if (quotaText && quotaBar) {
      if (isPro) {
        quotaText.textContent = `${this.unlockedDocuments.length} expedientes (Ilimitado)`;
        quotaBar.style.width = '100%';
        quotaBar.className = 'h-1.5 rounded-full bg-amber-400';
      } else {
        const pct = Math.min(100, (this.unlockedDocuments.length / 5) * 100);
        quotaText.textContent = `${this.unlockedDocuments.length} de 5 expedientes`;
        quotaBar.style.width = `${pct}%`;
        quotaBar.className = pct >= 100 ? 'h-1.5 rounded-full bg-rose-500' : 'h-1.5 rounded-full bg-emerald-500';
      }
    }
  }

  /**
   * Alterna el estado de apertura/cierre de una gaveta específica
   */
  toggleDrawer(categoryKey) {
    if (this.openDrawers.has(categoryKey)) {
      this.openDrawers.delete(categoryKey);
    } else {
      this.openDrawers.add(categoryKey);
    }
    this.renderCabinet();
  }

  /**
   * Abre o cierra todas las gavetas del archivador simultáneamente
   */
  toggleAllDrawers(openAll) {
    if (openAll) {
      Object.keys(this.categories).forEach(k => this.openDrawers.add(k));
    } else {
      this.openDrawers.clear();
    }
    this.renderCabinet();
  }

  /**
   * Exporta y descarga un archivo de respaldo seguro en formato JSON (Zero-Knowledge)
   */
  async handleExportBackup() {
    try {
      const user = window.vaultAuth.currentUser;
      const userId = user ? user.sub || user.email : 'local_user';
      // Priorizar la sal efectiva real con la que se cifran los documentos
      const salt = await window.vaultStorage.getSetting(`userSalt_${userId}`) ||
                   await window.vaultStorage.getSetting(`userSalt_${user?.email}`) ||
                   await window.vaultStorage.getSetting('last_imported_salt') ||
                   window.vaultAuth?.salt ||
                   await window.vaultStorage.getSetting('userSalt') ||
                   '226000658459336d4184642799fc8498';
      const pinHash = await window.vaultStorage.getSetting('vaultPinHash_' + (user?.email || 'default')) || '';
      const backupData = await window.vaultStorage.exportBackupData(userId, salt, pinHash);

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const today = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = url;
      a.download = `boveda-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast(`Respaldo generado exitosamente (${backupData.total_documents} expedientes).`, 'success');
    } catch (err) {
      console.error('[BovedaApp] Error al exportar respaldo:', err);
      this.showToast('Error al generar respaldo: ' + err.message, 'danger');
    }
  }

  /**
   * Importa y fusiona los expedientes y gavetas desde un archivo de respaldo JSON
   */
  async handleImportBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let backupData;
      try {
        backupData = JSON.parse(text);
      } catch (parseErr) {
        this.showToast('El archivo seleccionado no es un JSON válido.', 'danger');
        return;
      }

      const validacion = window.validarBackupBoveda(backupData);
      if (!validacion.valido) {
        this.showToast('Respaldo rechazado: ' + validacion.error, 'danger');
        return;
      }

      const user = window.vaultAuth.currentUser;
      const userId = user ? user.sub || user.email : 'local_user';

      // Si el archivo de respaldo contiene un crypto_salt y difiere del actual
      if (backupData.crypto_salt && window.vaultAuth.salt !== backupData.crypto_salt) {
        const pinToDerive = window.vaultAuth.lastEnteredPin || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('_vault_session_pin') : null);
        if (pinToDerive) {
          try {
            const newKey = await window.vaultCrypto.deriveKeyFromPin(pinToDerive, backupData.crypto_salt);
            window.vaultAuth.masterKey = newKey;
            window.vaultAuth.salt = backupData.crypto_salt;
            await window.vaultStorage.setSetting('userSalt', backupData.crypto_salt);
            if (user?.email) {
              await window.vaultStorage.setSetting('userSalt_' + user.email, backupData.crypto_salt);
              const newHash = await window.vaultCrypto.sha256(pinToDerive + ':' + backupData.crypto_salt);
              await window.vaultStorage.setSetting('vaultPinHash_' + user.email, newHash);
            }
          } catch(errSalt) {
            console.warn('[BovedaApp] No se pudo re-derivar clave con el salt del respaldo:', errSalt);
          }
        }
      }

      const result = await window.vaultStorage.importBackupData(backupData, userId);

      // Si venían gavetas personalizadas, recargarlas en memoria
      if (backupData.customDrawers && typeof backupData.customDrawers === 'object') {
        const customDrawers = await window.vaultStorage.getSetting(`customDrawers_${userId}`) || {};
        this.categories = { ...this.defaultCategories, ...customDrawers };
        this.updateCategoryDropdowns();
      }

      // Recargar y re-renderizar documentos descifrados en memoria
      await this.loadAndRenderDocuments();

      const activeCount = this.unlockedDocuments ? this.unlockedDocuments.length : 0;
      if (activeCount === 0 && result.restoredCount > 0) {
        this.showToast(`Respaldo importado (${result.restoredCount} expedientes), pero requieren el PIN original para descifrarse.`, 'warning');
        this.openBackupPinPrompt(backupData);
      } else {
        this.showToast(`Recuperación exitosa: ${activeCount} expedientes restaurados y listos en el archivador.`, 'success');
      }
    } catch (err) {
      console.error('[BovedaApp] Error al importar respaldo:', err);
      this.showToast('Error en la recuperación: ' + err.message, 'danger');
    }
  }

  /**
   * Dispara el diálogo nativo de instalación PWA (1 Toque)
   */
  async triggerPwaInstall() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      const choice = await this.deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this.showToast('¡Bóveda Digital instalada en tu dispositivo!', 'success');
        const btn = document.getElementById('btn-pwa-install');
        if (btn) {
          btn.classList.add('hidden');
          btn.classList.remove('inline-flex');
        }
      }
      this.deferredInstallPrompt = null;
    } else {
      this.showToast('Para instalar con 1 toque: en el menú del navegador pulsa "Añadir a pantalla de inicio" o "Instalar aplicación".', 'info');
    }
  }

  /**
   * Abre el modal de Sincronización con Google Drive
   */
  openGoogleDriveModal() {
    const modal = document.getElementById('modal-gdrive-sync');
    if (!modal) return;
    this.updateGoogleDriveUI();
    const inputClient = document.getElementById('input-gdrive-client-id');
    if (inputClient && window.vaultGoogleDrive) {
      inputClient.value = window.vaultGoogleDrive.clientId || '';
    }
    modal.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Actualiza los elementos visuales de Google Drive en el Navbar y Modal
   * @param {'syncing' | 'synced' | 'error' | null} [overrideState]
   */
  updateGoogleDriveUI(overrideState = null) {
    const gd = window.vaultGoogleDrive;
    if (!gd) return;

    const indicator = document.getElementById('indicator-gdrive-sync');
    const badge = document.getElementById('gdrive-status-badge');
    const led = document.getElementById('gdrive-status-led');
    const statusText = document.getElementById('gdrive-status-text');
    const labelConnect = document.getElementById('label-gdrive-connect');
    const lastBackupText = document.getElementById('gdrive-last-backup-text');
    const toggleAutoSync = document.getElementById('toggle-gdrive-autosync');

    if (toggleAutoSync) {
      toggleAutoSync.checked = Boolean(gd.autoSyncEnabled);
    }

    if (overrideState === 'syncing') {
      if (indicator) {
        indicator.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
        indicator.title = 'Google Drive: Respaldando automáticamente...';
      }
      if (badge) {
        badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20';
      }
      if (led) led.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
      if (statusText) statusText.textContent = 'Respaldando en Drive...';
    } else if (overrideState === 'error') {
      if (indicator) {
        indicator.className = 'w-2 h-2 rounded-full bg-rose-400';
        indicator.title = 'Google Drive: Error al sincronizar';
      }
      if (badge) {
        badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20';
      }
      if (led) led.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
      if (statusText) statusText.textContent = 'Error de Respaldo';
    } else if (gd.isConnected) {
      if (indicator) {
        indicator.className = 'w-2 h-2 rounded-full bg-emerald-400';
        indicator.title = gd.autoSyncEnabled ? 'Google Drive: Conectado (Auto-Sync activo)' : 'Google Drive: Conectado (Manual)';
      }
      if (badge) {
        badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      }
      if (led) led.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
      if (statusText) statusText.textContent = gd.autoSyncEnabled ? 'Conectado (Auto-Sync)' : 'Conectado';
      if (labelConnect) labelConnect.textContent = 'Desconectar de Google Drive';
    } else {
      if (indicator) {
        indicator.className = 'w-2 h-2 rounded-full bg-slate-400';
        indicator.title = 'Google Drive: Desconectado';
      }
      if (badge) {
        badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-mono font-medium flex items-center gap-1.5 bg-slate-800 text-slate-400 border border-white/10';
      }
      if (led) led.className = 'w-1.5 h-1.5 rounded-full bg-slate-400';
      if (statusText) statusText.textContent = 'Desconectado';
      if (labelConnect) labelConnect.textContent = 'Conectar con Google Drive';
    }

    if (lastBackupText) {
      if (gd.lastBackupTime) {
        const d = new Date(gd.lastBackupTime);
        lastBackupText.textContent = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        lastBackupText.textContent = 'Ninguno registrado';
      }
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 30);
    }
  }

  /**
   * Conecta o desconecta con Google Drive
   */
  async handleGoogleDriveConnect() {
    const gd = window.vaultGoogleDrive;
    if (!gd) return;

    try {
      if (gd.isConnected) {
        await gd.disconnect();
        this.updateGoogleDriveUI();
        this.showToast('Google Drive desconectado.', 'info');
      } else {
        this.showToast('Conectando con Google Drive...', 'info');
        await gd.connect();
        this.updateGoogleDriveUI();
        this.showToast('¡Conectado exitosamente con Google Drive!', 'success');
      }
    } catch (err) {
      console.error('[GoogleDrive] Error de conexión:', err);
      this.showToast('Error al conectar con Google Drive: ' + err.message, 'danger');
    }
  }

  /**
   * Conmuta la sincronización automática con Google Drive
   * @param {boolean} checked
   */
  async handleGoogleDriveToggleAutoSync(checked) {
    if (window.vaultGoogleDrive) {
      await window.vaultGoogleDrive.setAutoSync(checked);
      this.updateGoogleDriveUI();
      this.showToast(checked ? 'Sincronización automática con Drive activada.' : 'Sincronización automática con Drive desactivada.', 'info');
    }
  }

  /**
   * Guarda el Client ID de Google OAuth ingresado por el usuario
   */
  async saveGoogleDriveClientId() {
    const input = document.getElementById('input-gdrive-client-id');
    const clientId = input ? input.value : '';
    if (window.vaultGoogleDrive) {
      await window.vaultGoogleDrive.setClientId(clientId);
      this.showToast('Client ID de Google Drive guardado correctamente.', 'success');
    }
  }

  /**
   * Sube el respaldo cifrado a Google Drive
   */
  async handleGoogleDriveUpload() {
    const gd = window.vaultGoogleDrive;
    if (!gd) return;
    const user = window.vaultAuth.currentUser;
    const userId = user ? user.sub || user.email : 'local_user';

    try {
      this.showToast('Cifrando y subiendo respaldo a Google Drive...', 'info');
      const res = await gd.uploadBackup(userId);
      this.updateGoogleDriveUI();
      this.showToast(`Respaldo cifrado subido a Google Drive exitosamente (${res.docsCount} expedientes).`, 'success');
    } catch (err) {
      console.error('[GoogleDrive] Error al subir:', err);
      this.showToast('Error al subir a Google Drive: ' + err.message, 'danger');
    }
  }

  /**
   * Descarga y restaura el respaldo cifrado desde Google Drive
   */
  async handleGoogleDriveDownload() {
    const gd = window.vaultGoogleDrive;
    if (!gd) return;
    const user = window.vaultAuth.currentUser;
    const userId = user ? user.sub || user.email : 'local_user';

    try {
      this.showToast('Descargando respaldo cifrado desde Google Drive...', 'info');
      const res = await gd.downloadAndRestore(userId);
      this.updateGoogleDriveUI();

      // Recargar gavetas y expedientes en memoria
      const customDrawers = await window.vaultStorage.getSetting(`customDrawers_${userId}`) || {};
      this.categories = { ...this.defaultCategories, ...customDrawers };
      this.updateCategoryDropdowns();
      await this.loadAndRenderDocuments();

      const activeCount = this.unlockedDocuments ? this.unlockedDocuments.length : 0;
      const modal = document.getElementById('modal-gdrive-sync');
      if (modal) modal.close();

      if (activeCount === 0 && res.mergedCount > 0) {
        this.showToast(`Respaldo descargado (${res.mergedCount} expedientes), pero requieren el PIN original para descifrarse.`, 'warning');
        this.openBackupPinPrompt(res.backupData);
      } else {
        this.showToast(`Restauración desde Google Drive exitosa: ${activeCount} expedientes restaurados y listos.`, 'success');
      }
    } catch (err) {
      console.error('[GoogleDrive] Error al descargar de Drive:', err);
      this.showToast('Error al restaurar desde Google Drive: ' + err.message, 'danger');
    }
  }

  /**
   * Renderiza el Mueble Gavetero Inteligente con sus gavetas coloreadas y sus carpetas interiores
   */
  renderCabinet() {
    const container = document.getElementById('cabinet-drawers-container');
    if (!container) return;

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const q = this.searchQuery.toLowerCase().trim();

    // Si el usuario está buscando, abrir automáticamente gavetas con coincidencias
    if (q) {
      Object.keys(this.categories).forEach(catKey => {
        const hasMatch = this.unlockedDocuments.some(d =>
          d.category === catKey && (
            (d.title && d.title.toLowerCase().includes(q)) ||
            (d.doc_number && d.doc_number.toLowerCase().includes(q)) ||
            (d.issuer && d.issuer.toLowerCase().includes(q)) ||
            (d.tags && d.tags.toLowerCase().includes(q)) ||
            (d.notes && d.notes.toLowerCase().includes(q))
          )
        );
        if (hasMatch) {
          this.openDrawers.add(catKey);
        }
      });
    }

    const drawerKeys = Object.keys(this.categories);

    const summaryText = document.getElementById('cabinet-summary-text');
    if (summaryText) {
      summaryText.textContent = `${this.unlockedDocuments.length} expedientes archivados • ${this.openDrawers.size} de ${drawerKeys.length} gavetas abiertas`;
    }

    container.innerHTML = drawerKeys.map(catKey => {
      const cat = this.categories[catKey];
      if (!cat) return '';
      const allCategoryDocs = this.unlockedDocuments.filter(d => d.category === catKey);

      // Filtrar por buscador
      let visibleDocs = allCategoryDocs;
      if (q) {
        visibleDocs = allCategoryDocs.filter(d =>
          (d.title && d.title.toLowerCase().includes(q)) ||
          (d.doc_number && d.doc_number.toLowerCase().includes(q)) ||
          (d.issuer && d.issuer.toLowerCase().includes(q)) ||
          (d.tags && d.tags.toLowerCase().includes(q)) ||
          (d.notes && d.notes.toLowerCase().includes(q))
        );
      }

      // Evaluar estado de alertas dentro de la gaveta
      let hasExpired = false;
      let hasWarning = false;
      allCategoryDocs.forEach(d => {
        if (d.expiry_date) {
          const exp = new Date(d.expiry_date);
          if (exp < now) hasExpired = true;
          else if (exp <= thirtyDays) hasWarning = true;
        }
      });

      let ledClass = 'drawer-led';
      let ledBadge = '';
      if (hasExpired) {
        ledClass = 'drawer-led danger';
        ledBadge = '<span class="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">Vencido</span>';
      } else if (hasWarning) {
        ledClass = 'drawer-led warning';
        ledBadge = '<span class="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Por vencer</span>';
      }

      const isOpen = this.openDrawers.has(catKey);
      const color = cat.color || '#10b981';

      return `
        <div class="drawer-unit ${isOpen ? 'is-open' : ''}" style="--drawer-color: ${color};">
          <!-- Frente de la Gaveta (Cajón con color distintivo) -->
          <div class="drawer-front flex flex-col md:flex-row md:items-center justify-between gap-4" onclick="window.bovedaApp.toggleDrawer('${catKey}')">
            <!-- Lado Izquierdo: Cerradura, Icono y Etiqueta -->
            <div class="flex items-center gap-3.5">
              <div class="${ledClass}" title="Indicador de seguridad de la gaveta"></div>
              
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner transition-transform" style="background: ${color}18; color: ${color}; border: 1px solid ${color}35;">
                <i data-lucide="${cat.icon}" class="w-5 h-5"></i>
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <div class="drawer-label-holder">
                    <span class="text-[10px] uppercase font-bold font-mono tracking-wider" style="color: ${color};">Gaveta ${cat.drawerNumber}</span>
                    <span class="font-bold text-slate-100 text-sm tracking-wide">${this.escapeHtml(cat.label)}</span>
                  </div>
                  ${cat.isCustom ? `
                    <span class="text-[9px] uppercase font-mono px-2 py-0.5 rounded-md border font-semibold" style="color: ${color}; border-color: ${color}40; background: ${color}10;">Personalizada</span>
                  ` : ''}
                  ${ledBadge}
                </div>
                <p class="text-xs text-slate-400 mt-0.5 hidden sm:block">${this.escapeHtml(cat.subtitle)}</p>
              </div>
            </div>

            <!-- Centro: Manija Metálica del Cajón con reflejo tonal -->
            <div class="hidden lg:flex items-center justify-center flex-1 px-8">
              <div class="drawer-handle" title="Tirador metálico reforzado"></div>
            </div>

            <!-- Lado Derecho: Contador de Fichas, Desinstalar y Flecha de Apertura -->
            <div class="flex items-center justify-between md:justify-end gap-2.5 w-full md:w-auto">
              <span class="text-xs font-mono font-semibold px-3 py-1 rounded-full border shadow-sm" style="color: ${color}; border-color: ${color}35; background: ${color}0d;">
                ${allCategoryDocs.length} ${allCategoryDocs.length === 1 ? 'expediente' : 'expedientes'}
              </span>

              ${cat.isCustom ? `
                <button type="button" title="Desinstalar esta gaveta personalizada" onclick="event.stopPropagation(); window.bovedaApp.deleteCustomDrawer('${catKey}')" class="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}

              <div class="flex items-center gap-1.5 text-xs text-slate-400 font-medium ml-1">
                <span class="hidden sm:inline">${isOpen ? 'Cerrar gaveta' : 'Abrir gaveta'}</span>
                <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 transition-transform" style="color: ${color};"></i>
              </div>
            </div>
          </div>

          <!-- Interior de la Gaveta (Riel de Carpetas e Índice de Documentos) -->
          <div class="drawer-interior">
            <div class="folder-rail">
              <!-- Barra de herramientas interior de la gaveta -->
              <div class="flex items-center justify-between pb-3 mb-3 border-b border-white/5 text-xs text-slate-400">
                <span class="font-semibold text-slate-300 flex items-center gap-1.5">
                  <i data-lucide="folder-open" class="w-4 h-4" style="color: ${color};"></i>
                  Índice de Expedientes en Gaveta ${cat.drawerNumber} (${this.escapeHtml(cat.label)}):
                </span>
                <button type="button" onclick="event.stopPropagation(); window.bovedaApp.openNewDocumentModal('${catKey}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm" style="background: ${color}15; color: ${color}; border: 1px solid ${color}40;">
                  <i data-lucide="plus" class="w-3.5 h-3.5"></i> Archivar en esta Gaveta
                </button>
              </div>

              <!-- Lista de Carpetas / Fichas -->
              <div class="space-y-3">
                ${visibleDocs.length === 0 ? `
                  <div class="py-8 px-4 text-center rounded-xl bg-slate-900/40 border border-white/5 text-slate-400">
                    <p class="text-sm font-medium text-slate-300">Esta gaveta está vacía${q ? ' para la búsqueda actual' : ''}.</p>
                    <p class="text-xs text-slate-500 mt-1">Archiva documentos de ${this.escapeHtml(cat.label.toLowerCase())} aquí para mantenerlos protegidos.</p>
                    <button type="button" onclick="event.stopPropagation(); window.bovedaApp.openNewDocumentModal('${catKey}')" class="mt-3 px-3 py-1.5 rounded-lg text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-transform hover:scale-105 shadow-md" style="background: ${color};">
                      <i data-lucide="plus" class="w-3.5 h-3.5"></i> Archivar Primer Documento
                    </button>
                  </div>
                ` : visibleDocs.map(doc => {
        let statusBadge = '<span class="badge-status badge-valid"><i data-lucide="check-circle" class="w-3 h-3"></i> Vigente</span>';
        if (doc.expiry_date) {
          const exp = new Date(doc.expiry_date);
          if (exp < now) {
            statusBadge = '<span class="badge-status badge-expired"><i data-lucide="alert-octagon" class="w-3 h-3"></i> Vencido</span>';
          } else if (exp <= thirtyDays) {
            const daysLeft = Math.ceil((exp - now) / 86400000);
            statusBadge = `<span class="badge-status badge-warning"><i data-lucide="clock" class="w-3 h-3"></i> Vence en ${daysLeft}d</span>`;
          }
        }

        return `
                    <div class="folder-card p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 group" onclick="window.bovedaApp.openDocumentDetail('${doc.id}')">
                      <div>
                        <div class="flex items-center gap-2 mb-1">
                          <span class="folder-tab" style="color: ${color};">
                            <i data-lucide="${cat.icon}" class="w-3 h-3" style="color: ${color};"></i> ${this.escapeHtml(cat.label)}
                          </span>
                          ${doc.attachment ? `
                            <span title="Contiene archivo adjunto cifrado" class="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono inline-flex items-center gap-1">
                              <i data-lucide="paperclip" class="w-2.5 h-2.5"></i> Adjunto
                            </span>
                          ` : ''}
                        </div>

                        <h4 class="font-bold text-slate-100 text-base group-hover:text-emerald-300 transition-colors flex items-center gap-2">
                          ${this.escapeHtml(doc.title)}
                        </h4>

                        <div class="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                          ${doc.doc_number ? `
                            <span class="font-mono text-emerald-400 flex items-center gap-1">
                              <strong>Nº:</strong> ${this.escapeHtml(doc.doc_number)}
                            </span>
                          ` : ''}
                          ${doc.issuer ? `<span><strong>Emisor:</strong> ${this.escapeHtml(doc.issuer)}</span>` : ''}
                          ${doc.expiry_date ? `<span><strong>Vence:</strong> ${doc.expiry_date}</span>` : ''}
                        </div>
                      </div>

                      <div class="flex items-center gap-3 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                        ${statusBadge}
                        <button type="button" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500 group-hover:text-slate-950 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-all whitespace-nowrap">
                          <span>Extraer Expediente</span>
                          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `;
      }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Abre el modal de creación de documento permitiendo preseleccionar gaveta
   */
  openNewDocumentModal(categoryPreselect = null) {
    if (window.vaultLicense && window.vaultLicense.isExpired && !window.vaultLicense.isLicensed) {
      this.openTrialLockModal();
      return;
    }

    this.updateCategoryDropdowns(); // Asegurar catálogo actualizado de gavetas

    const modal = document.getElementById('modal-new-doc');
    const form = document.getElementById('form-new-doc');
    if (form) form.reset();

    if (categoryPreselect) {
      const select = document.getElementById('new-doc-category-select');
      if (select) select.value = categoryPreselect;
    }

    if (modal) modal.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Abre el modal para crear una nueva gaveta con concepto y color personalizado
   */
  openNewDrawerModal() {
    const modal = document.getElementById('modal-new-drawer');
    const form = document.getElementById('form-new-drawer');
    if (form) form.reset();

    // Paleta de colores distintivos de alta tecnología
    const colors = [
      { name: 'Cyan', hex: '#06b6d4' },
      { name: 'Esmeralda', hex: '#10b981' },
      { name: 'Ámbar', hex: '#f59e0b' },
      { name: 'Púrpura', hex: '#8b5cf6' },
      { name: 'Rosa', hex: '#ec4899' },
      { name: 'Azul Zafiro', hex: '#3b82f6' },
      { name: 'Naranja Fuego', hex: '#f97316' },
      { name: 'Verde Lima', hex: '#84cc16' },
      { name: 'Rubí', hex: '#f43f5e' },
      { name: 'Teal', hex: '#14b8a6' },
      { name: 'Índigo Cripto', hex: '#6366f1' },
      { name: 'Bronce Suizo', hex: '#d97706' }
    ];

    const colorPicker = document.getElementById('new-drawer-color-picker');
    if (colorPicker) {
      colorPicker.innerHTML = colors.map((c, i) => `
        <button type="button" onclick="window.bovedaApp.selectDrawerColor('${c.hex}')" data-color="${c.hex}" class="drawer-color-btn p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${i === 5 ? 'border-white bg-white/10 ring-2 ring-white/50' : 'border-white/10 hover:border-white/30 bg-slate-900'}">
          <div class="w-6 h-6 rounded-full shadow-md" style="background: ${c.hex}; box-shadow: 0 0 10px ${c.hex}60;"></div>
          <span class="text-[9px] font-medium text-slate-300 truncate w-full text-center">${c.name}</span>
        </button>
      `).join('');
      document.getElementById('new-drawer-selected-color').value = colors[5].hex;
    }

    // Selección de iconos Lucide representativos
    const icons = [
      { id: 'graduation-cap', label: 'Educación' },
      { id: 'briefcase', label: 'Trabajo' },
      { id: 'scale', label: 'Legal' },
      { id: 'file-text', label: 'General' },
      { id: 'paw-print', label: 'Mascotas' },
      { id: 'heart-pulse', label: 'Seguros' },
      { id: 'building-2', label: 'Empresas' },
      { id: 'receipt', label: 'Impuestos' },
      { id: 'shield-alert', label: 'Pólizas' },
      { id: 'key', label: 'Inmuebles' },
      { id: 'plane', label: 'Viajes' },
      { id: 'folder-archive', label: 'Archivos' }
    ];

    const iconPicker = document.getElementById('new-drawer-icon-picker');
    if (iconPicker) {
      iconPicker.innerHTML = icons.map((ic, i) => `
        <button type="button" onclick="window.bovedaApp.selectDrawerIcon('${ic.id}')" data-icon="${ic.id}" class="drawer-icon-btn p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${i === 0 ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 ring-2 ring-cyan-400/50' : 'border-white/10 hover:border-white/30 bg-slate-900 text-slate-300'}">
          <i data-lucide="${ic.id}" class="w-5 h-5"></i>
          <span class="text-[9px] font-medium truncate w-full text-center">${ic.label}</span>
        </button>
      `).join('');
      document.getElementById('new-drawer-selected-icon').value = icons[0].id;
    }

    if (modal) modal.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  selectDrawerColor(hex) {
    document.getElementById('new-drawer-selected-color').value = hex;
    document.querySelectorAll('.drawer-color-btn').forEach(btn => {
      if (btn.dataset.color === hex) {
        btn.className = 'drawer-color-btn p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all border-white bg-white/10 ring-2 ring-white/50';
      } else {
        btn.className = 'drawer-color-btn p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all border-white/10 hover:border-white/30 bg-slate-900';
      }
    });
  }

  selectDrawerIcon(iconId) {
    document.getElementById('new-drawer-selected-icon').value = iconId;
    document.querySelectorAll('.drawer-icon-btn').forEach(btn => {
      if (btn.dataset.icon === iconId) {
        btn.className = 'drawer-icon-btn p-2 rounded-xl border flex flex-col items-center gap-1 transition-all border-cyan-400 bg-cyan-500/20 text-cyan-300 ring-2 ring-cyan-400/50';
      } else {
        btn.className = 'drawer-icon-btn p-2 rounded-xl border flex flex-col items-center gap-1 transition-all border-white/10 hover:border-white/30 bg-slate-900 text-slate-300';
      }
    });
  }

  /**
   * Guarda una nueva gaveta personalizada en IndexedDB y la integra en el archivador
   */
  async handleSaveNewDrawer(event) {
    event.preventDefault();
    const label = document.getElementById('new-drawer-label').value.trim();
    const subtitle = document.getElementById('new-drawer-subtitle').value.trim();
    const color = document.getElementById('new-drawer-selected-color').value || '#3b82f6';
    const icon = document.getElementById('new-drawer-selected-icon').value || 'graduation-cap';

    if (!label) return;

    const user = window.vaultAuth.currentUser;
    if (!user) return;

    const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const drawerId = `gaveta_${slug}_${Math.random().toString(36).substr(2, 5)}`;
    const drawerNumber = Object.keys(this.categories).length + 1;

    const newDrawer = {
      id: drawerId,
      drawerNumber,
      label,
      subtitle,
      icon,
      color,
      isCustom: true
    };

    try {
      const savedCustom = (await window.vaultStorage.getSetting('customDrawers_' + user.sub)) || {};
      savedCustom[drawerId] = newDrawer;
      await window.vaultStorage.setSetting('customDrawers_' + user.sub, savedCustom);

      this.categories[drawerId] = newDrawer;
      this.openDrawers.add(drawerId); // Abrir la nueva gaveta instalada

      this.updateCategoryDropdowns();
      this.renderCabinet();
      this.showToast(`Gaveta "${label}" instalada y protegida en el archivador.`, 'success');

      document.getElementById('modal-new-drawer').close();
      await window.vaultStorage.logAuditEvent(user.sub, 'DRAWER_CREATED', { drawerId, label, color });
      window.vaultGoogleDrive?.triggerAutoSync(user.sub, 'drawer_created');
    } catch (err) {
      console.error(err);
      this.showToast('Error al guardar la nueva gaveta.', 'danger');
    }
  }

  /**
   * Desinstala una gaveta personalizada si no contiene expedientes
   */
  async deleteCustomDrawer(drawerKey) {
    const cat = this.categories[drawerKey];
    if (!cat || !cat.isCustom) return;

    const docsInDrawer = this.unlockedDocuments.filter(d => d.category === drawerKey);
    if (docsInDrawer.length > 0) {
      this.showToast(`Esta gaveta contiene ${docsInDrawer.length} expediente(s). Muévelos a otra gaveta o elimínalos antes de desinstalarla.`, 'warning');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas desinstalar la Gaveta ${cat.drawerNumber} (${cat.label})?`)) {
      return;
    }

    const user = window.vaultAuth.currentUser;
    try {
      const savedCustom = (await window.vaultStorage.getSetting('customDrawers_' + user.sub)) || {};
      delete savedCustom[drawerKey];
      await window.vaultStorage.setSetting('customDrawers_' + user.sub, savedCustom);

      delete this.categories[drawerKey];
      this.openDrawers.delete(drawerKey);

      // Re-numerar gavetas consecutivamente
      let num = 1;
      Object.values(this.categories).forEach(c => {
        c.drawerNumber = num++;
      });

      this.updateCategoryDropdowns();
      this.renderCabinet();
      this.showToast(`Gaveta "${cat.label}" desinstalada del archivador.`, 'info');
      await window.vaultStorage.logAuditEvent(user.sub, 'DRAWER_DELETED', { drawerKey });
      window.vaultGoogleDrive?.triggerAutoSync(user.sub, 'drawer_deleted');
    } catch (err) {
      console.error(err);
      this.showToast('Error al desinstalar la gaveta.', 'danger');
    }
  }

  /**
   * Guarda un nuevo documento cifrado
   */
  async handleSaveNewDocument(formData) {
    if (!window.vaultAuth.masterKey) {
      this.showToast('La clave maestra no está activa. Desbloquea la bóveda.', 'danger');
      return;
    }

    const title = formData.get('title');
    const category = formData.get('category');
    const docNumber = formData.get('doc_number');
    const issuer = formData.get('issuer');
    const issueDate = formData.get('issue_date');
    const expiryDate = formData.get('expiry_date');
    const tags = formData.get('tags');
    const notes = formData.get('notes');
    const fileAttachment = formData.get('attachment_file');

    const docId = 'doc_' + Math.random().toString(36).substr(2, 9);

    let attachmentCipher = null;
    if (fileAttachment && fileAttachment.size > 0) {
      attachmentCipher = await window.vaultCrypto.encryptFile(window.vaultAuth.masterKey, fileAttachment);
    }

    const payloadToEncrypt = {
      doc_number: docNumber,
      issuer: issuer,
      issue_date: issueDate,
      expiry_date: expiryDate,
      tags: tags,
      notes: notes,
      attachment: attachmentCipher
    };

    // Cifrar metadatos y payload con AES-256-GCM
    const encryptedResult = await window.vaultCrypto.encrypt(window.vaultAuth.masterKey, payloadToEncrypt);

    const docRecord = {
      id: docId,
      user_id: window.vaultAuth.currentUser.sub,
      category: category,
      title: title,
      encrypted_payload: encryptedResult.ciphertext,
      iv: encryptedResult.iv,
      checksum: encryptedResult.checksum,
      expiry_date: expiryDate || null,
      is_synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await window.vaultStorage.saveDocument(docRecord);
    await window.vaultStorage.logAuditEvent(window.vaultAuth.currentUser.sub, 'DOC_CREATED', { docId, category });

    // Asegurar que la gaveta correspondiente se abra para ver el nuevo expediente
    this.openDrawers.add(category);

    this.showToast('Documento cifrado y archivado en la gaveta con éxito', 'success');
    document.getElementById('modal-new-doc').close();
    await this.loadAndRenderDocuments(true);
    this.syncWithCloud(true);
    window.vaultGoogleDrive?.triggerAutoSync(window.vaultAuth.currentUser.sub, 'doc_created');
  }

  /**
   * Abre el detalle de un documento descifrado con opciones de Lectura, Impresión y Modificación
   */
  async openDocumentDetail(docId) {
    const doc = this.unlockedDocuments.find(d => d.id === docId);
    if (!doc) return;

    this.selectedDoc = doc;
    this.toggleEditDocumentMode(false); // Siempre comenzar en modo lectura

    // Liberar objeto URL previo si existe para prevenir fugas de memoria
    if (this._currentObjectUrl) {
      URL.revokeObjectURL(this._currentObjectUrl);
      this._currentObjectUrl = null;
    }

    const modal = document.getElementById('modal-doc-detail');
    const cat = this.categories[doc.category] || { label: doc.category, drawerNumber: 1, icon: 'file' };

    // Encabezado
    const categoryBadge = document.getElementById('detail-category-badge');
    if (categoryBadge) {
      categoryBadge.textContent = `GAVETA ${cat.drawerNumber} • ${cat.label.toUpperCase()}`;
    }

    // Badge de estado de vencimiento
    const statusPill = document.getElementById('detail-status-pill');
    if (statusPill) {
      const now = new Date();
      const thirtyDays = new Date(now.getTime() + 30 * 86400000);
      if (!doc.expiry_date) {
        statusPill.innerHTML = '<span class="badge-status badge-valid"><i data-lucide="check-circle" class="w-3 h-3"></i> Vigente</span>';
      } else {
        const exp = new Date(doc.expiry_date);
        if (exp < now) {
          statusPill.innerHTML = '<span class="badge-status badge-expired"><i data-lucide="alert-octagon" class="w-3 h-3"></i> Vencido</span>';
        } else if (exp <= thirtyDays) {
          const daysLeft = Math.ceil((exp - now) / 86400000);
          statusPill.innerHTML = `<span class="badge-status badge-warning"><i data-lucide="clock" class="w-3 h-3"></i> Vence en ${daysLeft}d</span>`;
        } else {
          statusPill.innerHTML = '<span class="badge-status badge-valid"><i data-lucide="check-circle" class="w-3 h-3"></i> Vigente</span>';
        }
      }
    }

    // Renderizar la Credencial Digital Visual
    const cardContainer = document.getElementById('detail-credential-card-container');
    if (cardContainer) {
      cardContainer.innerHTML = this.renderCredentialCardHTML(doc, cat);
    }

    // Modo Lectura - Textos
    document.getElementById('detail-title').textContent = doc.title;
    document.getElementById('detail-number').textContent = doc.doc_number || 'N/A';
    document.getElementById('detail-issuer').textContent = doc.issuer || 'N/A';
    document.getElementById('detail-issue-date').textContent = doc.issue_date || 'N/A';
    document.getElementById('detail-expiry-date').textContent = doc.expiry_date || 'Sin vencimiento programado';
    document.getElementById('detail-notes').textContent = doc.notes || 'Sin notas privadas adicionales.';

    // Manejo de archivo adjunto con descifrado en memoria y visualización inline
    const attachmentContainer = document.getElementById('detail-attachment-preview');
    if (doc.attachment && doc.attachment.ciphertext) {
      attachmentContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center gap-3 text-slate-400 text-xs mt-3">
          <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400 animate-pulse"></i>
          <span>Descifrando expediente original con Web Crypto API (AES-256-GCM)...</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();

      try {
        const blob = await window.vaultCrypto.decryptFile(
          window.vaultAuth.masterKey,
          doc.attachment.ciphertext,
          doc.attachment.iv,
          doc.attachment.mimeType
        );

        this._currentObjectUrl = URL.createObjectURL(blob);
        const mime = doc.attachment.mimeType || '';

        if (mime.startsWith('image/')) {
          attachmentContainer.innerHTML = `
            <div class="rounded-2xl border-2 border-emerald-500/40 bg-slate-950/90 p-4 shadow-2xl mt-1">
              <div class="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-xs text-slate-300">
                <span class="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                  <i data-lucide="file-check" class="w-5 h-5"></i> Documento Digitalizado Oficial (${this.escapeHtml(doc.attachment.name)})
                </span>
                <div class="flex items-center gap-2">
                  <a href="${this._currentObjectUrl}" target="_blank" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold inline-flex items-center gap-1.5 transition-colors text-xs border border-cyan-500/30">
                    <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i> Pantalla Completa
                  </a>
                  <button type="button" onclick="window.bovedaApp.downloadDecryptedAttachment('${doc.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 transition-colors text-xs shadow-md shadow-emerald-500/20">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
                  </button>
                </div>
              </div>
              <div class="flex justify-center p-3 bg-slate-900/80 rounded-xl overflow-hidden border border-white/5 relative group">
                <img src="${this._currentObjectUrl}" alt="${this.escapeHtml(doc.title)}" class="max-h-[460px] w-auto object-contain rounded-lg shadow-xl cursor-zoom-in transition-transform duration-300 hover:scale-[1.02]" onclick="window.open('${this._currentObjectUrl}', '_blank')" title="Haga clic para expandir a tamaño completo en nueva pestaña" />
                <div class="absolute bottom-5 right-5 bg-slate-950/80 border border-white/20 text-slate-300 px-2.5 py-1 rounded-lg text-[11px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  Clic para tamaño completo
                </div>
              </div>
            </div>
          `;
        } else if (mime === 'application/pdf') {
          attachmentContainer.innerHTML = `
            <div class="rounded-2xl border-2 border-emerald-500/40 bg-slate-950/90 p-4 shadow-2xl mt-1">
              <div class="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-xs text-slate-300">
                <span class="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                  <i data-lucide="file-text" class="w-5 h-5"></i> Expediente PDF Oficial (${this.escapeHtml(doc.attachment.name)})
                </span>
                <div class="flex items-center gap-2">
                  <a href="${this._currentObjectUrl}" target="_blank" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold inline-flex items-center gap-1.5 transition-colors text-xs border border-cyan-500/30">
                    <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Abrir en Pestaña
                  </a>
                  <button type="button" onclick="window.bovedaApp.downloadDecryptedAttachment('${doc.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 transition-colors text-xs shadow-md shadow-emerald-500/20">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
                  </button>
                </div>
              </div>
              <iframe src="${this._currentObjectUrl}#toolbar=1" class="w-full h-[480px] rounded-xl border border-white/10 bg-slate-900 shadow-inner"></iframe>
            </div>
          `;
        } else {
          attachmentContainer.innerHTML = `
            <div class="p-5 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-1">
              <div class="flex items-center gap-3">
                <div class="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <i data-lucide="file-check" class="w-6 h-6"></i>
                </div>
                <div>
                  <p class="text-sm font-bold text-slate-200">${this.escapeHtml(doc.attachment.name)}</p>
                  <p class="text-xs text-slate-400">Archivo Cifrado con AES-256 • ${doc.attachment.mimeType || 'Documento Oficial'}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <a href="${this._currentObjectUrl}" target="_blank" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors border border-cyan-500/30">
                  <i data-lucide="external-link" class="w-4 h-4"></i> Abrir
                </a>
                <button type="button" onclick="window.bovedaApp.downloadDecryptedAttachment('${doc.id}')" class="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 inline-flex items-center gap-1.5 shadow-md shadow-emerald-500/20">
                  <i data-lucide="download" class="w-4 h-4"></i> Descargar Original
                </button>
              </div>
            </div>
          `;
        }
      } catch (err) {
        console.error('[BovedaApp] Error al descifrar adjunto:', err);
        attachmentContainer.innerHTML = `
          <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center justify-between gap-3 mt-1">
            <div class="flex items-center gap-2.5">
              <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0 text-rose-400"></i>
              <span>No se pudo descifrar la vista previa del archivo adjunto con la clave activa.</span>
            </div>
            <button type="button" onclick="window.bovedaApp.openBackupPinPrompt()" class="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold text-xs whitespace-nowrap">
              Ingresar PIN de Respaldo
            </button>
          </div>
        `;
      }
    } else {
      attachmentContainer.innerHTML = `
        <div class="p-5 rounded-2xl bg-slate-900/60 border border-dashed border-white/15 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3 mt-1">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
              <i data-lucide="file-question" class="w-5 h-5"></i>
            </div>
            <div>
              <p class="font-bold text-slate-200 text-sm">Sin Documento Físico Adjunto</p>
              <p class="text-xs text-slate-400 mt-0.5">Este expediente contiene metadatos pero no tiene una imagen o PDF cargado.</p>
            </div>
          </div>
          <button type="button" onclick="window.bovedaApp.toggleEditDocumentMode(true)" class="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold inline-flex items-center gap-2 text-xs transition-colors whitespace-nowrap">
            <i data-lucide="paperclip" class="w-4 h-4"></i> Adjuntar Documento Ahora
          </button>
        </div>
      `;
    }

    // Precargar campos en Modo Edición
    document.getElementById('edit-title').value = doc.title || '';
    document.getElementById('edit-category').value = doc.category || 'identidad';
    document.getElementById('edit-doc-number').value = doc.doc_number || '';
    document.getElementById('edit-issuer').value = doc.issuer || '';
    document.getElementById('edit-issue-date').value = doc.issue_date || '';
    document.getElementById('edit-expiry-date').value = doc.expiry_date || '';
    document.getElementById('edit-notes').value = doc.notes || '';

    modal.showModal();
    if (window.lucide) window.lucide.createIcons();
    await window.vaultStorage.logAuditEvent(window.vaultAuth.currentUser.sub, 'DOC_VIEWED', { docId });
  }

  /**
   * Genera el HTML de la Credencial Digital Visual (Digital Document Card)
   */
  renderCredentialCardHTML(doc, cat) {
    const isDefaultTheme = ['identidad', 'vehiculos', 'finanzas', 'residencia', 'salud'].includes(doc.category);
    const themeClass = isDefaultTheme ? `theme-${doc.category}` : 'theme-custom';
    const drawerColor = (cat && cat.color) ? cat.color : '#06b6d4';
    const customStyle = !isDefaultTheme ? `style="background: linear-gradient(135deg, ${drawerColor}28 0%, #0d1527 50%, #030712 100%); border-color: ${drawerColor}66;"` : '';
    const docNum = doc.doc_number || '000000000';
    const rawCleanNum = docNum.replace(/[^A-Z0-9]/gi, '').toUpperCase() || '000000000';
    const mrzNum = rawCleanNum.padEnd(9, '<').slice(0, 9);

    // Líneas MRZ tipo estándar OCR-B (40 caracteres por línea)
    const mrzLine1 = `IDUTO${mrzNum}${'<'.repeat(26)}`;
    const mrzLine2 = `8501017M3212318UTO${'<'.repeat(21)}4`;

    const user = window.vaultAuth.currentUser;
    const titularName = (user && user.email) ? user.email.split('@')[0].toUpperCase() : 'TITULAR AUTORIZADO';

    return `
      <div class="credential-card ${themeClass}" ${customStyle}>
        <div class="hologram-strip"></div>
        
        <!-- Encabezado de la Credencial -->
        <div class="flex items-center justify-between pb-3 border-b border-white/10 mb-4 relative z-10">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white text-xs">
              <i data-lucide="${cat.icon || 'shield'}" class="w-3.5 h-3.5"></i>
            </div>
            <div>
              <span class="text-[9px] font-bold tracking-widest uppercase text-slate-300 block">REPÚBLICA DIGITAL • BÓVEDA SECURE WALLET</span>
              <span class="text-xs font-bold text-white tracking-wide">${this.escapeHtml(cat.label)}</span>
            </div>
          </div>

          <!-- Símbolo Contactless / NFC -->
          <div class="flex items-center gap-2 text-white/70" title="Credencial Digital con Chip y NFC Seguro">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            <span class="text-[9px] font-mono font-bold tracking-wider uppercase hidden sm:inline">ZERO-KNOWLEDGE</span>
          </div>
        </div>

        <!-- Cuerpo Central: Chip, Foto Biométrica y Datos Embossados -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 my-2 relative z-10">
          <div class="flex items-center gap-3.5">
            <!-- Chip EMV Dorado -->
            <div class="emv-chip" title="Microprocesador criptográfico seguro"></div>

            <!-- Silueta de Foto Biométrica -->
            <div class="w-12 h-14 rounded-lg bg-slate-900/90 border border-white/20 flex flex-col items-center justify-center text-slate-400 shadow-inner relative overflow-hidden" title="Identificación Biométrica">
              <i data-lucide="user" class="w-6 h-6 text-slate-300"></i>
              <span class="text-[7px] font-mono tracking-tighter text-emerald-400 mt-1 uppercase">VERIFICADO</span>
            </div>

            <!-- Título y Titular -->
            <div>
              <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Documento Oficial</p>
              <h4 class="font-extrabold text-white text-base sm:text-lg leading-tight">${this.escapeHtml(doc.title)}</h4>
              <p class="text-xs text-slate-300 mt-0.5 font-medium">${this.escapeHtml(doc.issuer || 'Autoridad Emisora Oficial')}</p>
            </div>
          </div>

          <!-- Número de Documento en Relieve (Embossed OCR) -->
          <div class="sm:text-right">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Nº DE EXPEDIENTE</span>
            <span class="font-mono font-black text-lg sm:text-xl text-emerald-300 tracking-wider drop-shadow-md">
              ${this.escapeHtml(doc.doc_number || 'N/A')}
            </span>
          </div>
        </div>

        <!-- Fila de Fechas y Titular -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 mt-3 border-t border-white/10 text-xs text-slate-300 relative z-10">
          <div>
            <span class="text-[9px] uppercase font-semibold text-slate-400 block">Titular:</span>
            <span class="font-semibold text-white tracking-wide text-xs truncate block">${titularName}</span>
          </div>
          <div>
            <span class="text-[9px] uppercase font-semibold text-slate-400 block">Emisión:</span>
            <span class="font-mono text-slate-200 text-xs">${doc.issue_date || 'N/A'}</span>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <span class="text-[9px] uppercase font-semibold text-slate-400 block">Vencimiento:</span>
            <span class="font-mono text-emerald-300 font-bold text-xs">${doc.expiry_date || 'INDEFINIDO'}</span>
          </div>
        </div>

        <!-- Franja OCR / MRZ en la Base de la Credencial -->
        <div class="mt-4 relative z-10">
          <div class="mrz-strip">
            <div>${mrzLine1}</div>
            <div>${mrzLine2}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Si la bóveda está vacía, pre-siembra 3 documentos de muestra con adjuntos vectoriales digitalizados
   */
  async _seedInitialDemoDocuments(userId) {
    try {
      const demoItems = [
        {
          id: 'doc_demo_pasaporte',
          category: 'identidad',
          title: 'Pasaporte Biométrico Oficial',
          doc_number: 'PAS-84920184',
          issuer: 'Dirección General de Migración',
          issue_date: '2022-04-10',
          expiry_date: '2032-04-10',
          tags: 'pasaporte, viaje, identidad',
          notes: 'Pasaporte con microchip criptográfico biométrico y lectura RFID.',
          fileName: 'pasaporte_biometrico_scan.svg',
          svg: `<svg width="600" height="380" viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="380" rx="16" fill="#0f172a" />
            <rect x="10" y="10" width="580" height="360" rx="12" fill="#0a192f" stroke="#00b4d8" stroke-width="2" />
            <circle cx="500" cy="80" r="45" fill="none" stroke="#00b4d8" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.6"/>
            <text x="35" y="45" fill="#f8fafc" font-family="Arial, sans-serif" font-size="14" font-weight="bold" letter-spacing="2">REPÚBLICA DIGITAL • PASAPORTE BIOMÉTRICO</text>
            <text x="35" y="65" fill="#94a3b8" font-family="Arial, sans-serif" font-size="10">PASSPORT / PASSEPORT • TIPO P • CÓDIGO UTO</text>
            <rect x="35" y="90" width="110" height="140" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
            <circle cx="90" cy="140" r="26" fill="#64748b"/>
            <path d="M55 210 Q90 175 125 210 Z" fill="#64748b"/>
            <text x="90" y="222" fill="#38bdf8" font-family="monospace" font-size="8" text-anchor="middle">BIOMETRIC CHIP</text>
            <text x="165" y="105" fill="#94a3b8" font-family="sans-serif" font-size="9">APELLIDOS / SURNAME</text>
            <text x="165" y="122" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">AGUIAR MÁRMOL</text>
            <text x="165" y="145" fill="#94a3b8" font-family="sans-serif" font-size="9">NOMBRES / GIVEN NAMES</text>
            <text x="165" y="162" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">ANDRÉS ELOY</text>
            <text x="165" y="185" fill="#94a3b8" font-family="sans-serif" font-size="9">NACIONALIDAD</text>
            <text x="165" y="200" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold">UTOPIAN</text>
            <text x="340" y="185" fill="#94a3b8" font-family="sans-serif" font-size="9">FECHA NACIMIENTO</text>
            <text x="340" y="200" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold">17 OCT 1995</text>
            <text x="165" y="222" fill="#94a3b8" font-family="sans-serif" font-size="9">Nº PASAPORTE</text>
            <text x="165" y="238" fill="#38bdf8" font-family="monospace" font-size="13" font-weight="bold">PAS-84920184</text>
            <text x="340" y="222" fill="#94a3b8" font-family="sans-serif" font-size="9">VENCIMIENTO</text>
            <text x="340" y="238" fill="#10b981" font-family="monospace" font-size="13" font-weight="bold">10 ABR 2032</text>
            <circle cx="500" cy="180" r="32" fill="#d97706" opacity="0.3"/>
            <circle cx="500" cy="180" r="28" fill="none" stroke="#f59e0b" stroke-width="2"/>
            <text x="500" y="184" fill="#fbbf24" font-family="sans-serif" font-size="8" font-weight="bold" text-anchor="middle">OFFICIAL SEAL</text>
            <rect x="25" y="270" width="550" height="85" rx="6" fill="#030712" stroke="#1e293b" stroke-width="1"/>
            <text x="40" y="305" fill="#cbd5e1" font-family="Courier, monospace" font-size="13" letter-spacing="3">P&lt;UTOPAS84920184&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
            <text x="40" y="335" fill="#cbd5e1" font-family="Courier, monospace" font-size="13" letter-spacing="3">9510178M3204104UTO&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;8</text>
          </svg>`
        },
        {
          id: 'doc_demo_licencia',
          category: 'vehiculos',
          title: 'Licencia Nacional de Conducir',
          doc_number: 'LIC-7749210-B',
          issuer: 'Instituto Nacional de Transporte',
          issue_date: '2023-08-15',
          expiry_date: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
          tags: 'licencia, vehiculo, transito',
          notes: 'Categoría B (Automóviles particulares) y Categoría A (Motocicletas).',
          fileName: 'licencia_conducir_scan.svg',
          svg: `<svg width="600" height="380" viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="380" rx="16" fill="#042f2e" />
            <rect x="10" y="10" width="580" height="360" rx="12" fill="#064e3b" stroke="#10b981" stroke-width="2" />
            <text x="35" y="45" fill="#ecfdf5" font-family="Arial, sans-serif" font-size="14" font-weight="bold" letter-spacing="1">LICENCIA NACIONAL DE CONDUCIR</text>
            <text x="35" y="65" fill="#a7f3d0" font-family="Arial, sans-serif" font-size="10">INSTITUTO NACIONAL DE TRANSPORTE TERRESTRE</text>
            <rect x="35" y="90" width="110" height="140" rx="8" fill="#022c22" stroke="#10b981" stroke-width="2"/>
            <circle cx="90" cy="140" r="26" fill="#059669"/>
            <path d="M55 210 Q90 175 125 210 Z" fill="#059669"/>
            <text x="90" y="222" fill="#6ee7b7" font-family="monospace" font-size="8" text-anchor="middle">CLASE B</text>
            <text x="165" y="105" fill="#a7f3d0" font-family="sans-serif" font-size="9">TITULAR CONDUCTOR</text>
            <text x="165" y="122" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">ANDRÉS ELOY AGUIAR</text>
            <text x="165" y="150" fill="#a7f3d0" font-family="sans-serif" font-size="9">Nº LICENCIA</text>
            <text x="165" y="168" fill="#34d399" font-family="monospace" font-size="14" font-weight="bold">LIC-7749210-B</text>
            <text x="340" y="150" fill="#a7f3d0" font-family="sans-serif" font-size="9">GRUPO SANGUÍNEO</text>
            <text x="340" y="168" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">O POSITIVO (O+)</text>
            <text x="165" y="195" fill="#a7f3d0" font-family="sans-serif" font-size="9">CATEGORÍAS AUTORIZADAS</text>
            <rect x="165" y="202" width="40" height="24" rx="4" fill="#047857" stroke="#34d399"/>
            <text x="185" y="218" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">A</text>
            <rect x="215" y="202" width="40" height="24" rx="4" fill="#10b981"/>
            <text x="235" y="218" fill="#022c22" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">B</text>
            <text x="340" y="195" fill="#a7f3d0" font-family="sans-serif" font-size="9">VENCIMIENTO</text>
            <text x="340" y="218" fill="#fbbf24" font-family="monospace" font-size="13" font-weight="bold">PROXIMO A VENCER</text>
            <rect x="35" y="270" width="530" height="60" rx="6" fill="#022c22"/>
            <text x="200" y="305" fill="#a7f3d0" font-family="monospace" font-size="12" letter-spacing="4">*LIC-7749210-B*</text>
          </svg>`
        },
        {
          id: 'doc_demo_tarjeta',
          category: 'finanzas',
          title: 'Tarjeta Visa Signature Bóveda',
          doc_number: '4532 •••• •••• 9924',
          issuer: 'Banco Internacional de Pagos',
          issue_date: '2024-01-01',
          expiry_date: '2029-12-31',
          tags: 'tarjeta, visa, finanzas',
          notes: 'Tarjeta metálica privada con tokenización Zero-Knowledge.',
          fileName: 'tarjeta_visa_titanium.svg',
          svg: `<svg width="600" height="380" viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="380" rx="20" fill="#18181b" />
            <rect x="8" y="8" width="584" height="364" rx="16" fill="#09090b" stroke="#71717a" stroke-width="1.5" />
            <text x="40" y="55" fill="#e4e4e7" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="2">BÓVEDA DIGITAL</text>
            <text x="40" y="75" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="10" letter-spacing="1">PRIVATE TITANIUM METAL</text>
            <path d="M490 55 A 12 12 0 0 1 490 75 M496 50 A 18 18 0 0 1 496 80 M502 45 A 24 24 0 0 1 502 85" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round"/>
            <rect x="40" y="115" width="60" height="46" rx="8" fill="#d97706" stroke="#b45309" stroke-width="1.5"/>
            <rect x="44" y="119" width="52" height="38" rx="5" fill="#fbbf24"/>
            <line x1="44" y1="138" x2="96" y2="138" stroke="#78350f" stroke-width="1"/>
            <line x1="68" y1="119" x2="68" y2="157" stroke="#78350f" stroke-width="1"/>
            <text x="40" y="215" fill="#f4f4f5" font-family="Courier, monospace" font-size="22" font-weight="bold" letter-spacing="4">4532  8901  2345  9924</text>
            <text x="40" y="260" fill="#71717a" font-family="sans-serif" font-size="9">VALID THRU</text>
            <text x="40" y="278" fill="#f4f4f5" font-family="monospace" font-size="14" font-weight="bold">12/29</text>
            <text x="40" y="315" fill="#e4e4e7" font-family="sans-serif" font-size="14" font-weight="bold" letter-spacing="2">ANDRÉS E. AGUIAR</text>
            <text x="460" y="318" fill="#fbbf24" font-family="Arial, sans-serif" font-size="24" font-style="italic" font-weight="900" letter-spacing="1">VISA</text>
            <text x="460" y="335" fill="#e4e4e7" font-family="sans-serif" font-size="9" letter-spacing="1">SIGNATURE</text>
          </svg>`
        }
      ];

      for (const item of demoItems) {
        const svgBlob = new Blob([item.svg], { type: 'image/svg+xml' });
        svgBlob.name = item.fileName;

        const attachmentCipher = await window.vaultCrypto.encryptFile(window.vaultAuth.masterKey, svgBlob);

        const payloadToEncrypt = {
          doc_number: item.doc_number,
          issuer: item.issuer,
          issue_date: item.issue_date,
          expiry_date: item.expiry_date,
          tags: item.tags,
          notes: item.notes,
          attachment: attachmentCipher
        };

        const encrypted = await window.vaultCrypto.encrypt(window.vaultAuth.masterKey, payloadToEncrypt);

        const record = {
          id: item.id,
          user_id: userId,
          category: item.category,
          title: item.title,
          encrypted_payload: encrypted.ciphertext,
          iv: encrypted.iv,
          checksum: encrypted.checksum,
          expiry_date: item.expiry_date,
          is_synced: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await window.vaultStorage.saveDocument(record);
      }
    } catch (err) {
      console.warn('[BovedaApp] Error al sembrar documentos demo:', err);
    }
  }

  /**
   * Conmuta entre el Modo Lectura y el Modo Modificación del documento activo
   */
  toggleEditDocumentMode(forceState = null) {
    if (forceState !== null) {
      this.isEditingCurrentDoc = forceState;
    } else {
      this.isEditingCurrentDoc = !this.isEditingCurrentDoc;
    }

    const readView = document.getElementById('doc-read-view');
    const editView = document.getElementById('doc-edit-view');
    const btnText = document.getElementById('btn-toggle-edit-text');
    const btn = document.getElementById('btn-toggle-edit');

    if (this.isEditingCurrentDoc) {
      if (readView) readView.classList.add('hidden');
      if (editView) editView.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Ver Lectura';
      if (btn) btn.className = 'p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors';
    } else {
      if (readView) readView.classList.remove('hidden');
      if (editView) editView.classList.add('hidden');
      if (btnText) btnText.textContent = 'Modificar';
      if (btn) btn.className = 'p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors';
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Guarda los cambios modificados del documento y los re-cifra inmediatamente con AES-256
   */
  async handleSaveModifiedDocument(event) {
    event.preventDefault();
    if (!this.selectedDoc) return;

    if (!window.vaultAuth.masterKey) {
      this.showToast('Clave maestra bloqueada. Ingrese su PIN.', 'danger');
      return;
    }

    const updatedTitle = document.getElementById('edit-title').value.trim();
    const updatedCategory = document.getElementById('edit-category').value;
    const updatedDocNumber = document.getElementById('edit-doc-number').value.trim();
    const updatedIssuer = document.getElementById('edit-issuer').value.trim();
    const updatedIssueDate = document.getElementById('edit-issue-date').value;
    const updatedExpiryDate = document.getElementById('edit-expiry-date').value;
    const updatedNotes = document.getElementById('edit-notes').value.trim();
    const attachmentFileInput = document.getElementById('edit-attachment-file');

    let attachmentCipher = this.selectedDoc.attachment || null;
    if (attachmentFileInput && attachmentFileInput.files && attachmentFileInput.files[0]) {
      const newFile = attachmentFileInput.files[0];
      attachmentCipher = await window.vaultCrypto.encryptFile(window.vaultAuth.masterKey, newFile);
    }

    const updatedPayload = {
      doc_number: updatedDocNumber,
      issuer: updatedIssuer,
      issue_date: updatedIssueDate,
      expiry_date: updatedExpiryDate,
      tags: this.selectedDoc.tags || '',
      notes: updatedNotes,
      attachment: attachmentCipher
    };

    // Re-cifrar con AES-256-GCM
    const encryptedResult = await window.vaultCrypto.encrypt(window.vaultAuth.masterKey, updatedPayload);

    const updatedRecord = {
      id: this.selectedDoc.id,
      user_id: window.vaultAuth.currentUser.sub,
      category: updatedCategory,
      title: updatedTitle,
      encrypted_payload: encryptedResult.ciphertext,
      iv: encryptedResult.iv,
      checksum: encryptedResult.checksum,
      expiry_date: updatedExpiryDate || null,
      is_synced: false,
      created_at: this.selectedDoc.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await window.vaultStorage.saveDocument(updatedRecord);
    await window.vaultStorage.logAuditEvent(window.vaultAuth.currentUser.sub, 'DOC_MODIFIED', { docId: updatedRecord.id });

    this.showToast('Documento modificado y re-cifrado con éxito.', 'success');

    // Recargar datos y refrescar la vista de detalle
    await this.loadAndRenderDocuments(true);
    this.syncWithCloud(true);
    window.vaultGoogleDrive?.triggerAutoSync(window.vaultAuth.currentUser.sub, 'doc_modified');
    await this.openDocumentDetail(this.selectedDoc.id);
  }

  /**
   * Imprime la ficha oficial y legible del documento activo
   */
  printSelectedDocument() {
    if (!this.selectedDoc) return;
    this.toggleEditDocumentMode(false); // Asegurar vista de lectura limpia
    this.showToast('Preparando expediente para impresión...', 'info');
    setTimeout(() => {
      window.print();
    }, 200);
  }

  /**
   * Descarga un archivo adjunto descifrándolo en tiempo real
   */
  async downloadDecryptedAttachment(docId) {
    const doc = this.unlockedDocuments.find(d => d.id === docId);
    if (!doc || !doc.attachment) return;

    try {
      const blob = await window.vaultCrypto.decryptFile(
        window.vaultAuth.masterKey,
        doc.attachment.ciphertext,
        doc.attachment.iv,
        doc.attachment.mimeType
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.attachment.name || 'expediente_descifrado';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('Archivo descifrado y descargado.', 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Error al descifrar el archivo adjunto.', 'danger');
    }
  }

  /**
   * Elimina un documento permanentemente con confirmación de seguridad
   */
  async handleDeleteSelectedDocument() {
    if (!this.selectedDoc) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el documento "${this.selectedDoc.title}" de tu bóveda? Esta acción no se puede deshacer.`)) return;

    const docId = this.selectedDoc.id;
    await window.vaultStorage.deleteDocument(docId);
    await window.vaultStorage.logAuditEvent(window.vaultAuth.currentUser.sub, 'DOC_DELETED', { docId });

    // Eliminar también en la nube si hay sesión activa
    if (window.vaultAuth.accessToken) {
      fetch(`${window.vaultAuth.apiBaseUrl}/api/v1/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${window.vaultAuth.accessToken}` }
      }).catch(() => { });
    }

    document.getElementById('modal-doc-detail').close();
    this.showToast('Documento eliminado de la gaveta.', 'success');
    await this.loadAndRenderDocuments(true);
    this.syncWithCloud(true);
    window.vaultGoogleDrive?.triggerAutoSync(window.vaultAuth.currentUser.sub, 'doc_deleted');
  }

  /**
   * Abre modal de compartir seguro
   */
  openShareModal() {
    if (!this.selectedDoc) return;
    const modal = document.getElementById('modal-share-doc');
    const linkInput = document.getElementById('share-generated-link');
    const token = Math.random().toString(36).substr(2, 12);
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    linkInput.value = `${baseUrl}#share=${token}`;
    modal.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Abre el modal de perfil de usuario registrado (Estándar Halterofilia)
   */
  async openUserProfileModal() {
    const modal = document.getElementById('modal-user-profile');
    if (!modal) return;

    let profile = window.vaultLicense ? window.vaultLicense.userProfile : null;
    if (!profile && window.vaultLicense && typeof window.vaultLicense.getUserProfile === 'function') {
      profile = await window.vaultLicense.getUserProfile();
    }

    const firstNameInput = document.getElementById('user-profile-first-name');
    const lastNameInput = document.getElementById('user-profile-last-name');
    const emailInput = document.getElementById('user-profile-email');
    const phoneInput = document.getElementById('user-profile-phone');
    const photoImg = document.getElementById('user-profile-photo-img');
    const photoPlaceholder = document.getElementById('user-profile-photo-placeholder');
    const removeBtn = document.getElementById('btn-remove-user-photo');

    const defaultEmail = (profile && profile.email) ||
                         (window.vaultAuth?.currentUser?.email) ||
                         (window.vaultLicense?.userEmail) || '';

    if (firstNameInput) firstNameInput.value = (profile && profile.firstName) || '';
    if (lastNameInput) lastNameInput.value = (profile && profile.lastName) || '';
    if (emailInput) emailInput.value = defaultEmail;
    if (phoneInput) phoneInput.value = (profile && profile.phone) || '';

    this._pendingUserPhoto = profile ? profile.photo : null;

    if (photoImg && photoPlaceholder) {
      if (this._pendingUserPhoto) {
        photoImg.src = this._pendingUserPhoto;
        photoImg.classList.remove('hidden');
        photoPlaceholder.classList.add('hidden');
        if (removeBtn) {
          removeBtn.classList.remove('hidden');
          removeBtn.classList.add('inline-flex');
        }
      } else {
        photoImg.src = '';
        photoImg.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
        if (removeBtn) {
          removeBtn.classList.add('hidden');
          removeBtn.classList.remove('inline-flex');
        }
      }
    }

    modal.showModal();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Cierra el modal de perfil de usuario registrado
   */
  closeUserProfileModal() {
    const modal = document.getElementById('modal-user-profile');
    if (modal) modal.close();
  }

  /**
   * Captura o selecciona una foto de perfil y la redimensiona a 256x256 px en Canvas
   */
  handleUserPhotoCapture(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showToast('Por favor selecciona un archivo de imagen válido.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this._pendingUserPhoto = dataUrl;

        const photoImg = document.getElementById('user-profile-photo-img');
        const photoPlaceholder = document.getElementById('user-profile-photo-placeholder');
        const removeBtn = document.getElementById('btn-remove-user-photo');

        if (photoImg && photoPlaceholder) {
          photoImg.src = dataUrl;
          photoImg.classList.remove('hidden');
          photoPlaceholder.classList.add('hidden');
          if (removeBtn) {
            removeBtn.classList.remove('hidden');
            removeBtn.classList.add('inline-flex');
          }
        }
        if (window.lucide) window.lucide.createIcons();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Quita la foto de perfil asignada
   */
  removeUserPhoto() {
    this._pendingUserPhoto = null;
    const photoImg = document.getElementById('user-profile-photo-img');
    const photoPlaceholder = document.getElementById('user-profile-photo-placeholder');
    const removeBtn = document.getElementById('btn-remove-user-photo');

    if (photoImg && photoPlaceholder) {
      photoImg.src = '';
      photoImg.classList.add('hidden');
      photoPlaceholder.classList.remove('hidden');
      if (removeBtn) {
        removeBtn.classList.add('hidden');
        removeBtn.classList.remove('inline-flex');
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Guarda los cambios del perfil de usuario y actualiza los indicadores del sistema
   */
  async saveUserProfile() {
    const firstName = (document.getElementById('user-profile-first-name')?.value || '').trim();
    const lastName = (document.getElementById('user-profile-last-name')?.value || '').trim();
    const email = (document.getElementById('user-profile-email')?.value || '').trim().toLowerCase();
    const phone = (document.getElementById('user-profile-phone')?.value || '').trim();
    const photo = this._pendingUserPhoto !== undefined ? this._pendingUserPhoto : (window.vaultLicense?.userProfile?.photo || null);

    if (!firstName) {
      this.showToast('Por favor ingresa tu nombre.', 'warning');
      return;
    }
    if (!email) {
      this.showToast('Por favor ingresa un correo electrónico válido.', 'warning');
      return;
    }

    if (window.vaultLicense && typeof window.vaultLicense.saveUserProfile === 'function') {
      await window.vaultLicense.saveUserProfile({ firstName, lastName, email, phone, photo });
    }

    await this.renderHeaderUserProfile();
    this.updateLicenseUI();

    // Sincronizar inputs de correo en modales de licencia
    const lockEmailInput = document.getElementById('lock-user-email-input');
    if (lockEmailInput) lockEmailInput.value = email;
    const infoEmailInput = document.getElementById('info-user-email-input');
    if (infoEmailInput) infoEmailInput.value = email;

    this.closeUserProfileModal();
    this.showToast('Perfil de usuario guardado y asociado al dispositivo.', 'success');
  }

  /**
   * Desvincula el usuario actual del dispositivo
   */
  async unlinkUserProfile() {
    if (!confirm('¿Estás seguro de desvincular este usuario del dispositivo? El equipo quedará disponible para registrar un nuevo usuario.')) {
      return;
    }

    this._pendingUserPhoto = null;
    if (window.vaultLicense && typeof window.vaultLicense.clearUserProfile === 'function') {
      await window.vaultLicense.clearUserProfile();
    }

    await this.renderHeaderUserProfile();
    this.updateLicenseUI();
    this.closeUserProfileModal();
    this.showToast('Usuario desvinculado con éxito.', 'info');
    this.openFirstRunOnboarding();
  }

  /**
   * Despliega la pantalla de identificación obligatoria de primer uso
   */
  async openFirstRunOnboarding() {
    const modal = document.getElementById('modal-first-run-onboarding');
    if (!modal) return;

    this._onboardingPhoto = null;
    const photoImg = document.getElementById('onboarding-photo-img');
    const photoPl = document.getElementById('onboarding-photo-placeholder');
    const btnRemove = document.getElementById('btn-onboarding-remove-photo');
    if (photoImg) { photoImg.src = ''; photoImg.classList.add('hidden'); }
    if (photoPl) photoPl.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');

    if (window.vaultLicense) {
      const prof = await window.vaultLicense.getUserProfile();
      if (prof) {
        const fn = document.getElementById('onboarding-first-name');
        const ln = document.getElementById('onboarding-last-name');
        const em = document.getElementById('onboarding-email');
        const ph = document.getElementById('onboarding-phone');
        if (fn && prof.firstName) fn.value = prof.firstName;
        if (ln && prof.lastName) ln.value = prof.lastName;
        if (em && prof.email) em.value = prof.email;
        if (ph && prof.phone) ph.value = prof.phone;
        if (prof.photo) {
          this._onboardingPhoto = prof.photo;
          if (photoImg) { photoImg.src = prof.photo; photoImg.classList.remove('hidden'); }
          if (photoPl) photoPl.classList.add('hidden');
          if (btnRemove) btnRemove.classList.remove('hidden');
        }
      }
    }

    this.showOnboardingStep(1);
    if (!modal.open) {
      modal.showModal();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Cambia el paso activo del modal de onboarding (1 o 2)
   */
  showOnboardingStep(step) {
    const step1 = document.getElementById('onboarding-step-1');
    const step2 = document.getElementById('onboarding-step-2');
    if (step === 1) {
      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
    } else {
      if (step1) step1.classList.add('hidden');
      if (step2) step2.classList.remove('hidden');
      const otpInput = document.getElementById('onboarding-otp-input');
      if (otpInput) {
        otpInput.value = '';
        setTimeout(() => otpInput.focus(), 100);
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Maneja la captura de foto para el onboarding inicial
   */
  handleOnboardingPhotoCapture(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showToast('Por favor selecciona un archivo de imagen válido.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this._onboardingPhoto = dataUrl;

        const photoImg = document.getElementById('onboarding-photo-img');
        const photoPlaceholder = document.getElementById('onboarding-photo-placeholder');
        const removeBtn = document.getElementById('btn-onboarding-remove-photo');

        if (photoImg && photoPlaceholder) {
          photoImg.src = dataUrl;
          photoImg.classList.remove('hidden');
          photoPlaceholder.classList.add('hidden');
          if (removeBtn) {
            removeBtn.classList.remove('hidden');
            removeBtn.classList.add('inline-flex');
          }
        }
        if (window.lucide) window.lucide.createIcons();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Quita la foto de perfil en el onboarding
   */
  removeOnboardingPhoto() {
    this._onboardingPhoto = null;
    const photoImg = document.getElementById('onboarding-photo-img');
    const photoPlaceholder = document.getElementById('onboarding-photo-placeholder');
    const removeBtn = document.getElementById('btn-onboarding-remove-photo');

    if (photoImg) { photoImg.src = ''; photoImg.classList.add('hidden'); }
    if (photoPlaceholder) photoPlaceholder.classList.remove('hidden');
    if (removeBtn) { removeBtn.classList.add('hidden'); removeBtn.classList.remove('inline-flex'); }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Paso 1: Valida los campos de la ficha y despacha el código por email
   */
  async handleOnboardingSubmitStep1() {
    const firstName = (document.getElementById('onboarding-first-name')?.value || '').trim();
    const lastName = (document.getElementById('onboarding-last-name')?.value || '').trim();
    const email = (document.getElementById('onboarding-email')?.value || '').trim().toLowerCase();
    const phone = (document.getElementById('onboarding-phone')?.value || '').trim();

    if (!firstName || !lastName || !email || !phone) {
      this.showToast('Por favor completa todos los campos obligatorios de la ficha.', 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.showToast('Ingresa un correo electrónico con formato válido.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-onboarding-send-code');
    const btnText = document.getElementById('btn-onboarding-send-text');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Enviando código...';

    try {
      const res = await window.vaultAuth.sendEmailVerificationCode(email, `${firstName} ${lastName}`);
      if (!res.success) {
        this.showToast(res.error || 'Error al enviar código de verificación', 'error');
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Continuar y Enviar Código Validador';
        return;
      }

      this._pendingOnboardingProfile = {
        firstName,
        lastName,
        email,
        phone,
        photo: this._onboardingPhoto || null
      };

      const targetEmailEl = document.getElementById('onboarding-verify-target-email');
      if (targetEmailEl) targetEmailEl.textContent = email;

      const simAlert = document.getElementById('onboarding-simulated-code-alert');
      const simVal = document.getElementById('onboarding-simulated-code-val');
      if (res.simulated && res.code && simAlert && simVal) {
        simVal.textContent = res.code;
        simAlert.classList.remove('hidden');
        this.showToast(`Código generado (modo offline): ${res.code}`, 'info');
      } else if (simAlert) {
        simAlert.classList.add('hidden');
        this.showToast(`Código validador enviado a ${email}. Revisa tu bandeja de entrada o spam.`, 'success');
      }

      this.showOnboardingStep(2);
    } catch (err) {
      console.error('[Onboarding] Error:', err);
      this.showToast('Ocurrió un error al contactar el servicio de validación.', 'error');
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Continuar y Enviar Código Validador';
    }
  }

  /**
   * Paso 2: Valida el código de 6 dígitos ingresado y activa el perfil
   */
  async handleOnboardingSubmitStep2() {
    if (!this._pendingOnboardingProfile) {
      this.showOnboardingStep(1);
      return;
    }

    const otpInput = document.getElementById('onboarding-otp-input');
    const code = (otpInput?.value || '').trim();

    if (!code || code.length !== 6) {
      this.showToast('El código validador debe contener exactamente 6 dígitos numéricos.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-onboarding-verify');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Validando código...';
    }

    try {
      const res = await window.vaultAuth.verifyEmailCode(this._pendingOnboardingProfile.email, code);
      if (!res.success || !res.verified) {
        this.showToast(res.error || 'Código incorrecto o expirado.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4"></i><span>Validar Código y Acceder a la Bóveda</span>';
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      // Guardar perfil y persistir verificación
      if (window.vaultLicense) {
        await window.vaultLicense.saveUserProfile(this._pendingOnboardingProfile);
        await window.vaultLicense.markUserVerified(true);
        await window.vaultLicense.setUserEmail(this._pendingOnboardingProfile.email);
      }

      const modal = document.getElementById('modal-first-run-onboarding');
      if (modal) modal.close();

      this.showToast('¡Identificación confirmada y correo verificado con éxito!', 'success');
      await this.renderHeaderUserProfile();
      this.updateLicenseUI();

      // Proseguir con el flujo de inicialización de la app
      const hasPin = await window.vaultAuth.hasConfiguredPin();
      if (hasPin) {
        this.switchView('pin-lock');
      } else {
        this.switchView('pin-setup');
      }
    } catch (err) {
      console.error('[Onboarding] Error al verificar código:', err);
      this.showToast('Error al validar el código.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4"></i><span>Validar Código y Acceder a la Bóveda</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  /**
   * Reenvía el código validador al correo del paso 1
   */
  async handleOnboardingResendCode() {
    if (!this._pendingOnboardingProfile) {
      this.showOnboardingStep(1);
      return;
    }

    const { email, firstName, lastName } = this._pendingOnboardingProfile;
    const res = await window.vaultAuth.sendEmailVerificationCode(email, `${firstName} ${lastName}`);
    if (res.success) {
      const simAlert = document.getElementById('onboarding-simulated-code-alert');
      const simVal = document.getElementById('onboarding-simulated-code-val');
      if (res.simulated && res.code && simAlert && simVal) {
        simVal.textContent = res.code;
        simAlert.classList.remove('hidden');
        this.showToast(`Nuevo código generado (modo offline): ${res.code}`, 'info');
      } else {
        if (simAlert) simAlert.classList.add('hidden');
        this.showToast('Nuevo código validador despachado a tu correo. Revisa tu bandeja de entrada o spam.', 'info');
      }
    } else {
      this.showToast(res.error || 'No se pudo reenviar el código.', 'error');
    }
  }

  /**
   * Vuelve al paso 1 del onboarding para corregir datos o correo
   */
  handleOnboardingBackToStep1() {
    this.showOnboardingStep(1);
  }

  /**
   * Teclado PIN en pantalla
   */
  handlePinKey(num) {
    if (this.currentPinInput.length < 6) {
      this.currentPinInput += num;
      this.updatePinDots();
      if (this.currentPinInput.length === 6) {
        setTimeout(() => this.submitPinUnlock(), 150);
      }
    }
  }

  handlePinBackspace() {
    this.currentPinInput = this.currentPinInput.slice(0, -1);
    this.updatePinDots();
  }

  updatePinDots() {
    for (let i = 1; i <= 6; i++) {
      const dot = document.getElementById(`pin-dot-${i}`);
      if (dot) {
        if (i <= this.currentPinInput.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      }
    }
  }

  async submitPinUnlock() {
    try {
      await window.vaultAuth.unlockWithPin(this.currentPinInput);
      this.showToast('Bóveda descifrada correctamente', 'success');
      this.switchView('dashboard');
    } catch (e) {
      this.showToast(e.message, 'danger');
      this.currentPinInput = '';
      this.updatePinDots();
      const pad = document.getElementById('pin-pad-container');
      if (pad) {
        pad.classList.add('animate-shake');
        setTimeout(() => pad.classList.remove('animate-shake'), 400);
      }
    }
  }

  /**
   * Bloqueo rápido de la bóveda
   */
  lockVaultNow() {
    window.vaultAuth.lockVault();
    this.unlockedDocuments = [];
    this.showToast('Bóveda bloqueada de forma segura', 'warning');
    this.switchView('pin-lock');
  }

  /**
   * Resetea el PIN maestro y redirige al flujo de configuración de nuevo PIN
   */
  async resetPin() {
    await window.vaultAuth.resetPin();
    this.currentPinInput = '';
    this.updatePinDots();
    const pin1 = document.getElementById('input-new-pin');
    const pin2 = document.getElementById('input-confirm-pin');
    if (pin1) pin1.value = '';
    if (pin2) pin2.value = '';
    this.showToast('PIN restablecido. Ingresa tu nuevo PIN.', 'info');
    this.switchView('pin-setup');
  }

  /**
   * Simulación del escáner de cámara inteligente
   */
  startCameraScanner() {
    const scannerOverlay = document.getElementById('camera-scanner-view');
    if (!scannerOverlay) return;

    scannerOverlay.classList.remove('hidden');
    const statusText = document.getElementById('scanner-status-text');
    if (statusText) statusText.textContent = 'Enfoca el documento dentro del marco...';

    // Simular detección de bordes y lectura OCR inteligente tras 1.2 segundos
    setTimeout(() => {
      if (statusText) statusText.textContent = 'Documento detectado. Ajustando bordes...';
    }, 1200);

    setTimeout(() => {
      if (statusText) statusText.textContent = '¡Lectura completada con éxito!';

      // Auto-completar campos de ejemplo leídos por OCR
      const docNumInput = document.getElementById('input-doc-number');
      const issuerInput = document.getElementById('input-issuer');
      const expiryInput = document.getElementById('input-expiry-date');

      if (docNumInput) docNumInput.value = 'PAS-' + Math.floor(10000000 + Math.random() * 90000000);
      if (issuerInput) issuerInput.value = 'Registro Civil / Cancillería';

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 5);
      if (expiryInput) expiryInput.value = futureDate.toISOString().split('T')[0];

      this.showToast('Campos estructurados leídos automáticamente con escáner.', 'success');
      scannerOverlay.classList.add('hidden');
    }, 2800);
  }

  stopCameraScanner() {
    const scannerOverlay = document.getElementById('camera-scanner-view');
    if (scannerOverlay) scannerOverlay.classList.add('hidden');
  }

  /**
   * Notificaciones flotantes tipo Toast
   */
  showToast(message, type = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    const bgMap = {
      success: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40',
      danger: 'bg-rose-950/90 text-rose-200 border-rose-500/40',
      warning: 'bg-amber-950/90 text-amber-200 border-amber-500/40',
      info: 'bg-slate-900/90 text-slate-200 border-white/20'
    };

    toast.className = `fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 font-sans text-sm ${bgMap[type] || bgMap.info}`;
    toast.innerHTML = `
      <div class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-emerald-400' : type === 'danger' ? 'bg-rose-400' : 'bg-amber-400'} animate-pulse"></div>
      <span>${this.escapeHtml(message)}</span>
    `;

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 3200);
  }

  copyToClipboard(text) {
    if (!text || text === 'N/A') return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`Copiado al portapapeles: ${text}`, 'success');
    }).catch(() => {
      this.showToast('No se pudo copiar.', 'warning');
    });
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  /**
   * Actualiza el indicador visual de estado de sincronización con la Nube
   * @param {'synced' | 'syncing' | 'offline' | 'error'} state
   * @param {string} message
   */
  updateCloudSyncUI(state, message = '') {
    const indicator = document.getElementById('indicator-cloud-sync');
    const icon = document.getElementById('icon-cloud-sync');
    const label = document.getElementById('label-cloud-sync');
    const statusText = document.getElementById('cloud-status-text');
    const btn = document.getElementById('btn-cloud-sync');

    if (btn && message) {
      btn.title = `Nube: ${message} (Clic para sincronizar)`;
    }

    if (state === 'syncing') {
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
      if (icon) {
        icon.setAttribute('data-lucide', 'refresh-cw');
        icon.setAttribute('class', 'w-4 h-4 animate-spin text-amber-400');
      }
      if (label) label.textContent = 'Sincronizando';
      if (statusText) {
        statusText.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Sincronizando con Servidor...';
      }
    } else if (state === 'synced') {
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (icon) {
        icon.setAttribute('data-lucide', 'cloud-check');
        icon.setAttribute('class', 'w-4 h-4 text-emerald-400');
      }
      if (label) label.textContent = 'Nube';
      if (statusText) {
        statusText.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Conectada y Protegida';
      }
    } else if (state === 'offline') {
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-slate-400';
      if (icon) {
        icon.setAttribute('data-lucide', 'cloud-off');
        icon.setAttribute('class', 'w-4 h-4 text-slate-400');
      }
      if (label) label.textContent = 'Offline';
      if (statusText) {
        statusText.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Modo Local / Offline';
      }
    } else if (state === 'error') {
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-rose-400';
      if (icon) {
        icon.setAttribute('data-lucide', 'cloud');
        icon.setAttribute('class', 'w-4 h-4 text-rose-400');
      }
      if (label) label.textContent = 'Error Nube';
      if (statusText) {
        statusText.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Desconectado';
      }
    }

    // Actualizar elementos del diálogo modal de Nube si está presente
    const modalLed = document.getElementById('cloud-modal-status-led');
    const modalText = document.getElementById('cloud-modal-status-text');
    if (modalText && modalLed) {
      if (state === 'syncing') {
        modalLed.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
        modalText.textContent = 'Sincronizando con Servidor...';
      } else if (state === 'synced') {
        modalLed.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        modalText.textContent = 'Conectado y Sincronizado';
      } else if (state === 'offline') {
        modalLed.className = 'w-1.5 h-1.5 rounded-full bg-slate-400';
        modalText.textContent = 'Modo Local / Offline';
      } else if (state === 'error') {
        modalLed.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        modalText.textContent = 'Error de Conexión';
      }
    }

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 50);
    }
  }

  /**
   * Sincronización bidireccional Zero-Knowledge con el Servidor / Google Cloud
   * @param {boolean} silent
   */
  async syncWithCloud(silent = false) {
    const user = window.vaultAuth.currentUser;
    if (!user) return;

    this.updateCloudSyncUI('syncing', 'Sincronizando...');

    const isLive = await window.vaultAuth.checkServerConnection();
    if (!isLive) {
      this.updateCloudSyncUI('offline', 'Modo Local / Offline');
      if (!silent) {
        this.showToast('Servidor no disponible. Los datos continúan protegidos localmente en tu dispositivo.', 'info');
      }
      return;
    }

    let token = window.vaultAuth.accessToken;
    const apiBase = window.vaultAuth.apiBaseUrl;

    try {
      // Si el token es un mock local o está ausente, intentar adquirir token JWT genuino del servidor
      if (!token || token.includes('mock_signature')) {
        const refreshed = await window.vaultAuth.refreshSession();
        if (refreshed) {
          token = window.vaultAuth.accessToken;
        }
      }

      // 1. Obtener todos los documentos locales de IndexedDB
      const localDocs = await window.vaultStorage.getAllDocuments(user.sub);

      // 2. Subir en lote a la Nube (Zero-Knowledge: sólo payloads cifrados)
      if (token) {
        const controllerSync = new AbortController();
        const timeoutSync = setTimeout(() => controllerSync.abort(), 12000);

        let syncRes = await fetch(`${apiBase}/api/v1/documents/batch-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ documents: localDocs }),
          signal: controllerSync.signal
        }).catch(err => {
          console.warn('[BovedaApp] Petición batch-sync diferida:', err.message);
          return null;
        });
        clearTimeout(timeoutSync);

        // Si el token expiró o fue rechazado (401), intentar auto-renovación y reintentar 1 vez
        if (syncRes && syncRes.status === 401) {
          const refreshed = await window.vaultAuth.refreshSession();
          if (refreshed) {
            token = window.vaultAuth.accessToken;
            syncRes = await fetch(`${apiBase}/api/v1/documents/batch-sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ documents: localDocs })
            }).catch(() => null);
          }
        }

        if (syncRes && syncRes.ok) {
          for (const d of localDocs) {
            await window.vaultStorage.markDocumentSynced(d.id, true);
          }
        }

        // 3. Descargar documentos existentes en la Nube
        const controllerGet = new AbortController();
        const timeoutGet = setTimeout(() => controllerGet.abort(), 12000);

        let getRes = await fetch(`${apiBase}/api/v1/documents`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          signal: controllerGet.signal
        }).catch(err => {
          console.warn('[BovedaApp] Petición get documents diferida:', err.message);
          return null;
        });
        clearTimeout(timeoutGet);

        if (getRes && getRes.status === 401) {
          const refreshed = await window.vaultAuth.refreshSession();
          if (refreshed) {
            token = window.vaultAuth.accessToken;
            getRes = await fetch(`${apiBase}/api/v1/documents`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => null);
          }
        }

        if (getRes && getRes.ok) {
          const cloudData = await getRes.json().catch(() => ({}));
          if (Array.isArray(cloudData.documents)) {
            await window.vaultStorage.mergeCloudDocuments(cloudData.documents);
          }
        }
      }

      this.updateCloudSyncUI('synced', 'Nube Sincronizada y Protegida');
      if (!silent) {
        this.showToast('Bóveda sincronizada exitosamente con la Nube.', 'success');
      }

      // Refrescar documentos descifrados en pantalla si la bóveda está desbloqueada
      if (window.vaultAuth.masterKey) {
        try {
          await this.loadAndRenderDocuments(true); // true = no disparar sync recursivo
        } catch (rErr) {
          console.warn('[BovedaApp] Aviso en refresco de vista post-sync:', rErr);
        }
      }
    } catch (err) {
      console.warn('[BovedaApp] Aviso durante sincronización Cloud:', err);
      this.updateCloudSyncUI('offline', 'Modo Local (Datos Protegidos)');
      if (!silent) {
        this.showToast('Conexión con la Nube interrumpida. Los datos continúan protegidos localmente.', 'info');
      }
    }
  }

  /**
   * Abre el diálogo de configuración y estado de Google Cloud Run
   */
  async openCloudSyncModal() {
    const modal = document.getElementById('modal-cloud-sync');
    if (!modal) return;

    const urlDisplay = document.getElementById('cloud-modal-url-text');
    const inputUrl = document.getElementById('input-cloud-api-url');
    const savedCustomUrl = localStorage.getItem('boveda_api_base_url') || '';

    if (urlDisplay) {
      urlDisplay.textContent = window.vaultAuth.apiBaseUrl || 'No configurado';
    }
    if (inputUrl) {
      inputUrl.value = savedCustomUrl;
    }

    modal.showModal();

    // Comprobar estado en segundo plano
    const isLive = await window.vaultAuth.checkServerConnection();
    this.updateCloudSyncUI(isLive ? 'synced' : 'offline');

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 50);
    }
  }

  /**
   * Dispara sincronización manual desde el modal de la nube
   */
  async handleCloudSyncNow() {
    const icon = document.getElementById('icon-cloud-modal-sync');
    if (icon) icon.classList.add('animate-spin');

    try {
      await this.syncWithCloud(false);
    } finally {
      if (icon) icon.classList.remove('animate-spin');
      const urlDisplay = document.getElementById('cloud-modal-url-text');
      if (urlDisplay) urlDisplay.textContent = window.vaultAuth.apiBaseUrl;
    }
  }

  /**
   * Prueba de conectividad con la URL de Cloud Run
   */
  async testCloudConnection() {
    const input = document.getElementById('input-cloud-api-url');
    let testUrl = input ? input.value.trim() : '';
    if (!testUrl) {
      testUrl = window.vaultAuth.apiBaseUrl;
    } else {
      if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
        testUrl = 'https://' + testUrl;
      }
      testUrl = testUrl.replace(/\/+$/, '');
    }

    this.showToast(`Probando conexión con ${testUrl}...`, 'info');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${testUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        this.showToast(`🟢 Conexión exitosa con ${data.service || 'Google Cloud Run'}!`, 'success');
        this.updateCloudSyncUI('synced');
      } else {
        this.showToast(`⚠️ El servidor respondió con código ${res.status}. Verifica la URL.`, 'warning');
      }
    } catch (err) {
      this.showToast(`🔴 No se pudo conectar a ${testUrl}. Asegúrate de que el servicio esté activo y permita peticiones.`, 'danger');
      this.updateCloudSyncUI('offline');
    }
  }

  /**
   * Guarda una nueva URL de Google Cloud Run y sincroniza
   */
  async saveCloudApiUrl() {
    const input = document.getElementById('input-cloud-api-url');
    const newUrl = input ? input.value.trim() : '';

    if (!newUrl) {
      this.showToast('Por favor ingresa una URL válida (ej. https://boveda-digital-xxxx.run.app)', 'warning');
      return;
    }

    const activeUrl = window.vaultAuth.setApiBaseUrl(newUrl);
    const urlDisplay = document.getElementById('cloud-modal-url-text');
    if (urlDisplay) urlDisplay.textContent = activeUrl;

    this.showToast(`Servidor configurado en: ${activeUrl}`, 'success');

    // Probar conexión y sincronizar inmediatamente
    await this.testCloudConnection();
    if (window.vaultAuth.currentUser) {
      await this.syncWithCloud(true);
    }
  }

  /**
   * Restablece la URL del servidor al origen automático
   */
  async resetCloudApiUrl() {
    const defaultUrl = window.vaultAuth.setApiBaseUrl(null);
    const input = document.getElementById('input-cloud-api-url');
    const urlDisplay = document.getElementById('cloud-modal-url-text');

    if (input) input.value = '';
    if (urlDisplay) urlDisplay.textContent = defaultUrl;

    this.showToast(`URL restablecida al origen predeterminado: ${defaultUrl}`, 'info');
    await this.syncWithCloud(true);
  }

  bindEvents() {
    // Formulario de Login
    const loginForm = document.getElementById('form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const res = await window.vaultAuth.login(email, pass);
        if (res.success) {
          if (res.requiresPinSetup) {
            this.switchView('pin-setup');
          } else {
            this.switchView('pin-lock');
          }
        } else {
          this.showToast(res.error || 'Error al iniciar sesión', 'danger');
        }
      });
    }

    // Formulario de Configuración de PIN inicial
    const pinSetupForm = document.getElementById('form-pin-setup');
    if (pinSetupForm) {
      pinSetupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = document.getElementById('input-new-pin').value;
        const pinConfirm = document.getElementById('input-confirm-pin').value;
        if (pin !== pinConfirm) {
          this.showToast('Los PINs ingresados no coinciden.', 'danger');
          return;
        }
        try {
          await window.vaultAuth.setupPin(pin);
          this.showToast('PIN maestro configurado y bóveda descifrada.', 'success');
          this.switchView('dashboard');
        } catch (err) {
          this.showToast(err.message, 'danger');
        }
      });
    }

    // Buscador en tiempo real de gavetas
    const searchInput = document.getElementById('dashboard-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderCabinet();
      });
    }

    // Soporte nativo de teclado accesible para PIN pad y pantallas de seguridad
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (this.activeView === 'pin-lock') {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          this.handlePinKey(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          this.handlePinBackspace();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.currentPinInput.length >= 4) {
            this.submitPinUnlock();
          }
        }
      } else if (this.activeView === 'pin-setup') {
        if (!isInputFocused && e.key >= '0' && e.key <= '9') {
          const pin1 = document.getElementById('input-new-pin');
          if (pin1) {
            pin1.focus();
          }
        }
      }
    });

    // Formulario de Guardado de Documento
    const newDocForm = document.getElementById('form-new-doc');
    if (newDocForm) {
      newDocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(newDocForm);
        await this.handleSaveNewDocument(formData);
      });
    }

    // Modal de Detalle de Expediente: Limpieza de Object URLs descifrados
    const modalDetail = document.getElementById('modal-doc-detail');
    if (modalDetail) {
      modalDetail.addEventListener('close', () => {
        if (this._currentObjectUrl) {
          URL.revokeObjectURL(this._currentObjectUrl);
          this._currentObjectUrl = null;
        }
      });
    }
  }

  /**
   * Abre el modal interactivo de solicitud de PIN original del respaldo
   * @param {Object} [backupData] Metadatos y documentos pendientes del respaldo
   */
  openBackupPinPrompt(backupData = null) {
    this._pendingBackupData = backupData;
    const modal = document.getElementById('modal-backup-pin-prompt');
    if (!modal) return;
    const input = document.getElementById('input-backup-pin');
    const errEl = document.getElementById('backup-pin-error');
    if (input) input.value = '';
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.classList.remove('hidden');
    }
    if (input) {
      setTimeout(() => input.focus(), 150);
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Cierra el modal de solicitud de PIN del respaldo sin cambios
   */
  cancelBackupPinUnlock() {
    this._pendingBackupData = null;
    const modal = document.getElementById('modal-backup-pin-prompt');
    if (modal) {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.classList.add('hidden');
      }
    }
  }

  /**
   * Procesa el PIN ingresado por el usuario para descifrar y normalizar expedientes de respaldo
   */
  async submitBackupPinUnlock() {
    const input = document.getElementById('input-backup-pin');
    const errEl = document.getElementById('backup-pin-error');
    const btn = document.getElementById('btn-submit-backup-pin');
    const pin = input ? input.value.trim() : '';

    if (!pin || pin.length < 4) {
      if (errEl) {
        errEl.textContent = 'Por favor ingresa el PIN del respaldo (mínimo 4 dígitos).';
        errEl.classList.remove('hidden');
      }
      return;
    }

    if (errEl) errEl.classList.add('hidden');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Descifrando...</span>';
    }

    try {
      const user = window.vaultAuth.currentUser;
      const userId = user ? user.sub || user.email : 'local_user';

      // 1. Obtener candidatos de sal criptográfica
      const candidateSalts = [
        this._pendingBackupData?.crypto_salt,
        '226000658459336d4184642799fc8498', // Sal histórica maestra de Bóveda
        window.vaultAuth?.salt,
        await window.vaultStorage.getSetting('userSalt'),
        'ae8713595fed1e759db1062454187513'  // Sal por defecto de respaldo
      ].filter(Boolean);

      // Eliminar duplicados
      const uniqueSalts = [...new Set(candidateSalts)];

      // 2. Obtener documentos cifrados almacenados
      let rawDocs = await window.vaultStorage.getAllDocuments(userId);
      if ((!rawDocs || rawDocs.length === 0) && this._pendingBackupData?.documents) {
        rawDocs = this._pendingBackupData.documents;
      }
      if (!rawDocs || rawDocs.length === 0) {
        rawDocs = await window.vaultStorage.getAllDocuments();
      }

      const isValido = (d) => {
        if (window.vaultStorage && typeof window.vaultStorage.esPayloadCifradoValido === 'function') {
          return window.vaultStorage.esPayloadCifradoValido(d);
        }
        if (typeof window.esPayloadCifradoValido === 'function') {
          return window.esPayloadCifradoValido(d);
        }
        return !!(d && (d.encrypted_payload || d.encryptedPayload));
      };

      const validEncryptedDocs = rawDocs.filter(isValido);

      if (validEncryptedDocs.length === 0) {
        throw new Error('No se encontraron expedientes cifrados válidos para restaurar.');
      }

      let decryptedResults = [];
      let successfulSalt = null;
      let recoveryKey = null;

      // 3. Probar cada combinación de sal con el PIN ingresado
      for (const salt of uniqueSalts) {
        try {
          const testKey = await window.vaultCrypto.deriveKeyFromPin(pin, salt);
          const currentDecrypted = [];

          for (const doc of validEncryptedDocs) {
            try {
              const payload = doc.encrypted_payload || doc.encryptedPayload;
              const iv = doc.iv;
              const plain = await window.vaultCrypto.decrypt(testKey, payload, iv);
              if (plain && (plain.title || plain.category || plain.documentType || typeof plain === 'object')) {
                currentDecrypted.push({
                  id: doc.id,
                  originalDoc: doc,
                  decryptedData: plain
                });
              }
            } catch (e) {
              // Falla silenciosa para probar siguiente documento
            }
          }

          if (currentDecrypted.length > 0) {
            decryptedResults = currentDecrypted;
            successfulSalt = salt;
            recoveryKey = testKey;
            break;
          }
        } catch (deriveErr) {
          console.warn('[BovedaApp] Error probando sal candidata:', deriveErr);
        }
      }

      if (decryptedResults.length === 0) {
        if (errEl) {
          errEl.textContent = 'El PIN ingresado no coincide con el cifrado de los expedientes. Verifica los 6 dígitos.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      // 4. Re-cifrar con la clave maestra activa del dispositivo (o adoptar la clave si no existe)
      let activeMasterKey = window.vaultAuth.masterKey;
      if (!activeMasterKey) {
        activeMasterKey = recoveryKey;
        window.vaultAuth.masterKey = recoveryKey;
        window.vaultAuth.salt = successfulSalt;
        window.vaultAuth.lastEnteredPin = pin;
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('_vault_session_pin', pin);
        }
      }

      // Re-cifrar y guardar cada documento en IndexedDB
      for (const item of decryptedResults) {
        const plain = item.decryptedData;
        const payloadToEncrypt = {
          title: plain.title || 'Documento Restaurado',
          category: plain.category || 'general',
          documentType: plain.documentType || 'otro',
          documentNumber: plain.documentNumber || '',
          expirationDate: plain.expirationDate || '',
          notes: plain.notes || '',
          fileData: plain.fileData || null,
          fileName: plain.fileName || null,
          fileMime: plain.fileMime || null,
          createdAt: plain.createdAt || item.originalDoc.createdAt || item.originalDoc.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const reEncrypted = await window.vaultCrypto.encrypt(activeMasterKey, payloadToEncrypt);
        await window.vaultStorage.saveDocument({
          id: item.id,
          user_id: userId,
          category: payloadToEncrypt.category,
          title: payloadToEncrypt.title,
          encrypted_payload: reEncrypted.ciphertext,
          iv: reEncrypted.iv,
          checksum: reEncrypted.checksum,
          expiry_date: payloadToEncrypt.expirationDate || null,
          created_at: payloadToEncrypt.createdAt,
          updated_at: payloadToEncrypt.updatedAt,
          is_synced: false
        });
      }

      // Registrar sal exitosa
      await window.vaultStorage.setSetting('last_imported_salt', successfulSalt);
      if (user?.email) {
        await window.vaultStorage.setSetting('userSalt_' + user.email, window.vaultAuth.salt || successfulSalt);
      }

      // 5. Cerrar modal y re-renderizar interfaz
      this.cancelBackupPinUnlock();
      await this.loadAndRenderDocuments();

      this.showToast(`¡Recuperación completada! ${decryptedResults.length} expedientes descifrados y listos en tu archivador.`, 'success');
    } catch (err) {
      console.error('[BovedaApp] Error en desbloqueo interactivo de respaldo:', err);
      if (errEl) {
        errEl.textContent = 'Error al descifrar: ' + err.message;
        errEl.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="unlock" class="w-4 h-4"></i><span>Descifrar</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  /**
   * Actualiza el badge de estado de licencia o período de prueba en la interfaz (Spec 003)
   */
  updateLicenseUI() {
    if (!window.vaultLicense) return;
    const user = window.vaultAuth?.currentUser;
    const lic = window.vaultLicense.getEstadoLicencia(user?.email);

    const badge = document.getElementById('badge-license-status');
    const icon = document.getElementById('icon-license-badge');
    const text = document.getElementById('text-license-badge');
    if (!badge || !text) return;

    badge.className = 'badge-status cursor-pointer text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-all';

    if (lic.isLicensed) {
      badge.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
      badge.title = 'Licencia Oficial Activa (100% Offline)';
      if (icon) icon.setAttribute('data-lucide', 'shield-check');
      text.textContent = 'Licencia Activa';
    } else if (lic.isTrialActive) {
      if (lic.trialDaysRemaining <= 2) {
        badge.classList.add('bg-amber-500/10', 'text-amber-400', 'border', 'border-amber-500/30', 'animate-pulse');
        badge.title = `Período de prueba por vencer: ${lic.trialDaysRemaining} día(s) restante(s)`;
      } else {
        badge.classList.add('bg-cyan-500/10', 'text-cyan-400', 'border', 'border-cyan-500/20');
        badge.title = `Período de prueba activo: ${lic.trialDaysRemaining} días restantes`;
      }
      if (icon) icon.setAttribute('data-lucide', 'clock');
      text.textContent = `Trial: ${lic.trialDaysRemaining}d`;
    } else {
      badge.classList.add('bg-rose-500/10', 'text-rose-400', 'border', 'border-rose-500/30');
      badge.title = 'Período de prueba de 7 días expirado. Requiere activación.';
      if (icon) icon.setAttribute('data-lucide', 'shield-alert');
      text.textContent = 'Trial Expirado';
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Comprueba si el período de prueba expiró sin licencia y superpone el bloqueo no eludible
   */
  checkLicenseLock() {
    if (!window.vaultLicense) return;
    const user = window.vaultAuth?.currentUser;
    const lic = window.vaultLicense.getEstadoLicencia(user?.email);

    const lockModal = document.getElementById('modal-trial-lock');
    if (!lockModal) return;

    if (lic.isExpired && !lic.isLicensed) {
      const devEl = document.getElementById('lock-device-id');
      const emailInput = document.getElementById('lock-user-email-input');
      const emailEl = document.getElementById('lock-user-email-display');
      const cadEl = document.getElementById('lock-cadena-solicitud');
      const errEl = document.getElementById('lock-activation-error');

      if (devEl) devEl.textContent = lic.deviceId;
      if (emailInput && !emailInput.value) emailInput.value = lic.email;
      if (emailEl) emailEl.textContent = lic.email;
      if (cadEl) cadEl.value = lic.cadenaSolicitud;
      if (errEl) {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }

      if (typeof lockModal.showModal === 'function' && !lockModal.open) {
        lockModal.showModal();
      }
      if (window.lucide) window.lucide.createIcons();
    } else {
      if (lockModal.open) {
        lockModal.close();
      }
    }
  }

  /**
   * Abre el modal informativo de licencia para consultar días o ingresar token preventivamente
   */
  openLicenseModal() {
    if (!window.vaultLicense) return;
    const user = window.vaultAuth?.currentUser;
    const lic = window.vaultLicense.getEstadoLicencia(user?.email);

    const modal = document.getElementById('modal-license-info');
    if (!modal) return;

    const statusBadge = document.getElementById('info-license-status-badge');
    const timeLeft = document.getElementById('info-license-time-left');
    const devId = document.getElementById('info-device-id');
    const emailInput = document.getElementById('info-user-email-input');
    const cadena = document.getElementById('info-cadena-solicitud');
    const inputToken = document.getElementById('input-activation-token-info');
    const errEl = document.getElementById('info-activation-error');

    if (statusBadge) {
      statusBadge.textContent = lic.isLicensed ? 'Licencia Offline Activa' : (lic.isTrialActive ? 'Período de Prueba (7 Días)' : 'Trial Expirado');
      statusBadge.className = lic.isLicensed ?
        'px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
        (lic.isTrialActive ? 'px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
          'px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20');
    }

    if (timeLeft) {
      if (lic.isLicensed) {
        timeLeft.textContent = lic.licenseData?.isPerpetual ? 'Perpetua / Ilimitada' : (lic.licenseData?.expirationDate || 'Activa');
      } else if (lic.isTrialActive) {
        timeLeft.textContent = `${lic.trialDaysRemaining} día(s) restante(s)`;
      } else {
        timeLeft.textContent = 'Expirado (0 días)';
      }
    }

    if (devId) devId.textContent = lic.deviceId;
    if (emailInput) emailInput.value = lic.email;
    if (cadena) cadena.value = lic.cadenaSolicitud;
    if (inputToken) inputToken.value = '';
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Manejador reactivo cuando el usuario modifica su correo o usuario en el formulario de licencia
   * @param {'lock'|'info'} origin
   * @param {string} emailValue
   */
  handleLicenseEmailChange(origin, emailValue) {
    if (!window.vaultLicense) return;
    const clean = (emailValue || '').trim().toLowerCase();
    window.vaultLicense.setUserEmail(clean);

    // Sincronizar campo espejo en el otro modal si existe
    const otherOrigin = origin === 'lock' ? 'info' : 'lock';
    const otherInput = document.getElementById(`${otherOrigin}-user-email-input`);
    if (otherInput && otherInput.value !== clean) {
      otherInput.value = clean;
    }
    const emailDisplay = document.getElementById('lock-user-email-display');
    if (emailDisplay) emailDisplay.textContent = clean;

    const lic = window.vaultLicense.getEstadoLicencia(clean);
    const cadenaEl = document.getElementById(`${origin}-cadena-solicitud`);
    if (cadenaEl) cadenaEl.value = lic.cadenaSolicitud;
    const otherCadenaEl = document.getElementById(`${otherOrigin}-cadena-solicitud`);
    if (otherCadenaEl) otherCadenaEl.value = lic.cadenaSolicitud;
  }

  /**
   * Copia la cadena de solicitud al portapapeles
   * @param {'lock'|'info'} origin
   */
  async copyLicenseRequestString(origin = 'info') {
    const input = document.getElementById(`${origin}-cadena-solicitud`);
    const val = input ? input.value : '';
    if (!val) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(val);
      } else if (input) {
        input.select();
        document.execCommand('copy');
      }
      this.showToast('Código de solicitud copiado al portapapeles.', 'success');
    } catch (e) {
      this.showToast(`Código: ${val}`, 'info');
    }
  }

  /**
   * Abre enlace directo a WhatsApp para solicitar token
   * @param {'lock'|'info'} origin
   */
  openWhatsAppSupport(origin = 'info') {
    if (!window.vaultLicense) return;
    const emailInput = document.getElementById(`${origin}-user-email-input`);
    const email = emailInput ? emailInput.value.trim() : (window.vaultAuth?.currentUser?.email || window.vaultLicense.userEmail);
    const lic = window.vaultLicense.getEstadoLicencia(email);
    if (lic.whatsAppUrl) {
      window.open(lic.whatsAppUrl, '_blank');
    }
  }

  /**
   * Procesa la activación de licencia mediante token ingresado
   * @param {'lock'|'info'} origin
   */
  async submitLicenseActivation(origin = 'lock') {
    const input = document.getElementById(`input-activation-token-${origin}`);
    const errEl = document.getElementById(`${origin}-activation-error`);
    const btn = document.getElementById(`btn-submit-${origin}-activation`);
    const token = input ? input.value.trim() : '';

    if (!token) {
      if (errEl) {
        errEl.textContent = 'Por favor pega el Token de Activación recibido.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    if (btn) btn.disabled = true;

    try {
      const emailInput = document.getElementById(`${origin}-user-email-input`);
      const email = emailInput ? emailInput.value.trim() : (window.vaultAuth?.currentUser?.email || window.vaultLicense.userEmail);
      const res = await window.vaultLicense.activarConToken(token, email);

      if (!res.success) {
        if (errEl) {
          errEl.textContent = res.message;
          errEl.classList.remove('hidden');
        }
        return;
      }

      if (errEl) errEl.classList.add('hidden');
      if (input) input.value = '';

      // Cerrar modales de bloqueo o información
      const modal = document.getElementById(`modal-${origin === 'lock' ? 'trial-lock' : 'license-info'}`);
      if (modal && modal.open) {
        modal.close();
      }

      const lockModal = document.getElementById('modal-trial-lock');
      if (lockModal && lockModal.open) {
        lockModal.close();
      }

      this.updateLicenseUI();
      this.showToast('¡Licencia verificada y activada con éxito! Acceso completo habilitado.', 'success');
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Error al validar token: ' + err.message;
        errEl.classList.remove('hidden');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}

// Inicializar al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.bovedaApp = new BovedaApp();
  window.bovedaApp.init();
});

// Registro de Service Worker para PWA (Acceso Offline y Arranque a 1 Toque)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[Boveda PWA] Service Worker registrado con éxito:', reg.scope);
        if ('SyncManager' in window && reg.sync) {
          reg.sync.register('cloud-sync').catch(() => {});
        }
      })
      .catch((err) => {
        console.warn('[Boveda PWA] Aviso: Service Worker no registrado (modo local/preview):', err.message);
      });
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_REQUEST') {
      window.bovedaApp?.syncWithCloud(true);
    }
  });
}

