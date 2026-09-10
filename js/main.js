import { generateSmartRoutine } from './routineEngine.js';

const CONFIG = {
  keys: { routine: 'currentRoutine', prefs: 'userPreferences' },
  allEquipment: ['dumbbell', 'barbell', 'cable'],
  maxExercises: 12
};

const state = {
  globalDataset: [],
  muscleEquipmentMap: {},
  currentRoutine: [],
  alternativesList: [],
  selectedAlternative: null,
  swapIndex: null,
  modalMode: 'swap',
  toastTimeout: null,
  savedRoutines: Array(6).fill(null),
  preferences: {
    muscles: [],
    equipment: [...CONFIG.allEquipment],
    totalExercises: 6
  }
};

const TRANSLATIONS = {
  muscles: {
    chest: 'PECHO', back: 'ESPALDA', shoulders: 'HOMBROS',
    biceps: 'BÍCEPS', triceps: 'TRÍCEPS', legs: 'PIERNAS',
    core: 'ABDOMEN', glutes: 'GLÚTEOS', forearms: 'ANTEBRAZOS', cardio: 'CARDIO', other: 'OTROS'
  },
  equipment: {
    'body weight': 'PESO CORPORAL', bodyweight: 'PESO CORPORAL',
    dumbbell: 'MANCUERNAS', barbell: 'BARRA', cable: 'POLEA'
  }
};

const translate = (type, key) => TRANSLATIONS[type]?.[key?.toLowerCase()] || key?.toUpperCase() || '';

const Storage = {
  save() {
    localStorage.setItem(CONFIG.keys.prefs, JSON.stringify(state.preferences));
    localStorage.setItem(CONFIG.keys.routine, JSON.stringify(state.currentRoutine.map(ex => ex.id)));
  },
  loadPreferences() {
    const saved = localStorage.getItem(CONFIG.keys.prefs);
    if (saved) {
      try { Object.assign(state.preferences, JSON.parse(saved)); }
      catch (e) { console.warn("Error cargando preferencias", e); }
    }
  },
  loadRoutine() {
    const saved = localStorage.getItem(CONFIG.keys.routine);
    if (!saved) return false;
    try {
      const ids = JSON.parse(saved);
      if (!Array.isArray(ids) || ids.length === 0) return false;
      const routine = ids.map(id => state.globalDataset.find(ex => ex.id === id)).filter(Boolean);
      if (routine.length !== ids.length) return false;

      state.currentRoutine = routine;
      return true;
    } catch {
      localStorage.removeItem(CONFIG.keys.routine);
      return false;
    }
  },
  clear() {
    localStorage.removeItem(CONFIG.keys.routine);
    localStorage.removeItem(CONFIG.keys.prefs);
    state.preferences = { muscles: [], equipment: [...CONFIG.allEquipment], totalExercises: 6 };
    state.currentRoutine = [];
  }
};

const ShareService = {
  encodeRoutine(routine) {
    if (!routine || routine.length === 0) return null;

    const buffer = new Uint16Array(routine.length);
    for (let i = 0; i < routine.length; i++) {
      buffer[i] = parseInt(routine[i].id, 10);
    }

    const bytes = new Uint8Array(buffer.buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  decodeAndValidate(code, globalDataset) {
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'CÓDIGO INVÁLIDO O VACÍO' };
    }

    try {
      let base64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      if (bytes.length % 2 !== 0) {
        return { valid: false, error: 'FORMATO DE CÓDIGO CORRUPTO' };
      }

      const buffer = new Uint16Array(bytes.buffer);

      let concatenated = '';
      buffer.forEach(num => {
        concatenated += String(num).padStart(4, '0');
      });

      if (concatenated.length === 0 || concatenated.length % 4 !== 0) {
        return { valid: false, error: 'LONGITUD DE CÓDIGO INVÁLIDA' };
      }

      const extractedIds = [];
      for (let i = 0; i < concatenated.length; i += 4) {
        extractedIds.push(concatenated.substring(i, i + 4));
      }

      const exercises = [];
      for (const id of extractedIds) {
        const found = globalDataset.find(ex => ex.id === id);
        if (!found) {
          return { valid: false, error: `EL EJERCICIO CON ID "${id}" NO EXISTE` };
        }
        exercises.push(found);
      }

      return { valid: true, routine: exercises };

    } catch (e) {
      return { valid: false, error: 'EL CÓDIGO INGRESADO NO ES VÁLIDO' };
    }
  }
};

