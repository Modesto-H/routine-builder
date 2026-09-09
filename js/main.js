import { generateSmartRoutine } from './routineEngine.js';

const ROUTINE_KEY = 'currentRoutine';
const PREFS_KEY = 'userPreferences';
const ALL_EQUIPMENT = ['dumbbell', 'barbell', 'cable'];

let globalDataset = [];
let userPreferences = {
  muscles: [],
  equipment: [...ALL_EQUIPMENT],
  totalExercises: 6
};

let muscleEquipmentMap = {};
let currentRoutine = [];
let currentIndexToSwap = null;
let selectedAlternative = null;
let currentAlternativesList = [];
let toastTimeout = null;
let modalMode = 'swap';

async function initApp() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./js/sw.js')
        .then((reg) => console.log('Service Worker registrado correctamente:', reg.scope))
        .catch((err) => console.error('Error al registrar Service Worker:', err));
    });
  }

  try {
    const response = await fetch('exercises.json');
    globalDataset = await response.json();

    buildEquipmentMap();

    const savedPrefs = localStorage.getItem(PREFS_KEY);
    if (savedPrefs) {
      try {
        userPreferences = JSON.parse(savedPrefs);
      } catch (e) {
        console.warn("Error leyendo preferencias guardadas", e);
      }
    }

    const savedRoutineIds = localStorage.getItem(ROUTINE_KEY);

    if (savedRoutineIds) {
      try {
        const routineIds = JSON.parse(savedRoutineIds);

        if (!Array.isArray(routineIds) || routineIds.length === 0) {
          throw new Error("IDs inválidos");
        }

        currentRoutine = routineIds.map(id => globalDataset.find(ex => ex.id === id)).filter(Boolean);

        if (currentRoutine.length !== routineIds.length) {
          throw new Error("Algunos IDs ya no existen en el dataset");
        }

        if (!savedPrefs) {
          userPreferences = {
            muscles: [...new Set(currentRoutine.map(ex => ex.mainMuscle))],
            equipment: [...new Set(currentRoutine.map(ex => ex.equipment))],
            totalExercises: currentRoutine.length
          };
        }

        renderSetlist(currentRoutine);

      } catch (error) {
        console.warn("IDs almacenados corruptos o desactualizados, reiniciando...", error);
        localStorage.removeItem(ROUTINE_KEY);
      }
    }

    restorePreferencesUI();

  } catch (error) {
    console.error("Error loading dataset:", error);
  }
}

function buildEquipmentMap() {
  globalDataset.forEach(ex => {
    const muscle = ex.mainMuscle;
    const eq = ex.equipment;

    if (!muscleEquipmentMap[muscle]) {
      muscleEquipmentMap[muscle] = new Set();
    }
    muscleEquipmentMap[muscle].add(eq);
  });
}

function savePreferences() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(userPreferences));
}

function restorePreferencesUI() {
  document.querySelectorAll('#grid-muscles .btn-option, #grid-equipment .btn-option').forEach(btn => {
    btn.classList.remove('active');
  });

  userPreferences.muscles.forEach(m => {
    const btn = document.querySelector(`#grid-muscles [data-muscle="${m}"]`);
    if (btn) btn.classList.add('active');
  });

  updateEquipmentAvailability();

  userPreferences.equipment.forEach(e => {
    const btn = document.querySelector(`#grid-equipment [data-equipment="${e}"]`);
    if (btn) btn.classList.add('active');
  });

  document.querySelectorAll('.btn-num').forEach(btn => btn.classList.remove('active'));
  const numBtn = document.querySelector(`.btn-num[data-num="${userPreferences.totalExercises}"]`);
  if (numBtn) {
    numBtn.classList.add('active');
    document.getElementById('txt-total').innerText = String(userPreferences.totalExercises).padStart(2, '0');
  }

  updateNumberButtonsUI(userPreferences.totalExercises);
}

function resetPreferencesUI() {
  localStorage.removeItem(ROUTINE_KEY);
  localStorage.removeItem(PREFS_KEY);

  userPreferences = {
    muscles: [],
    equipment: [...ALL_EQUIPMENT],
    totalExercises: 6
  };
  currentRoutine = [];

  restorePreferencesUI();
}

function resetAndGoToConfig() {
  resetPreferencesUI();
  document.getElementById('setlist-container').classList.add('hidden');
  document.querySelector('main').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateEquipmentAvailability() {
  if (userPreferences.muscles.length === 0) {
    document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => {
      btn.disabled = false;
    });
    return;
  }

  const equiposDisponibles = new Set();
  userPreferences.muscles.forEach(muscle => {
    if (muscleEquipmentMap[muscle]) {
      muscleEquipmentMap[muscle].forEach(eq => equiposDisponibles.add(eq));
    }
  });

  document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => {
    const eq = btn.dataset.equipment;

    if (equiposDisponibles.has(eq)) {
      btn.disabled = false;
    } else {
      btn.disabled = true;

      if (userPreferences.equipment.includes(eq)) {
        btn.classList.remove('active');
        userPreferences.equipment = userPreferences.equipment.filter(e => e !== eq);
      }
    }
  });
}

function showToast(message, duration = 3500) {
  const toast = document.getElementById('toast-container');
  toast.innerText = message;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

document.querySelectorAll('#grid-muscles .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const muscle = btn.dataset.muscle;
    if (userPreferences.muscles.includes(muscle)) {
      userPreferences.muscles = userPreferences.muscles.filter(m => m !== muscle);
    } else {
      userPreferences.muscles.push(muscle);
    }

    updateEquipmentAvailability();
    autoSelectExerciseCount();
    savePreferences();
  });
});

document.querySelectorAll('#grid-equipment .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;

    btn.classList.toggle('active');
    const eq = btn.dataset.equipment;
    if (userPreferences.equipment.includes(eq)) {
      userPreferences.equipment = userPreferences.equipment.filter(e => e !== eq);
    } else {
      userPreferences.equipment.push(eq);
    }

    savePreferences();
  });
});

document.querySelectorAll('.btn-num').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.btn-num.active')?.classList.remove('active');
    btn.classList.add('active');
    userPreferences.totalExercises = parseInt(btn.dataset.num);
    document.getElementById('txt-total').innerText = btn.dataset.num.padStart(2, '0');

    savePreferences();
  });
});

document.getElementById('btn-build').addEventListener('click', () => {
  if (userPreferences.muscles.length === 0 || userPreferences.equipment.length === 0) {
    showToast("SELECCIONA AL MENOS UN MÚSCULO Y UN EQUIPAMIENTO");
    return;
  }

  const generatedRoutine = generateSmartRoutine(globalDataset, userPreferences);

  if (generatedRoutine.length === 0) {
    showToast("NO HAY EJERCICIOS DISPONIBLES CON ESOS FILTROS");
    return;
  }

  const routineIds = generatedRoutine.map(ex => ex.id);
  localStorage.setItem(ROUTINE_KEY, JSON.stringify(routineIds));
  savePreferences();

  renderSetlist(generatedRoutine);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const includedMuscles = new Set(generatedRoutine.map(ex => ex.mainMuscle));
  const missingMuscles = userPreferences.muscles.filter(m => !includedMuscles.has(m));

  let warningMessage = null;

  if (missingMuscles.length > 0) {
    const translatedMissing = missingMuscles.map(translateMuscle).join(', ');
    warningMessage = `⚠️ AVISO: NO HAY EJERCICIOS DE (${translatedMissing}) CON EL EQUIPO SELECCIONADO.`;
  }

  const heavyGripCount = generatedRoutine.filter(ex =>
    (ex.mainMuscle === 'back' || ex.movementPattern === 'hip_dominant') &&
    (ex.equipment === 'barbell' || ex.equipment === 'dumbbell')
  ).length;

  if (warningMessage) {
    showToast(warningMessage, 4000);
    if (heavyGripCount >= 3) {
      setTimeout(() => {
        showToast("💡 CONSEJO: ALTA FATIGA DE AGARRE. USA STRAPS SI FALLAN TUS ANTEBRAZOS.", 4500);
      }, 4200);
    }
  } else if (heavyGripCount >= 3) {
    showToast("💡 CONSEJO: ALTA FATIGA DE AGARRE. USA STRAPS SI FALLAN TUS ANTEBRAZOS.", 4500);
  }
});