const SavedRoutinesService = {
  key: 'userSavedRoutinesSlots',

  loadSlots() {
    const saved = localStorage.getItem(this.key);
    if (!saved) {
      state.savedRoutines = Array(6).fill(null);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) {
        state.savedRoutines = Array(6).fill(null);
        return;
      }

      state.savedRoutines = parsed.map(code => {
        if (!code) return null;
        const validation = ShareService.decodeAndValidate(code, state.globalDataset);
        return validation.valid ? code : null;
      });

      this.saveSlots();
    } catch {
      state.savedRoutines = Array(6).fill(null);
    }
  },

  saveSlots() {
    localStorage.setItem(this.key, JSON.stringify(state.savedRoutines));
  },

  saveCurrentToSlot(index) {
    if (!state.currentRoutine || state.currentRoutine.length === 0) {
      UI.showToast("⚠️ NO HAY NINGUNA RUTINA ACTIVA PARA GUARDAR");
      return;
    }

    const code = ShareService.encodeRoutine(state.currentRoutine);
    if (!code) return;

    state.savedRoutines[index] = code;
    this.saveSlots();
    UI.renderSavedSlots();
    UI.showToast("¡RUTINA GUARDADA EN EL SLOT!");
  },

  deleteSlot(index) {
    state.savedRoutines[index] = null;
    this.saveSlots();
    UI.renderSavedSlots();
    UI.showToast("SLOT LIBERADO");
  },

  loadSlotRoutine(index) {
    const code = state.savedRoutines[index];
    if (!code) return;

    const result = ShareService.decodeAndValidate(code, state.globalDataset);
    if (!result.valid) {
      this.deleteSlot(index);
      return;
    }

    state.currentRoutine = result.routine;
    state.preferences.totalExercises = result.routine.length;
    Storage.save();
    UI.renderSetlist();
    Modal.closeSaved();
    UI.showToast("¡RUTINA CARGADA CON ÉXITO!");
  },

  shareSlotCode(index) {
    const code = state.savedRoutines[index];
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
      UI.showToast('¡CÓDIGO COPIADO AL PORTAPAPELES!');
    }).catch(() => {
      UI.showToast('NO SE PUDO COPIAR EL CÓDIGO');
    });
  }
};