function renderSetlist(exercises) {
  currentRoutine = exercises;
  const gridContainer = document.getElementById('grid-cards');
  gridContainer.innerHTML = '';

  exercises.forEach((ex, index) => {
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
              <span class="tag-muscle">${translateMuscle(ex.mainMuscle)}</span>
              <span class="tag-equipment">${translateEquipment(ex.equipment)}</span>
          </div>
          <button class="btn-details" data-id="${ex.id}">VER GUÍA</button>
      `;

    card.querySelector('.btn-details').addEventListener('click', () => openModal(ex.id));
    card.querySelector('.btn-top-swap').addEventListener('click', () => openSwapModal(index));
    card.querySelector('.btn-top-delete').addEventListener('click', () => deleteExercise(index));
    gridContainer.appendChild(card);
  });

  document.querySelector('main').classList.add('hidden');
  document.getElementById('setlist-container').classList.remove('hidden');
}

function deleteExercise(index) {
  currentRoutine.splice(index, 1);

  if (currentRoutine.length === 0) {
    resetAndGoToConfig();
    return;
  }

  userPreferences.totalExercises = currentRoutine.length;

  const routineIds = currentRoutine.map(ex => ex.id);
  localStorage.setItem(ROUTINE_KEY, JSON.stringify(routineIds));
  savePreferences();

  renderSetlist(currentRoutine);
  showToast("EJERCICIO ELIMINADO", 2000);
}

document.getElementById('btn-rebuild').addEventListener('click', resetAndGoToConfig);

function openModal(id) {
  const ex = globalDataset.find(e => e.id === id);
  if (!ex) return;

  document.body.classList.add('modal-open');
  document.getElementById('modal-title').innerText = ex.name;
  document.getElementById('modal-video').src = ex.video;

  const stepsList = document.getElementById('modal-steps');
  stepsList.innerHTML = '';
  ex.steps.forEach(step => {
    let li = document.createElement('li');
    li.innerText = step;
    stepsList.appendChild(li);
  });

  document.getElementById('modal-detail').classList.remove('hidden');
}

document.getElementById('btn-close-modal').addEventListener('click', () => {
  document.body.classList.remove('modal-open');
  document.getElementById('modal-detail').classList.add('hidden');
  document.getElementById('modal-video').src = '';
});

function openSwapModal(index) {
  modalMode = 'swap';
  currentIndexToSwap = index;
  selectedAlternative = null;

  document.body.classList.add('modal-open');
  document.getElementById('modal-swap-title').innerText = "CAMBIAR EJERCICIO";
  document.getElementById('btn-confirm-swap').innerHTML = "&#10004; REEMPLAZAR SELECCIONADO";
  document.getElementById('btn-confirm-swap').disabled = true;
  document.getElementById('btn-random-swap').classList.remove('hidden');

  const searchInput = document.getElementById('input-search-swap');
  if (searchInput) searchInput.value = '';

  const exerciseToReplace = currentRoutine[index];
  const remainingRoutine = currentRoutine.filter((_, i) => i !== index);
  const currentAxialCount = remainingRoutine.filter(ex => ex.hasAxialLoad).length;
  const maxAxialAllowed = userPreferences.totalExercises <= 6 ? 1 : 2;
  const activePatterns = new Set(remainingRoutine.map(ex => ex.movementPattern));

  currentAlternativesList = globalDataset.filter(ex => {
    const isSameMuscle = ex.mainMuscle === exerciseToReplace.mainMuscle;
    const isAllowedEquipment = userPreferences.equipment.includes(ex.equipment);
    const isNotInCurrentRoutine = !currentRoutine.some(rutinaEx => rutinaEx.id === ex.id);

    if (!isSameMuscle || !isAllowedEquipment || !isNotInCurrentRoutine) return false;
    return !(ex.hasAxialLoad && currentAxialCount >= maxAxialAllowed);
  });

  currentAlternativesList.sort((a, b) => {
    const aUsed = activePatterns.has(a.movementPattern) ? 1 : 0;
    const bUsed = activePatterns.has(b.movementPattern) ? 1 : 0;
    return aUsed - bUsed;
  });

  resetModalPreview();
  renderAlternativesList(currentAlternativesList);
  document.getElementById('modal-swap').classList.remove('hidden');
}

document.getElementById('btn-add-exercise').addEventListener('click', openAddModal);

function openAddModal() {
  modalMode = 'add';
  currentIndexToSwap = null;
  selectedAlternative = null;

  document.body.classList.add('modal-open');
  document.getElementById('modal-swap-title').innerText = "AÑADIR EJERCICIO EXTRA";
  document.getElementById('btn-confirm-swap').innerHTML = "&#10004; AÑADIR A LA RUTINA";
  document.getElementById('btn-confirm-swap').disabled = true;
  document.getElementById('btn-random-swap').classList.add('hidden');

  const searchInput = document.getElementById('input-search-swap');
  if (searchInput) searchInput.value = '';

  currentAlternativesList = globalDataset.filter(ex => {
    const isAllowedMuscle = userPreferences.muscles.length === 0 || userPreferences.muscles.includes(ex.mainMuscle);
    const isAllowedEquipment = userPreferences.equipment.length === 0 || userPreferences.equipment.includes(ex.equipment);
    const isNotInCurrentRoutine = !currentRoutine.some(rutinaEx => rutinaEx.id === ex.id);

    return isAllowedMuscle && isAllowedEquipment && isNotInCurrentRoutine;
  });

  currentAlternativesList.sort((a, b) => a.name.localeCompare(b.name));

  resetModalPreview();
  renderAlternativesList(currentAlternativesList);
  document.getElementById('modal-swap').classList.remove('hidden');
}

function resetModalPreview() {
  const previewContainer = document.getElementById('swap-preview');
  previewContainer.innerHTML = `<p class="preview-placeholder">Selecciona un ejercicio para ver la vista previa</p>`;
}

function renderAlternativesList(list) {
  const alternativesContainer = document.getElementById('grid-alternatives');
  alternativesContainer.innerHTML = '';

  if (list.length === 0) {
    alternativesContainer.innerHTML = `<p style="font-size: 0.8rem; font-weight: 700; text-align: center; padding: 1rem;">No hay ejercicios disponibles.</p>`;
    return;
  }

  list.forEach(alt => {
    const item = document.createElement('div');
    item.className = 'alternative-item';
    item.innerHTML = `
      <img src="${alt.image}" alt="${alt.name}" loading="lazy">
      <div style="display:flex; flex-direction:column; align-items:flex-start;">
        <span>${alt.name}</span>
        <small style="font-size:0.65rem; opacity:0.8;">${translateMuscle(alt.mainMuscle)}</small>
      </div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.alternative-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectAlternativeForPreview(alt);
    });

    alternativesContainer.appendChild(item);
  });
}

function autoSelectExerciseCount() {
  const muscleCount = userPreferences.muscles.length;

  if (muscleCount === 0) return;

  let targetCount;

  if (muscleCount === 1) {
    targetCount = 4;
  } else {
    targetCount = Math.min(Math.max(muscleCount * 2, 6), 12);
  }

  if (targetCount % 2 !== 0) {
    targetCount += 1;
  }

  userPreferences.totalExercises = targetCount;
  updateNumberButtonsUI(targetCount);
}

function updateNumberButtonsUI(num) {
  document.querySelectorAll('.btn-num').forEach(btn => btn.classList.remove('active'));
  const numBtn = document.querySelector(`.btn-num[data-num="${num}"]`);

  if (numBtn) {
    numBtn.classList.add('active');
  } else {
    const availableBtn = Array.from(document.querySelectorAll('.btn-num'));
    const closestBtn = availableBtn.reduce((prev, curr) =>
      Math.abs(parseInt(curr.dataset.num) - num) < Math.abs(parseInt(prev.dataset.num) - num) ? curr : prev
    );
    closestBtn.classList.add('active');
    userPreferences.totalExercises = parseInt(closestBtn.dataset.num);
  }

  document.getElementById('txt-total').innerText = String(userPreferences.totalExercises).padStart(2, '0');
}

document.getElementById('input-search-swap').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();

  const filteredList = currentAlternativesList.filter(alt =>
    alt.name.toLowerCase().includes(query) ||
    translateMuscle(alt.mainMuscle).toLowerCase().includes(query)
  );

  renderAlternativesList(filteredList);
});