const RoutineService = {
  buildEquipmentMap() {
    state.globalDataset.forEach(({ mainMuscle, equipment }) => {
      if (!state.muscleEquipmentMap[mainMuscle]) state.muscleEquipmentMap[mainMuscle] = new Set();
      state.muscleEquipmentMap[mainMuscle].add(equipment);
    });
  },

  calculateAutoExercises() {
    const count = state.preferences.muscles.length;
    if (count === 0) return;

    let target = count === 1 ? 4 : Math.min(Math.max(count * 2, 6), CONFIG.maxExercises);
    if (target % 2 !== 0) target += 1;

    state.preferences.totalExercises = target;
    UI.updateNumberButtons(target);
  },

  getAlternatives() {
    const { muscles, equipment } = state.preferences;
    const { currentRoutine, swapIndex, modalMode, globalDataset } = state;

    if (modalMode === 'add') {
      return globalDataset
        .filter(ex =>
          (muscles.length === 0 || muscles.includes(ex.mainMuscle)) &&
          (equipment.length === 0 || equipment.includes(ex.equipment)) &&
          !currentRoutine.some(r => r.id === ex.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const exToReplace = currentRoutine[swapIndex];
    const remaining = currentRoutine.filter((_, i) => i !== swapIndex);
    const axialCount = remaining.filter(ex => ex.hasAxialLoad).length;
    const maxAxial = state.preferences.totalExercises <= 6 ? 1 : 2;
    const activePatterns = new Set(remaining.map(ex => ex.movementPattern));

    return globalDataset
      .filter(ex => {
        const isValid = ex.mainMuscle === exToReplace.mainMuscle &&
          equipment.includes(ex.equipment) &&
          !currentRoutine.some(r => r.id === ex.id);
        if (!isValid) return false;
        return !(ex.hasAxialLoad && axialCount >= maxAxial);
      })
      .sort((a, b) => (activePatterns.has(a.movementPattern) ? 1 : 0) - (activePatterns.has(b.movementPattern) ? 1 : 0));
  }
};

const UI = {
  showToast(message, duration = 3500) {
    const toast = document.getElementById('toast-container');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.remove('hidden');

    if (state.toastTimeout) clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => toast.classList.add('hidden'), duration);
  },

  updateEquipmentAvailability() {
    const { muscles, equipment } = state.preferences;
    if (muscles.length === 0) {
      document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => btn.disabled = false);
      return;
    }

    const available = new Set();
    muscles.forEach(m => state.muscleEquipmentMap[m]?.forEach(eq => available.add(eq)));

    document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => {
      const eq = btn.dataset.equipment;
      const isAvailable = available.has(eq);
      btn.disabled = !isAvailable;

      if (!isAvailable && equipment.includes(eq)) {
        btn.classList.remove('active');
        state.preferences.equipment = equipment.filter(e => e !== eq);
      }
    });
  },

  updateNumberButtons(num) {
    document.querySelectorAll('.btn-num').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.btn-num[data-num="${num}"]`);

    if (btn) {
      btn.classList.add('active');
    } else {
      const available = Array.from(document.querySelectorAll('.btn-num'));
      const closest = available.reduce((p, c) => Math.abs(c.dataset.num - num) < Math.abs(p.dataset.num - num) ? c : p);
      closest.classList.add('active');
      state.preferences.totalExercises = parseInt(closest.dataset.num);
    }
    const txtTotal = document.getElementById('txt-total');
    if (txtTotal) txtTotal.innerText = String(state.preferences.totalExercises).padStart(2, '0');
  },

  restorePreferences() {
    document.querySelectorAll('.btn-option').forEach(btn => btn.classList.remove('active'));

    state.preferences.muscles.forEach(m => document.querySelector(`#grid-muscles [data-muscle="${m}"]`)?.classList.add('active'));
    this.updateEquipmentAvailability();
    state.preferences.equipment.forEach(e => document.querySelector(`#grid-equipment [data-equipment="${e}"]`)?.classList.add('active'));
    this.updateNumberButtons(state.preferences.totalExercises);
  },

  renderSetlist() {
    const container = document.getElementById('grid-cards');
    if (!container) return;
    container.innerHTML = '';

    state.currentRoutine.forEach((ex, index) => {
      const card = document.createElement('div');
      card.className = 'exercise-card';
      card.innerHTML = `
        <div class="card-header-row">
            <span class="order-num">${String(index + 1).padStart(2, '0')}</span>
            <div class="card-header-btns">
                <button class="btn-top-swap" data-index="${index}" title="Cambiar ejercicio">&#8644;</button>
                <button class="btn-top-delete" data-index="${index}" title="Eliminar ejercicio">&times;</button>
            </div>
        </div>
        <img src="${ex.image}" alt="${ex.name}" loading="lazy">
        <h3>${ex.name}</h3>
        <div class="tags">
            <span class="tag-muscle">${translate('muscles', ex.mainMuscle)}</span>
            <span class="tag-equipment">${translate('equipment', ex.equipment)}</span>
        </div>
        <button class="btn-details" data-id="${ex.id}">VER GUÍA</button>
      `;

      card.querySelector('.btn-details').addEventListener('click', () => Modal.openDetail(ex.id));
      card.querySelector('.btn-top-swap').addEventListener('click', () => Modal.openSwap(index, 'swap'));
      card.querySelector('.btn-top-delete').addEventListener('click', () => Handlers.deleteExercise(index));
      container.appendChild(card);
    });

    document.querySelector('main')?.classList.add('hidden');
    document.getElementById('setlist-container')?.classList.remove('hidden');
  },

  renderAlternativesList(list) {
    const container = document.getElementById('grid-alternatives');
    if (!container) return;
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `<p class="empty-msg">No hay ejercicios disponibles.</p>`;
      return;
    }

    list.forEach(alt => {
      const item = document.createElement('div');
      item.className = 'alternative-item';
      item.innerHTML = `
        <img src="${alt.image}" alt="${alt.name}" loading="lazy">
        <div class="alternative-info">
          <span>${alt.name}</span>
          <small class="alternative-muscle">${translate('muscles', alt.mainMuscle)}</small>
        </div>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.alternative-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        Modal.selectPreview(alt);
      });

      container.appendChild(item);
    });
  },

  renderSavedSlots() {
    const container = document.getElementById('grid-saved-slots');
    if (!container) return;
    container.innerHTML = '';

    state.savedRoutines.forEach((code, index) => {
      if (!code) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'slot-empty';
        emptyDiv.innerHTML = `
          <span>+</span>
          <p>SLOT ${index + 1}<br><small style="font-weight:400; font-size:0.75rem;">Guardar rutina actual</small></p>
        `;
        emptyDiv.addEventListener('click', () => SavedRoutinesService.saveCurrentToSlot(index));
        container.appendChild(emptyDiv);
      } else {
        const validation = ShareService.decodeAndValidate(code, state.globalDataset);
        if (!validation.valid) {
          state.savedRoutines[index] = null;
          SavedRoutinesService.saveSlots();
          return this.renderSavedSlots();
        }

        const exercises = validation.routine;
        const musclesList = Array.from(new Set(exercises.map(ex => translate('muscles', ex.mainMuscle)))).join(', ');

        const cardDiv = document.createElement('div');
        cardDiv.className = 'slot-card';

        let thumbnailsHtml = exercises.map(ex => `<img src="${ex.image}" alt="${ex.name}" class="slot-thumb" loading="lazy">`).join('');

        cardDiv.innerHTML = `
          <div class="slot-card-header">SLOT ${index + 1}: ${musclesList}</div>
          <div class="slot-thumbnails">${thumbnailsHtml}</div>
          <div class="slot-footer">
            <button class="slot-btn-load" data-index="${index}">CARGAR</button>
            <button class="slot-btn-share" data-index="${index}">COMPARTIR</button>
            <button class="slot-btn-delete" data-index="${index}">BORRAR</button>
          </div>
        `;

        cardDiv.querySelector('.slot-btn-load').addEventListener('click', () => SavedRoutinesService.loadSlotRoutine(index));
        cardDiv.querySelector('.slot-btn-share').addEventListener('click', () => SavedRoutinesService.shareSlotCode(index));
        cardDiv.querySelector('.slot-btn-delete').addEventListener('click', () => SavedRoutinesService.deleteSlot(index));

        container.appendChild(cardDiv);
      }
    });
  }
};

const Modal = {
  openDetail(id) {
    const ex = state.globalDataset.find(e => e.id === id);
    if (!ex) return;

    document.body.classList.add('modal-open');
    document.getElementById('modal-title').innerText = ex.name;
    document.getElementById('modal-video').src = ex.video;

    const steps = document.getElementById('modal-steps');
    if (steps) steps.innerHTML = ex.steps.map(s => `<li>${s}</li>`).join('');
    document.getElementById('modal-detail')?.classList.remove('hidden');
  },

  closeDetail() {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-detail')?.classList.add('hidden');
    const video = document.getElementById('modal-video');
    if (video) video.src = '';
  },

  openSwap(index = null, mode = 'swap') {
    state.modalMode = mode;
    state.swapIndex = index;
    state.selectedAlternative = null;

    document.body.classList.add('modal-open');
    const isSwap = mode === 'swap';

    const titleEl = document.getElementById('modal-swap-title');
    if (titleEl) titleEl.innerText = isSwap ? "CAMBIAR EJERCICIO" : "AÑADIR EJERCICIO EXTRA";

    const confirmBtn = document.getElementById('btn-confirm-swap');
    if (confirmBtn) {
      confirmBtn.innerHTML = isSwap ? "&#10004; USAR SELECCIONADO" : "&#10004; AÑADIR A LA RUTINA";
      confirmBtn.disabled = true;
    }

    document.getElementById('btn-random-swap')?.classList.toggle('hidden', !isSwap);

    const searchInput = document.getElementById('input-search-swap');
    if (searchInput) searchInput.value = '';

    state.alternativesList = RoutineService.getAlternatives();
    this.resetPreview();
    UI.renderAlternativesList(state.alternativesList);
    document.getElementById('modal-swap')?.classList.remove('hidden');
  },

  closeSwap() {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-swap')?.classList.add('hidden');
    state.swapIndex = null;
    state.selectedAlternative = null;
  },

  resetPreview() {
    const preview = document.getElementById('swap-preview');
    if (preview) preview.innerHTML = `<p class="preview-placeholder">Selecciona un ejercicio para ver la vista previa</p>`;
  },

  selectPreview(alt) {
    state.selectedAlternative = alt;
    const preview = document.getElementById('swap-preview');
    if (preview) {
      preview.innerHTML = `
        <img src="${alt.video}" alt="${alt.name}" loading="lazy">
        <h4>${alt.name.toUpperCase()}</h4>
        <span class="tag-muscle">${translate('muscles', alt.mainMuscle)}</span>
      `;
    }
    const confirmBtn = document.getElementById('btn-confirm-swap');
    if (confirmBtn) confirmBtn.disabled = false;
  },

  openShare() {
    document.body.classList.add('modal-open');
    const modal = document.getElementById('modal-share');
    const inputExport = document.getElementById('input-share-code');
    const inputImport = document.getElementById('input-import-code');

    if (inputExport) {
      if (state.currentRoutine.length > 0) {
        const code = ShareService.encodeRoutine(state.currentRoutine);
        inputExport.value = code || '';
      } else {
        inputExport.value = 'NO HAY RUTINA GENERADA';
      }
    }

    if (inputImport) inputImport.value = '';
    modal?.classList.remove('hidden');
  },

  closeShare() {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-share')?.classList.add('hidden');
  },

  openSaved() {
    document.body.classList.add('modal-open');
    SavedRoutinesService.loadSlots();
    UI.renderSavedSlots();
    document.getElementById('modal-saved')?.classList.remove('hidden');
  },

  closeSaved() {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-saved')?.classList.add('hidden');
  },

  openInfo() {
    document.body.classList.add('modal-open');
    document.getElementById('modal-info')?.classList.remove('hidden');
  },

  closeInfo() {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-info')?.classList.add('hidden');
  }
};

const Handlers = {
  buildRoutine() {
    if (state.preferences.muscles.length === 0 || state.preferences.equipment.length === 0) {
      UI.showToast("SELECCIONA AL MENOS UN MÚSCULO Y UN EQUIPAMIENTO");
      return;
    }

    const generated = generateSmartRoutine(state.globalDataset, state.preferences);
    if (generated.length === 0) {
      UI.showToast("NO HAY EJERCICIOS DISPONIBLES CON ESOS FILTROS");
      return;
    }

    state.currentRoutine = generated;
    Storage.save();
    UI.renderSetlist();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const includedMuscles = new Set(generated.map(ex => ex.mainMuscle));
    const missing = state.preferences.muscles.filter(m => !includedMuscles.has(m));
    if (missing.length > 0) {
      UI.showToast(`⚠️ AVISO: NO HAY EJERCICIOS DE (${missing.map(m => translate('muscles', m)).join(', ')}) CON EL EQUIPO SELECCIONADO.`, 4000);
    }
  },

  deleteExercise(index) {
    state.currentRoutine.splice(index, 1);
    if (state.currentRoutine.length === 0) {
      this.resetAndGoConfig();
      return;
    }

    state.preferences.totalExercises = state.currentRoutine.length;
    Storage.save();
    UI.renderSetlist();
    UI.showToast("EJERCICIO ELIMINADO", 2000);
  },

  confirmSwap() {
    const { selectedAlternative, modalMode, swapIndex } = state;
    if (!selectedAlternative) return;

    if (modalMode === 'swap' && swapIndex !== null) {
      state.currentRoutine[swapIndex] = selectedAlternative;
      UI.showToast(`EJERCICIO CAMBIADO POR: ${selectedAlternative.name.toUpperCase()}`, 2500);
    } else {
      state.currentRoutine.push(selectedAlternative);
      state.preferences.totalExercises = state.currentRoutine.length;
      UI.showToast(`EJERCICIO AÑADIDO: ${selectedAlternative.name.toUpperCase()}`, 2500);
    }

    Storage.save();
    UI.renderSetlist();
    Modal.closeSwap();
  },

  randomSwap() {
    if (state.alternativesList.length === 0) return UI.showToast("NO HAY ALTERNATIVAS DISPONIBLES");

    const activePatterns = new Set(state.currentRoutine.filter((_, i) => i !== state.swapIndex).map(ex => ex.movementPattern));
    const optimal = state.alternativesList.filter(alt => !activePatterns.has(alt.movementPattern));
    const pool = optimal.length > 0 ? optimal : state.alternativesList;

    state.currentRoutine[state.swapIndex] = pool[Math.floor(Math.random() * pool.length)];
    Storage.save();
    UI.renderSetlist();
    Modal.closeSwap();
  },

  resetAndGoConfig() {
    Storage.clear();
    UI.restorePreferences();
    document.getElementById('setlist-container')?.classList.add('hidden');
    document.querySelector('main')?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  copyShareCode() {
    const input = document.getElementById('input-share-code');
    if (!input || !input.value || input.value === 'NO HAY RUTINA GENERADA') {
      UI.showToast('PRIMERO DEBES CREAR UNA RUTINA');
      return;
    }

    navigator.clipboard.writeText(input.value).then(() => {
      UI.showToast('¡CÓDIGO COPIADO AL PORTAPAPELES!');
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      UI.showToast('¡CÓDIGO COPIADO!');
    });
  },

  importRoutineCode() {
    const inputImport = document.getElementById('input-import-code');
    if (!inputImport) return;
    const code = inputImport.value.trim();
    const result = ShareService.decodeAndValidate(code, state.globalDataset);

    if (!result.valid) {
      UI.showToast(`⚠️ ${result.error}`);
      return;
    }

    state.currentRoutine = result.routine;
    state.preferences.totalExercises = result.routine.length;

    Storage.save();
    UI.renderSetlist();
    Modal.closeShare();
    UI.showToast('¡RUTINA CARGADA CON ÉXITO!');
  }
};

async function initApp() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./js/sw.js').catch(console.error));
  }

  try {
    const res = await fetch('exercises.json');
    state.globalDataset = await res.json();

    RoutineService.buildEquipmentMap();
    Storage.loadPreferences();
    SavedRoutinesService.loadSlots();

    if (Storage.loadRoutine()) {
      UI.renderSetlist();
    }
    UI.restorePreferences();
  } catch (err) {
    console.error("Error al iniciar la aplicación:", err);
  }
}

document.querySelectorAll('#grid-muscles .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const m = btn.dataset.muscle;
    state.preferences.muscles = btn.classList.contains('active')
      ? [...state.preferences.muscles, m]
      : state.preferences.muscles.filter(item => item !== m);

    UI.updateEquipmentAvailability();
    RoutineService.calculateAutoExercises();
    Storage.save();
  });
});

document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.classList.toggle('active');
    const eq = btn.dataset.equipment;
    state.preferences.equipment = btn.classList.contains('active')
      ? [...state.preferences.equipment, eq]
      : state.preferences.equipment.filter(e => e !== eq);

    Storage.save();
  });
});

document.querySelectorAll('.btn-num').forEach(btn => {
  btn.addEventListener('click', () => {
    state.preferences.totalExercises = parseInt(btn.dataset.num);
    UI.updateNumberButtons(state.preferences.totalExercises);
    Storage.save();
  });
});

document.getElementById('btn-build')?.addEventListener('click', () => Handlers.buildRoutine());
document.getElementById('btn-rebuild')?.addEventListener('click', () => Handlers.resetAndGoConfig());
document.getElementById('btn-add-exercise')?.addEventListener('click', () => Modal.openSwap(null, 'add'));
document.getElementById('btn-confirm-swap')?.addEventListener('click', () => Handlers.confirmSwap());
document.getElementById('btn-random-swap')?.addEventListener('click', () => Handlers.randomSwap());
document.getElementById('btn-close-modal')?.addEventListener('click', () => Modal.closeDetail());
document.getElementById('btn-close-swap')?.addEventListener('click', () => Modal.closeSwap());

document.getElementById('btn-open-share')?.addEventListener('click', () => Modal.openShare());
document.getElementById('btn-close-share')?.addEventListener('click', () => Modal.closeShare());
document.getElementById('btn-copy-code')?.addEventListener('click', () => Handlers.copyShareCode());
document.getElementById('btn-import-code')?.addEventListener('click', () => Handlers.importRoutineCode());

document.getElementById('btn-open-saved')?.addEventListener('click', () => Modal.openSaved());
document.getElementById('btn-close-saved')?.addEventListener('click', () => Modal.closeSaved());

document.getElementById('input-search-swap')?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = state.alternativesList.filter(alt =>
    alt.name.toLowerCase().includes(query) || translate('muscles', alt.mainMuscle).toLowerCase().includes(query)
  );
  UI.renderAlternativesList(filtered);
});

const modalInfo = document.getElementById('modal-info');
document.getElementById('btn-open-info')?.addEventListener('click', () => Modal.openInfo());
document.getElementById('btn-close-info')?.addEventListener('click', () => Modal.closeInfo());
modalInfo?.addEventListener('click', (e) => { if (e.target === modalInfo) Modal.closeInfo(); });

const modalShare = document.getElementById('modal-share');
modalShare?.addEventListener('click', (e) => { if (e.target === modalShare) Modal.closeShare(); });

const modalSaved = document.getElementById('modal-saved');
modalSaved?.addEventListener('click', (e) => { if (e.target === modalSaved) Modal.closeSaved(); });

const fabMenu = document.getElementById('fab-menu');
const fabToggle = document.getElementById('btn-fab-toggle');

fabToggle?.addEventListener('click', () => {
  fabMenu?.classList.toggle('active');
  if (fabMenu?.classList.contains('active')) {
    fabToggle.innerHTML = '&times;';
  } else {
    fabToggle.innerHTML = '&#9776;';
  }
});

document.querySelectorAll('.fab-menu .floating-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fabMenu?.classList.remove('active');
    if (fabToggle) fabToggle.innerHTML = '&#9776;';
  });
});

initApp();