function selectAlternativeForPreview(alt) {
  selectedAlternative = alt;
  const previewContainer = document.getElementById('swap-preview');
  previewContainer.innerHTML = `
    <img src="${alt.video}" alt="${alt.name}" loading="lazy">
    <h4>${alt.name.toUpperCase()}</h4>
    <span class="tag-muscle" style="margin-top:0.4rem; font-size:0.65rem;">${translateMuscle(alt.mainMuscle)}</span>
  `;
  document.getElementById('btn-confirm-swap').disabled = false;
}

document.getElementById('btn-confirm-swap').addEventListener('click', () => {
  if (!selectedAlternative) return;

  if (modalMode === 'swap' && currentIndexToSwap !== null) {
    currentRoutine[currentIndexToSwap] = selectedAlternative;
    showToast(`EJERCICIO CAMBIADO POR: ${selectedAlternative.name.toUpperCase()}`, 2500);
  } else if (modalMode === 'add') {
    currentRoutine.push(selectedAlternative);
    userPreferences.totalExercises = currentRoutine.length;
    showToast(`EJERCICIO AÑADIDO: ${selectedAlternative.name.toUpperCase()}`, 2500);
  }

  const routineIds = currentRoutine.map(ex => ex.id);
  localStorage.setItem(ROUTINE_KEY, JSON.stringify(routineIds));
  savePreferences();

  renderSetlist(currentRoutine);
  closeSwapModal();
});

document.getElementById('btn-random-swap').addEventListener('click', () => {
  if (currentAlternativesList.length > 0) {
    const activePatterns = new Set(
      currentRoutine.filter((_, i) => i !== currentIndexToSwap).map(ex => ex.movementPattern)
    );

    const optimalAlternatives = currentAlternativesList.filter(alt => !activePatterns.has(alt.movementPattern));

    const poolToPick = optimalAlternatives.length > 0 ? optimalAlternatives : currentAlternativesList;
    const randomIndex = Math.floor(Math.random() * poolToPick.length);

    executeSwap(poolToPick[randomIndex]);
  } else {
    showToast("NO HAY ALTERNATIVAS DISPONIBLES");
  }
});

function executeSwap(newExercise) {
  if (currentIndexToSwap !== null) {
    currentRoutine[currentIndexToSwap] = newExercise;

    const routineIds = currentRoutine.map(ex => ex.id);
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(routineIds));

    renderSetlist(currentRoutine);
    closeSwapModal();
  }
}

function closeSwapModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('modal-swap').classList.add('hidden');
  currentIndexToSwap = null;
  selectedAlternative = null;
}

document.getElementById('btn-close-swap').addEventListener('click', closeSwapModal);

const modalInfo = document.getElementById('modal-info');
const btnOpenInfo = document.getElementById('btn-open-info');
const btnCloseInfo = document.getElementById('btn-close-info');

btnOpenInfo.addEventListener('click', () => {
  modalInfo.classList.remove('hidden');
});

btnCloseInfo.addEventListener('click', () => {
  modalInfo.classList.add('hidden');
});

modalInfo.addEventListener('click', (e) => {
  if (e.target === modalInfo) {
    modalInfo.classList.add('hidden');
  }
});

function translateMuscle(muscle) {
  const translations = {
    'chest': 'PECHO',
    'back': 'ESPALDA',
    'shoulders': 'HOMBROS',
    'biceps': 'BÍCEPS',
    'triceps': 'TRÍCEPS',
    'legs': 'PIERNAS',
    'core': 'ABDOMEN',
    'glutes': 'GLÚTEOS',
    'other': 'OTROS'
  };
  return translations[muscle.toLowerCase()] || muscle.toUpperCase();
}

function translateEquipment(equipment) {
  const translations = {
    'body weight': 'PESO CORPORAL',
    'bodyweight': 'PESO CORPORAL',
    'dumbbell': 'MANCUERNAS',
    'barbell': 'BARRA',
    'cable': 'POLEA',
  };
  return translations[equipment.toLowerCase()] || equipment.toUpperCase();
}

initApp().finally();