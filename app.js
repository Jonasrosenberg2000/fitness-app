const toast = document.querySelector('#toast');
const programExercisesKey = 'formlyProgramExercises';
const exerciseImageRegistryKey = 'formlyExerciseImageRegistry';
const boundSaveButtons = new WeakSet();
let deferredInstallPrompt = null;
const storedUserId = localStorage.getItem('formlyUserId');
const userId = storedUserId && storedUserId !== 'default'
  ? storedUserId
  : `user-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
localStorage.setItem('formlyUserId', userId);
const billingState = {
  loaded: false,
  configured: false,
  isPro: false,
  priceDkk: 39,
  limits: { coach: 60, vision: 4 },
  remaining: { coach: 0, vision: 0 }
};
const authState = {
  loaded: false,
  configured: false,
  authenticated: false,
  user: null,
  notice: ''
};

const installAppButton = document.createElement('button');
installAppButton.type = 'button';
installAppButton.id = 'installAppButton';
installAppButton.textContent = 'Installer app';
installAppButton.hidden = true;
installAppButton.className = 'install-app-button';

document.querySelector('.topbar')?.appendChild(installAppButton);

const networkStatus = document.createElement('div');
networkStatus.id = 'networkStatus';
networkStatus.className = 'network-status';
networkStatus.textContent = 'Online';
networkStatus.setAttribute('aria-live', 'polite');
document.querySelector('.topbar')?.appendChild(networkStatus);

function updateNetworkStatus() {
  if (!networkStatus) return;
  const online = navigator.onLine;
  networkStatus.textContent = online ? 'Online · lokalt og cloud' : 'Offline · lokal mode';
  networkStatus.dataset.status = online ? 'online' : 'offline';
}

window.addEventListener('online', () => {
  updateNetworkStatus();
  showToast('Forbindelsen er tilbage');
});
window.addEventListener('offline', () => {
  updateNetworkStatus();
  showToast('Du er offline. Appen arbejder lokalt.');
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installAppButton.hidden = true;
  deferredInstallPrompt = null;
  showToast('Appen er installeret');
});

installAppButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    showToast('Installeringsprompt er ikke tilgængeligt i denne browser');
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    showToast('Appen er nu klar til installation');
  } else {
    showToast('Installation blev afbrudt');
  }
  deferredInstallPrompt = null;
  installAppButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    let updateReloadStarted = false;
    const reloadForUpdate = () => {
      if (updateReloadStarted) return;
      updateReloadStarted = true;
      showToast('Ny version er klar - opdaterer appen...');
      window.setTimeout(() => window.location.reload(), 300);
    };
    const checkDeploymentBuild = async () => {
      if (!navigator.onLine || updateReloadStarted) return;
      try {
        const response = await fetch(`/api/health?update=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const { build } = await response.json();
        if (!build || build === 'local') return;
        const storedBuild = localStorage.getItem('formlyAppBuild');
        localStorage.setItem('formlyAppBuild', build);
        if (storedBuild && storedBuild !== build) {
          await registration.update().catch(() => {});
          reloadForUpdate();
        }
      } catch {
        // The current cached app remains usable while update checks are offline.
      }
    };
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', reloadForUpdate);
    window.addEventListener('online', checkDeploymentBuild);
    window.addEventListener('pageshow', checkDeploymentBuild);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkDeploymentBuild();
    });

    registration.update().catch(() => {});
    checkDeploymentBuild();
    setInterval(checkDeploymentBuild, 60000);
  }).catch(() => {});
}

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const liveReloadFiles = ['index.html', 'styles.css', 'app.js'];
  const liveReloadState = {};

  const readServerState = async (filePath) => {
    const response = await fetch(`${filePath}?v=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) return null;
    return response.headers.get('Last-Modified') || response.headers.get('ETag') || `${response.status}`;
  };

  const checkForLiveReload = async () => {
    const entries = await Promise.all(liveReloadFiles.map(async (filePath) => {
      const stamp = await readServerState(filePath);
      return [filePath, stamp || 'missing'];
    }));

    const changed = entries.some(([filePath, stamp]) => {
      const previous = liveReloadState[filePath];
      liveReloadState[filePath] = stamp;
      return previous && previous !== stamp;
    });

    if (changed) {
      window.location.reload();
    }
  };

  liveReloadFiles.forEach((filePath) => {
    liveReloadState[filePath] = null;
  });

  setInterval(checkForLiveReload, 1800);
}

// Keeps the top-right date live (weekday, day, month, year), rolling over automatically at midnight/new year.
function updateTopbarDate(date = new Date()) {
  const todayDateEl = document.querySelector('#todayDate');
  if (!todayDateEl) return;
  const weekdayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const monthNames = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
  todayDateEl.textContent = `${weekdayNames[date.getDay()]} ${date.getDate()}. ${monthNames[date.getMonth()]} ${date.getFullYear()}`.toUpperCase();
}
function scheduleTopbarDateUpdate() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  window.setTimeout(() => { updateTopbarDate(); scheduleTopbarDateUpdate(); }, nextMidnight - now);
}
function syncTopbarWithWorkoutDate() {
  if (!workoutDateInput) return;
  const rawValue = workoutDateInput.value.trim();
  const selectedDate = rawValue ? parseWorkoutDateInput(rawValue) : new Date();
  updateTopbarDate(selectedDate);
}
updateTopbarDate();
scheduleTopbarDateUpdate();

// Counts consecutive days the app has been opened; resets once a full day is skipped.
function updateStreak() {
  const streakEl = document.querySelector('#streakCount');
  if (!streakEl) return;
  const toDateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = new Date();
  const todayKey = toDateKey(today);
  const lastDateKey = localStorage.getItem('formlyStreakLastDate');
  let streak = Number(localStorage.getItem('formlyStreakCount') || 0);
  if (lastDateKey !== todayKey) {
    if (lastDateKey === null) {
      streak = 1;
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      streak = lastDateKey === toDateKey(yesterday) ? streak + 1 : 0;
    }
    localStorage.setItem('formlyStreakCount', String(streak));
    localStorage.setItem('formlyStreakLastDate', todayKey);
  }
  streakEl.textContent = String(streak).padStart(2, '0');
}
updateStreak();

// Lets the user download every formly* localStorage key as one JSON file, and restore it later.
function getBackupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('formly')) data[key] = localStorage.getItem(key);
  }
  return data;
}
const exportBackupButton = document.querySelector('#exportBackup');
const importBackupInput = document.querySelector('#importBackupInput');
exportBackupButton?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(getBackupData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aio-fitness-backup-${getIsoDateValue()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Backup gemt som fil');
});
importBackupInput?.addEventListener('change', () => {
  const file = importBackupInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      Object.entries(data).forEach(([key, value]) => { if (key.startsWith('formly')) localStorage.setItem(key, value); });
      showToast('Backup gendannet - genindlæser...');
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      showToast('Kunne ikke læse backup-filen');
    }
  };
  reader.readAsText(file);
  importBackupInput.value = '';
});

// Swaps the welcome greeting based on time of day (morning/formiddag/eftermiddag/aften).
function getUserName() {
  return localStorage.getItem('formlyName') || '';
}
function updateGreeting() {
  const greetingEl = document.querySelector('#greetingText');
  if (!greetingEl) return;
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Godmorgen' : hour < 12 ? 'God formiddag' : hour < 18 ? 'God eftermiddag' : 'God aften';
  const name = getUserName();
  greetingEl.textContent = name ? `${greeting}, ${name}` : greeting;
}
updateGreeting();
window.setInterval(updateGreeting, 15 * 60 * 1000);
const startButton = document.querySelector('#startWorkout');
const exerciseOptions = ['Barbell squat', 'Front squat', 'Back squat', 'Deadlift', 'Sumo deadlift', 'Romanian deadlift', 'Stiff-leg deadlift', 'Bench press', 'Incline bench press', 'Decline bench press', 'Overhead press', 'Push press', 'Barbell row', 'Pendlay row', 'T-bar row', 'Pull-up', 'Chin-up', 'Dips', 'Push-up', 'Goblet squat', 'Dumbbell press', 'Dumbbell incline press', 'Dumbbell row', 'Dumbbell shoulder press', 'Dumbbell lateral raise', 'Dumbbell front raise', 'Dumbbell rear delt fly', 'Dumbbell curl', 'Incline dumbbell curl', 'Hammer curl', 'Kettlebell swing', 'Kettlebell clean', 'Turkish get-up', 'Leg press machine', 'Hack squat machine', 'Chest press machine', 'Pec deck machine', 'Shoulder press machine', 'Lat pulldown machine', 'Seated row machine', 'Cable crossover', 'Cable fly', 'Cable curl', 'Face pull', 'Triceps pushdown', 'Overhead triceps extension', 'Leg extension machine', 'Leg curl machine', 'Calf raise machine', 'Hip thrust', 'Glute bridge', 'Lunge', 'Walking lunge', 'Bulgarian split squat', 'Step-up', 'Sled push', 'Ab wheel rollout', 'Plank', 'Hanging leg raise', 'Cable crunch'];
const exerciseCategories = ['Bryst', 'Ryg', 'Ben', 'Skuldre', 'Arme', 'Core', 'Kondition', 'Fuldkrop'];
const exerciseCategoryOptions = exerciseCategories.map((category) => `<option value="${category}">${category}</option>`).join('');
function getExerciseCategory(exerciseName = '') {
  const name = String(exerciseName).toLowerCase();
  if (/bench|chest press|pec deck|cable fly|cable crossover|dumbbell press|push-up|dips/.test(name)) return 'Bryst';
  if (/row|deadlift|pull-up|chin-up|lat pulldown|face pull/.test(name)) return 'Ryg';
  if (/squat|leg press|leg extension|leg curl|lunge|calf|hip thrust|glute|step-up|sled/.test(name)) return 'Ben';
  if (/shoulder|overhead press|push press|lateral raise|front raise|rear delt/.test(name)) return 'Skuldre';
  if (/curl|triceps/.test(name)) return 'Arme';
  if (/plank|ab wheel|hanging leg|cable crunch|turkish get-up/.test(name)) return 'Core';
  if (/kettlebell/.test(name)) return 'Fuldkrop';
  return 'Fuldkrop';
}
const workoutFlow = document.createElement('div');
workoutFlow.className = 'workout-flow';
workoutFlow.innerHTML = '<div class="workout-flow-heading"><p class="eyebrow">WORKOUT FLOW</p><span>SESSION GUIDE</span></div><div class="workout-flow-steps"><button type="button" data-flow-target="#library"><b>01</b><strong>Vælg øvelse</strong><small>Find dagens bevægelse</small></button><button type="button" data-flow-target="#library"><b>02</b><strong>Registrér træning</strong><small>Kg · reps pr. sæt · arbejdssæt</small></button><button type="button" data-flow-target="#library"><b>03</b><strong>Hold pause</strong><small>Start rest-timeren</small></button><button type="button" data-flow-target="#library"><b>04</b><strong>Markér færdig</strong><small>Følg din progression</small></button></div>';
document.querySelector('#workout').after(workoutFlow);
workoutFlow.querySelectorAll('[data-flow-target]').forEach((step) => step.addEventListener('click', () => document.querySelector(step.dataset.flowTarget).scrollIntoView({ behavior: 'smooth', block: 'start' })));
const progressButton = document.querySelector('#viewProgress');
const workoutDateInput = document.querySelector('#workoutDateInput');

function repairWorkoutHistory(logEntries) {
  if (!Array.isArray(logEntries)) return [];
  return logEntries.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const hasTimestamp = typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp);
    const hasDate = typeof entry.date === 'string' && entry.date.trim();
    if (hasTimestamp && hasDate) return entry;
    if (!hasDate && hasTimestamp) entry.date = formatWorkoutDate(new Date(entry.timestamp));
    if (!hasTimestamp && hasDate) entry.timestamp = parseWorkoutDateInput(entry.date).getTime();
    if (!entry.date && !entry.timestamp) entry.date = formatWorkoutDate(new Date());
    if (!entry.timestamp && entry.date) entry.timestamp = parseWorkoutDateInput(entry.date).getTime();
    return entry;
  });
}

const workoutLog = repairWorkoutHistory(JSON.parse(localStorage.getItem('formlyWorkoutLog') || '[]'));

function normalizeSessionDate(sessionNumber, dateValue) {
  const selectedDate = dateValue instanceof Date ? dateValue : parseWorkoutDateInput(dateValue);
  const loggedDate = formatWorkoutDate(selectedDate);
  return { timestamp: selectedDate.getTime(), date: loggedDate };
}

localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));

function getIsoDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function parseWorkoutDateInput(rawValue) {
  const value = String(rawValue || getIsoDateValue()).trim();
  const danishMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const isoValue = danishMatch ? `${danishMatch[3]}-${danishMatch[2].padStart(2, '0')}-${danishMatch[1].padStart(2, '0')}` : value;
  const date = new Date(`${isoValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function formatWorkoutDate(value) {
  const date = value instanceof Date ? value : parseWorkoutDateInput(value);
  return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}
if (workoutDateInput) {
  workoutDateInput.value = getIsoDateValue();
  workoutDateInput.addEventListener('input', syncTopbarWithWorkoutDate);
  workoutDateInput.addEventListener('change', syncTopbarWithWorkoutDate);
}
updateTopbarDate(new Date());
const benchHistoryEndDate = new Date(2026, 7, 24, 12, 0, 0, 0);
const getBenchSessionTimestamp = (session) => {
  const date = new Date(benchHistoryEndDate);
  date.setDate(benchHistoryEndDate.getDate() - ((Number(session) - 1) * 4));
  return date.getTime();
};
const getBenchSessionDate = (session) => {
  return new Date(getBenchSessionTimestamp(session)).toLocaleDateString('da-DK');
};
function getActualSessionDate(sessionNumber, exerciseName = '') {
  const session = Number(sessionNumber || 1);
  const entries = workoutLog.filter((entry) => Number(entry.session || 1) === session && (!exerciseName || entry.exercise.toLowerCase() === exerciseName.toLowerCase()));
  if (!entries.length) return '';
  const timestamps = entries.map((entry) => getProgressTimestamp(entry)).filter((value) => Number.isFinite(value));
  if (!timestamps.length) return '';
  const latestTimestamp = Math.max(...timestamps);
  return new Date(latestTimestamp).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
const getProgressTimestamp = (entry) => {
  if (entry && typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) return entry.timestamp;
  if (entry && entry.date) {
    const dateString = String(entry.date).trim();
    const isoLike = dateString.includes('.') ? dateString.split('.').reverse().join('-') : dateString;
    const parsed = new Date(isoLike.includes('T') ? isoLike : `${isoLike}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  if (entry && entry.session) return getBenchSessionTimestamp(entry.session);
  return Date.now();
};
if (!localStorage.getItem('formlyBenchHistoryDatesV1')) {
  const benchHistory = workoutLog.filter((entry) => entry.exercise.toLowerCase() === 'bench press').slice().reverse();
  benchHistory.forEach((entry, index) => {
    if (!entry.date && !entry.timestamp) {
      const sessionDate = new Date(benchHistoryEndDate);
      sessionDate.setDate(benchHistoryEndDate.getDate() - ((benchHistory.length - index - 1) * 4));
      entry.session = index + 1;
      entry.timestamp = sessionDate.getTime();
      entry.date = sessionDate.toLocaleDateString('da-DK');
    }
  });
  localStorage.setItem('formlyBenchHistoryDatesV1', 'true');
  localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
}
if (!localStorage.getItem('formlyBenchHistorySessionsV2')) {
  const benchEntries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === 'bench press');
  const groups = [...benchEntries.reduce((map, entry) => { const key = entry.date || String(entry.timestamp || 'unknown'); if (!map.has(key)) map.set(key, []); map.get(key).push(entry); return map; }, new Map()).values()];
  groups.forEach((group, index) => {
    const sessionDate = new Date(benchHistoryEndDate);
    sessionDate.setDate(benchHistoryEndDate.getDate() - ((groups.length - index - 1) * 4));
    group.forEach((entry) => {
      if (!entry.date && !entry.timestamp) {
        entry.session = index + 1;
        entry.timestamp = sessionDate.getTime();
        entry.date = sessionDate.toLocaleDateString('da-DK');
      } else if (!entry.session) {
        entry.session = index + 1;
      }
    });
  });
  localStorage.setItem('formlyBenchHistorySessionsV2', 'true');
  localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
}
function recalculatePrStatus(entries = workoutLog) {
  const byExercise = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const key = String(entry.exercise || '').trim().toLowerCase();
    if (!key) return;
    const list = byExercise.get(key) || [];
    list.push(entry);
    byExercise.set(key, list);
  });
  byExercise.forEach((exerciseEntries) => {
    let bestWeight = 0;
    let bestRepsAtWeight = 0;
    const bestWeightByReps = new Map();
    [...exerciseEntries]
      .sort((a, b) => (getProgressTimestamp(a) || 0) - (getProgressTimestamp(b) || 0))
      .forEach((entry) => {
        const weight = Number(entry.weight) || 0;
        const reps = Number(entry.reps) || 0;
        const previousBestWeight = bestWeight;
        const previousBestReps = bestRepsAtWeight;
        const previousBestWeightAtTheseReps = bestWeightByReps.get(reps) || 0;
        const weightImprovement = weight > previousBestWeight;
        const sameRepsWeightImprovement = reps > 0 && weight > previousBestWeightAtTheseReps;
        const repsImprovement = weight === previousBestWeight && reps > previousBestReps;
        const isPr = weightImprovement || sameRepsWeightImprovement || repsImprovement;
        entry.isPR = Boolean(isPr);
        entry.prType = isPr ? (weightImprovement || sameRepsWeightImprovement ? 'Vægt-PR' : 'Reps-PR') : '';
        if (weightImprovement) {
          bestWeight = weight;
          bestRepsAtWeight = reps;
        } else if (weight === previousBestWeight && reps > previousBestReps) {
          bestRepsAtWeight = reps;
        }
        if (reps > 0 && weight > (bestWeightByReps.get(reps) || 0)) {
          bestWeightByReps.set(reps, weight);
        }
      });
  });
}
recalculatePrStatus(workoutLog);
localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
let activeWorkoutSession = Math.max(1, Math.min(20000, Number(localStorage.getItem('formlyActiveWorkoutSession') || 1)));
let sessionStarted = false;
const stepsInput = document.querySelector('#stepsInput');
const stepsValue = document.querySelector('#stepsValue');
const stepKcalResult = document.querySelector('#stepKcalResult');
const exactStepsInput = document.querySelector('#exactStepsInput');
const goalTabs = document.querySelectorAll('#goalTabs button');
const intensitySelect = document.querySelector('#intensitySelect');
const maintenanceInput = document.querySelector('#maintenanceInput');
const trainingWeekSelect = document.querySelector('#trainingWeekSelect');
const goalCalories = document.querySelector('#goalCalories');
const goalChange = document.querySelector('#goalChange');
const goalPros = document.querySelector('#goalPros');
const goalCons = document.querySelector('#goalCons');
const profileWeight = document.querySelector('#profileWeight');
const profileHeight = document.querySelector('#profileHeight');
const profileAge = document.querySelector('#profileAge');
const profileSex = document.querySelector('#profileSex');
const profileSummary = document.querySelector('#profileSummary');
const profileName = document.querySelector('#profileName');

// Reflects the typed-in name everywhere it's shown (sidebar, greeting, coach).
function applyUserName(name) {
  const trimmed = (name || '').trim();
  const sidebarNameInput = document.querySelector('#sidebarNameInput');
  const sidebarInitial = document.querySelector('#sidebarInitial');
  if (sidebarInitial) sidebarInitial.textContent = trimmed ? trimmed.charAt(0).toUpperCase() : '+';
  [profileName, sidebarNameInput].forEach((input) => {
    if (input && document.activeElement !== input && input.value !== trimmed) input.value = trimmed;
  });
  updateGreeting();
}
function handleNameInput(event) {
  localStorage.setItem('formlyName', event.target.value);
  applyUserName(event.target.value);
}
[profileName, document.querySelector('#sidebarNameInput')].forEach((input) => {
  if (!input) return;
  input.value = getUserName();
  input.addEventListener('input', handleNameInput);
});
applyUserName(getUserName());

function restorePersistedInput(input, key, eventName = 'input') {
  if (!input) return;
  const saved = localStorage.getItem(key);
  if (saved !== null && saved !== '') {
    input.value = saved;
  }
  input.addEventListener(eventName, () => {
    const value = input.value ?? '';
    localStorage.setItem(key, String(value));
  });
}
restorePersistedInput(profileWeight, 'formlyProfileWeight');
restorePersistedInput(profileHeight, 'formlyProfileHeight');
restorePersistedInput(profileAge, 'formlyProfileAge');
restorePersistedInput(profileSex, 'formlyProfileSex', 'change');
restorePersistedInput(document.querySelector('#profileWeightGoal'), 'formlyProfileWeightGoal');
if ((!localStorage.getItem('formlyProfileWeight') || localStorage.getItem('formlyProfileWeight') === '70') && !localStorage.getItem('formlyWeight') && !localStorage.getItem('formlyWeightHistory')) {
  profileWeight.value = '00';
  localStorage.removeItem('formlyProfileWeight');
}
restorePersistedInput(stepsInput, 'formlySteps');
restorePersistedInput(exactStepsInput, 'formlyExactSteps');
restorePersistedInput(trainingWeekSelect, 'formlyTrainingDays', 'change');
restorePersistedInput(intensitySelect, 'formlyIntensity', 'change');
restorePersistedInput(maintenanceInput, 'formlyMaintenance');
const calculateGoals = document.querySelector('#calculateGoals');
const syncHealth = document.querySelector('#syncHealth');
const healthStatus = document.querySelector('#healthStatus');
const healthSteps = document.querySelector('#healthSteps');
const sessionComplete = document.querySelector('#sessionComplete');
function updateMaintenance() {
  const weight = Number(profileWeight.value) || 0;
  const height = Number(profileHeight.value) || 0;
  const age = Number(profileAge.value) || 0;
  const sex = profileSex.value === 'male' ? 'male' : 'female';
  const baseTdee = sex === 'male'
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161;
  const activityBoost = Math.min(Number(stepsInput.value || 0), 20000) / 20000;
  const maintenanceEstimate = Math.round(baseTdee * (1.1 + activityBoost * 0.4));
  maintenanceInput.value = maintenanceEstimate;
  if (weight > 0) localStorage.setItem('formlyProfileWeight', String(profileWeight.value || ''));
  localStorage.setItem('formlyProfileHeight', String(profileHeight.value || ''));
  localStorage.setItem('formlyProfileAge', String(profileAge.value || ''));
  localStorage.setItem('formlyProfileSex', String(profileSex.value || 'male'));
  localStorage.setItem('formlyTrainingDays', String(trainingWeekSelect?.value || localStorage.getItem('formlyTrainingDays') || 3));
  localStorage.setItem('formlyMaintenance', String(maintenanceInput.value || ''));
  const adjustment = getGoalAdjustment();
  const target = Number(maintenanceInput.value) + adjustment;
  profileSummary.textContent = `${target.toLocaleString('da-DK')} kcal · ${getIntensityData().pros}`;
  updateIntensityLabels();
  updateGoal();
}
const savedHealth = JSON.parse(localStorage.getItem('formlyHealthOverview') || '{}');
if (savedHealth.steps) {
  stepsInput.value = Math.min(20000, Number(savedHealth.steps));
  exactStepsInput.value = Number(savedHealth.steps);
  healthSteps.innerHTML = `${Number(savedHealth.steps).toLocaleString('da-DK')} <small>steps</small>`;
  healthStatus.textContent = 'Data indlæst fra Apple Watch og appen Sundhed';
} else {
  const savedSteps = localStorage.getItem('formlySteps');
  if (savedSteps) {
    stepsInput.value = Math.min(20000, Number(savedSteps));
    exactStepsInput.value = Number(savedSteps);
  }
}
const coachPanel = document.createElement('section');
coachPanel.className = 'coach-panel';
coachPanel.innerHTML = `
  <div class="coach-header">
    <div>
      <p class="eyebrow">ALL IN ONE FITNESS COACH</p>
      <h2>Din AI-coach</h2>
      <p>Personlige svar baseret på din træning, kost og udvikling.</p>
    </div>
    <span class="coach-mark" aria-hidden="true">AI</span>
  </div>
  <div class="coach-status-bar">
    <div class="coach-status-indicator"><i aria-hidden="true"></i><span id="coachStatus" class="coach-status">AI er klar</span></div>
    <div id="aiProviderStatus" class="coach-provider-status">Kontrollerer AI-status...</div>
  </div>
  <div id="coachProGate" class="pro-inline-gate">
    <div><span>PRO ONLINE</span><strong>AI-coach kræver Pro</strong><small>Personlig AI og billedanalyse · 39 kr./måned</small></div>
    <button type="button" data-open-pro>Se Pro</button>
  </div>
  <div class="coach-layout">
    <div class="coach-conversation">
      <div class="coach-conversation-heading"><span>SENESTE SVAR</span><small>Personlig analyse</small></div>
      <div class="coach-chat-body">
        <div class="coach-message coach-message-ai">
          <span class="coach-message-label">AI</span>
          <div id="coachAnswer" class="coach-answer">Hej${getUserName() ? ` ${getUserName()}` : ''}. Hvad vil du gerne have analyseret?</div>
        </div>
      </div>
      <form id="coachForm" class="coach-form">
        <input id="coachQuestion" aria-label="Spørg din AI-coach" placeholder="Spørg om træning, kost eller din udvikling" autocomplete="off">
        <button type="submit">Send spørgsmål</button>
      </form>
    </div>
    <aside class="coach-tools">
      <div class="coach-tools-heading"><span>HURTIGE ANALYSER</span><strong>Vælg et fokus</strong></div>
      <div class="coach-suggestions">
        <button type="button" data-accent="orange" data-question="Hvor mange kcal har jeg tilbage i dag?"><span>KOST</span><strong>Kcal-status</strong></button>
        <button type="button" data-accent="green" data-question="Hvordan udvikler min fysik sig?"><span>UDVIKLING</span><strong>Fysikudvikling</strong></button>
        <button type="button" data-accent="coral" data-question="Vurder min seneste fysikmåling med fordele og ulemper."><span>VURDERING</span><strong>Vurder fysik</strong></button>
        <button type="button" data-accent="blue" data-question="Hvordan ligger mine steps i dag?"><span>AKTIVITET</span><strong>Stepstatus</strong></button>
        <button type="button" data-accent="green" data-question="Hvad bør jeg træne i dag?"><span>TRÆNING</span><strong>Dagens træning</strong></button>
      </div>
      <details class="coach-settings">
        <summary>AI-forbindelse</summary>
        <label for="aiEndpointInput">AI-server</label>
        <div class="coach-server-row"><input id="aiEndpointInput" type="url" value="" placeholder="https://din-backend.com"><button type="button" id="aiEndpointApply">Gem</button></div>
      </details>
    </aside>
  </div>`;
document.querySelector('.welcome').after(coachPanel);

const proAccessButton = document.createElement('button');
proAccessButton.type = 'button';
proAccessButton.id = 'proAccessButton';
proAccessButton.className = 'pro-access-button';
proAccessButton.textContent = 'PRO · 39 KR';
document.body.append(proAccessButton);

const proAccessDialog = document.createElement('div');
proAccessDialog.id = 'proAccessDialog';
proAccessDialog.className = 'pro-access-dialog';
proAccessDialog.hidden = true;
proAccessDialog.innerHTML = `
  <section class="pro-access-sheet" role="dialog" aria-modal="true" aria-labelledby="proAccessTitle">
    <button type="button" class="pro-access-close" aria-label="Luk">×</button>
    <div class="pro-access-heading">
      <span>AIO PRO</span>
      <h2 id="proAccessTitle">Online coaching, på din konto</h2>
      <p>Gratisdelen fortsætter som før. Pro åbner de funktioner, der bruger online AI.</p>
    </div>
    <div class="pro-access-price"><strong>39</strong><span>kr.<small>pr. måned</small></span></div>
    <ul class="pro-access-features">
      <li><b>60</b><span>personlige AI-coachbeskeder hver måned</span></li>
      <li><b>4</b><span>3-vinkels fysikanalyser hver måned</span></li>
      <li><b>Fri</b><span>træning, mad, vægt og Withings uden abonnement</span></li>
    </ul>
    <div class="pro-auth-panel">
      <div id="proAuthGuest">
        <div class="pro-auth-tabs" role="tablist" aria-label="Konto">
          <button type="button" class="active" data-auth-mode="login" role="tab" aria-selected="true">Log ind</button>
          <button type="button" data-auth-mode="signup" role="tab" aria-selected="false">Opret konto</button>
        </div>
        <form id="proAuthForm" class="pro-auth-form">
          <label>E-mail<input id="proAuthEmail" type="email" autocomplete="email" required></label>
          <label>Adgangskode<input id="proAuthPassword" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label>
          <button id="proAuthSubmit" type="submit">Log ind</button>
        </form>
      </div>
      <div id="proAuthAccount" class="pro-auth-account" hidden>
        <div><span>KONTO</span><strong id="proAuthEmailLabel"></strong></div>
        <button id="proAuthLogout" type="button">Log ud</button>
      </div>
      <small id="proAuthStatus" class="pro-auth-status" role="status">Log ind for at aktivere eller administrere Pro.</small>
    </div>
    <div id="proUsageSummary" class="pro-usage-summary" hidden></div>
    <button type="button" id="startProCheckout" class="pro-checkout-button">Start Pro for 39 kr./måned</button>
    <small id="proCheckoutStatus" class="pro-checkout-status">Sikker betaling håndteres af Stripe. Opsig når som helst.</small>
  </section>`;
document.body.append(proAccessDialog);

const proCheckoutButton = proAccessDialog.querySelector('#startProCheckout');
const proCheckoutStatus = proAccessDialog.querySelector('#proCheckoutStatus');
const proUsageSummary = proAccessDialog.querySelector('#proUsageSummary');
const proAuthGuest = proAccessDialog.querySelector('#proAuthGuest');
const proAuthAccount = proAccessDialog.querySelector('#proAuthAccount');
const proAuthForm = proAccessDialog.querySelector('#proAuthForm');
const proAuthEmail = proAccessDialog.querySelector('#proAuthEmail');
const proAuthPassword = proAccessDialog.querySelector('#proAuthPassword');
const proAuthSubmit = proAccessDialog.querySelector('#proAuthSubmit');
const proAuthEmailLabel = proAccessDialog.querySelector('#proAuthEmailLabel');
const proAuthStatus = proAccessDialog.querySelector('#proAuthStatus');
const proAuthLogout = proAccessDialog.querySelector('#proAuthLogout');
let authMode = 'login';

function openProAccess() {
  proAccessDialog.hidden = false;
  document.body.classList.add('pro-dialog-open');
  proAccessDialog.querySelector('.pro-access-close').focus();
}

function closeProAccess() {
  proAccessDialog.hidden = true;
  document.body.classList.remove('pro-dialog-open');
}

function setAuthMode(mode) {
  authMode = mode === 'signup' ? 'signup' : 'login';
  proAccessDialog.querySelectorAll('[data-auth-mode]').forEach((button) => {
    const active = button.dataset.authMode === authMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  proAuthPassword.autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  proAuthSubmit.textContent = authMode === 'signup' ? 'Opret gratis konto' : 'Log ind';
  authState.notice = authMode === 'signup' ? 'Din gratis konto koster ingenting. Pro vælges separat.' : '';
  updateAuthUi();
}

function updateAuthUi() {
  proAuthGuest.hidden = authState.authenticated;
  proAuthAccount.hidden = !authState.authenticated;
  proAuthEmailLabel.textContent = authState.user?.email || '';
  if (authState.authenticated) {
    proAuthStatus.textContent = billingState.isPro ? 'Din konto har aktiv Pro-adgang.' : 'Kontoen er klar. Du kan nu vælge Pro.';
  } else if (authState.notice) {
    proAuthStatus.textContent = authState.notice;
  } else if (!authState.loaded) {
    proAuthStatus.textContent = 'Kontrollerer konto...';
  } else if (!authState.configured) {
    proAuthStatus.textContent = 'Konto-login klargøres.';
  } else {
    proAuthStatus.textContent = 'Log ind for at aktivere eller administrere Pro.';
  }
}

function requireFreshLogin() {
  setAuthMode('login');
  authState.authenticated = false;
  authState.user = null;
  authState.notice = 'Din session er udløbet. Log ind igen.';
  billingState.isPro = false;
  updateBillingUi();
  openProAccess();
  proAuthEmail.focus();
}

function updateBillingUi() {
  const hasOnlineAccess = authState.authenticated && billingState.isPro;
  document.body.classList.toggle('has-pro-access', hasOnlineAccess);
  proAccessButton.textContent = !authState.authenticated ? 'LOG IND · PRO' : hasOnlineAccess ? 'PRO AKTIV' : 'PRO · 39 KR';
  proAccessButton.classList.toggle('is-active', billingState.isPro);
  coachPanel.classList.toggle('is-pro-locked', !hasOnlineAccess);
  const coachGate = coachPanel.querySelector('#coachProGate');
  if (coachGate) coachGate.hidden = hasOnlineAccess;
  coachPanel.querySelectorAll('#coachForm input, #coachForm button, .coach-suggestions button').forEach((control) => {
    control.disabled = !hasOnlineAccess;
  });
  const physiquePanel = document.querySelector('#physique-ai');
  if (physiquePanel) {
    physiquePanel.classList.toggle('is-pro-locked', !hasOnlineAccess);
    const gate = physiquePanel.querySelector('#physiqueProGate');
    if (gate) gate.hidden = hasOnlineAccess;
    const analyzeButton = physiquePanel.querySelector('#physiqueAnalyzeBtn');
    const readyPhotos = [...physiquePanel.querySelectorAll('.physique-angle-card')].filter((card) => card.classList.contains('is-ready')).length;
    if (analyzeButton) analyzeButton.disabled = !hasOnlineAccess || readyPhotos < 3;
  }
  if (!authState.authenticated) {
    proUsageSummary.hidden = true;
    proCheckoutButton.textContent = 'Log ind for at fortsætte';
    proCheckoutButton.disabled = !authState.configured;
    proCheckoutStatus.textContent = 'En konto sikrer, at abonnementet tilhører dig på tværs af enheder.';
  } else if (billingState.isPro) {
    proUsageSummary.hidden = false;
    proUsageSummary.innerHTML = `<strong>Din Pro-kvote</strong><span>${billingState.remaining.coach} coachbeskeder · ${billingState.remaining.vision} fysikanalyser tilbage</span>`;
    proCheckoutButton.textContent = 'Administrér Pro';
    proCheckoutButton.disabled = !billingState.configured;
    proCheckoutStatus.textContent = 'Se betalinger, skift kort eller opsig sikkert hos Stripe.';
  } else {
    proUsageSummary.hidden = true;
    proCheckoutButton.textContent = 'Start Pro for 39 kr./måned';
    proCheckoutButton.disabled = !billingState.configured;
    proCheckoutStatus.textContent = billingState.configured
      ? 'Sikker betaling håndteres af Stripe. Opsig når som helst.'
      : 'Betaling klargøres. Ingen betaling kan gennemføres endnu.';
  }
  updateAuthUi();
}

function applyBillingStatus(status) {
  if (!status) return;
  billingState.loaded = true;
  billingState.configured = Boolean(status.configured);
  billingState.isPro = Boolean(status.is_pro);
  billingState.priceDkk = Number(status.price_dkk) || 39;
  billingState.limits = status.limits || billingState.limits;
  billingState.remaining = status.remaining || billingState.remaining;
  updateBillingUi();
}

async function loadBillingStatus() {
  const params = new URLSearchParams(window.location.search);
  const checkoutState = params.get('checkout');
  const sessionId = params.get('session_id');
  if (!authState.authenticated) {
    billingState.loaded = true;
    billingState.isPro = false;
    updateBillingUi();
    return;
  }
  try {
    let response;
    if (checkoutState === 'success' && sessionId) {
      response = await fetch('/api/billing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
    } else {
      response = await fetch('/api/billing/status', { cache: 'no-store' });
    }
    const result = await response.json();
    if (response.status === 401) {
      requireFreshLogin();
    }
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'billing-unavailable');
    applyBillingStatus(result);
    if (checkoutState === 'success') {
      showToast('Pro er aktivt. Velkommen til online coaching.');
      openProAccess();
    }
  } catch {
    billingState.loaded = true;
    updateBillingUi();
    if (checkoutState === 'success') showToast('Betalingen kontrolleres stadig. Prøv igen om lidt.');
  } finally {
    if (checkoutState) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('checkout');
      cleanUrl.searchParams.delete('session_id');
      history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }
}

async function loadAuthSession() {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error('auth-unavailable');
    authState.loaded = true;
    authState.configured = Boolean(result.configured);
    authState.authenticated = Boolean(result.authenticated);
    authState.user = result.user || null;
    authState.notice = '';
    billingState.configured = Boolean(result.billing_configured);
  } catch {
    authState.loaded = true;
    authState.authenticated = false;
    authState.user = null;
  }
  updateBillingUi();
}

async function loadAccountState() {
  await loadAuthSession();
  await loadBillingStatus();
}

async function consumeAuthRedirect() {
  if (!window.location.hash.includes('=')) return false;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const refreshToken = fragment.get('refresh_token');
  const authError = fragment.get('error_description');
  if (!refreshToken && !authError) return false;
  history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#top`);
  openProAccess();
  if (authError) {
    authState.loaded = true;
    authState.notice = 'Bekræftelseslinket er ugyldigt eller udløbet. Log ind eller opret kontoen igen.';
    updateBillingUi();
    return true;
  }
  try {
    const response = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const result = await response.json();
    if (!response.ok || !result?.authenticated) throw new Error('confirmation-failed');
    authState.loaded = true;
    authState.configured = true;
    authState.authenticated = true;
    authState.user = result.user || null;
    authState.notice = '';
    await loadBillingStatus();
    showToast('Din konto er bekræftet og logget ind.');
  } catch {
    authState.loaded = true;
    authState.notice = 'Bekræftelsen kunne ikke gennemføres. Prøv at logge ind.';
    updateBillingUi();
  }
  return true;
}

async function initializeAccountState() {
  const consumedRedirect = await consumeAuthRedirect();
  if (!consumedRedirect) await loadAccountState();
}

proAccessButton.addEventListener('click', openProAccess);
document.querySelectorAll('[data-open-pro]').forEach((button) => button.addEventListener('click', openProAccess));
proAccessDialog.querySelector('.pro-access-close').addEventListener('click', closeProAccess);
proAccessDialog.addEventListener('click', (event) => {
  if (event.target === proAccessDialog) closeProAccess();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !proAccessDialog.hidden) closeProAccess();
});
proAccessDialog.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
proAuthForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  proAuthSubmit.disabled = true;
  proAuthSubmit.textContent = authMode === 'signup' ? 'Opretter konto...' : 'Logger ind...';
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: proAuthEmail.value.trim(), password: proAuthPassword.value })
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'Login kunne ikke gennemføres.');
    proAuthPassword.value = '';
    if (result.authenticated) {
      authState.authenticated = true;
      authState.user = result.user || null;
      authState.notice = '';
      await loadBillingStatus();
    } else {
      authState.notice = 'Tjek din e-mail og bekræft kontoen. Åbn derefter appen igen.';
    }
  } catch (error) {
    authState.notice = error.message;
  } finally {
    proAuthSubmit.disabled = false;
    proAuthSubmit.textContent = authMode === 'signup' ? 'Opret gratis konto' : 'Log ind';
    updateBillingUi();
  }
});
proAuthLogout.addEventListener('click', async () => {
  proAuthLogout.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('logout-failed');
    authState.authenticated = false;
    authState.user = null;
    billingState.isPro = false;
    billingState.remaining = { coach: 0, vision: 0 };
    setAuthMode('login');
    updateBillingUi();
  } catch {
    showToast('Logout kunne ikke gennemføres. Prøv igen.');
  } finally {
    proAuthLogout.disabled = false;
  }
});
proCheckoutButton.addEventListener('click', async () => {
  if (!authState.authenticated) {
    proAuthEmail.focus();
    return;
  }
  if (!billingState.configured) return;
  proCheckoutButton.disabled = true;
  proCheckoutButton.textContent = billingState.isPro ? 'Åbner Pro-indstillinger...' : 'Åbner sikker betaling...';
  try {
    const response = await fetch(billingState.isPro ? '/api/billing/portal' : '/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const result = await response.json();
    if (response.status === 401) {
      requireFreshLogin();
      return;
    }
    if (!response.ok || !result?.url) throw new Error(result?.message || 'checkout-unavailable');
    window.location.assign(result.url);
  } catch (error) {
    proCheckoutStatus.textContent = error.message === 'checkout-unavailable' ? 'Betaling kunne ikke åbnes. Prøv igen.' : error.message;
    proCheckoutButton.textContent = billingState.isPro ? 'Administrér Pro' : 'Start Pro for 39 kr./måned';
    proCheckoutButton.disabled = false;
  }
});
initializeAccountState();

const dailyFocusCard = document.createElement('section');
dailyFocusCard.className = 'daily-focus-card';
dailyFocusCard.innerHTML = `
  <div class="daily-focus-header">
    <p class="eyebrow">DAGLIG FOKUS</p>
    <h3>3 mål for i dag</h3>
  </div>
  <div class="daily-focus-grid">
    <div class="daily-focus-item">
      <span>Steps</span>
      <strong id="dailyFocusSteps">0</strong>
    </div>
    <div class="daily-focus-item">
      <span>Protein</span>
      <strong id="dailyFocusProtein">0 g</strong>
    </div>
    <div class="daily-focus-item">
      <span>Træning</span>
      <strong id="dailyFocusWorkout">0/3</strong>
    </div>
  </div>
`;
document.querySelector('.welcome')?.after(dailyFocusCard);

const dailyQuickActions = document.createElement('section');
dailyQuickActions.className = 'daily-quick-actions';
dailyQuickActions.innerHTML = `
  <div class="daily-quick-actions-header">
    <p class="eyebrow">HURTIGE HANDLINGER</p>
    <h3>Kom i gang</h3>
  </div>
  <div class="daily-quick-actions-grid">
    <button type="button" data-quick-action="#food"><span>🍽</span><strong>Mad</strong><small>Log måltid</small></button>
    <button type="button" data-quick-action="#workout"><span>🏋️</span><strong>Træning</strong><small>Start session</small></button>
    <button type="button" data-quick-action="#progress"><span>📈</span><strong>Fremskridt</strong><small>Se udvikling</small></button>
  </div>
`;
document.querySelector('.welcome')?.after(dailyQuickActions);
dailyQuickActions.querySelectorAll('[data-quick-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.querySelector(button.dataset.quickAction);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

function updateDailyFocus() {
  const focusSteps = document.querySelector('#dailyFocusSteps');
  const focusProtein = document.querySelector('#dailyFocusProtein');
  const focusWorkout = document.querySelector('#dailyFocusWorkout');
  if (!focusSteps || !focusProtein || !focusWorkout) return;

  const stepTarget = Number(stepsInput?.value || 0);
  const proteinTarget = Number(profileWeight.value || 0) * 1.8;
  const foodProtein = foodEntries
    .filter((entry) => entry.date === foodDateKey(selectedFoodDate))
    .reduce((total, entry) => total + Number(entry.protein || 0), 0);
  const plannedWorkouts = Number(trainingWeekSelect?.value || 3);

  focusSteps.textContent = `${Number(stepTarget).toLocaleString('da-DK')} steps`;
  focusProtein.textContent = `${Math.round(foodProtein).toLocaleString('da-DK')} / ${Math.round(proteinTarget).toLocaleString('da-DK')} g`;
  focusWorkout.textContent = `${Math.min(plannedWorkouts, 3)}/3`;
}

function normalizeCoachEndpoint(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '/api/coach';

  if (/\/api\/chat$/i.test(trimmed) || /\/api\/coach$/i.test(trimmed)) {
    return trimmed.replace(/\/api\/chat$/i, '/api/coach').replace(/\/api\/coach$/i, '/api/coach');
  }

  return trimmed.endsWith('/') ? `${trimmed}api/coach` : `${trimmed}/api/coach`;
}

function getCoachEndpoint() {
  const savedEndpoint = localStorage.getItem('formlyAiEndpoint');
  const selected = savedEndpoint ? savedEndpoint : document.querySelector('#aiEndpointInput')?.value || '';
  return normalizeCoachEndpoint(selected);
}

function getHealthEndpoint() {
  const stored = localStorage.getItem('formlyAiEndpoint');
  if (!stored) return '/api/health';
  const base = String(stored).trim();
  if (!base) return '/api/health';
  const normalized = normalizeCoachEndpoint(base).replace(/\/api\/coach$/i, '/api/health');
  return normalized;
}

const aiEndpointInput = document.querySelector('#aiEndpointInput');
const aiEndpointApply = document.querySelector('#aiEndpointApply');
const savedAiEndpoint = localStorage.getItem('formlyAiEndpoint');
if (savedAiEndpoint && aiEndpointInput) {
  aiEndpointInput.value = savedAiEndpoint;
}

aiEndpointApply?.addEventListener('click', () => {
  const value = aiEndpointInput?.value.trim() || '';
  localStorage.setItem('formlyAiEndpoint', value);
  updateAiProviderStatus();
  showToast(value ? 'AI-server gemt' : 'AI-server nulstillet');
});
aiEndpointInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    aiEndpointApply?.click();
  }
});

async function updateAiProviderStatus() {
  const providerStatus = document.querySelector('#aiProviderStatus');
  if (!providerStatus) return;

  try {
    const response = await fetch(getHealthEndpoint(), { cache: 'no-store' });
    const data = await response.json();
    if (!data || !data.status) throw new Error('health-missing');

    const providerLabel = data.provider === 'openai' ? 'Global AI aktiv' : data.provider === 'ollama' ? 'Lokal AI aktiv' : 'AI-nøgle mangler';
    const modelLabel = data.model ? ` · ${data.model}` : '';
    providerStatus.textContent = `${providerLabel}${modelLabel}`;
    providerStatus.dataset.provider = data.provider || 'fallback';
  } catch {
    providerStatus.textContent = 'AI-server offline';
    providerStatus.dataset.provider = 'offline';
  }
}

updateAiProviderStatus();
const overviewQuickLinks = document.createElement('nav');
overviewQuickLinks.className = 'overview-quick-links';
overviewQuickLinks.setAttribute('aria-label', 'Hurtige genveje');
overviewQuickLinks.innerHTML = '<button type="button" data-quick-target="#food"><span>◒</span>Mad Tracker</button><button type="button" data-quick-target=".coach-panel"><span>AI</span>AI-coach</button><button type="button" data-quick-target=".profile-section"><span>◌</span>Kcal-mål</button><button type="button" data-quick-target="#library"><span>▦</span>Øvelsesbibliotek</button>';
document.querySelector('.topbar')?.after(overviewQuickLinks);
overviewQuickLinks.querySelectorAll('[data-quick-target]').forEach((button) => button.addEventListener('click', () => document.querySelector(button.dataset.quickTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
const overviewStatsGrid = document.querySelector('.stats-grid');
const overviewCategories = document.createElement('section');
overviewCategories.className = 'overview-categories';
overviewCategories.innerHTML = '<div class="overview-categories-heading"><p class="eyebrow">OVERSIGT</p><h2>Vælg en kategori</h2></div><div class="overview-category-grid"><button type="button" data-category-target="#workout"><strong>Træning</strong><span>Start session og markér øvelser</span></button><button type="button" data-category-target=".training-progress-panel" data-category-muscle="push"><strong>Push</strong><span>Bryst, skuldre og triceps</span></button><button type="button" data-category-target=".training-progress-panel" data-category-muscle="pull"><strong>Pull</strong><span>Ryg, biceps og træk</span></button><button type="button" data-category-target=".training-progress-panel" data-category-muscle="legs"><strong>Ben</strong><span>Lår, baller og lægge</span></button><button type="button" data-category-target="#food"><strong>Mad &amp; kcal</strong><span>Mad, makroer, steps og mål</span></button><button type="button" data-category-target="#weight"><strong>Krop</strong><span>Fysikudvikling, vægt og billeder</span></button><button type="button" data-category-target=".training-progress-panel"><strong>Progression</strong><span>Lineær udvikling i kg og 1RM</span></button><button type="button" data-category-target="#library"><strong>Øvelser</strong><span>Bibliotek, sessioner og log</span></button><button type="button" data-category-target=".coach-panel"><strong>AI-coach</strong><span>Vurdering, pros, cons og næste skridt</span></button></div>';
const overviewCategoryGrid = overviewCategories.querySelector('.overview-category-grid');
overviewCategoryGrid.insertAdjacentHTML('beforeend', '<button type="button" data-category-target="#profile"><strong>Kcal-beregner</strong><span>Personlige mål og kalorier</span></button><button type="button" data-category-target="#weight"><strong>Kropsvægt</strong><span>Vejninger og vægtudvikling</span></button><button type="button" data-category-target=".coach-panel"><strong>Coach</strong><span>AI-hjælp til hele din træning</span></button><button type="button" data-category-target="#physique-ai"><strong>Fysik vurdering AI</strong><span>Scan et billede og få en fysikvurdering</span></button>');
const trainingCategoryGroup = document.createElement('div');
trainingCategoryGroup.className = 'overview-training-category-group';
trainingCategoryGroup.innerHTML = '<p class="eyebrow">TRÆNING OPDELT</p><h3>Vælg fokusområde</h3><div class="overview-training-grid"></div>';
const trainingGrid = trainingCategoryGroup.querySelector('.overview-training-grid');
overviewCategoryGrid.querySelectorAll('[data-category-muscle]').forEach((button) => trainingGrid.append(button));
trainingGrid.insertAdjacentHTML('beforeend', '<button type="button" data-category-target="#workout"><strong>Core</strong><span>Mave, stabilitet og holdning</span></button><button type="button" data-category-target="#workout"><strong>Kondition</strong><span>Puls, cardio og udholdenhed</span></button><button type="button" data-category-target="#workout"><strong>Mobilitet</strong><span>Bevægelighed og restitution</span></button><button type="button" data-category-target="#workout"><strong>Styrke</strong><span>Progressive løft og belastning</span></button>');
trainingCategoryGroup.remove();
if (overviewQuickLinks) overviewQuickLinks.before(overviewCategories);
else overviewStatsGrid?.before(overviewCategories);
overviewCategories.querySelectorAll('[data-category-target]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(button.dataset.categoryTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const muscle = button.dataset.categoryMuscle;
  if (muscle) document.querySelector(`.training-progress-panel .training-tabs [data-muscle="${muscle}"]`)?.click();
}));
const coachAnswer = coachPanel.querySelector('#coachAnswer');
const coachConversationKey = 'formlyCoachConversation';
const coachConversation = JSON.parse(localStorage.getItem(coachConversationKey) || '[]');
const testMessagesRemoved = coachConversation.filter((item) => /ollama|test svar/i.test(String(item.answer || ''))).length;
if (testMessagesRemoved) {
  for (let index = coachConversation.length - 1; index >= 0; index -= 1) {
    if (/ollama|test svar/i.test(String(coachConversation[index].answer || ''))) coachConversation.splice(index, 1);
  }
  localStorage.setItem(coachConversationKey, JSON.stringify(coachConversation));
}
const savedCoachMessage = coachConversation.at(-1)?.answer;
if (savedCoachMessage) coachAnswer.textContent = savedCoachMessage;
function saveCoachConversation(question, answer) {
  coachConversation.push({ question, answer, timestamp: Date.now() });
  while (coachConversation.length > 100) coachConversation.shift();
  localStorage.setItem(coachConversationKey, JSON.stringify(coachConversation));
}
const answerCoach = (question) => {
  const text = question.toLowerCase();
  const calories = foodEntries.reduce((total, entry) => total + entry.kcal, 0);
  const target = Number(maintenanceInput.value) + getGoalAdjustment();
  const protein = foodEntries.reduce((total, entry) => total + entry.protein, 0);
  const carbs = foodEntries.reduce((total, entry) => total + (entry.carbs || 0), 0);
  const fat = foodEntries.reduce((total, entry) => total + (entry.fat || 0), 0);
  const steps = Number(stepsInput.value) || 0;
  if (text.includes('kcal') || text.includes('kalori')) return `Du har spist cirka ${calories.toLocaleString('da-DK')} kcal og har ${Math.max(0, target - calories).toLocaleString('da-DK')} kcal tilbage af dit mål på ${target.toLocaleString('da-DK')} kcal.`;
  if (text.includes('protein')) return `Du har ${protein} g protein registreret. Et godt praktisk mål er at fordele protein over dagens måltider. Dit præcise mål afhænger af kropsvægt, træning og målsætning.`;
  if (text.includes('step') || text.includes('gå')) return `Du står på ${steps.toLocaleString('da-DK')} steps i dag. Fortsæt roligt; lidt bevægelse ad gangen tæller også.`;
  if (text.includes('træn') || text.includes('øvelse') || text.includes('workout')) return 'Din næste session er Full body foundation. Start med første øvelse og marker hver øvelse som færdig, når du er klar.';
  if (text.includes('fysik') || text.includes('billede') || text.includes('bulk') || text.includes('cut')) return 'Jeg kan vurdere din fysikudvikling ud fra vægt, datoer og ændringen mellem billederne. Tilføj startvægt, mål og ugens måling for en mere præcis vurdering med ros, fordele og cons.';
  if (text.includes('makro') || text.includes('fedt') || text.includes('kulhydrat')) return `Dit dashboard samler protein (${protein} g), kulhydrat (${carbs} g) og fedt (${fat} g). Brug makroerne til at justere måltiderne.`;
  return 'Jeg kan hjælpe med kcal, makroer, protein, steps og dagens træning. Prøv at spørge mere konkret.';
};
function getLocalCoachContext() {
  const weightEntries = JSON.parse(localStorage.getItem('formlyWeightHistory') || '[]');
  const foodEntriesToday = foodEntries.filter((entry) => entry.date === foodDateKey(selectedFoodDate));
  const libraryExercises = [...document.querySelectorAll('#exerciseList h3')].map((heading) => heading.textContent.trim());
  const trainingCompletion = JSON.parse(localStorage.getItem('formlyWeeklyCompletion') || '{}');
  return {
    profile: { name: getUserName(), weight: profileWeight.value, goalWeight: document.querySelector('#profileWeightGoal')?.value || '', height: profileHeight.value, age: profileAge.value, sex: profileSex.value },
    calories: { maintenance: maintenanceInput.value, target: calculateCalorieTarget(), goal: selectedGoal, intensity: intensitySelect.value, trainingDays: trainingWeekSelect.value, steps: stepsInput.value, stepKcal: stepKcalResult.textContent },
    overview: { training: document.querySelector('#overviewTrainingStat')?.textContent || '', activeTime: document.querySelector('#overviewActiveTimeStat')?.textContent || '', energy: document.querySelector('#overviewEnergyStat')?.textContent || '', food: document.querySelector('#overviewFoodStat')?.textContent || '', weight: document.querySelector('#overviewWeightStat')?.textContent || '', sections: ['Oversigt', 'Mad Tracker', 'Kcal-mål', 'Progression i træningen', 'Fysikudvikling', 'Øvelsesbibliotek'] },
    selected: { goal: selectedGoal, phase: selectedWeightPhase, foodDate: foodDateKey(selectedFoodDate), activeSession: activeWorkoutSession, progressionExercise: document.querySelector('#progressExercisePicker')?.value || '', muscleCategory: document.querySelector('.training-progress-panel .training-tabs button.active')?.dataset.muscle || '', progressionYear: selectedProgressYear, physiqueYear: selectedFysikYear },
    foodToday: { date: foodDateKey(selectedFoodDate), calories: foodEntriesToday.reduce((total, entry) => total + entry.kcal, 0), protein: foodEntriesToday.reduce((total, entry) => total + entry.protein, 0), carbs: foodEntriesToday.reduce((total, entry) => total + (entry.carbs || 0), 0), fat: foodEntriesToday.reduce((total, entry) => total + (entry.fat || 0), 0), entries: foodEntriesToday.map((entry) => ({ name: entry.name, grams: entry.grams, kcal: entry.kcal })) },
    physique: { phase: selectedWeightPhase, selectedYear: selectedFysikYear, startWeight: fysikStartWeight.value, targetWeight: fysikTargetWeight.value, currentWeight: fysikCurrentWeight.textContent, measurements: weightEntries.map((entry) => ({ date: entry.date, weight: entry.weight, phase: entry.phase || 'bulk', hasPhoto: Boolean(entry.photo) })) },
    exerciseLibrary: { count: libraryExercises.length, limit: 30, exercises: libraryExercises, activeSession: activeWorkoutSession, completion: trainingCompletion },
    workoutLog: workoutLog.slice(0, 30).map((entry) => ({ exercise: entry.exercise, profile: getExerciseProfile(entry.exercise), weight: entry.weight, reps: entry.reps, estimatedOneRepMax: estimateOneRepMax(entry.weight, entry.reps), session: entry.session, date: entry.date }))
  };
}
async function askLocalCoach(question, selectedImages = null) {
  const coachStatus = coachPanel.querySelector('#coachStatus');
  if (!authState.authenticated || !billingState.isPro) {
    coachStatus.textContent = authState.authenticated ? 'Pro kræves til online AI' : 'Log ind for at bruge online AI';
    openProAccess();
    return '';
  }
  coachStatus.textContent = 'Lokal AI tænker...';
  const physiqueQuestion = /fysik|billede|foto|krop/i.test(question);
  const physiquePhotos = [...JSON.parse(localStorage.getItem('formlyWeightHistory') || '[]')]
    .filter((entry) => (entry.phase || 'bulk') === selectedWeightPhase && entry.photo)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const comparisonPhotos = physiquePhotos.slice(-2);
  const imageData = selectedImages || comparisonPhotos.map((entry) => entry.photo.includes(',') ? entry.photo.split(',')[1] : entry.photo);

  const fallbackLocalCoach = () => {
    coachStatus.textContent = 'AI svarer ud fra dine data';
    return answerCoach(question);
  };

  try {
    const response = await fetch(getCoachEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context: getLocalCoachContext(),
        images: imageData,
        isPhysiqueQuestion: physiqueQuestion
      })
    });

    const result = await response.json();
    if (response.status === 401) {
      requireFreshLogin();
      coachStatus.textContent = 'Log ind for at bruge online AI';
      return '';
    }
    if (response.status === 402) {
      applyBillingStatus(result.billing);
      openProAccess();
      coachStatus.textContent = 'Pro kræves til online AI';
      return '';
    }
    if (response.status === 429) {
      applyBillingStatus(result.billing);
      coachStatus.textContent = 'Månedlig Pro-kvote er brugt';
      showToast(result.message || 'Din månedlige Pro-kvote er brugt');
      return '';
    }
    if (!response.ok) throw new Error('local-api-error');
    if (result?.answer && String(result.answer).trim()) {
      applyBillingStatus(result.billing);
      coachStatus.textContent = 'AI er klar';
      return String(result.answer).trim();
    }
    throw new Error('empty-local-answer');
  } catch {
    try {
      const coachController = new AbortController();
      const coachTimeout = window.setTimeout(() => coachController.abort(), 8000);
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: coachController.signal,
        body: JSON.stringify({ model: physiqueQuestion && imageData.length ? 'llava' : 'llama3.2', stream: false, messages: [{ role: 'system', content: 'Du er en hjælpsom dansk AI-assistent, der kan svare på almindelige spørgsmål om viden, hverdagen, planlægning, idéer og problemløsning. Du er samtidig specialiseret i træning, styrke, kondition, mobilitet, restitution, søvn, kost, kalorier, makroer, vægttab, muskelopbygning, øvelsesteknik og programmering. Brug kun de gemte app-data til personlige svar, når spørgsmålet handler om brugerens træning eller sundhed. Skeln mellem generel viden og brugerens faktiske data. Opfind aldrig personlige tal; sig tydeligt hvis en personlig oplysning mangler. Giv et konkret svar i passende længde. Giv ikke medicinsk diagnose. Data: ' + JSON.stringify(getLocalCoachContext()) }, { role: 'user', content: question, ...(physiqueQuestion && imageData.length ? { images: imageData } : {}) }] })
      });
      window.clearTimeout(coachTimeout);
      if (!response.ok) throw new Error('ollama-error');
      const result = await response.json();
      const answer = result.message?.content?.trim() || '';
      if (answer) {
        coachStatus.textContent = 'AI er klar';
        return answer;
      }
      throw new Error('empty-ollama-answer');
    } catch {
      return fallbackLocalCoach();
    }
  }
}
coachPanel.querySelector('#coachForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = coachPanel.querySelector('#coachQuestion').value.trim();
  if (!question) return;
  const answer = await askLocalCoach(question);
  if (!answer) return;
  coachAnswer.textContent = answer;
  saveCoachConversation(question, answer);
  coachPanel.querySelector('#coachQuestion').value = '';
});
coachPanel.querySelectorAll('.coach-suggestions button').forEach((button) => button.addEventListener('click', async () => {
  const question = button.dataset.question;
  const answer = await askLocalCoach(question);
  if (!answer) return;
  coachAnswer.textContent = answer;
  saveCoachConversation(question, answer);
}));

const trainingProgressPanel = document.createElement('section');
trainingProgressPanel.className = 'training-progress-panel';
trainingProgressPanel.innerHTML = '<div class="training-progress-header"><div><p class="eyebrow">STYRKE & PERFORMANCE</p><h2>Progression i træningen</h2><p>Følg dine løft og se udviklingen fra træning til træning.</p></div><span class="progress-live">LIVE DATA</span></div><div class="training-tabs"><button type="button" class="active" data-muscle="push">Pres</button><button type="button" data-muscle="pull">Træk</button><button type="button" data-muscle="legs">Ben</button></div><div class="training-progress-content"><div><h3 id="progressExerciseName">Bench press</h3><p id="progressExerciseMeta">Seneste træningsblok og udvikling</p><div id="progressChart" class="progress-chart"></div></div><div class="progress-callout"><strong id="progressChange">+0 kg</strong><span>udvikling siden sidste træning</span><small id="progressNext">Registrér din næste træning for at fortsætte grafen.</small></div></div>';
const librarySection = document.querySelector('#library');
if (librarySection) {
  librarySection.after(trainingProgressPanel);
} else {
  coachPanel.after(trainingProgressPanel);
}
const progressRangeTabs = document.createElement('div');
progressRangeTabs.className = 'progress-range-tabs';
progressRangeTabs.innerHTML = '<button type="button" class="active" data-range="session">Træninger</button><button type="button" data-range="week">Uger</button><button type="button" data-range="month">Måneder</button><button type="button" data-range="year">År</button>';
trainingProgressPanel.querySelector('.training-tabs').after(progressRangeTabs);
const progressPeriodNav = document.createElement('div');
progressPeriodNav.className = 'progress-period-nav';
progressPeriodNav.innerHTML = '<button type="button" id="progressPreviousPeriod" aria-label="Forrige periode">←</button><span>Skift periode</span><button type="button" id="progressNextPeriod" aria-label="Næste periode">→</button>';
progressRangeTabs.after(progressPeriodNav);
const progressYearNav = document.createElement('div');
progressYearNav.className = 'progress-year-nav';
progressYearNav.innerHTML = '<button type="button" aria-label="Forrige år">‹</button><strong>2026</strong><button type="button" aria-label="Næste år">›</button>';
progressRangeTabs.after(progressYearNav);
let progressRange = 'session';
let progressRangeOffset = 0;
let selectedProgressYear = Number(localStorage.getItem('formlyProgressYear') || new Date().getFullYear());
const currentCalendarYear = new Date().getFullYear();
const savedCalendarYear = localStorage.getItem('formlyLastCalendarYear');
const lastCalendarYear = Number(savedCalendarYear || 0);
if (!savedCalendarYear || lastCalendarYear !== currentCalendarYear) {
  selectedProgressYear = currentCalendarYear;
  localStorage.setItem('formlyProgressYear', String(currentCalendarYear));
  localStorage.setItem('formlyLastCalendarYear', String(currentCalendarYear));
}
const progressYearPrevious = progressYearNav.querySelector('button:first-child');
const progressYearNext = progressYearNav.querySelector('button:last-child');
const progressYearLabel = progressYearNav.querySelector('strong');
function renderProgressYearLabel() {
  progressYearLabel.textContent = String(selectedProgressYear);
  progressYearPrevious.disabled = selectedProgressYear <= 1900;
  progressYearNext.disabled = selectedProgressYear >= 2100;
}
function shiftProgressYear(direction) {
  selectedProgressYear = Math.max(1900, Math.min(2100, selectedProgressYear + direction));
  localStorage.setItem('formlyProgressYear', String(selectedProgressYear));
  progressRangeOffset = 0;
  renderProgressYearLabel();
  renderTrainingProgress(trainingProgressPanel.querySelector('.training-tabs button.active').dataset.muscle);
}
progressYearPrevious.addEventListener('click', () => shiftProgressYear(-1));
progressYearNext.addEventListener('click', () => shiftProgressYear(1));
renderProgressYearLabel();
function getProgressWindowEntries(entries) {
  const compactEntries = [...entries];
  if (!compactEntries.length) return compactEntries;
  const windowSize = progressRange === 'session' ? 8 : progressRange === 'week' ? 8 : progressRange === 'month' ? 9 : 8;
  if (compactEntries.length <= windowSize) return compactEntries;
  const maxOffset = Math.max(0, compactEntries.length - windowSize);
  const safeOffset = Math.min(maxOffset, Math.max(0, progressRangeOffset));
  return compactEntries.slice(0, compactEntries.length - safeOffset).slice(-windowSize);
}
function shiftProgressRange(direction) {
  const exerciseName = (progressExercisePicker.value || '').trim();
  const entries = [...workoutLog].filter((entry) => entry.exercise.toLowerCase() === exerciseName.toLowerCase());
  if (!entries.length) return;
  const step = direction === 'left' ? 1 : -1;
  const windowSize = progressRange === 'session' ? 8 : progressRange === 'week' ? 8 : progressRange === 'month' ? 9 : 8;
  const maxOffset = Math.max(0, entries.length - windowSize);
  progressRangeOffset = Math.min(maxOffset, Math.max(0, progressRangeOffset + step));
  renderTrainingProgress(trainingProgressPanel.querySelector('.training-tabs button.active').dataset.muscle);
}
document.addEventListener('keydown', (event) => {
  const tagName = (event.target && event.target.tagName || '').toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    shiftProgressRange('left');
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    shiftProgressRange('right');
  }
});
progressPeriodNav.querySelector('#progressPreviousPeriod').addEventListener('click', () => shiftProgressRange('left'));
progressPeriodNav.querySelector('#progressNextPeriod').addEventListener('click', () => shiftProgressRange('right'));
let progressTouchStartX = null;
let progressTouchStartY = null;
trainingProgressPanel.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  progressTouchStartX = touch.clientX;
  progressTouchStartY = touch.clientY;
}, { passive: true });
trainingProgressPanel.addEventListener('touchmove', (event) => {
  if (progressTouchStartX === null || !event.touches[0]) return;
  const deltaX = event.touches[0].clientX - progressTouchStartX;
  const deltaY = event.touches[0].clientY - progressTouchStartY;
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 12) event.preventDefault();
}, { passive: false });
trainingProgressPanel.addEventListener('touchend', (event) => {
  if (progressTouchStartX === null || !event.changedTouches[0]) return;
  const deltaX = event.changedTouches[0].clientX - progressTouchStartX;
  const deltaY = event.changedTouches[0].clientY - progressTouchStartY;
  if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) shiftProgressRange(deltaX < 0 ? 'right' : 'left');
  progressTouchStartX = null;
  progressTouchStartY = null;
}, { passive: true });
progressRangeTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
  progressRangeTabs.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  progressRange = button.dataset.range;
  progressRangeOffset = 0;
  progressYearNav.style.display = progressRange === 'year' ? 'flex' : 'none';
  renderProgressYearLabel();
  renderTrainingProgress(trainingProgressPanel.querySelector('.training-tabs button.active').dataset.muscle);
}));
progressYearNav.style.display = 'none';
const progressChart = trainingProgressPanel.querySelector('#progressChart');
const longProgressSummary = document.createElement('div');
longProgressSummary.className = 'long-progress-summary';
longProgressSummary.innerHTML = '<div><strong id="longStartWeight">-</strong><small>første session</small></div><div><strong id="longCurrentWeight">-</strong><small>estimeret 1RM fra bedste sæt</small></div><div><strong id="longIncrease">-</strong><small>samlet 1RM-øgning</small></div><div><strong id="longTime">-</strong><small>siden start</small></div>';
trainingProgressPanel.querySelector('.training-progress-content').after(longProgressSummary);
const progressExercises = { push: ['bench press', 'push-up', 'shoulder press'], pull: ['barbell row', 'deadlift', 'pull-up'], legs: ['goblet squat', 'leg press machine', 'lunge', 'bulgarian split squat'] };
const progressExercisePicker = document.createElement('select');
progressExercisePicker.id = 'progressExercisePicker';
progressExercisePicker.setAttribute('aria-label', 'Vælg øvelse til progression');
exerciseOptions.forEach((exercise) => progressExercisePicker.insertAdjacentHTML('beforeend', `<option value="${exercise}">${exercise}</option>`));
trainingProgressPanel.querySelector('.training-tabs').after(progressExercisePicker);
progressExercisePicker.value = 'Bench press';
function estimateOneRepMax(weight, reps) {
  const safeWeight = Number(weight) || 0;
  const safeReps = Number(reps) || 0;
  if (safeReps <= 1) return safeWeight;
  if (safeReps >= 37) return safeWeight * (1 + safeReps / 30);
  const epley = safeWeight * (1 + safeReps / 30);
  const brzycki = safeWeight * (36 / (37 - safeReps));
  return (epley + brzycki) / 2;
}
function getExerciseProfile(exerciseName = '') {
  const name = exerciseName.trim().toLowerCase();
  const machine = /machine|cable|pec deck|lat pulldown|leg press|chest press|shoulder press|seated row|smith/.test(name);
  const compound = /squat|deadlift|press|row|pull-up|chin-up|dip|lunge|leg press|push-up|hip thrust|kettlebell swing/.test(name);
  const type = compound ? 'basisøvelse' : 'isoleringsøvelse';
  const equipment = machine ? 'maskine/kabel' : 'fri vægt/kropsvægt';
  const reliability = machine ? 'Brug samme maskine og indstilling hver gang; maskin-kg kan ikke sammenlignes direkte med fri vægt.' : 'Sammenlign helst samme teknik, tempo og bevægeudslag hver gang.';
  return { type, equipment, reliability };
}
function getExerciseSetCount(entryOrValue) {
  const value = typeof entryOrValue === 'object' ? entryOrValue?.setNumber : entryOrValue;
  return Math.max(1, Number(value) || 1);
}
function getExerciseVolume(entry) {
  return (Number(entry?.weight) || 0) * (Number(entry?.reps) || 0) * getExerciseSetCount(entry);
}
function formatExerciseLogSummary(weight, reps, sets, date = '') {
  const setCount = getExerciseSetCount(sets);
  const dateMarkup = date ? `<time>${date}</time>` : '';
  return `<span class="exercise-latest-label">Senest registreret</span><span class="exercise-latest-values"><b>${Number(weight) || 0} kg</b><span>${Number(reps) || 0} reps pr. sæt</span><span>${setCount} arbejdssæt</span>${dateMarkup}</span>`;
}
function syncProgressExerciseOptions() {
  document.querySelectorAll('#exerciseList h3').forEach((heading) => {
    const name = heading.textContent.trim();
    if (name && ![...progressExercisePicker.options].some((option) => option.value.toLowerCase() === name.toLowerCase())) {
      progressExercisePicker.insertAdjacentHTML('beforeend', `<option value="${name}">${name}</option>`);
    }
  });
}
function syncExerciseLibraryWithProgress(exerciseName = progressExercisePicker.value) {
  const normalizedName = String(exerciseName || '').trim();
  if (!normalizedName) return;
  if (typeof exerciseInput !== 'undefined' && exerciseInput) {
    const matchingOption = [...exerciseInput.options].find((option) => option.value.toLowerCase() === normalizedName.toLowerCase());
    if (matchingOption) exerciseInput.value = matchingOption.value;
  }
  document.querySelectorAll('#exerciseList .exercise-row').forEach((row) => {
    const rowName = row.querySelector('h3')?.textContent?.trim() || '';
    const isSelected = rowName.toLowerCase() === normalizedName.toLowerCase();
    row.classList.toggle('session-selected', isSelected);
  });
}
progressExercisePicker.addEventListener('change', () => {
  syncExerciseLibraryWithProgress(progressExercisePicker.value);
  renderTrainingProgress();
});
function renderTrainingProgress(muscle = 'push') {
  syncProgressExerciseOptions();
  const exercise = progressExercisePicker.value || progressExercises[muscle][0];
  const entries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === exercise.toLowerCase() && (progressRange !== 'year' || new Date(getProgressTimestamp(entry)).getFullYear() === selectedProgressYear)).map((entry) => ({ ...entry, weight: Number(entry.weight) || 0, reps: Number(entry.reps) || 0 }));
  const sortedEntries = [...entries].sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
  const firstProgressTimestamp = sortedEntries.length ? getProgressTimestamp(sortedEntries[0]) : Date.now();
  const formatRangeDateLabel = (eventDate, range = progressRange) => {
    const base = eventDate instanceof Date ? eventDate : new Date(eventDate);
    if (!Number.isFinite(base.getTime())) return '';
    if (range === 'session') return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' });
    if (range === 'week') return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
    if (range === 'month') return base.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '');
    if (range === 'year') return base.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '');
    return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
  };
  const getRangeGroupKey = (entry) => {
    const timestamp = getProgressTimestamp(entry);
    const date = new Date(timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const yearBucket = String(date.getFullYear());
    if (progressRange === 'session') return `session-${entry.session || dateKey}`;
    if (progressRange === 'week') {
      const weekStart = new Date(date);
      const day = weekStart.getDay() || 7;
      weekStart.setDate(weekStart.getDate() - day + 1);
      return `week-${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    }
    if (progressRange === 'month') {
      return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    if (progressRange === 'year') return `month-${yearBucket}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return dateKey;
  };
  const grouped = sortedEntries.reduce((groups, entry) => {
    const key = getRangeGroupKey(entry);
    const current = groups[key];
    const entryTimestamp = getProgressTimestamp(entry);
    const mergedEntry = { ...entry, timestamp: entryTimestamp, date: entry.date || formatWorkoutDate(new Date(entryTimestamp)) };
    if (!current) {
      groups[key] = mergedEntry;
      return groups;
    }
    const shouldReplace = entry.weight > current.weight || (entry.weight === current.weight && entryTimestamp >= getProgressTimestamp(current));
    if (shouldReplace) {
      groups[key] = mergedEntry;
    }
    return groups;
  }, {});
  const periodLength = progressRange === 'year' || progressRange === 'month' ? 30 : 7;
  const monthNames = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
  const periodCount = progressRange === 'session' || !sortedEntries.length ? 0 : Math.floor((Math.max(...sortedEntries.map(getProgressTimestamp)) - firstProgressTimestamp) / (1000 * 60 * 60 * 24 * periodLength));

  let groupedEntries = Object.values(grouped).sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b)).map((entry) => ({
    ...entry,
    periodLabel: formatRangeDateLabel(getProgressTimestamp(entry), progressRange),
    hasData: true,
    historicalActual: true
  }));

  const chartEntries = [...getProgressWindowEntries(groupedEntries)];
  let points = chartEntries.length ? chartEntries.map((entry) => Number(entry.weight) || 0) : [0, 0, 0, 0, 0];
  if (points.length === 1) points = [points[0], points[0]];
  const minValue = Math.min(...points, 0);
  const maxValue = Math.max(...points, 1);
  const valueRange = Math.max(1, maxValue - minValue);
  const max = maxValue;
  const lastActualEntry = [...groupedEntries].reverse().find((entry) => entry.hasData !== false);
  const last = lastActualEntry?.weight || points[points.length - 1];
  const actualGroupedEntries = groupedEntries.filter((entry) => entry.hasData !== false);
  const latestGroupedEntry = actualGroupedEntries[actualGroupedEntries.length - 1];
  const previousGroupedEntry = actualGroupedEntries[actualGroupedEntries.length - 2];
  const rawChange = latestGroupedEntry && previousGroupedEntry ? latestGroupedEntry.weight - previousGroupedEntry.weight : 0;
  let change = Number.isFinite(rawChange) ? rawChange : 0;
  let changePercent = 0;
  const rangeNames = { session: 'session', week: 'uge', month: 'måned', year: 'år' };
  const chronologicalEntries = [...sortedEntries];
  const latestEntry = [...sortedEntries].reverse()[0];
  const latestEntryDate = latestEntry?.date || (latestEntry?.timestamp ? new Date(latestEntry.timestamp).toLocaleDateString('da-DK') : '');
  const startWeight = chronologicalEntries[0]?.weight || 0;
  const startReps = chronologicalEntries[0]?.reps || 0;
  const currentPR = Math.max(...entries.map((entry) => entry.weight), 0);
  const currentOneRepMax = entries.reduce((best, entry) => Math.max(best, estimateOneRepMax(entry.weight, entry.reps)), 0);
  const increaseFromStart = currentPR - startWeight;
  const startOneRepMax = chronologicalEntries[0] ? estimateOneRepMax(chronologicalEntries[0].weight, chronologicalEntries[0].reps) : 0;
  const oneRepMaxIncrease = entries.length ? Math.max(0, currentOneRepMax - startOneRepMax) : 0;
  const repsIncreaseFromStart = latestEntry && startReps ? latestEntry.reps - startReps : 0;
  if (progressRange === 'year') change = Number.isFinite(increaseFromStart) ? increaseFromStart : 0;
  const comparisonWeight = previousGroupedEntry?.weight || startWeight || 1;
  changePercent = comparisonWeight > 0 ? (change / comparisonWeight) * 100 : 0;
  const startTimestamp = chronologicalEntries[0] ? getProgressTimestamp(chronologicalEntries[0]) : 0;
  const latestProgressTimestamp = entries.length ? Date.now() : 0;
  const progressDays = startTimestamp && latestProgressTimestamp ? Math.max(0, Math.round((latestProgressTimestamp - startTimestamp) / (1000 * 60 * 60 * 24))) : 0;
  const changeDays = progressRange === 'week' ? 7 : progressRange === 'month' ? 30 : progressRange === 'year' ? 360 : 4;
  const monthChangeName = latestGroupedEntry ? monthNames[new Date(getProgressTimestamp(latestGroupedEntry)).getMonth()] : 'måned';
  const changeLabel = progressRange === 'year' && progressDays < 360 ? `faktisk øgning siden start (${progressDays} dage)` : progressRange === 'month' ? `faktisk øgning i ${monthChangeName}` : `øgning på ${changeDays} dage`;
  trainingProgressPanel.querySelector('#progressExerciseName').textContent = exercise;
  const exerciseProfile = getExerciseProfile(exercise);
  const latestSetInfo = latestEntry ? ` · senest ${getExerciseSetCount(latestEntry)} arbejdssæt med ${latestEntry.reps} reps og ${latestEntry.weight} kg · ca. 1RM ${estimateOneRepMax(latestEntry.weight, latestEntry.reps).toFixed(1)} kg` : '';
  trainingProgressPanel.querySelector('#progressExerciseMeta').textContent = entries.length ? `${entries.length} registreringer · ${exerciseProfile.type} · ${exerciseProfile.equipment} · vist pr. ${rangeNames[progressRange]} · seneste ${latestEntryDate || 'ingen dato'}${latestSetInfo}` : `Ingen træning registreret endnu · ${exerciseProfile.type} · ${exerciseProfile.equipment}`;
  trainingProgressPanel.querySelector('#progressChange').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)} kg (${changePercent.toFixed(1)}%)`;
  trainingProgressPanel.querySelector('.progress-callout span').textContent = changeLabel;
  trainingProgressPanel.querySelector('#progressNext').textContent = `Faktisk løft i perioden: ${last.toFixed(1)} kg · beregnet ud fra datoerne.`;
  trainingProgressPanel.querySelector('#longStartWeight').textContent = startWeight ? `${startWeight} kg` : '-';
  trainingProgressPanel.querySelector('#longCurrentWeight').textContent = currentOneRepMax ? `${currentOneRepMax.toFixed(1)} kg` : '-';
  trainingProgressPanel.querySelector('#longIncrease').textContent = oneRepMaxIncrease > 0 ? `+${oneRepMaxIncrease.toFixed(1)} kg` : '0 kg';
  trainingProgressPanel.querySelector('#longTime').textContent = startTimestamp ? `${progressDays} dage` : '-';
  const chartWidth = Math.max(640, chartEntries.length * 88);
  const chartHeight = 150;
  const chartFullLabels = chartEntries.map((entry) => entry.periodLabel || entry.date || (entry.session ? getBenchSessionDate(entry.session) : ''));
  const chartLabels = chartEntries.map((entry) => formatRangeDateLabel(getProgressTimestamp(entry), progressRange));
  const chartChanges = chartEntries.map((entry, index) => {
    if (!index) return 0;
    const previousEntry = chartEntries[index - 1];
    const previousValue = Number(previousEntry.weight) || 0;
    return (Number(entry.weight) || 0) - previousValue;
  });
  const chartValueLabels = points.map((point, index) => {
    const entry = chartEntries[index];
    if (!entry) return 'Ingen data';
    const weight = Number(entry.weight) || 0;
    const reps = Number(entry.reps) || 5;
    const profile = getExerciseProfile(exercise);
    return `${weight.toFixed(1)} kg × ${reps} · 1RM ${estimateOneRepMax(weight, reps).toFixed(1)} kg · ${profile.type}`;
  });
  const chartPoints = points.map((point, index) => {
    const y = chartHeight - (((point - minValue) / valueRange) * 112 + 12);
    return `${index * (chartWidth / Math.max(1, points.length - 1))},${y}`;
  }).join(' ');
  // Historik- og lineargrafen skal følge samme rækkefølge: nyeste først.
  const historyEntries = [...sortedEntries].reverse();
  const historyRows = historyEntries.length ? historyEntries.map((entry, index) => {
    const previous = historyEntries[index + 1];
    const rowChange = previous ? entry.weight - previous.weight : 0;
    const label = entry.date || (entry.session ? getBenchSessionDate(entry.session) : '');
    const profile = getExerciseProfile(exercise);
    return `<div class="progress-history-row"><strong>${label}</strong><span>${getExerciseSetCount(entry)} arbejdssæt × ${entry.reps} reps med ${entry.weight} kg · volumen ${getExerciseVolume(entry).toLocaleString('da-DK')} kg · 1RM ${estimateOneRepMax(entry.weight, entry.reps).toFixed(1)} kg · ${profile.type} · ${profile.equipment}</span><b>${rowChange ? `${rowChange >= 0 ? '+' : ''}${rowChange} kg` : '-'}</b><em>${entry.isPR ? 'PR' : ''}</em></div>`;
  }).join('') : '<p>Ingen træning registreret endnu</p>';
  progressChart.innerHTML = `<svg class="progress-line-chart" style="width:${chartWidth}px;min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} ${chartHeight + 28}" role="img" aria-label="Progression over ${rangeNames[progressRange]}"><line x1="0" y1="138" x2="${chartWidth}" y2="138"></line><polyline points="${chartPoints}"></polyline>${points.map((point, index) => { const x = index * (chartWidth / Math.max(1, points.length - 1)); const labelX = Math.max(42, x); const y = chartHeight - (((point - minValue) / valueRange) * 112 + 12); const deltaText = chartChanges[index] ? `${chartChanges[index] >= 0 ? '+' : ''}${chartChanges[index].toFixed(1)} kg` : '0.0 kg'; const dateBelow = progressRange === 'session' && chartLabels[index] ? `<text class="chart-point-date" x="${labelX}" y="${chartHeight + 18}" text-anchor="middle">${chartLabels[index]}</text><text class="chart-point-date" x="${labelX}" y="${chartHeight + 30}" text-anchor="middle">${deltaText}</text>` : ''; return `<g class="chart-point"><circle cx="${x}" cy="${y}" r="4"><title>${chartFullLabels[index] || `${rangeNames[progressRange]} ${index + 1}`}: ${chartValueLabels[index]}, ændring ${chartChanges[index] || 0} kg</title></circle><text class="chart-point-label" x="${labelX}" y="${Math.max(11, y - 9)}" text-anchor="middle">${chartValueLabels[index]}</text>${dateBelow}</g>`; }).join('')}</svg><div class="chart-labels" style="width:${chartWidth}px;min-width:${chartWidth}px">${points.map((point, index) => { const entry = chartEntries[index] || {}; return `<small>${chartLabels[index] || `${rangeNames[progressRange]} ${index + 1}`} · ${chartValueLabels[index]} · ${entry.hasData === false ? '-' : `${chartChanges[index] >= 0 ? '+' : ''}${chartChanges[index] || 0} kg`}</small>`; }).join('')}</div><div class="progress-history"><div class="progress-history-heading"><strong>Historik</strong><span>dato · løft · ændring · PR</span></div>${historyRows}</div>`;
}
trainingProgressPanel.querySelectorAll('.training-tabs button').forEach((button) => button.addEventListener('click', () => {
  trainingProgressPanel.querySelectorAll('.training-tabs button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  const groupExercises = progressExercises[button.dataset.muscle];
  const latestGroupEntry = workoutLog.find((entry) => groupExercises.includes(entry.exercise.toLowerCase()));
  progressExercisePicker.value = latestGroupEntry?.exercise || groupExercises[0];
  renderTrainingProgress(button.dataset.muscle);
}));
renderTrainingProgress();

const weightHistory = JSON.parse(localStorage.getItem('formlyWeightHistory') || '[]');
const weightPhases = ['bulk', 'cut', 'maintain'];
const weightPhaseLabels = { bulk: 'Bulk', cut: 'Cut', maintain: 'Vedligehold' };
let selectedWeightPhase = localStorage.getItem('formlyWeightPhase') || 'bulk';
if (!weightPhases.includes(selectedWeightPhase)) selectedWeightPhase = 'bulk';
weightHistory.forEach((entry) => { if (!entry.phase) entry.phase = 'bulk'; });
localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
const weightTracker = document.createElement('section');
weightTracker.className = 'weight-tracker-panel';
weightTracker.id = 'weight';
weightTracker.innerHTML = '<div class="training-progress-header"><div><p class="eyebrow">FYSIKUDVIKLING</p><h2>Din udvikling, uge for uge</h2><p class="weight-intro">Sæt dit mål, registrér din vægt og følg den samlede udvikling i et roligt tempo.</p></div><span class="progress-live">UGENTLIG STATUS</span></div><div class="weight-phase-switcher"><span class="tracker-control-label">Aktiv fase</span><button id="weightPhasePrevious" type="button" aria-label="Forrige fase">←</button><strong id="weightPhaseLabel">Bulk</strong><button id="weightPhaseNext" type="button" aria-label="Næste fase">→</button></div><div class="fysik-goal"><div class="fysik-goal-heading"><span class="fysik-step">01</span><div><p>MÅLSÆTNING</p><h3>Hvor vil du hen?</h3></div></div><label>Startvægt <span>kg</span><input id="fysikStartWeight" type="number" min="1" step="0.1" placeholder="Fx 82,4" aria-label="Startvægt"></label><button id="saveFysikStartWeight" type="button">Gem startpunkt</button><label>Målvægt <span>kg</span><input id="fysikTargetWeight" type="number" min="1" step="0.1" placeholder="Fx 78,0" aria-label="Mål for kropsvægt"></label><div id="fysikCurrentWeight"></div><div id="fysikGoalSummary"></div></div><div class="weight-entry-heading"><span class="fysik-step">02</span><div><p>UGENS MÅLING</p><h3>Registrér din status</h3></div></div><form id="weightHistoryForm" class="weight-history-form"><label>Dato<input id="weightDate" type="text" inputmode="numeric" placeholder="DD.MM.ÅÅÅÅ" aria-label="Dato for mandagsmåling" required></label><label>Vægt <span>kg</span><input id="weightEntry" type="number" min="1" step="0.1" placeholder="Fx 82,4" required></label><label class="weight-photo-label">Fysikfoto <span>valgfrit</span><input id="weightPhotoInput" type="file" accept="image/*" capture="environment"><span class="weight-photo-picker"><b>Vælg foto</b><small id="weightPhotoFileName">Intet foto valgt</small></span><span id="weightPhotoPreview" class="weight-photo-preview"></span></label><button type="submit">Gem ugens måling</button></form><button id="weightWithingsConnect" class="weight-withings-button" type="button">Hent vægt fra Withings</button><div id="weightChangeSummary" class="weight-change-summary"></div><div id="weightChart" class="weight-chart"></div><div id="weightHistoryList" class="weight-history-list"></div>';
trainingProgressPanel.after(weightTracker);
const physiqueAiPanel = document.createElement('section');
physiqueAiPanel.className = 'physique-ai-panel';
physiqueAiPanel.id = 'physique-ai';
physiqueAiPanel.innerHTML = `
  <div class="training-progress-header">
    <div>
      <p class="eyebrow">FYSIK VURDERING AI</p>
      <h2>3-vinkels AI Body Scan</h2>
      <p>Tilføj front, højre og venstre side. AI sammenligner vinklerne og bygger en målrettet muskelplan.</p>
    </div>
    <div class="physique-header-actions">
      <button type="button" id="physiqueBackButton" class="physique-back-button">← Tilbage til oversigt</button>
      <span class="progress-live">3 ANGLE SCAN</span>
    </div>
  </div>
  <div id="physiqueProGate" class="pro-inline-gate">
    <div><span>PRO ONLINE</span><strong>3-vinkels AI-analyse</strong><small>4 personlige scanninger hver måned · 39 kr./måned</small></div>
    <button type="button" data-open-pro>Se Pro</button>
  </div>
  <div id="physique3dStage" class="physique-3d-stage" role="img" aria-label="Tredimensionel visualisering af AI kropsscanning">
    <canvas id="physique3dCanvas"></canvas>
    <div class="physique-3d-hud"><span>AI MUSCLE MAP</span><strong id="physique3dStatus">AWAITING INPUT</strong></div>
    <div class="physique-3d-angles" aria-hidden="true"><span>FRONT</span><span>RIGHT</span><span>LEFT</span></div>
  </div>
  <div class="physique-ai-grid">
    <div class="physique-ai-card">
      <div class="physique-scan-row">
        <label>Højde (cm)<input id="physiqueHeight" type="number" min="120" max="230" value="178"></label>
        <label>Vægt (kg)<input id="physiqueWeight" type="number" min="30" max="200" step="0.1" value="75"></label>
        <label>Talje (cm)<input id="physiqueWaist" type="number" min="40" max="150" value="82"></label>
      </div>
      <div class="physique-scan-row">
        <label>Skulderbredde (cm)<input id="physiqueShoulders" type="number" min="30" max="200" value="48"></label>
        <label>Bryst (cm)<input id="physiqueChest" type="number" min="40" max="200" value="95"></label>
        <label>Arm (cm)<input id="physiqueArm" type="number" min="15" max="80" value="36"></label>
      </div>
      <div class="physique-scan-console">
        <label class="physique-angle-card" data-angle="front">
          <input id="physiquePhotoInput" type="file" accept="image/*" capture="environment">
          <span class="physique-angle-index">01</span>
          <span class="physique-angle-copy"><strong>Front</strong><small>Hele kroppen forfra</small></span>
          <span class="physique-angle-state">Tilføj foto</span>
          <img id="physiquePreview" class="physique-angle-preview" alt="Frontfoto til fysik AI" hidden>
        </label>
        <label class="physique-angle-card" data-angle="right">
          <input id="physiqueRightPhotoInput" type="file" accept="image/*" capture="environment">
          <span class="physique-angle-index">02</span>
          <span class="physique-angle-copy"><strong>Højre side</strong><small>Stå afslappet fra siden</small></span>
          <span class="physique-angle-state">Tilføj foto</span>
          <img id="physiqueRightPreview" class="physique-angle-preview" alt="Højre sidefoto til fysik AI" hidden>
        </label>
        <label class="physique-angle-card" data-angle="left">
          <input id="physiqueLeftPhotoInput" type="file" accept="image/*" capture="environment">
          <span class="physique-angle-index">03</span>
          <span class="physique-angle-copy"><strong>Venstre side</strong><small>Samme afstand og lys</small></span>
          <span class="physique-angle-state">Tilføj foto</span>
          <img id="physiqueLeftPreview" class="physique-angle-preview" alt="Venstre sidefoto til fysik AI" hidden>
        </label>
      </div>
      <div class="physique-scan-readiness"><i></i><span id="physiqueScanReadiness">0/3 VINKLER KLAR</span></div>
      <div class="physique-actions">
        <button id="physiqueAnalyzeBtn" type="button">Start AI body scan</button>
      </div>
      <p class="physique-photo-guidance">Ens lys, afstand og afslappet holdning giver den bedste sammenligning. AI vurderer kun synlige muskelgrupper.</p>
    </div>
    <div class="physique-ai-card physique-result-card">
      <div class="score-ring">
        <strong id="physiqueScore">0</strong>
        <small>/100</small>
      </div>
      <h3 id="physiqueGrade">Venter på scan</h3>
      <p id="physiqueSummary">Indtast dine mål eller upload et billede for at få en vurdering.</p>
      <ul id="physiqueInsights" class="physique-insights"></ul>
      <p id="physiqueAiStatus" class="physique-ai-status">BODY SCAN STANDBY</p>
    </div>
  </div>
  <div id="physiqueMuscleAnalysis" class="physique-muscle-analysis" hidden>
    <section class="physique-analysis-block physique-strength-block">
      <div class="physique-analysis-heading"><span>01</span><div><small>STRENGTH MAP</small><h3>Stærkeste muskelgrupper</h3></div></div>
      <ul id="physiqueStrengths"></ul>
    </section>
    <section class="physique-analysis-block physique-priority-block">
      <div class="physique-analysis-heading"><span>02</span><div><small>PRIORITY MAP</small><h3>Muskelgrupper der skal bygges</h3></div></div>
      <ul id="physiquePriorities"></ul>
    </section>
    <section class="physique-analysis-block physique-plan-block">
      <div class="physique-analysis-heading"><span>03</span><div><small>AI PROGRAM</small><h3>Øvelser, sæt og reps</h3></div></div>
      <div class="physique-plan-head"><span>Øvelse</span><span>Fokus</span><span>Sæt × reps</span><span>Pause</span><span>Pr. uge</span></div>
      <div id="physiqueExercisePlan" class="physique-exercise-plan"></div>
    </section>
    <p id="physiqueAnalysisNote" class="physique-analysis-note"></p>
  </div>
`;
trainingProgressPanel.after(physiqueAiPanel);
physiqueAiPanel.querySelector('#physiqueBackButton').addEventListener('click', () => window.showAppPage?.('overview'));
physiqueAiPanel.querySelector('[data-open-pro]').addEventListener('click', openProAccess);
updateBillingUi();

const physiqueHeightInput = physiqueAiPanel.querySelector('#physiqueHeight');
const physiqueWeightInput = physiqueAiPanel.querySelector('#physiqueWeight');
const physiqueWaistInput = physiqueAiPanel.querySelector('#physiqueWaist');
const physiqueShouldersInput = physiqueAiPanel.querySelector('#physiqueShoulders');
const physiqueChestInput = physiqueAiPanel.querySelector('#physiqueChest');
const physiqueArmInput = physiqueAiPanel.querySelector('#physiqueArm');
const physiquePhotoInput = physiqueAiPanel.querySelector('#physiquePhotoInput');
const physiqueRightPhotoInput = physiqueAiPanel.querySelector('#physiqueRightPhotoInput');
const physiqueLeftPhotoInput = physiqueAiPanel.querySelector('#physiqueLeftPhotoInput');
const physiquePreview = physiqueAiPanel.querySelector('#physiquePreview');
const physiqueRightPreview = physiqueAiPanel.querySelector('#physiqueRightPreview');
const physiqueLeftPreview = physiqueAiPanel.querySelector('#physiqueLeftPreview');
const physiqueAnalyzeBtn = physiqueAiPanel.querySelector('#physiqueAnalyzeBtn');
const physiqueScoreEl = physiqueAiPanel.querySelector('#physiqueScore');
const physiqueGradeEl = physiqueAiPanel.querySelector('#physiqueGrade');
const physiqueSummaryEl = physiqueAiPanel.querySelector('#physiqueSummary');
const physiqueInsightsEl = physiqueAiPanel.querySelector('#physiqueInsights');
const physiqueScanReadiness = physiqueAiPanel.querySelector('#physiqueScanReadiness');
const physiqueAiStatus = physiqueAiPanel.querySelector('#physiqueAiStatus');
const physiqueMuscleAnalysis = physiqueAiPanel.querySelector('#physiqueMuscleAnalysis');
const physiqueStrengths = physiqueAiPanel.querySelector('#physiqueStrengths');
const physiquePriorities = physiqueAiPanel.querySelector('#physiquePriorities');
const physiqueExercisePlan = physiqueAiPanel.querySelector('#physiqueExercisePlan');
const physiqueAnalysisNote = physiqueAiPanel.querySelector('#physiqueAnalysisNote');

function clampPhysiqueValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculatePhysiqueScore(profile) {
  const { height, weight, waist, shoulders, chest, arm } = profile;
  if (!height || !weight || !waist) return 0;
  const bmi = weight / ((height / 100) ** 2);
  const waistHeightRatio = waist / height;
  const shoulderWaistRatio = shoulders > 0 ? shoulders / waist : 1.15;
  const chestWaistRatio = chest > 0 ? chest / waist : 1.05;
  const armRatio = arm > 0 ? arm / (height / 10) : 0.65;
  let score = 100;
  score -= Math.abs(bmi - 22) * 9;
  score -= Math.max(0, waistHeightRatio - 0.5) * 180;
  score -= Math.max(0, 1.1 - shoulderWaistRatio) * 120;
  score -= Math.max(0, 1.0 - chestWaistRatio) * 95;
  score -= Math.max(0, 0.7 - armRatio) * 90;
  score += Math.max(0, shoulderWaistRatio - 1.2) * 30;
  score += Math.max(0, chestWaistRatio - 1.05) * 35;
  score += Math.max(0, armRatio - 0.7) * 25;
  if (bmi > 30) score -= 15;
  if (weight < 55) score -= 8;
  return clampPhysiqueValue(Math.round(score), 0, 100);
}

function getPhysiqueGrade(score) {
  if (score >= 85) return 'Elite fysik';
  if (score >= 75) return 'Meget stærk fysik';
  if (score >= 65) return 'God balance';
  if (score >= 55) return 'Solid progression';
  return 'Byg videre';
}

function getPhysiqueSummary(profile, score) {
  const bmi = profile.weight / ((profile.height / 100) ** 2);
  const waistHeightRatio = profile.waist / profile.height;
  const bodyType = score >= 75 ? 'Du har et godt udgangspunkt for en præcis, atletisk kropsbygning.' : score >= 55 ? 'Din fysik er stabil og udviklingsbar med mere fokus på proportioner.' : 'Din struktur kan styrkes med mere belastning og bedre proportioner.';
  return `${bodyType} BMI ${bmi.toFixed(1)} · talje/højde ${waistHeightRatio.toFixed(2)} · score ${score}/100.`;
}

function getPhysiqueProfile() {
  return {
    height: Number(physiqueHeightInput.value) || 0,
    weight: Number(physiqueWeightInput.value) || 0,
    waist: Number(physiqueWaistInput.value) || 0,
    shoulders: Number(physiqueShouldersInput.value) || 0,
    chest: Number(physiqueChestInput.value) || 0,
    arm: Number(physiqueArmInput.value) || 0
  };
}

function renderPhysiqueAssessment() {
  const profile = getPhysiqueProfile();
  const score = calculatePhysiqueScore(profile);
  const grade = getPhysiqueGrade(score);
  const summary = getPhysiqueSummary(profile, score);
  const overviewPhysiqueStat = document.querySelector('#overviewPhysiqueStat');
  if (overviewPhysiqueStat) overviewPhysiqueStat.textContent = `${score}/100`;
  physiqueScoreEl.textContent = String(score);
  physiqueGradeEl.textContent = grade;
  physiqueSummaryEl.textContent = summary;
  const insights = [];
  const bmi = profile.weight / ((profile.height / 100) ** 2);
  if (profile.height && profile.weight) insights.push(`BMI: ${bmi.toFixed(1)} – ${bmi < 18.5 ? 'undervægt' : bmi < 25 ? 'i mål' : bmi < 30 ? 'over mål' : 'høj BMI'}`);
  if (profile.waist && profile.height) insights.push(`Talje/højde: ${(profile.waist / profile.height).toFixed(2)} – mål tæt på 0.50 eller lavere`);
  if (profile.shoulders && profile.waist) insights.push(`Skulder/talje: ${(profile.shoulders / profile.waist).toFixed(2)} – jo tættere på 1.2, jo mere atletisk proportion (godt udviklede skuldre)`);
  if (profile.chest && profile.waist) insights.push(`Bryst/talje: ${(profile.chest / profile.waist).toFixed(2)} – lavere end 1.0 betyder brystet trænger til mere fokus`);
  if (profile.arm) insights.push(`Arm: ${profile.arm} cm – ${(profile.arm / (profile.height / 10)) < 0.7 ? 'arme trænger til mere volumen' : 'godt udviklet armstørrelse'}`);
  const nextStep = score >= 75 ? 'Fortsæt med progressive belastninger og bevare den nuværende fedtprocent.' : score >= 55 ? 'Fokuser på skulder- og brystudvikling samt en mere præcis talje.' : 'Prioriter styrke, taljeproportioner og kontinuerlig vægtøgning i kvalitet.';
  insights.push(nextStep);
  physiqueInsightsEl.innerHTML = insights.map((item) => `<li>${item}</li>`).join('');
  localStorage.setItem('formlyPhysiqueAi', JSON.stringify({ ...profile, score, grade, summary, updatedAt: new Date().toISOString() }));
}

const physiquePhotoAngles = [
  { name: 'front', label: 'Front', key: 'formlyPhysiquePhoto', input: physiquePhotoInput, preview: physiquePreview },
  { name: 'right', label: 'Højre side', key: 'formlyPhysiquePhotoRight', input: physiqueRightPhotoInput, preview: physiqueRightPreview },
  { name: 'left', label: 'Venstre side', key: 'formlyPhysiquePhotoLeft', input: physiqueLeftPhotoInput, preview: physiqueLeftPreview }
];

function getPhysiquePhotos() {
  return physiquePhotoAngles.map((angle) => ({ ...angle, data: localStorage.getItem(angle.key) || '' }));
}

function updatePhysiqueScanReadiness() {
  const photos = getPhysiquePhotos();
  const readyCount = photos.filter((photo) => photo.data).length;
  photos.forEach((photo) => {
    const card = photo.input.closest('.physique-angle-card');
    const state = card.querySelector('.physique-angle-state');
    card.classList.toggle('is-ready', Boolean(photo.data));
    state.textContent = photo.data ? 'Klar · skift' : 'Tilføj foto';
    if (photo.data) {
      photo.preview.src = photo.data;
      photo.preview.hidden = false;
    }
  });
  physiqueScanReadiness.textContent = `${readyCount}/3 VINKLER KLAR`;
  physiqueScanReadiness.parentElement.classList.toggle('is-ready', readyCount === 3);
  physiqueAnalyzeBtn.disabled = readyCount < 3 || !billingState.isPro;
  if (!physiqueAiStatus.dataset.source) {
    physiqueAiStatus.textContent = readyCount === 3 ? 'BODY SCAN READY' : `MANGLER ${3 - readyCount} VINKEL${readyCount === 2 ? '' : 'ER'}`;
  }
  window.updatePhysique3DScan?.(readyCount);
  return readyCount;
}

function compressPhysiquePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxDimension = 1280;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('invalid-image'));
    };
    image.src = objectUrl;
  });
}

physiquePhotoAngles.forEach((angle) => angle.input.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Vælg en billedfil');
    event.target.value = '';
    return;
  }
  try {
    const photoData = await compressPhysiquePhoto(file);
    const duplicatePhoto = getPhysiquePhotos().some((photo) => photo.key !== angle.key && photo.data === photoData);
    if (duplicatePhoto) {
      showToast('Tag et forskelligt foto til hver vinkel');
      event.target.value = '';
      return;
    }
    localStorage.setItem(angle.key, photoData);
    localStorage.removeItem('formlyPhysiqueMuscleAnalysis');
    delete physiqueAiStatus.dataset.source;
    physiqueMuscleAnalysis.hidden = true;
    angle.preview.src = photoData;
    angle.preview.hidden = false;
    updatePhysiqueScanReadiness();
    showToast(`${angle.label}-foto er klar`);
  } catch (error) {
    showToast(error.name === 'QuotaExceededError' ? 'Billederne fylder for meget' : 'Fotoet kunne ikke læses');
  }
  event.target.value = '';
}));

function getFallbackMuscleAnalysis(profile) {
  const chestRatio = profile.waist ? profile.chest / profile.waist : 0;
  const armRatio = profile.height ? profile.arm / profile.height : 0;
  return {
    summary: 'Vision-AI kunne ikke svare. Denne foreløbige plan bruger dine mål og træner hele kroppen med ekstra fokus på overkroppens balance.',
    strengths: [
      { muscle: armRatio >= 0.2 ? 'Arme' : 'Grundstyrke', reason: armRatio >= 0.2 ? 'Armmålet er solidt i forhold til din højde.' : 'Dine mål giver et brugbart udgangspunkt for progression.' },
      { muscle: chestRatio >= 1.15 ? 'Bryst' : 'Ben og bagkæde', reason: chestRatio >= 1.15 ? 'Brystmålet står tydeligt i forhold til taljen.' : 'Store basisløft giver det stærkeste fundament.' }
    ],
    priorities: [
      { muscle: 'Ryg og lats', reason: 'Mere trækvolumen skaber bredde og balance omkring skuldrene.', priority: 'Høj' },
      { muscle: 'Side- og bagskulder', reason: 'Direkte skulderarbejde forbedrer bredde og symmetri.', priority: 'Høj' },
      { muscle: 'Ben og baller', reason: 'To ugentlige underkropspas holder fysikken komplet.', priority: 'Mellem' }
    ],
    plan: [
      { exercise: 'Lat pulldown', target: 'Lats', sets: '4', reps: '8-12', rest: '90 sek', frequency: '2 gange' },
      { exercise: 'Chest-supported row', target: 'Øvre ryg', sets: '4', reps: '8-12', rest: '90 sek', frequency: '2 gange' },
      { exercise: 'Cable lateral raise', target: 'Sideskulder', sets: '4', reps: '12-20', rest: '60 sek', frequency: '2-3 gange' },
      { exercise: 'Incline dumbbell press', target: 'Øvre bryst', sets: '3', reps: '8-12', rest: '90 sek', frequency: '2 gange' },
      { exercise: 'Squat', target: 'Lår og baller', sets: '4', reps: '6-10', rest: '2-3 min', frequency: '2 gange' },
      { exercise: 'Romanian deadlift', target: 'Baglår og baller', sets: '3', reps: '8-12', rest: '2 min', frequency: '2 gange' }
    ],
    note: 'Dette er træningsvejledning, ikke en medicinsk vurdering. Øg belastningen, når alle sæt rammer toppen af rep-intervallet med god teknik.'
  };
}

function parsePhysiqueAiAnswer(answer) {
  const text = String(answer || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizePhysiqueAnalysis(value, fallback) {
  const data = value && typeof value === 'object' ? value : {};
  const normalizeItems = (items, fallbackItems, keys, maximum) => Array.isArray(items) && items.length
    ? items.slice(0, maximum).map((item) => Object.fromEntries(keys.map((key) => [key, String(item?.[key] || '')])))
    : fallbackItems;
  return {
    summary: String(data.summary || fallback.summary),
    strengths: normalizeItems(data.strengths, fallback.strengths, ['muscle', 'reason'], 4),
    priorities: normalizeItems(data.priorities, fallback.priorities, ['muscle', 'reason', 'priority'], 4),
    plan: normalizeItems(data.plan, fallback.plan, ['exercise', 'target', 'sets', 'reps', 'rest', 'frequency'], 7),
    note: String(data.note || fallback.note)
  };
}

function appendPhysiqueFinding(list, title, description, badge = '') {
  const item = document.createElement('li');
  const heading = document.createElement('strong');
  const copy = document.createElement('p');
  heading.textContent = title;
  copy.textContent = description;
  item.append(heading, copy);
  if (badge) {
    const marker = document.createElement('span');
    marker.textContent = badge;
    item.append(marker);
  }
  list.append(item);
}

function renderPhysiqueMuscleAnalysis(analysis, source) {
  physiqueStrengths.replaceChildren();
  physiquePriorities.replaceChildren();
  physiqueExercisePlan.replaceChildren();
  analysis.strengths.forEach((item) => appendPhysiqueFinding(physiqueStrengths, item.muscle, item.reason));
  analysis.priorities.forEach((item) => appendPhysiqueFinding(physiquePriorities, item.muscle, item.reason, item.priority));
  analysis.plan.forEach((item) => {
    const row = document.createElement('div');
    [item.exercise, item.target, `${item.sets} × ${item.reps}`, item.rest, item.frequency].forEach((value) => {
      const cell = document.createElement('span');
      cell.textContent = value;
      row.append(cell);
    });
    physiqueExercisePlan.append(row);
  });
  physiqueSummaryEl.textContent = analysis.summary;
  physiqueAnalysisNote.textContent = analysis.note;
  physiqueAiStatus.textContent = source === 'vision' ? '3-ANGLE ANALYSIS COMPLETE' : 'OFFLINE PROGRAM ACTIVE';
  physiqueAiStatus.dataset.source = source;
  physiqueMuscleAnalysis.hidden = false;
  window.updatePhysique3DMuscles?.(analysis.priorities.map((item) => item.muscle));
}

async function requestPhysiqueVisionAnalysis(profile, photos) {
  const images = photos.map((photo) => photo.data.includes(',') ? photo.data.split(',')[1] : photo.data);
  const prompt = `Du modtager tre fotos i denne faste rækkefølge: 1) front, 2) højre side, 3) venstre side. Sammenlign alle vinkler som en forsigtig træningscoach. Vurder kun synlige muskelgrupper, proportioner og sideforskelle. Gæt ikke identitet, køn, etnicitet, sygdom eller præcis fedtprocent, og opfind ikke observationer om muskler som vinklerne ikke viser. Tag højde for lys, pose, tøj og kameravinkel. Mål: ${JSON.stringify(profile)}. Returnér KUN gyldig JSON: {"summary":"samlet vurdering med usikkerhed","strengths":[{"muscle":"muskelgruppe","reason":"synligt grundlag på tværs af vinkler"}],"priorities":[{"muscle":"muskelgruppe","reason":"hvorfor den bør prioriteres","priority":"Høj eller Mellem"}],"plan":[{"exercise":"øvelse","target":"muskelgruppe","sets":4,"reps":"8-12","rest":"90 sek","frequency":"2 gange"}],"note":"begrænsning og progressionsregel"}. Giv 2-4 styrker, 2-4 fokusområder og 5-7 øvelser med konkrete sæt, reps, pause og ugentlig frekvens.`;
  const response = await fetch(getCoachEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: prompt, context: { physique: profile, photoAngles: ['front', 'right', 'left'] }, images, isPhysiqueQuestion: true })
  });
  const result = await response.json();
  if (response.status === 401) {
    requireFreshLogin();
    throw new Error('auth-required');
  }
  if (response.status === 402) {
    applyBillingStatus(result.billing);
    openProAccess();
    throw new Error('pro-required');
  }
  if (response.status === 429) {
    applyBillingStatus(result.billing);
    throw new Error('quota-exceeded');
  }
  if (!response.ok) throw new Error('physique-ai-unavailable');
  const parsed = parsePhysiqueAiAnswer(result?.answer);
  if (!parsed) throw new Error('physique-ai-invalid');
  return parsed;
}

physiqueAnalyzeBtn.addEventListener('click', async () => {
  if (!authState.authenticated || !billingState.isPro) {
    openProAccess();
    return;
  }
  renderPhysiqueAssessment();
  const photos = getPhysiquePhotos();
  if (photos.some((photo) => !photo.data)) {
    showToast('Tilføj front, højre og venstre foto først');
    return;
  }
  const profile = getPhysiqueProfile();
  const fallback = getFallbackMuscleAnalysis(profile);
  physiqueAnalyzeBtn.disabled = true;
  physiqueAnalyzeBtn.textContent = 'Scanner 3 vinkler...';
  physiqueAiStatus.textContent = 'ANALYSERER MUSKELGRUPPER';
  try {
    const aiResult = await requestPhysiqueVisionAnalysis(profile, photos);
    const analysis = normalizePhysiqueAnalysis(aiResult, fallback);
    renderPhysiqueMuscleAnalysis(analysis, 'vision');
    localStorage.setItem('formlyPhysiqueMuscleAnalysis', JSON.stringify({ ...analysis, source: 'vision', updatedAt: new Date().toISOString() }));
    showToast('3-vinkels AI-analyse er klar');
  } catch (error) {
    if (error.message === 'auth-required') {
      physiqueAiStatus.textContent = 'LOG IND FOR ONLINE AI';
      showToast('Log ind for at bruge AI-fysikanalyse');
      return;
    }
    if (error.message === 'pro-required') {
      physiqueAiStatus.textContent = 'PRO KRÆVES';
      showToast('Pro kræves til AI-fysikanalyse');
      return;
    }
    if (error.message === 'quota-exceeded') {
      physiqueAiStatus.textContent = 'MÅNEDLIG KVOTE BRUGT';
      showToast('Din månedlige fysikanalyse-kvote er brugt');
      return;
    }
    renderPhysiqueMuscleAnalysis(fallback, 'fallback');
    localStorage.setItem('formlyPhysiqueMuscleAnalysis', JSON.stringify({ ...fallback, source: 'fallback', updatedAt: new Date().toISOString() }));
    showToast('Vision-AI var offline - din målbaserede plan er klar');
  } finally {
    physiqueAnalyzeBtn.textContent = 'Start AI body scan';
    updatePhysiqueScanReadiness();
  }
});

[physiqueHeightInput, physiqueWeightInput, physiqueWaistInput, physiqueShouldersInput, physiqueChestInput, physiqueArmInput].forEach((field) => {
  field.addEventListener('input', renderPhysiqueAssessment);
  field.addEventListener('change', renderPhysiqueAssessment);
});

const savedPhysique = JSON.parse(localStorage.getItem('formlyPhysiqueAi') || 'null');
if (savedPhysique) {
  physiqueHeightInput.value = savedPhysique.height || physiqueHeightInput.value;
  physiqueWeightInput.value = savedPhysique.weight || physiqueWeightInput.value;
  physiqueWaistInput.value = savedPhysique.waist || physiqueWaistInput.value;
  physiqueShouldersInput.value = savedPhysique.shoulders || physiqueShouldersInput.value;
  physiqueChestInput.value = savedPhysique.chest || physiqueChestInput.value;
  physiqueArmInput.value = savedPhysique.arm || physiqueArmInput.value;
}
updatePhysiqueScanReadiness();
const savedMuscleAnalysis = JSON.parse(localStorage.getItem('formlyPhysiqueMuscleAnalysis') || 'null');
if (savedMuscleAnalysis) {
  const fallback = getFallbackMuscleAnalysis(getPhysiqueProfile());
  renderPhysiqueMuscleAnalysis(normalizePhysiqueAnalysis(savedMuscleAnalysis, fallback), savedMuscleAnalysis.source || 'fallback');
}
renderPhysiqueAssessment();

const fysikYearSwitcher = document.createElement('div');
fysikYearSwitcher.className = 'fysik-year-switcher';
fysikYearSwitcher.innerHTML = '<span class="tracker-control-label">Viser år</span><button id="fysikYearPrevious" type="button" aria-label="Forrige år">←</button><strong id="fysikYearLabel"></strong><button id="fysikYearNext" type="button" aria-label="Næste år">→</button>';
const trackerControls = document.createElement('div');
trackerControls.className = 'weight-tracker-controls';
weightTracker.querySelector('.fysik-goal').before(trackerControls);
trackerControls.append(weightTracker.querySelector('.weight-phase-switcher'), fysikYearSwitcher);
const weightChart = weightTracker.querySelector('#weightChart');
const weightHistoryList = weightTracker.querySelector('#weightHistoryList');
const weightChangeSummary = weightTracker.querySelector('#weightChangeSummary');
let fysikTouchStartX = null;
let fysikTouchStartY = null;
weightChart.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  fysikTouchStartX = touch.clientX;
  fysikTouchStartY = touch.clientY;
}, { passive: true });
weightChart.addEventListener('touchmove', (event) => {
  if (fysikTouchStartX === null || !event.touches[0]) return;
  const deltaX = event.touches[0].clientX - fysikTouchStartX;
  const deltaY = event.touches[0].clientY - fysikTouchStartY;
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 12) event.preventDefault();
}, { passive: false });
weightChart.addEventListener('touchend', (event) => {
  if (fysikTouchStartX === null || !event.changedTouches[0]) return;
  const deltaX = event.changedTouches[0].clientX - fysikTouchStartX;
  const deltaY = event.changedTouches[0].clientY - fysikTouchStartY;
  if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) shiftFysikYear(deltaX < 0 ? 1 : -1);
  fysikTouchStartX = null;
  fysikTouchStartY = null;
}, { passive: true });
const fysikTargetWeight = weightTracker.querySelector('#fysikTargetWeight');
const fysikGoalSummary = weightTracker.querySelector('#fysikGoalSummary');
const fysikStartWeight = weightTracker.querySelector('#fysikStartWeight');
const fysikCurrentWeight = weightTracker.querySelector('#fysikCurrentWeight');
const saveFysikStartWeight = weightTracker.querySelector('#saveFysikStartWeight');
const weightPhaseLabel = weightTracker.querySelector('#weightPhaseLabel');
const weightPhasePrevious = weightTracker.querySelector('#weightPhasePrevious');
const weightPhaseNext = weightTracker.querySelector('#weightPhaseNext');
let selectedFysikYear = Number(localStorage.getItem('formlyFysikYear') || currentCalendarYear);
if (lastCalendarYear !== currentCalendarYear) {
  selectedFysikYear = currentCalendarYear;
  localStorage.setItem('formlyFysikYear', String(currentCalendarYear));
}
const fysikYearLabel = fysikYearSwitcher.querySelector('#fysikYearLabel');
function renderFysikYearLabel() {
  fysikYearLabel.textContent = String(selectedFysikYear);
}
function shiftFysikYear(direction) {
  selectedFysikYear = Math.max(1900, Math.min(2100, selectedFysikYear + direction));
  localStorage.setItem('formlyFysikYear', String(selectedFysikYear));
  renderFysikYearLabel();
  renderWeightHistory();
}
fysikYearSwitcher.querySelector('#fysikYearPrevious').addEventListener('click', () => shiftFysikYear(-1));
fysikYearSwitcher.querySelector('#fysikYearNext').addEventListener('click', () => shiftFysikYear(1));
renderFysikYearLabel();
fysikTargetWeight.value = localStorage.getItem('formlyProfileWeightGoal') || '';
fysikStartWeight.value = localStorage.getItem(`formlyFysikStartWeight:${selectedWeightPhase}`) || localStorage.getItem('formlyFysikStartWeight') || '';
function getWeightPhaseEntries() {
  return weightHistory.filter((entry) => (entry.phase || 'bulk') === selectedWeightPhase);
}
function switchWeightPhase(direction) {
  const phaseIndex = weightPhases.indexOf(selectedWeightPhase);
  selectedWeightPhase = weightPhases[(phaseIndex + direction + weightPhases.length) % weightPhases.length];
  localStorage.setItem('formlyWeightPhase', selectedWeightPhase);
  weightPhaseLabel.textContent = weightPhaseLabels[selectedWeightPhase];
  fysikStartWeight.value = localStorage.getItem(`formlyFysikStartWeight:${selectedWeightPhase}`) || '';
  syncGoalState(selectedWeightPhase);
  renderWeightHistory();
  renderFysikGoal();
}
weightPhasePrevious.addEventListener('click', () => switchWeightPhase(-1));
weightPhaseNext.addEventListener('click', () => switchWeightPhase(1));
weightPhaseLabel.textContent = weightPhaseLabels[selectedWeightPhase];
function renderFysikGoal() {
  const latestMeasurement = [...getWeightPhaseEntries()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).at(-1);
  const currentWeight = Number(latestMeasurement?.weight) || Number(profileWeight.value) || 0;
  const savedStartWeight = Number(fysikStartWeight.value) || 0;
  fysikCurrentWeight.textContent = currentWeight ? `Nuværende vægt: ${formatWeight(currentWeight)} kg` : 'Nuværende vægt: -';
  const targetWeight = Number(fysikTargetWeight.value) || 0;
  const maintenance = Number(maintenanceInput.value) || 0;
  const targetCalories = calculateCalorieTarget();
  const dailyDifference = targetCalories - maintenance;
  const weeklyRate = Math.abs(dailyDifference) * 7 / 7700;
  const weightDifference = targetWeight - currentWeight;
  if (!currentWeight || !targetWeight) {
    fysikGoalSummary.innerHTML = '<p>Skriv dit mål for at se tiden.</p>';
    return;
  }
  if (Math.abs(weightDifference) < 0.05) {
    fysikGoalSummary.innerHTML = '<strong>Mål nået</strong><p>Din nuværende vægt matcher målet.</p>';
    return;
  }
  const directionMatches = (weightDifference > 0 && dailyDifference > 0) || (weightDifference < 0 && dailyDifference < 0);
  const weeks = weeklyRate ? Math.ceil(Math.abs(weightDifference) / weeklyRate) : 0;
  const direction = weightDifference > 0 ? 'op' : 'ned';
  const modes = weightDifference > 0 ? [
    { label: 'Moderat bulk', data: goalData.bulk.moderate, look: 'Mere fylde i musklerne og typisk mindre ændring i taljen.' },
    { label: 'Aggressiv bulk', data: goalData.bulk.high, look: 'Hurtigere fylde og styrke, men større risiko for synlig fedtøgning omkring taljen.' }
  ] : weightDifference < 0 ? [
    { label: 'Moderat cut', data: goalData.cut.moderate, look: 'Mindre talje over tid, mens musklerne kan bevares med styrketræning og protein.' },
    { label: 'Aggressiv cut', data: goalData.cut.high, look: 'Hurtigere synligt vægttab, men større risiko for fladere muskler og tab af muskelmasse.' }
  ] : selectedGoal === 'maintain' ? [
    { label: 'Vedligehold', data: goalData.maintain.moderate, look: 'Vægten er stabil, mens styrketræning kan give langsom forbedring af kropssammensætningen.' }
  ] : [];
  const modeSummary = modes.map((mode) => {
    const modeDifference = Math.round(mode.data.amount * getTrainingDayFactor());
    const modeRate = Math.abs(modeDifference) * 7 / 7700;
    const modeWeeks = modeRate ? Math.ceil(Math.abs(weightDifference) / modeRate) : 0;
    const timing = modeDifference ? `Ca. ${modeWeeks} uger (${Math.ceil(modeWeeks / 4.345)} måneder)` : 'Ingen planlagt vægtændring';
    return `<div class="fysik-goal-mode"><strong>${mode.label}: ${modeDifference > 0 ? '+' : ''}${modeDifference.toLocaleString('da-DK')} kcal/dag</strong><span>${timing}</span><small><b>Forventet at se:</b> ${mode.look}</small><small><b>Fordel:</b> ${mode.data.pros}</small><small><b>Ulempe:</b> ${mode.data.cons}</small></div>`;
  }).join('');
  const distanceText = `${formatWeight(Math.abs(weightDifference))} kg ${weightDifference > 0 ? 'mangler til målet' : 'over målet'}`;
  fysikGoalSummary.innerHTML = `<strong>${distanceText}</strong><p>${formatWeight(currentWeight)} kg → ${formatWeight(targetWeight)} kg</p><p>${directionMatches ? `Dit valgte kcal-mål giver ${dailyDifference > 0 ? '+' : ''}${dailyDifference.toLocaleString('da-DK')} kcal/dag og cirka ${weeks} uger (${Math.ceil(weeks / 4.345)} måneder).` : `Dit nuværende kcal-mål peger ikke ${direction}. Vælg ${weightDifference > 0 ? 'Bulk' : 'Cut'} for et passende ${weightDifference > 0 ? 'overskud' : 'underskud'}.`}</p>${modeSummary || `<p><b>Fordel:</b> ${getIntensityData().pros}</p><p><b>Ulempe:</b> ${getIntensityData().cons}</p>`}`;
}
fysikStartWeight.addEventListener('input', () => {
  localStorage.setItem(`formlyFysikStartWeight:${selectedWeightPhase}`, fysikStartWeight.value);
  renderFysikGoal();
});
saveFysikStartWeight.addEventListener('click', () => {
  const startWeight = Number(fysikStartWeight.value);
  if (!startWeight || startWeight <= 0) {
    showToast('Skriv en gyldig startvægt først');
    return;
  }
  localStorage.setItem(`formlyFysikStartWeight:${selectedWeightPhase}`, String(startWeight));
  renderFysikGoal();
  showToast(`Startvægt gemt: ${formatWeight(startWeight)} kg`);
});
fysikTargetWeight.addEventListener('input', () => {
  localStorage.setItem('formlyProfileWeightGoal', fysikTargetWeight.value);
  const profileGoalInput = document.querySelector('#profileWeightGoal');
  if (profileGoalInput) profileGoalInput.value = fysikTargetWeight.value;
  renderFysikGoal();
});
function formatWeight(value) {
  return Number(value || 0).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function renderWeightHistory() {
  const latestSavedMeasurement = [...weightHistory].sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a))[0];
  if (latestSavedMeasurement?.weight) {
    profileWeight.value = String(latestSavedMeasurement.weight);
    localStorage.setItem('formlyProfileWeight', String(latestSavedMeasurement.weight));
  }
  const entries = getWeightPhaseEntries()
    .filter((entry) => new Date(entry.timestamp || getProgressTimestamp(entry)).getFullYear() === selectedFysikYear)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || (a.week || 0) - (b.week || 0));
  const overviewWeightStat = document.querySelector('#overviewWeightStat');
  const overviewWeightNote = document.querySelector('#overviewWeightNote');
  const latestWeightEntry = latestSavedMeasurement || entries[entries.length - 1];
  if (overviewWeightStat) overviewWeightStat.textContent = latestWeightEntry ? `${formatWeight(latestWeightEntry.weight)} kg` : '-';
  if (overviewWeightNote) overviewWeightNote.textContent = latestWeightEntry ? `${latestWeightEntry.date || 'Seneste måling'} - næste måling mandag` : 'Tryk for at veje dig ind ->';
  if (!entries.length) {
    weightChangeSummary.innerHTML = '';
    weightChart.innerHTML = '<div class="weight-empty-state"><span>03</span><strong>Din kurve starter her</strong><p>Gem din første måling ovenfor. Når du kommer tilbage næste uge, kan du se retningen og tempoet i din udvikling.</p></div>';
    weightHistoryList.innerHTML = '';
    return;
  }
  const weights = entries.map((entry) => Number(entry.weight) || 0);
  const baselineWeight = Number(fysikStartWeight.value) || weights[0];
  const totalChange = weights[weights.length - 1] - baselineWeight;
  const changeLabel = totalChange > 0 ? 'taget på' : totalChange < 0 ? 'tabt' : 'ingen ændring';
  const changeText = changeLabel === 'ingen ændring'
    ? 'Ingen samlet vægtændring'
    : selectedWeightPhase === 'cut' && totalChange < 0
      ? `Du har tabt dig ${formatWeight(Math.abs(totalChange))} kg`
      : selectedWeightPhase === 'bulk' && totalChange > 0
        ? `Du har taget ${formatWeight(totalChange)} kg på`
        : `${formatWeight(Math.abs(totalChange))} kg ${changeLabel}`;
  weightChangeSummary.innerHTML = `<strong>${changeText}</strong><span>fra ${formatWeight(baselineWeight)} kg til ${formatWeight(weights[weights.length - 1])} kg over tid · ${weightPhaseLabels[selectedWeightPhase]}</span>`;
  const minWeight = Math.min(...weights) - 1;
  const maxWeight = Math.max(...weights) + 1;
  const range = Math.max(1, maxWeight - minWeight);
  const chartWidth = Math.max(520, entries.length * 150);
  const chartHeight = 180;
  const points = entries.map((entry, index) => {
    const x = entries.length === 1 ? chartWidth / 2 : 28 + index * ((chartWidth - 56) / (entries.length - 1));
    const y = chartHeight - 24 - (((Number(entry.weight) - minWeight) / range) * (chartHeight - 48));
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const averageIndex = (entries.length - 1) / 2;
  const averageWeight = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  const slope = entries.length > 1
    ? weights.reduce((sum, weight, index) => sum + (index - averageIndex) * (weight - averageWeight), 0) / weights.reduce((sum, _weight, index) => sum + (index - averageIndex) ** 2, 0)
    : 0;
  const trendStartWeight = averageWeight + slope * (0 - averageIndex);
  const trendEndWeight = averageWeight + slope * ((entries.length - 1) - averageIndex);
  const trendStartY = chartHeight - 24 - (((trendStartWeight - minWeight) / range) * (chartHeight - 48));
  const trendEndY = chartHeight - 24 - (((trendEndWeight - minWeight) / range) * (chartHeight - 48));
  const trendText = entries.length > 1 ? `Lineær trend: ${slope >= 0 ? '+' : ''}${formatWeight(slope)} kg pr. måling` : 'Lineær trend vises fra næste vejning';
  weightChangeSummary.innerHTML += `<small class="weight-linear-trend">${trendText}</small>`;
  const chartBaseline = chartHeight - 24;
  const areaPoints = `${points[0].x},${chartBaseline} ${line} ${points[points.length - 1].x},${chartBaseline}`;
  weightChart.innerHTML = `<svg class="weight-line-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Kropsvægt og lineær trend over tid"><defs><linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00f58a" stop-opacity="0.28"></stop><stop offset="100%" stop-color="#00f58a" stop-opacity="0"></stop></linearGradient><filter id="weightLineGlow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="3" result="blur"></feGaussianBlur><feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs><line class="weight-chart-baseline" x1="28" y1="${chartBaseline}" x2="${chartWidth - 28}" y2="${chartBaseline}"></line><polygon class="weight-chart-area" points="${areaPoints}"></polygon><line class="weight-trend-line" x1="${points[0].x}" y1="${trendStartY}" x2="${points[points.length - 1].x}" y2="${trendEndY}"></line><polyline class="weight-data-line" points="${line}"></polyline>${points.map((point, index) => `<g><circle cx="${point.x}" cy="${point.y}" r="5"></circle><text x="${point.x}" y="${point.y - 12}" text-anchor="middle">${formatWeight(entries[index].weight)}</text><text x="${point.x}" y="${chartHeight - 7}" text-anchor="middle">${entries[index].date || `Måling ${index + 1}`}</text></g>`).join('')}</svg>`;
  weightHistoryList.innerHTML = entries.slice().reverse().map((entry) => {
    const entryIndex = entries.indexOf(entry);
    const previous = entries[entryIndex - 1];
    const change = previous ? Number(entry.weight) - Number(previous.weight) : 0;
    const image = entry.photo ? `<img src="${entry.photo}" alt="Fysikfoto ${entry.date || ''}">` : '';
    const daysBetween = previous ? Math.max(0, Math.round((getProgressTimestamp(entry) - getProgressTimestamp(previous)) / 86400000)) : 0;
    const feedback = previous
      ? `${change > 0 ? `${formatWeight(change)} kg taget på` : change < 0 ? `Du har tabt dig ${formatWeight(Math.abs(change))} kg` : 'uændret vægt'} på ${daysBetween} dage${entry.photo && previous.photo ? ' siden sidste billede' : ' siden sidste måling'}`
      : 'Første billede og startpunkt';
    const praise = !previous
      ? 'Godt begyndt - du har sat et tydeligt startpunkt.'
      : change > 0
        ? 'Stærkt arbejde - udviklingen går opad.'
        : change < 0
          ? 'God disciplin - udviklingen går nedad.'
          : 'God stabilitet - vægten holder sig rolig.';
    const caution = !previous
      ? 'Ulempe: Der er endnu ingen tidligere måling at sammenligne med.'
      : change > 0
        ? 'Ulempe: Hold øje med taljemål og tempo, så vægtøgningen ikke bliver for hurtig.'
        : change < 0
          ? 'Ulempe: For hurtigt tab kan påvirke energi og muskelmasse.'
          : 'Ulempe: Synlig fremgang kan være langsom, selv om styrken forbedres.';
    const aiReview = entry.photo ? `<button type="button" class="weight-ai-review" data-weight-index="${weightHistory.indexOf(entry)}">Vurder foto med AI</button><small class="weight-ai-result" data-weight-result="${weightHistory.indexOf(entry)}"></small>` : '';
    return `<div class="weight-history-row">${image}<strong>${formatWeight(entry.weight)} kg</strong><span>${entry.date || 'Uden dato'}</span><small>${feedback}</small><div class="weight-photo-feedback"><span><b>Ros:</b> ${praise}</span><span><b>Cons:</b> ${caution}</span></div>${aiReview}</div>`;
  }).join('');
  weightHistoryList.querySelectorAll('.weight-ai-review').forEach((button) => button.addEventListener('click', async () => {
    const entry = weightHistory[Number(button.dataset.weightIndex)];
    if (!entry?.photo) return;
    button.disabled = true;
    button.textContent = 'AI vurderer...';
    const resultElement = weightHistoryList.querySelector(`[data-weight-result="${button.dataset.weightIndex}"]`);
    try {
      const answer = await askLocalCoach(`Vurder mit fysikfoto fra ${entry.date || 'denne måling'} sammen med min vægt på ${formatWeight(entry.weight)} kg. Beskriv kun synlige, ikke-medicinske ændringer med respektfuldt sprog. Nævn om der ses tegn på mere muskelmasse eller fedt, men sig tydeligt hvis billedet ikke giver sikkert grundlag.`, [entry.photo]);
      if (!answer) {
        button.textContent = 'Vurder foto med AI';
        return;
      }
      if (resultElement) resultElement.textContent = answer;
      button.textContent = 'AI-vurdering færdig';
    } catch {
      button.textContent = 'AI-vurdering fejlede';
    }
  }));
}
let pendingWeightPhoto = '';
let weightPhotoReady = Promise.resolve();
function compressWeightPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', reject);
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('error', reject);
      image.addEventListener('load', () => {
        const scale = Math.min(1, 700 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}
weightTracker.querySelector('#weightHistoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (localStorage.getItem('formlyWithingsConnected') === '1') {
    showToast('Withings styrer vægten. Deaktivér Withings for manuel indtastning.');
    return;
  }
  const saveButton = event.currentTarget.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  await weightPhotoReady;
  const dateValue = weightTracker.querySelector('#weightDate').value;
  const weight = Number(weightTracker.querySelector('#weightEntry').value);
  const parsedDate = parseWorkoutDateInput(dateValue);
  const timestamp = parsedDate.getTime();
  const entry = { dateValue, timestamp, weight, date: parsedDate.toLocaleDateString('da-DK'), photo: pendingWeightPhoto, phase: selectedWeightPhase };
  weightHistory.push(entry);
  if (!Number(fysikStartWeight.value)) {
    fysikStartWeight.value = String(weight);
    localStorage.setItem(`formlyFysikStartWeight:${selectedWeightPhase}`, String(weight));
  }
  try {
    localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
  } catch {
    showToast('Billedet er for stort. Vælg et mindre foto.');
    saveButton.disabled = false;
    return;
  }
  profileWeight.value = weight;
  updateMaintenance();
  renderWeightHistory();
  showToast(`${entry.date} er gemt med ${formatWeight(weight)} kg`);
  const nextMonday = new Date(parsedDate);
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  weightTracker.querySelector('#weightDate').value = nextMonday.toLocaleDateString('da-DK');
  weightTracker.querySelector('#weightEntry').value = '';
  weightTracker.querySelector('#weightPhotoInput').value = '';
  weightTracker.querySelector('#weightPhotoPreview').innerHTML = '';
  pendingWeightPhoto = '';
  saveButton.disabled = false;
});
weightTracker.querySelector('#weightDate').value = new Date().toLocaleDateString('da-DK');
weightTracker.querySelector('#weightPhotoInput').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  weightTracker.querySelector('#weightPhotoFileName').textContent = file.name;
  weightPhotoReady = compressWeightPhoto(file).then((imageData) => {
    pendingWeightPhoto = imageData;
    weightTracker.querySelector('#weightPhotoPreview').innerHTML = `<img src="${imageData}" alt="Valgt fysikfoto">`;
  }).catch(() => {
    pendingWeightPhoto = '';
    weightTracker.querySelector('#weightPhotoPreview').innerHTML = '';
    showToast('Fotoet kunne ikke indlæses');
  });
});
weightTracker.querySelector('#weightWithingsConnect').addEventListener('click', () => {
  localStorage.setItem('formlyHealthProvider', 'withings');
  document.querySelector('.health-providers [data-provider="withings"]')?.click();
});
renderWeightHistory();
const foodForm = document.querySelector('#foodForm');
const foodList = document.querySelector('#foodList');
const foodTotal = document.querySelector('#foodTotal');
const foodTarget = document.querySelector('#foodTarget');
const kcalRemainingLabel = document.querySelector('#kcalRemainingLabel');
const kcalRemainingValue = document.querySelector('#kcalRemainingValue');
const goalLabels = { cut: 'CUT', maintain: 'VEDLIGEHOLD', bulk: 'BULK' };
// Protein = 2,2x kropsvægt (uændret af mål), fedt sænkes på Cut, og kulhydrat udfylder resten af kcal-målet.
const proteinPerKg = 2.2;
const fatGramsByGoal = { cut: 65, maintain: 85, bulk: 85 };

function calculateCalorieTarget() {
  const maintenance = Number(maintenanceInput.value || 0);
  const adjustment = getGoalAdjustment(selectedGoal, intensitySelect.value, getSelectedTrainingDays());
  return maintenance + adjustment;
}

function getMacroGoals() {
  const kcalGoal = calculateCalorieTarget();
  const protein = Math.round((Number(profileWeight.value) || 0) * proteinPerKg);
  const fat = fatGramsByGoal[selectedGoal] ?? 85;
  const carbs = Math.max(0, Math.round((kcalGoal - (protein * 4) - (fat * 9)) / 4));
  return { kcal: kcalGoal, protein, carbs, fat };
}
function updateMacroCard(key, current, goal) {
  const textEl = document.querySelector(`#${key}ProgressText`);
  const barEl = document.querySelector(`#${key}ProgressBar`);
  if (textEl) textEl.textContent = `${Math.round(current)}/${goal} g`;
  if (barEl) barEl.style.width = `${Math.min(100, goal ? (current / goal) * 100 : 0)}%`;
}
const foodGramsInput = document.querySelector('#foodGramsInput');
const foodCarbsInput = document.querySelector('#foodCarbsInput');
const foodFatInput = document.querySelector('#foodFatInput');
const foodEntries = JSON.parse(localStorage.getItem('formlyFoodEntries') || '[]');
function foodDateKey(date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function todayFoodDateKey() { return foodDateKey(new Date()); }
// Entries logged before day-tracking existed count as "today" so nothing already logged gets lost.
let foodDateMigrated = false;
foodEntries.forEach((entry) => { if (!entry.date) { entry.date = todayFoodDateKey(); foodDateMigrated = true; } });
if (foodDateMigrated) localStorage.setItem('formlyFoodEntries', JSON.stringify(foodEntries));

// Browsing lets you look back and forward through days, with no cap; each calendar day starts empty on its own.
let selectedFoodDate = new Date();
selectedFoodDate.setHours(0, 0, 0, 0);
const foodDateLabel = document.querySelector('#foodDateLabel');
const foodDatePrev = document.querySelector('#foodDatePrev');
const foodDateNext = document.querySelector('#foodDateNext');
const foodMonthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAJ', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
function isViewingToday() { return foodDateKey(selectedFoodDate) === todayFoodDateKey(); }
function updateFoodDateNav() {
  foodDateLabel.textContent = `${selectedFoodDate.getDate()}. ${foodMonthNames[selectedFoodDate.getMonth()]} ${selectedFoodDate.getFullYear()}`;
  const isToday = isViewingToday();
  foodDateLabel.title = isToday ? 'I dag' : 'Valgt dag - mad gemmes på denne dato';
}
foodDatePrev.addEventListener('click', () => {
  selectedFoodDate.setDate(selectedFoodDate.getDate() - 1);
  updateFoodDateNav();
  renderFood();
});
foodDateNext.addEventListener('click', () => {
  selectedFoodDate.setDate(selectedFoodDate.getDate() + 1);
  updateFoodDateNav();
  renderFood();
});
let foodTouchStartX = null;
foodDateLabel.parentElement.addEventListener('touchstart', (event) => {
  foodTouchStartX = event.touches[0]?.clientX ?? null;
}, { passive: true });
foodDateLabel.parentElement.addEventListener('touchend', (event) => {
  if (foodTouchStartX === null || !event.changedTouches[0]) return;
  const deltaX = event.changedTouches[0].clientX - foodTouchStartX;
  if (Math.abs(deltaX) > 40) {
    selectedFoodDate.setDate(selectedFoodDate.getDate() + (deltaX < 0 ? 1 : -1));
    updateFoodDateNav();
    renderFood();
  }
  foodTouchStartX = null;
}, { passive: true });
window.setInterval(() => {
  if (isViewingToday()) updateFoodDateNav();
}, 60000);
updateFoodDateNav();
// Meal headings toggle their item list open/closed; delegated so it survives foodList re-renders.
foodList.addEventListener('click', (event) => {
  const heading = event.target.closest('.food-meal-heading');
  if (heading) heading.closest('.food-meal-group')?.classList.toggle('collapsed');
});
const startScanner = document.querySelector('#startScanner');
const scannerVideo = document.querySelector('#scannerVideo');
const barcodeInput = document.querySelector('#barcodeInput');
const useBarcode = document.querySelector('#useBarcode');
const scannerStatus = document.querySelector('#scannerStatus');
const mealSummaryGrid = document.createElement('div');
mealSummaryGrid.className = 'meal-summary-grid';
document.querySelector('.meal-quick-select')?.after(mealSummaryGrid);
// Clicking a meal shortcut opens an overview panel for that meal (kcal + logged items), with scanning tucked in the corner.
const mealOverviewModal = document.querySelector('#mealOverviewModal');
const mealOverviewTitle = document.querySelector('#mealOverviewTitle');
const mealOverviewKcal = document.querySelector('#mealOverviewKcal');
const mealOverviewList = document.querySelector('#mealOverviewList');
function renderMealOverview(meal) {
  mealOverviewTitle.textContent = meal.toUpperCase();
  const mealEntries = foodEntries.filter((entry) => entry.meal === meal && entry.date === foodDateKey(selectedFoodDate));
  const mealKcal = mealEntries.reduce((total, entry) => total + entry.kcal, 0);
  mealOverviewKcal.textContent = `${mealKcal.toLocaleString('da-DK')} kcal`;
  mealOverviewList.innerHTML = mealEntries.length ? mealEntries.map((entry) => {
    const name = String(entry.name || 'Fødevarer').trim() || 'Fødevarer';
    return `<div class="food-entry"><strong>${name}</strong><span>${entry.grams} g · ${entry.kcal} kcal</span><b>${entry.protein || 0}P · ${entry.carbs || 0}K · ${entry.fat || 0}F</b></div>`;
  }).join('') : '<p>Intet logget endnu i denne kategori.</p>';
}
function renderMealSummaries() {
  const meals = ['Morgenmad', 'Frokost', 'Aftensmad', 'Snack'];
  if (!mealSummaryGrid) return;
  const entriesByMeal = meals.map((meal) => {
    const items = foodEntries.filter((entry) => entry.meal === meal && entry.date === foodDateKey(selectedFoodDate));
    const totalKcal = items.reduce((total, item) => total + Number(item.kcal || 0), 0);
    return { meal, items, totalKcal };
  });
  mealSummaryGrid.innerHTML = entriesByMeal.map(({ meal, items, totalKcal }) => {
    const names = items.length ? items.map((item) => String(item.name || 'Fødevarer').trim() || 'Fødevarer') : ['Intet logget endnu'];
    const visibleNames = names.slice(0, 2).join('<br>');
    const extra = names.length > 2 ? `<small>+${names.length - 2} mere</small>` : '';
    return `
      <article class="meal-summary-card ${items.length ? 'filled' : ''}" data-meal="${meal}">
        <div class="meal-summary-header">
          <span>${meal}</span>
          <strong>${totalKcal.toLocaleString('da-DK')} kcal</strong>
        </div>
        <div class="meal-summary-items">${visibleNames}${extra}</div>
      </article>
    `;
  }).join('');
  mealSummaryGrid.querySelectorAll('.meal-summary-card').forEach((card) => {
    card.addEventListener('click', () => {
      const selectedMeal = card.dataset.meal;
      document.querySelectorAll('.meal-quick-select button').forEach((button) => {
        button.classList.toggle('active', button.dataset.meal === selectedMeal);
      });
      document.querySelector('#mealInput').value = selectedMeal;
      renderMealOverview(selectedMeal);
      mealOverviewModal.hidden = false;
    });
  });
}
document.querySelectorAll('.meal-quick-select button').forEach((button) => button.addEventListener('click', () => {
  const selectedMeal = button.dataset.meal;
  document.querySelectorAll('.meal-quick-select button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelector('#mealInput').value = selectedMeal;
  renderMealOverview(selectedMeal);
  mealOverviewModal.hidden = false;
  window.setTimeout(() => startScanner.click(), 120);
}));
document.querySelector('#mealOverviewClose').addEventListener('click', () => { mealOverviewModal.hidden = true; });
document.querySelector('#mealOverviewScan').addEventListener('click', () => {
  mealOverviewModal.hidden = true;
  startScanner.click();
});
const scannerImageInput = document.createElement('input');
scannerImageInput.type = 'file';
scannerImageInput.accept = 'image/*';
scannerImageInput.capture = 'environment';
scannerImageInput.hidden = true;
document.body.append(scannerImageInput);
scannerImageInput.addEventListener('change', async () => {
  const file = scannerImageInput.files[0];
  if (!file || !('BarcodeDetector' in window)) return;
  try {
    const codes = await new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(await createImageBitmap(file));
    if (!codes.length) throw new Error('not-found');
    barcodeInput.value = codes[0].rawValue;
    scannerStatus.textContent = `Kode ${codes[0].rawValue} læst fra foto.`;
    lookupFoodBarcode(codes[0].rawValue);
  } catch {
    scannerStatus.textContent = 'Ingen stregkode fundet i fotoet. Prøv igen eller indtast koden manuelt.';
  }
  scannerImageInput.value = '';
});
let scannerStream;
let zxingReader;
const addExercise = document.querySelector('#addExercise');
const newExerciseSelect = document.querySelector('#newExerciseSelect');
const customExerciseName = document.querySelector('#customExerciseName');
const exerciseOptionsList = document.querySelector('#exerciseOptions');
const exerciseCount = document.querySelector('#exerciseCount');
const programTitle = document.querySelector('#library h2');
const imageCredit = document.createElement('small');
imageCredit.textContent = 'Billeder: Wikimedia Commons';
imageCredit.className = 'image-credit';
programTitle.parentElement.append(imageCredit);
exerciseOptions.forEach((option) => {
  if (newExerciseSelect) newExerciseSelect.insertAdjacentHTML('beforeend', `<option value="${option}">${option}</option>`);
  if (exerciseOptionsList) exerciseOptionsList.insertAdjacentHTML('beforeend', `<option value="${option}"></option>`);
});
const exerciseList = document.querySelector('#exerciseList');
exerciseCount.textContent = `${exerciseList.querySelectorAll('.exercise-row').length}/30 øvelser`;
const sessionSwitcher = document.createElement('div');
sessionSwitcher.className = 'session-switcher';
sessionSwitcher.setAttribute('aria-label', 'Vælg træningssession');
sessionSwitcher.innerHTML = `<button type="button" id="sessionPrevious" aria-label="Forrige session">←</button>${[1, 2, 3, 4, 5, 6, 7].map((session) => `<button type="button" data-session="${session}">${session}</button>`).join('')}<button type="button" id="sessionNext" aria-label="Næste session">→</button><span>Session <strong id="sessionCurrent">1</strong> / 20.000</span>`;
exerciseList.before(sessionSwitcher);
function renderSessionSwitcher() {
  sessionSwitcher.querySelector('#sessionCurrent').textContent = activeWorkoutSession.toLocaleString('da-DK');
  sessionSwitcher.querySelector('#sessionPrevious').disabled = activeWorkoutSession <= 1;
  sessionSwitcher.querySelector('#sessionNext').disabled = activeWorkoutSession >= 20000;
  sessionSwitcher.querySelectorAll('[data-session]').forEach((button) => button.classList.toggle('active', Number(button.dataset.session) === activeWorkoutSession));
}
function selectWorkoutSession(sessionNumber) {
  activeWorkoutSession = Math.max(1, Math.min(20000, Number(sessionNumber) || 1));
  sessionStarted = true;
  localStorage.setItem('formlyActiveWorkoutSession', String(activeWorkoutSession));
  renderSessionSwitcher();
  syncWeekProgressState(selectedProgramWeek);
  renderWorkoutOverview();
  showToast(`Session ${activeWorkoutSession} er valgt`);
}
sessionSwitcher.querySelector('#sessionPrevious').addEventListener('click', () => selectWorkoutSession(activeWorkoutSession - 1));
sessionSwitcher.querySelector('#sessionNext').addEventListener('click', () => selectWorkoutSession(activeWorkoutSession + 1));
sessionSwitcher.querySelectorAll('[data-session]').forEach((button) => button.addEventListener('click', () => selectWorkoutSession(button.dataset.session)));
renderSessionSwitcher();
const programWeekLabel = document.querySelector('#programWeekLabel');
const programPreviousWeek = document.querySelector('#programPreviousWeek');
const programNextWeek = document.querySelector('#programNextWeek');
const programWeekSummary = document.createElement('div');
programWeekSummary.className = 'program-week-summary';
programWeekSummary.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:12px 14px;border-radius:16px;background:rgba(9, 19, 32, 0.9);border:1px solid rgba(107, 179, 255, 0.25);color:#ebf6ff;';
const programResetButton = document.createElement('button');
programResetButton.type = 'button';
programResetButton.textContent = 'Nulstil uge';
programResetButton.className = 'program-reset-button';
programResetButton.style.cssText = 'padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);color:#d9ebff;font-size:0.74rem;cursor:pointer;';
programWeekLabel?.parentElement?.append(programWeekSummary, programResetButton);
let selectedProgramWeek = Number(localStorage.getItem('formlySelectedProgramWeek') || 1);

function normalizeWeeklyCompletionData() {
  const raw = JSON.parse(localStorage.getItem('formlyWeeklyCompletion') || '{}');
  const normalized = {};
  const rowCount = document.querySelectorAll('#exerciseList .exercise-row').length || 0;

  Object.entries(raw).forEach(([weekKey, completionState]) => {
    const parsedWeek = Number(weekKey) || 1;
    if (!Array.isArray(completionState)) return;
    normalized[parsedWeek] = completionState.slice(0, rowCount).map(Boolean);
    while (normalized[parsedWeek].length < rowCount) normalized[parsedWeek].push(false);
  });

  localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(normalized));
  return normalized;
}

const weeklyCompletion = normalizeWeeklyCompletionData();

function normalizeExerciseNameForComparison(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function exerciseHasLoggedInSession(exerciseName, sessionNumber = activeWorkoutSession) {
  const targetSession = Number(sessionNumber || 1);
  const normalizedName = normalizeExerciseNameForComparison(exerciseName);
  return workoutLog.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return normalizeExerciseNameForComparison(entry.exercise) === normalizedName && Number(entry.session || 1) === targetSession;
  });
}

function persistCurrentWeekCompletion() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  weeklyCompletion[selectedProgramWeek] = rows.map((row) => row.querySelector('.complete-button')?.classList.contains('done') || false);
  localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(weeklyCompletion));
  localStorage.setItem('formlySelectedProgramWeek', String(selectedProgramWeek));
}

function resetWeekCompletionState(weekNumber = selectedProgramWeek) {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  weeklyCompletion[weekNumber] = Array(rows.length).fill(false);
  localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(weeklyCompletion));
  localStorage.setItem('formlySelectedProgramWeek', String(weekNumber));
}

function applyExerciseButtonState(button, isDone) {
  if (!button) return;

  button.style.setProperty('background', isDone
    ? 'linear-gradient(180deg, #a8f5b6, #4ee676)'
    : '#0b2d3a', 'important');
  button.style.setProperty('border-color', isDone ? '#7cf1a0' : '#2cc8ff', 'important');
  button.style.setProperty('color', isDone ? '#042713' : '#b9e8ff', 'important');
  button.style.setProperty('box-shadow', isDone
    ? '0 0 0 2px rgba(78, 230, 118, 0.18), 0 0 14px rgba(78, 230, 118, 0.5)'
    : 'none', 'important');
}

function renderProgramOverview() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  const total = rows.length || 0;
  const completed = rows.filter((row) => row.querySelector('.complete-button')?.classList.contains('done')).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  if (programWeekSummary) {
    programWeekSummary.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:#8cc7ff;">Uge ${selectedProgramWeek}</span>
        <strong style="font-size:1.2rem;line-height:1;color:#f7fbff;">${completed}/${total}</strong>
      </div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <span style="font-size:0.72rem;color:#afd4ff;">${percent}% færdig</span>
      </div>
    `;
  }
}

function syncWeekProgressState(weekNumber = selectedProgramWeek) {
  const rowEls = [...document.querySelectorAll('#exerciseList .exercise-row')];

  rowEls.forEach((row) => {
    const exerciseName = row.querySelector('h3')?.textContent?.trim() || '';
    const hasLoggedInCurrentSession = exerciseHasLoggedInSession(exerciseName, activeWorkoutSession);
    const button = row.querySelector('.complete-button');
    const isDone = hasLoggedInCurrentSession;

    button?.classList.toggle('done', isDone);
    applyExerciseButtonState(button, isDone);
    row.classList.toggle('completed', isDone);
  });

  renderProgramOverview();
}
const progressViews = document.querySelectorAll('#progressViews button');
const weekHistory = document.querySelector('#weekHistory');
const volumeStat = document.querySelector('#volumeStat');
const bestOrmStat = document.querySelector('#bestOrmStat');
const repsStat = document.querySelector('#repsStat');
const exerciseImages = {
  'bench press': 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=240&q=80',
  'barbell squat': 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=240&q=80',
  'goblet squat': 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=240&q=80',
  'deadlift': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=240&q=80',
  'leg press machine': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?auto=format&fit=crop&w=240&q=80',
  'lat pulldown': 'https://images.unsplash.com/photo-1584863231364-2edc166de6f5?auto=format&fit=crop&w=240&q=80',
  'shoulder press': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?auto=format&fit=crop&w=240&q=80',
  'romanian deadlift': 'https://images.unsplash.com/photo-1584863231364-2edc166de6f5?auto=format&fit=crop&w=240&q=80',
  'push-up': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?auto=format&fit=crop&w=240&q=80',
  'dead bug': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=240&q=80',
  'hip thrust': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=240&q=80'
};

function updateExerciseVisual(row, exerciseName) {
  const visual = row.querySelector('.exercise-visual');
  let imageElement = visual.querySelector('img');
  if (!imageElement) {
    imageElement = document.createElement('img');
    visual.append(imageElement);
  }
  let videoElement = visual.querySelector('video');
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.muted = true;
    videoElement.defaultMuted = true;
    videoElement.autoplay = false;
    videoElement.loop = true;
    videoElement.playsInline = true;
    videoElement.controls = true;
    videoElement.preload = 'none';
    visual.append(videoElement);
  }

  const normalizedName = String(exerciseName || '').trim();
  const savedImage = getSavedExerciseImage(normalizedName);
  const customImage = visual.dataset.customImage || savedImage;
  if (customImage) {
    visual.dataset.customImage = customImage;
    const isVideo = customImage.startsWith('data:video/') || visual.dataset.customMediaType === 'video';
    imageElement.style.display = isVideo ? 'none' : 'block';
    videoElement.style.display = isVideo ? 'block' : 'none';
    if (isVideo) {
      const sourceChanged = videoElement.src !== customImage;
      if (sourceChanged) videoElement.src = customImage;
      videoElement.setAttribute('aria-label', `${normalizedName || 'Øvelse'} video`);
      const startVideo = () => {
        if (videoElement.readyState < 2) {
          videoElement.addEventListener('canplay', () => videoElement.play().catch(() => {}), { once: true });
          videoElement.load();
          return;
        }
        videoElement.play().catch(() => {});
      };
      videoElement.addEventListener('click', startVideo);
      if (sourceChanged) {
        if (visual.dataset.videoRestored !== 'true') {
          videoElement.addEventListener('canplay', startVideo, { once: true });
        }
        videoElement.addEventListener('error', () => {
          showToast('Videoen kunne ikke afspilles. Brug en MP4-video.');
        }, { once: true });
        if (visual.dataset.videoRestored !== 'true') videoElement.load();
      }
      if (videoElement.readyState >= 3 && visual.dataset.videoRestored !== 'true') startVideo();
    } else {
      imageElement.src = customImage;
      imageElement.alt = `${normalizedName || 'Øvelse'} billede`;
      imageElement.style.objectFit = 'cover';
      imageElement.style.objectPosition = 'center 35%';
      imageElement.style.transform = 'scale(1.12)';
      imageElement.style.background = '#061326';
    }
    visual.classList.add('photo-visual');
    return;
  }

  const defaultImage = exerciseImages[normalizedName.toLowerCase()] || exerciseImages[normalizedName.toLowerCase().replace(/^barbell\s+/, '')] || `https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=240&q=80`;

  imageElement.src = defaultImage;
  imageElement.style.display = 'block';
  videoElement.style.display = 'none';
  imageElement.alt = `${normalizedName || 'Øvelse'} øvelse`;
  imageElement.style.display = 'block';
  imageElement.style.objectFit = 'cover';
  imageElement.style.objectPosition = 'center 35%';
  imageElement.style.transform = 'scale(1.12)';
  visual.classList.add('photo-visual');
  visual.dataset.exercise = (normalizedName || 'Øvelse').toUpperCase();
}

async function findExerciseImage(exerciseName, imageElement) {
  try {
    const query = encodeURIComponent(`${exerciseName} exercise`);
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=240&format=json&origin=*`);
    const data = await response.json();
    const result = data.query && Object.values(data.query.pages)[0];
    const imageUrl = result && result.imageinfo && result.imageinfo[0] && result.imageinfo[0].thumburl;
    if (imageUrl) imageElement.src = imageUrl;
  } catch {
    // Keep the exercise-specific fallback when the image archive is unavailable.
  }
}
const progressStat = document.querySelector('#progressStat');
let selectedGoal = 'cut';

const profileSection = document.querySelector('.profile-section');
const profileHeading = profileSection?.querySelector('.section-heading h2');
if (profileHeading) {
  profileHeading.textContent = 'Dit personlige kcal-mål';
  profileHeading.insertAdjacentHTML('afterend', '<p class="profile-calculator-intro">Beregn et realistisk mål ud fra din krop, aktivitet og træning.</p>');
}
const weightDevicePanel = document.createElement('div');
weightDevicePanel.className = 'weight-device-panel';
weightDevicePanel.innerHTML = '<div><p class="eyebrow">VÆGTMÅLER</p><h3>Seneste vejning</h3><strong><span id="weightReading">-</span> kg</strong><small id="weightSyncStatus">Ingen vejning endnu</small><small id="withingsStats">Withings-statistik vises efter synkronisering</small><small id="withingsActivityStats">Withings steps vises efter aktivitetsgodkendelse</small></div><div class="weight-device-controls"><label>Kilde<select id="weightSource"><option value="manual">Manuel vejning</option><option value="withings">Withings</option><option value="apple">Apple Sundhed</option><option value="google">Google Fit</option><option value="fitbit">Fitbit</option><option value="oura">Oura</option><option value="whoop">WHOOP</option></select></label><button id="syncWeight" type="button">Synkroniser vægt</button></div>';
profileSection.querySelector('.section-heading').after(weightDevicePanel);

const profileInputsPanel = profileSection.querySelector(':scope > .form-grid');
const profileCalculatorGrid = document.createElement('div');
profileCalculatorGrid.className = 'profile-calculator-grid';
profileInputsPanel.classList.add('profile-inputs-panel');
profileInputsPanel.insertAdjacentHTML('afterbegin', '<div class="profile-step-heading"><span>01</span><div><p>DINE OPLYSNINGER</p><h3>Grundlag for beregningen</h3></div></div>');

const profileResultPanel = document.createElement('aside');
profileResultPanel.className = 'profile-result-panel';
profileResultPanel.innerHTML = '<div class="profile-step-heading"><span>02</span><div><p>DIT DAGLIGE MÅL</p><h3>Kalorier og retning</h3></div></div>';
profileSection.querySelector('.section-heading').after(profileCalculatorGrid);
profileCalculatorGrid.append(profileInputsPanel, profileResultPanel);
profileCalculatorGrid.after(weightDevicePanel);

const goalTabsElement = profileSection.querySelector('#goalTabs');
const goalPrimary = document.createElement('div');
goalPrimary.className = 'profile-goal-primary';
const goalInsights = document.createElement('div');
goalInsights.className = 'profile-goal-insights';
const goalBenefit = document.createElement('div');
goalBenefit.className = 'profile-goal-benefit';
goalBenefit.innerHTML = '<span>FORDEL</span>';
const goalCaution = document.createElement('div');
goalCaution.className = 'profile-goal-caution';
goalCaution.innerHTML = '<span>VÆR OPMÆRKSOM PÅ</span>';
const profileActivitySummary = document.createElement('div');
profileActivitySummary.className = 'profile-activity-summary';
const profileStepsSummary = document.createElement('div');
profileStepsSummary.innerHTML = '<span>DAGLIGE STEPS</span>';
const profileStepKcalSummary = document.createElement('div');
profileStepKcalSummary.innerHTML = '<span>AKTIVITET</span>';
const profileHealthSync = document.createElement('div');
profileHealthSync.className = 'profile-health-sync';

profileResultPanel.append(goalTabsElement, goalPrimary, goalInsights, profileSummary, profileActivitySummary, profileHealthSync);
goalPrimary.append(goalCalories, goalChange);
goalInsights.append(goalBenefit, goalCaution);
goalBenefit.append(goalPros);
goalCaution.append(goalCons);
profileActivitySummary.append(profileStepsSummary, profileStepKcalSummary);
profileStepsSummary.append(stepsValue);
profileStepKcalSummary.append(stepKcalResult);
profileHealthSync.append(syncHealth, healthStatus, healthSteps);
const weightReading = weightDevicePanel.querySelector('#weightReading');
const weightSyncStatus = weightDevicePanel.querySelector('#weightSyncStatus');
const withingsStats = weightDevicePanel.querySelector('#withingsStats');
const weightSource = weightDevicePanel.querySelector('#weightSource');
const syncWeight = weightDevicePanel.querySelector('#syncWeight');
const savedWeightSource = localStorage.getItem('formlyWeightSource');
if (savedWeightSource) weightSource.value = savedWeightSource;
weightSource.addEventListener('change', () => localStorage.setItem('formlyWeightSource', weightSource.value));
const savedWeight = localStorage.getItem('formlyWeight');
if (savedWeight) {
  profileWeight.value = savedWeight;
  weightReading.textContent = savedWeight;
  weightSyncStatus.textContent = 'Sidst gemt fra denne enhed';
}

async function syncWithingsWeightFromBackend() {
  try {
    const response = await fetch(`/api/provider/weight?provider=withings&user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data || !data.ok || !Number(data.weight_kg)) {
      throw new Error(data?.message || 'Ingen vægt tilgængelig');
    }

    const weightValue = Number(data.weight_kg);
    profileWeight.value = String(weightValue);
    profileWeight.dispatchEvent(new Event('input', { bubbles: true }));
    weightReading.textContent = String(weightValue);
    weightSyncStatus.textContent = 'Synkroniseret fra Withings';
    const stats = data.stats;
    if (stats) {
      withingsStats.textContent = `Withings: ${stats.count} vejninger · ændring ${formatWeight(stats.change_kg)} kg · gennemsnit ${formatWeight(stats.average_kg)} kg · min ${formatWeight(stats.min_kg)} kg · max ${formatWeight(stats.max_kg)} kg`;
    }
    healthProviders?.querySelector('#providerStatus') && (healthProviders.querySelector('#providerStatus').textContent = `Withings forbundet · seneste vægt ${formatWeight(weightValue)} kg · statistik opdateret.`);
    localStorage.setItem('formlyWeight', String(weightValue));
    localStorage.setItem('formlyWeightSource', 'withings');
    weightSource.value = 'withings';
  profileWeight.readOnly = true;
  weightEntry.disabled = true;
  weightEntry.placeholder = 'Withings styrer vægten';
  renderFysikGoal();

    const measurements = Array.isArray(data.measurements) && data.measurements.length
      ? data.measurements
      : [{ weight_kg: weightValue, date: data.date }];
    let historyChanged = false;
    measurements.forEach((measurement) => {
      const measurementTimestamp = Number(measurement.date) > 100000000000
        ? Number(measurement.date)
        : Number(measurement.date) * 1000;
      const measurementDate = Number.isFinite(measurementTimestamp) && measurementTimestamp > 0
        ? new Date(measurementTimestamp)
        : new Date();
      const measurementWeight = Number(measurement.weight_kg);
      if (!measurementWeight || weightHistory.some((entry) => Math.abs(Number(entry.weight) - measurementWeight) < 0.01 && Math.abs((entry.timestamp || 0) - measurementDate.getTime()) < 86400000)) return;
      weightHistory.push({ dateValue: getIsoDateValue(measurementDate), timestamp: measurementDate.getTime(), weight: measurementWeight, date: measurementDate.toLocaleDateString('da-DK'), photo: '', phase: selectedWeightPhase, source: 'withings' });
      historyChanged = true;
    });
    if (historyChanged) {
      localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
      renderWeightHistory();
    }
    showToast(`Vægt hentet fra Withings: ${formatWeight(weightValue)} kg`);
  } catch (error) {
    weightSyncStatus.textContent = error?.message === 'Ingen vægt tilgængelig'
      ? 'Withings er forbundet, men ingen vægtmåling er fundet'
      : 'Withings kunne ikke hente den nyeste vægt';
    healthProviders?.querySelector('#providerStatus') && (healthProviders.querySelector('#providerStatus').textContent = error?.message === 'Ingen vægt tilgængelig'
      ? 'Withings er forbundet, men ingen vægtmåling er fundet. Lav en vejning i Withings-appen og prøv igen.'
      : 'Withings er forbundet, men synkronisering af vægt mislykkedes.');
    console.warn('Withings sync failed:', error);
  }
}

window.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.type === 'withings-auth-success' && payload.provider === 'withings') {
    syncWithingsWeightFromBackend();
  }
});

const healthProviders = document.createElement('div');
healthProviders.className = 'health-providers';
healthProviders.innerHTML = '<p class="eyebrow">FLERE SUNDHEDSKILDER</p><div class="provider-grid"><button type="button" data-provider="apple">Forbind Apple Health</button><button type="button" data-provider="oura">Forbind Oura</button><button type="button" data-provider="whoop">Forbind WHOOP</button><button type="button" data-provider="withings">Forbind Withings</button></div><small id="providerStatus">Vælg en kilde for at forbinde recovery, søvn og puls.</small><button type="button" id="withingsDisconnect" hidden>Deaktivér Withings</button>';
profileSection.append(healthProviders);
const withingsButton = healthProviders.querySelector('[data-provider="withings"]');
const withingsDisconnect = healthProviders.querySelector('#withingsDisconnect');
function applyWithingsConnectionState(connected) {
  withingsButton.textContent = connected ? 'Withings forbundet' : 'Forbind Withings';
  withingsDisconnect.hidden = !connected;
  profileWeight.readOnly = connected;
  weightEntry.disabled = connected;
  weightEntry.placeholder = connected ? 'Withings styrer vægten' : 'Fx 82,4';
}
withingsDisconnect.addEventListener('click', async () => {
  await fetch(`/api/provider/disconnect?user_id=${encodeURIComponent(userId)}`, { method: 'POST' });
  localStorage.removeItem('formlyWithingsConnected');
  applyWithingsConnectionState(false);
  healthProviders.querySelector('#providerStatus').textContent = 'Withings er deaktiveret. Indtast vægt manuelt.';
  weightSyncStatus.textContent = 'Indtastet manuelt';
  renderFysikGoal();
});

const providerCallbackParams = new URLSearchParams(window.location.search);
if (providerCallbackParams.get('provider') === 'withings' && providerCallbackParams.get('connected') === '1') {
  localStorage.setItem('formlyWithingsConnected', '1');
  applyWithingsConnectionState(true);
  healthProviders.querySelector('#providerStatus').textContent = 'Forbundet med Withings. Henter seneste vægt...';
  window.setTimeout(() => syncWithingsWeightFromBackend(), 0);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
}
else if (localStorage.getItem('formlyWithingsConnected') === '1') {
  applyWithingsConnectionState(true);
  healthProviders.querySelector('#providerStatus').textContent = 'Forbundet med Withings. Henter seneste vægt...';
  window.setTimeout(() => syncWithingsWeightFromBackend(), 0);
}

async function syncWithingsActivityFromBackend() {
  try {
    const response = await fetch(`/api/provider/activity?provider=withings&user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data?.ok) throw new Error(data?.message || 'Ingen steps tilgængelige');
    const activityStats = weightDevicePanel.querySelector('#withingsActivityStats');
    if (activityStats) {
      activityStats.textContent = `Withings i dag: ${Number(data.steps || 0).toLocaleString('da-DK')} steps · ${Number(data.distance_m || 0).toLocaleString('da-DK')} m · ${Number(data.active_calories || 0).toLocaleString('da-DK')} aktive kcal`;
    }
  } catch (error) {
    const activityStats = weightDevicePanel.querySelector('#withingsActivityStats');
    if (activityStats) activityStats.textContent = 'Withings steps kræver ny godkendelse med aktivitetsadgang.';
    const withingsButton = healthProviders?.querySelector('[data-provider="withings"]');
    if (withingsButton) withingsButton.textContent = 'Aktivér steps fra Withings';
    console.warn('Withings activity sync failed:', error);
  }
}

const autoSyncWithingsWeight = () => {
  if (localStorage.getItem('formlyWithingsConnected') === '1') {
    syncWithingsWeightFromBackend();
    syncWithingsActivityFromBackend();
  }
};
fetch(`/api/provider/status?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
  .then((response) => response.json())
  .then((data) => {
    if (data?.withings_connected) {
      localStorage.setItem('formlyWithingsConnected', '1');
      applyWithingsConnectionState(true);
      healthProviders.querySelector('#providerStatus').textContent = 'Forbundet med Withings. Henter seneste vægt...';
      syncWithingsWeightFromBackend();
      syncWithingsActivityFromBackend();
    }
  })
  .catch(() => {});
window.addEventListener('pageshow', autoSyncWithingsWeight);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autoSyncWithingsWeight();
});
window.setInterval(autoSyncWithingsWeight, 60000);

window.AIOHealthKitBridge = window.AIOHealthKitBridge || {
  requestHealthData: function requestHealthData() {
    const bridge = window.HealthKitBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.healthKitBridge);
    if (!bridge) {
      return false;
    }

    if (typeof bridge.requestHealthData === 'function') {
      bridge.requestHealthData();
      return true;
    }

    if (typeof bridge.postMessage === 'function') {
      bridge.postMessage({ type: 'requestHealthData' });
      return true;
    }

    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.healthKitBridge) {
      window.webkit.messageHandlers.healthKitBridge.postMessage({ type: 'requestHealthData' });
      return true;
    }

    return false;
  },
  handleIncomingData: function handleIncomingData(payload) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const stepCount = Number(data.steps || 0);
    const weight = Number(data.weight || 0);
    const activeCalories = Number(data.activeCalories || 0);
    const distance = Number(data.distance || 0);
    const sleepMinutes = Number(data.sleepMinutes || 0);

    if (stepCount > 0) {
      stepsInput.value = Math.min(20000, stepCount);
      exactStepsInput.value = stepCount;
      updateSteps();
      const activityStats = document.querySelector('#withingsActivityStats');
      if (activityStats) activityStats.textContent = `Sundhed i dag: ${stepCount.toLocaleString('da-DK')} steps`;
      const healthStatus = document.querySelector('#providerStatus');
      if (healthStatus) healthStatus.textContent = `Apple Sundhed forbundet · ${stepCount.toLocaleString('da-DK')} steps importeret.`;
    }

    if (weight > 0) {
      profileWeight.value = weight;
      localStorage.setItem('formlyWeight', String(weight));
      document.querySelector('#weightReading').textContent = weight;
    }

    if (activeCalories > 0 || distance > 0 || sleepMinutes > 0) {
      localStorage.setItem('formlyHealthKitData', JSON.stringify(data));
    }

    showToast('Apple Health-data importeret');
  }
};

window.handleHealthKitData = function handleHealthKitData(payload) {
  window.AIOHealthKitBridge.handleIncomingData(payload);
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function renderWorkoutOverview() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  const sessionEntries = workoutLog.filter((entry) => Number(entry.session || 1) === activeWorkoutSession);
  const completedExercises = rows.filter((row) => row.classList.contains('completed')).length;
  const isSessionComplete = localStorage.getItem(`formlyWorkoutSessionComplete:${activeWorkoutSession}`) === 'true';
  const loggedSets = sessionEntries.reduce((total, entry) => total + getExerciseSetCount(entry), 0);
  const sessionVolume = sessionEntries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const completionPercent = isSessionComplete ? 100 : rows.length ? Math.round((completedExercises / rows.length) * 100) : 0;
  const latestEntry = [...sessionEntries].sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a))[0];

  document.querySelector('#workoutSessionBadge').textContent = `SESSION ${String(activeWorkoutSession).padStart(2, '0')}`;
  document.querySelector('#workoutStatusLabel').textContent = isSessionComplete ? 'Session gennemført' : sessionEntries.length ? 'Træning i gang' : 'Klar til at starte';
  document.querySelector('#workoutOverviewTitle').textContent = isSessionComplete ? 'Dagens arbejde er gemt' : sessionEntries.length ? 'Fortsæt hvor du slap' : 'Byg videre på din styrke';
  document.querySelector('#workoutOverviewLead').textContent = isSessionComplete ? `${loggedSets} arbejdssæt og ${sessionVolume.toLocaleString('da-DK')} kg volumen er registreret.` : sessionEntries.length ? `${loggedSets} arbejdssæt er logget. Fortsæt med næste øvelse.` : 'Dit program er klar. Åbn øvelserne og registrér dagens arbejdssæt.';
  document.querySelector('#workoutExerciseTotal').textContent = String(rows.length);
  document.querySelector('#workoutLoggedSets').textContent = String(loggedSets);
  document.querySelector('#workoutSessionVolume').textContent = `${sessionVolume.toLocaleString('da-DK')} kg`;
  document.querySelector('#workoutCompletionPercent').textContent = `${completionPercent}%`;
  document.querySelector('#workoutCompletionBar').style.width = `${completionPercent}%`;
  document.querySelector('#workoutPlanSummary').textContent = isSessionComplete ? 'Sessionen er gennemført' : `${completedExercises} af ${rows.length} øvelser markeret færdige`;
  document.querySelector('#workoutLastLog').textContent = latestEntry ? `${latestEntry.exercise} · ${latestEntry.date || formatWorkoutDate(new Date(getProgressTimestamp(latestEntry)))}` : 'Ingen endnu';
  startButton.innerHTML = `${sessionEntries.length ? 'Fortsæt træning' : 'Åbn øvelser'} <span aria-hidden="true">→</span>`;
  sessionComplete.textContent = isSessionComplete ? 'Gennemført' : 'Markér som gennemført';
  sessionComplete.classList.toggle('done', isSessionComplete);
}

startButton.addEventListener('click', () => {
  if (!sessionStarted) {
    activeWorkoutSession += 1;
    sessionStarted = true;
    localStorage.setItem('formlyActiveWorkoutSession', String(activeWorkoutSession));
  }
  syncWeekProgressState(selectedProgramWeek);
  window.showAppPage?.('library');
  showToast(`Session ${activeWorkoutSession} er klar på dashboardet`);
});
sessionComplete.addEventListener('click', () => {
  const isComplete = localStorage.getItem(`formlyWorkoutSessionComplete:${activeWorkoutSession}`) !== 'true';
  localStorage.setItem(`formlyWorkoutSessionComplete:${activeWorkoutSession}`, String(isComplete));
  renderWorkoutOverview();
  showToast(isComplete ? 'Hele træningen er markeret som færdig' : 'Træningen er markeret som aktiv');
});
renderWorkoutOverview();
progressButton?.addEventListener('click', () => document.querySelector('#progress').scrollIntoView({ behavior: 'smooth' }));

window.setInterval(() => renderTrainingProgress(), 60 * 60 * 1000);

const restTimer = document.createElement('div');
restTimer.className = 'rest-timer';
restTimer.innerHTML = '<div><p class="eyebrow">PAUSE SYSTEM</p><h3>Rest mellem sæt</h3><strong id="restTime">01:30</strong></div><div class="rest-controls"><select id="restDuration"><option value="60">60 sek</option><option value="90" selected>90 sek</option><option value="120">120 sek</option><option value="180">180 sek</option></select><button id="startRest" type="button">Start pause</button><button id="resetRest" type="button">Nulstil</button><button id="restAlarm" type="button">Aktivér alarm</button></div>';
document.querySelector('#library').append(restTimer);
let restSeconds = 90;
let restInterval;
let restEndsAt = 0;
let restWakeLock = null;
let restAudioContext = null;
const restTime = restTimer.querySelector('#restTime');
const restAlarm = restTimer.querySelector('#restAlarm');
const formatRestTime = () => `${String(Math.floor(restSeconds / 60)).padStart(2, '0')}:${String(restSeconds % 60).padStart(2, '0')}`;
const updateRestTime = () => { restTime.textContent = formatRestTime(); };
const savedRestDuration = localStorage.getItem('formlyRestDuration');
if (savedRestDuration) {
  restTimer.querySelector('#restDuration').value = savedRestDuration;
  restSeconds = Number(savedRestDuration);
  updateRestTime();
}
restTimer.querySelector('#restDuration').addEventListener('change', (event) => { restSeconds = Number(event.target.value); localStorage.setItem('formlyRestDuration', event.target.value); updateRestTime(); });
let restAlarmEnabled = localStorage.getItem('formlyRestAlarm') === 'true';
const updateRestAlarmButton = () => { restAlarm.textContent = restAlarmEnabled ? 'Alarm aktiv' : 'Aktivér alarm'; restAlarm.classList.toggle('enabled', restAlarmEnabled); };
let alarmPermissionRequested = restAlarmEnabled;
restAlarm.addEventListener('click', async () => {
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  restAlarmEnabled = true;
  alarmPermissionRequested = true;
  localStorage.setItem('formlyRestAlarm', 'true');
  updateRestAlarmButton();
  showToast(Notification.permission === 'denied' ? 'Alarm aktiv: lyd og vibration bruges' : 'Pausealarm er aktiveret');
});
const announceRestComplete = () => {
  if (!restAlarmEnabled && !alarmPermissionRequested) return;
  if ('vibrate' in navigator) navigator.vibrate([250, 120, 250]);
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification('Pause slut', { body: 'Klar til næste sæt.', tag: 'fitness-rest-timer', icon: './favicon.svg', vibrate: [250, 120, 250], silent: false })).catch(() => {
      try { new Notification('Pause slut', { body: 'Klar til næste sæt.', tag: 'fitness-rest-timer' }); } catch {}
    });
  }
  try {
    const audioContext = restAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    if (audioContext.state === 'suspended') audioContext.resume();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch {}
};
updateRestAlarmButton();
const releaseRestWakeLock = async () => {
  if (!restWakeLock) return;
  await restWakeLock.release().catch(() => {});
  restWakeLock = null;
};
const requestRestWakeLock = async () => {
  if (!('wakeLock' in navigator)) return;
  restWakeLock = await navigator.wakeLock.request('screen').catch(() => null);
};
const finishRest = () => {
  window.clearInterval(restInterval);
  restTimer.classList.remove('running');
  announceRestComplete();
  showToast('Pause slut - klar til næste sæt');
  restSeconds = Number(restTimer.querySelector('#restDuration').value);
  restEndsAt = 0;
  updateRestTime();
  releaseRestWakeLock();
};
const updateRestFromClock = () => {
  if (!restEndsAt) return;
  restSeconds = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
  updateRestTime();
  if (restSeconds <= 0) finishRest();
};
restTimer.querySelector('#startRest').addEventListener('click', () => {
  window.clearInterval(restInterval);
  try {
    restAudioContext = restAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (restAudioContext.state === 'suspended') restAudioContext.resume();
  } catch {}
  restEndsAt = Date.now() + (restSeconds * 1000);
  restTimer.classList.add('running');
  requestRestWakeLock();
  restInterval = window.setInterval(() => {
    updateRestFromClock();
  }, 1000);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && restEndsAt) { updateRestFromClock(); requestRestWakeLock(); } });
restTimer.querySelector('#resetRest').addEventListener('click', () => { window.clearInterval(restInterval); restTimer.classList.remove('running'); restEndsAt = 0; restSeconds = Number(restTimer.querySelector('#restDuration').value); updateRestTime(); releaseRestWakeLock(); });

function updateSteps() {
  const steps = Math.max(0, Math.min(20000, Number(stepsInput.value) || 0));
  stepsInput.value = steps;
  exactStepsInput.value = steps;
  stepsValue.textContent = steps.toLocaleString('da-DK');
  const stepKcal = steps * Number(profileWeight.value) * 0.0005;
  stepKcalResult.innerHTML = `${Math.round(stepKcal)} <small>kcal</small>`;
  localStorage.setItem('formlySteps', String(steps));
  updateMaintenance();
}

stepsInput.addEventListener('input', updateSteps);
exactStepsInput.addEventListener('input', () => {
  stepsInput.value = Math.max(0, Math.min(20000, Number(exactStepsInput.value) || 0));
  updateSteps();
});
profileWeight.addEventListener('input', () => {
  updateSteps();
});

const goalData = {
  cut: {
    low: { amount: -150, pros: 'Meget skånsomt fedttab med minimal risiko for at miste muskelmasse.', cons: 'Langsom fremgang - kræver tålmodighed.' },
    moderate: { amount: -300, pros: 'Fedttab med et roligt tempo og god chance for at bevare muskelmasse.', cons: 'Mindre energi og langsommere styrkefremgang kan forekomme.' },
    moderateHigh: { amount: -450, pros: 'Tydeligt kalorieunderskud med stadig rimelig energi til træning.', cons: 'Mere sult og øget risiko for at miste lidt muskelmasse.' },
    high: { amount: -600, pros: 'Hurtigt vægttab og et stort kalorieunderskud.', cons: 'Mere sult, lavere energi og større risiko for tab af muskelmasse.' },
    failure: { amount: -750, pros: 'Maksimalt tempo på vægttabet.', cons: 'Høj risiko for udbrændthed, muskeltab og lavt energiniveau - kun til korte perioder.' }
  },
  maintain: {
    low: { amount: 0, pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' },
    moderate: { amount: 0, pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' },
    moderateHigh: { amount: 0, pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' },
    high: { amount: 0, pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' },
    failure: { amount: 0, pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' }
  },
  bulk: {
    low: { amount: 100, pros: 'Meget kontrolleret muskelopbygning med minimal fedtøgning.', cons: 'Langsom vægtstigning.' },
    moderate: { amount: 250, pros: 'Kontrolleret muskelopbygning med mindre ekstra fedt over tid.', cons: 'Muskelopbygningen går langsommere end ved et stort overskud.' },
    moderateHigh: { amount: 350, pros: 'God balance mellem muskelopbygning og et rimeligt overskud.', cons: 'Lidt større risiko for fedtøgning.' },
    high: { amount: 450, pros: 'Mere energi til hård træning og hurtigere vægtstigning.', cons: 'Større risiko for fedtøgning og længere efterfølgende cut.' },
    failure: { amount: 550, pros: 'Maksimalt tempo på vægtstigningen.', cons: 'Størst risiko for fedtøgning - kun til korte perioder.' }
  }
};
// Falls back safely if a stale/unknown intensity value ever lingers (e.g. from an older cached version).
function getIntensityData() {
  return goalData[selectedGoal][intensitySelect.value] || goalData[selectedGoal].moderate;
}

function getSelectedTrainingDays() {
  const profileDays = Number(trainingWeekSelect?.value || localStorage.getItem('formlyTrainingDays') || 3);
  const selected = document.querySelector('#trainingPicker .selected');
  const pickerDays = Number(selected?.dataset.days || profileDays || 3);
  const selectedDays = Number.isFinite(profileDays) ? profileDays : pickerDays;
  if (trainingWeekSelect && Number(trainingWeekSelect.value) !== selectedDays) {
    trainingWeekSelect.value = String(selectedDays);
  }
  return selectedDays;
}

function applyTrainingDaySelection(days) {
  const selectedDays = Number(days || getSelectedTrainingDays() || 3);
  const buttons = [...document.querySelectorAll('#trainingPicker button')];
  const selectedButton = buttons.find((button) => Number(button.dataset.days) === selectedDays) || buttons[0];
  buttons.forEach((button) => button.classList.toggle('selected', button === selectedButton));
  if (trainingWeekSelect) trainingWeekSelect.value = String(selectedDays);
  const trainingValue = document.querySelector('#trainingValue');
  const trainingTip = document.querySelector('#trainingTip');
  if (trainingValue) trainingValue.textContent = `${selectedDays} træning${selectedDays === 1 ? '' : 'er'} om ugen`;
  if (trainingTip) {
    trainingTip.textContent = selectedDays === 1
      ? '1 dag/uge giver maksimal restitution og et lavt volumeniveau.'
      : selectedDays >= 2 && selectedDays <= 3
        ? 'Full body · 2-3 gange om ugen med god restitution.'
        : selectedDays <= 4 ? 'God balance mellem fremgang og restitution.'
          : selectedDays <= 6 ? 'Høj træningsmængde kræver god søvn og planlægning.'
            : '7 dage/uge er meget intensivt; prioritér restitution og belastningsstyring.';
  }
  localStorage.setItem('formlyTrainingDays', String(selectedDays));
  updateIntensityLabels();
  updateGoal();
  updateMaintenance();
}

function getTrainingDayFactor(trainingDays = getSelectedTrainingDays()) {
  if (trainingDays <= 1) return 0.82;
  if (trainingDays === 2) return 0.9;
  if (trainingDays === 3) return 1;
  if (trainingDays === 4) return 1.06;
  if (trainingDays === 5) return 1.12;
  if (trainingDays === 6) return 1.18;
  return 1.24;
}

function getGoalAdjustment(goalKey = selectedGoal, intensityKey = intensitySelect.value, trainingDays = getSelectedTrainingDays()) {
  const safeGoal = goalData[goalKey] ? goalKey : 'cut';
  const safeIntensity = goalData[safeGoal][intensityKey] ? intensityKey : 'moderate';
  const baseAmount = goalData[safeGoal][safeIntensity]?.amount ?? goalData[safeGoal].moderate.amount ?? 0;
  const dayFactor = getTrainingDayFactor(trainingDays);
  if (safeGoal === 'maintain') return 0;
  return Math.round(baseAmount * dayFactor);
}

function updateIntensityLabels() {
  const labels = {
    low: 'Lavt alene',
    moderate: 'Moderat alene',
    moderateHigh: 'Moderat-Stor (blandet)',
    high: 'Højt alene',
    failure: 'Failure'
  };
  const values = Object.keys(labels);
  values.forEach((value) => {
    const option = [...intensitySelect.options].find((item) => item.value === value);
    if (!option) return;
    const adjustedAmount = getGoalAdjustment(selectedGoal, value, getSelectedTrainingDays());
    const sign = adjustedAmount > 0 ? '+' : '';
    option.text = `${labels[value]} (${sign}${adjustedAmount} kcal)`;
  });
  if (intensitySelect.value && intensitySelect.selectedIndex >= 0) {
    const selectedOption = intensitySelect.options[intensitySelect.selectedIndex];
    intensitySelect.title = selectedOption?.text || 'Intensitet';
  }
}

function updateGoal() {
  const change = getGoalAdjustment();
  const calories = calculateCalorieTarget();
  goalCalories.innerHTML = `${calories.toLocaleString('da-DK')} <small>kcal</small>`;
  goalChange.textContent = change === 0 ? 'På dit estimerede vedligeholdelsesniveau' : `${change > 0 ? '+' : ''}${change} kcal fra vedligeholdelse`;
  const intensityLabel = intensitySelect.options[intensitySelect.selectedIndex]?.text || 'Intensitet';
  intensitySelect.title = `${intensityLabel}: ${change > 0 ? '+' : ''}${change} kcal`;
  goalPros.textContent = getIntensityData().pros;
  goalCons.textContent = getIntensityData().cons;
  if (profileSummary) profileSummary.textContent = `${calories.toLocaleString('da-DK')} kcal · ${getIntensityData().pros}`;
  if (foodTarget) renderFood();
  if (typeof renderFysikGoal === 'function') renderFysikGoal();
}

function renderFood() {
  const viewedDateKey = foodDateKey(selectedFoodDate);
  const dayEntries = foodEntries.filter((entry) => entry.date === viewedDateKey);
  const calories = dayEntries.reduce((total, entry) => total + entry.kcal, 0);
  const protein = dayEntries.reduce((total, entry) => total + entry.protein, 0);
  const carbs = dayEntries.reduce((total, entry) => total + (entry.carbs || 0), 0);
  const fat = dayEntries.reduce((total, entry) => total + (entry.fat || 0), 0);
  const goals = getMacroGoals();
  foodTotal.innerHTML = `${calories.toLocaleString('da-DK')} <small>kcal</small>`;
  foodTarget.textContent = `${goals.kcal.toLocaleString('da-DK')} kcal`;
  if (kcalRemainingLabel) kcalRemainingLabel.textContent = `KCAL TILBAGE (${goalLabels[selectedGoal]})`;
  if (kcalRemainingValue) kcalRemainingValue.textContent = `${Math.max(0, goals.kcal - calories).toLocaleString('da-DK')} kcal`;
  updateMacroCard('protein', protein, goals.protein);
  updateMacroCard('carbs', carbs, goals.carbs);
  updateMacroCard('fat', fat, goals.fat);
  const mealOrder = ['Morgenmad', 'Frokost', 'Aftensmad', 'Snack'];
  const indexedEntries = foodEntries.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.date === viewedDateKey);
  foodList.innerHTML = dayEntries.length ? mealOrder.map((meal) => {
    const mealEntries = indexedEntries.filter((entry) => entry.meal === meal);
    if (!mealEntries.length) return '';
    const mealKcal = mealEntries.reduce((total, entry) => total + entry.kcal, 0);
    return `<div class="food-meal-group collapsed"><div class="food-meal-heading"><strong>${meal}</strong><span>${mealKcal.toLocaleString('da-DK')} kcal</span></div><div class="food-meal-items">${mealEntries.map((entry) => `<div class="food-entry"><strong>${entry.name}</strong><span>${entry.grams} g · ${entry.kcal} kcal</span><b>${entry.protein || 0}P · ${entry.carbs || 0}K · ${entry.fat || 0}F</b><button class="food-remove" data-index="${entry.index}" type="button">x</button></div>`).join('')}</div></div>`;
  }).join('') : '<p>Ingen mad logget denne dag</p>';
  foodList.querySelectorAll('.food-remove').forEach((button) => button.addEventListener('click', () => { foodEntries.splice(Number(button.dataset.index), 1); localStorage.setItem('formlyFoodEntries', JSON.stringify(foodEntries)); renderFood(); }));
  const overviewFoodStat = document.querySelector('#overviewFoodStat');
  if (overviewFoodStat) overviewFoodStat.textContent = `${calories.toLocaleString('da-DK')} / ${goals.kcal.toLocaleString('da-DK')} kcal`;
  renderMealSummaries();
}
document.querySelector('#overviewFoodCard')?.addEventListener('click', () => document.querySelector('.food-section').scrollIntoView({ behavior: 'smooth', block: 'start' }));
document.querySelector('#overviewWeightCard')?.addEventListener('click', () => document.querySelector('.weight-tracker-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

foodForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const grams = Number(foodGramsInput.value);
  const proteinPer100g = Number(document.querySelector('#foodProteinInput').value) || 0;
  const carbsPer100g = Number(foodCarbsInput.value) || 0;
  const fatPer100g = Number(foodFatInput.value) || 0;
  const kcalPer100g = (proteinPer100g * 4) + (carbsPer100g * 4) + (fatPer100g * 9);
  const foodName = document.querySelector('#foodNameInput').value.trim() || 'Uden navn';
  const selectedMeal = document.querySelector('#mealInput').value || 'Morgenmad';
  foodEntries.push({ meal: selectedMeal, name: foodName, grams, kcal: Math.round(grams / 100 * kcalPer100g), protein: Math.round(grams / 100 * proteinPer100g), carbs: Math.round(grams / 100 * carbsPer100g), fat: Math.round(grams / 100 * fatPer100g), date: foodDateKey(selectedFoodDate) });
  localStorage.setItem('formlyFoodEntries', JSON.stringify(foodEntries));
  foodForm.reset();
  document.querySelector('#mealInput').value = selectedMeal;
  renderMealOverview(selectedMeal);
  renderFood();
  showToast(`${foodName} gemt i ${selectedMeal}`);
});

async function lookupFoodBarcode(code) {
  scannerStatus.textContent = 'Søger efter fødevaren...';
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const result = await response.json();
    if (result.status !== 1) throw new Error('not-found');
    const product = result.product;
    document.querySelector('#foodNameInput').value = product.product_name || 'Scannet fødevare';
    document.querySelector('#foodKcalInput').value = '';
    document.querySelector('#foodProteinInput').value = Number(product.nutriments?.proteins_100g || 0).toFixed(1);
    foodCarbsInput.value = Number(product.nutriments?.carbohydrates_100g || 0).toFixed(1);
    foodFatInput.value = Number(product.nutriments?.fat_100g || 0).toFixed(1);
    document.querySelector('#foodGramsInput').value = 100;
    scannerStatus.textContent = `${product.product_name || 'Fødevaren'} fundet. Kontroller data og tilføj den.`;
  } catch {
    scannerStatus.textContent = 'Koden blev læst, men fødevaren blev ikke fundet. Indtast data manuelt.';
  }
}

// Manual code entry as a fallback, since camera-based scanning doesn't always work.
useBarcode.addEventListener('click', () => {
  if (barcodeInput.value.trim()) lookupFoodBarcode(barcodeInput.value.trim());
});

// Auto-fills protein/carbs/fat when a food name is typed manually, so kcal matches the real item.
const foodLookupStatus = document.querySelector('#foodLookupStatus');
const foodNameInput = document.querySelector('#foodNameInput');
let lastLookedUpName = '';
async function lookupFoodByName(name) {
  const query = name.trim();
  if (!query || query === lastLookedUpName) return;
  if (foodLookupStatus) foodLookupStatus.textContent = 'Slår varen op...';
  try {
    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`);
    const result = await response.json();
    const product = result.products?.[0];
    if (!product) throw new Error('not-found');
    foodProteinInput.value = Number(product.nutriments?.proteins_100g || 0).toFixed(1);
    foodCarbsInput.value = Number(product.nutriments?.carbohydrates_100g || 0).toFixed(1);
    foodFatInput.value = Number(product.nutriments?.fat_100g || 0).toFixed(1);
    lastLookedUpName = query;
    if (foodLookupStatus) foodLookupStatus.textContent = `Makroer fundet for "${product.product_name || query}" (pr. 100 g).`;
  } catch {
    if (foodLookupStatus) foodLookupStatus.textContent = 'Ingen makroer fundet automatisk - indtast dem manuelt.';
  }
}
foodNameInput.addEventListener('change', () => lookupFoodByName(foodNameInput.value));

startScanner.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    scannerStatus.textContent = 'Kamera kræver HTTPS eller localhost. Brug foto eller manuel kode.';
    scannerImageInput.click();
    return;
  }
  if (!('BarcodeDetector' in window)) {
    scannerStatus.textContent = 'Live scanning understøttes ikke her. Vælg et foto af stregkoden eller indtast koden manuelt.';
    scannerImageInput.click();
    return;
  }
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scannerVideo.srcObject = scannerStream;
    scannerVideo.hidden = false;
    await scannerVideo.play();
    scannerStatus.textContent = 'Peg kameraet på QR- eller stregkoden...';
    const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const scan = async () => {
      if (!scannerStream) return;
      const codes = await detector.detect(scannerVideo);
      if (codes.length) {
        barcodeInput.value = codes[0].rawValue;
        scannerStatus.textContent = `Kode ${codes[0].rawValue} læst.`;
        scannerStream.getTracks().forEach((track) => track.stop());
        scannerStream = null;
        scannerVideo.hidden = true;
        lookupFoodBarcode(codes[0].rawValue);
        return;
      }
      window.requestAnimationFrame(scan);
    };
    scan();
  } catch {
    scannerStatus.textContent = 'Kameraet kunne ikke åbnes. Brug foto eller manuel kode.';
    scannerImageInput.click();
  }
});

healthProviders.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', () => {
    const providerNames = { apple: 'Apple Health', oura: 'Oura', whoop: 'WHOOP', withings: 'Withings' };
    const provider = providerNames[button.dataset.provider] || button.dataset.provider;
    const providerKey = button.dataset.provider;
    localStorage.setItem('formlyHealthProvider', providerKey);

    if (providerKey === 'withings' && localStorage.getItem('formlyWithingsConnected') === '1') {
      showToast('Withings er allerede forbundet. Brug Deaktivér Withings for at skifte kilde.');
      return;
    }

    if (providerKey === 'apple') {
      const bridgeAvailable = window.AIOHealthKitBridge.requestHealthData();
      if (!bridgeAvailable) {
        healthProviders.querySelector('#providerStatus').textContent = 'Apple Health kræver en native iOS-app. I browseren kan du kun bruge manuel indtastning og upload.';
        showToast('Apple Health kræver native app');
        return;
      }
      healthProviders.querySelector('#providerStatus').textContent = 'Apple Health er valgt. Appen beder nu om data via native bridge.';
      showToast('Apple Health åbner');
      return;
    }

    if (providerKey === 'withings' || providerKey === 'whoop') {
      fetch(`/api/provider/start?provider=${providerKey}&user_id=${encodeURIComponent(userId)}`)
        .then((response) => response.json())
        .then((data) => {
          if (data && data.ok && data.url) {
            localStorage.setItem(`formly${providerKey}AuthUrl`, data.url);
            healthProviders.querySelector('#providerStatus').textContent = `${provider} er valgt. OAuth-flow åbner nu via din backend.`;
            showToast(`${provider}-forbindelse startet`);
            window.location.assign(data.url);
            return;
          }

          healthProviders.querySelector('#providerStatus').textContent = `${provider} kræver OAuth-credentials i backend. Sæt ${providerKey.toUpperCase()}_CLIENT_ID og ${providerKey.toUpperCase()}_CLIENT_SECRET i .env før login.`;
          showToast(`${provider}-credentials mangler`);
        })
        .catch(() => {
          healthProviders.querySelector('#providerStatus').textContent = `${provider} kunne ikke starte. Tjek backend og OAuth-konfigurationen.`;
          showToast(`${provider}-forbindelse fejlede`);
        });
      return;
    }

    if (providerKey === 'oura') {
      healthProviders.querySelector('#providerStatus').textContent = `${provider} kræver OAuth/API-kode fra producentens udviklerportal. Appen er klar til at modtage data, når credentials er lagt ind.`;
      showToast(`${provider}-forbindelse forberedt`);
      return;
    }

    healthProviders.querySelector('#providerStatus').textContent = `${provider} er valgt. Direkte data kræver login, OAuth/API og din tilladelse.`;
    showToast(`${provider}-forbindelse valgt`);
  });
});
syncWeight.addEventListener('click', () => {
  const sourceNames = { manual: 'manuel vejning', withings: 'Withings', apple: 'Apple Sundhed', google: 'Google Fit', fitbit: 'Fitbit', oura: 'Oura', whoop: 'WHOOP' };
  const weight = Number(profileWeight.value);
  if (!weight || weight <= 0) {
    weightSyncStatus.textContent = 'Indtast en gyldig vægt først';
    return;
  }
  localStorage.setItem('formlyWeight', String(weight));
  weightReading.textContent = weight;
  weightSyncStatus.textContent = `Gemt fra ${sourceNames[weightSource.value]}`;
  const scaleDate = new Date();
  const scaleEntry = { dateValue: getIsoDateValue(scaleDate), timestamp: scaleDate.getTime(), weight, date: scaleDate.toLocaleDateString('da-DK'), photo: '' };
  if (!weightHistory.some((entry) => Math.abs(entry.weight - weight) < 0.01 && Math.abs((entry.timestamp || 0) - scaleDate.getTime()) < 60000)) {
    weightHistory.push(scaleEntry);
    localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
    renderWeightHistory();
  }
  updateMaintenance();
  showToast(`Vægt på ${weight} kg er gemt`);
});
function getSafeGoal(goalKey) {
  return goalData[goalKey] ? goalKey : 'cut';
}

function getValidIntensityForGoal(goalKey, preferredIntensity) {
  const safeGoal = getSafeGoal(goalKey);
  if (goalData[safeGoal][preferredIntensity]) return preferredIntensity;
  return goalData[safeGoal].moderate ? 'moderate' : Object.keys(goalData[safeGoal])[0];
}

function syncGoalState(goalKey) {
  const safeGoal = getSafeGoal(goalKey);
  selectedGoal = safeGoal;
  selectedWeightPhase = safeGoal;
  localStorage.setItem('formlyWeightPhase', selectedWeightPhase);
  if (weightPhaseLabel) weightPhaseLabel.textContent = weightPhaseLabels[selectedWeightPhase];
  if (fysikStartWeight) fysikStartWeight.value = localStorage.getItem(`formlyFysikStartWeight:${selectedWeightPhase}`) || '';
  const nextIntensity = getValidIntensityForGoal(safeGoal, intensitySelect.value || 'moderate');
  intensitySelect.value = nextIntensity;
  localStorage.setItem('formlyGoal', safeGoal);
  localStorage.setItem('formlyIntensity', nextIntensity);
  goalTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.goal === safeGoal));
  intensitySelect.disabled = safeGoal === 'maintain';
  updateIntensityLabels();
  updateGoal();
  updateMaintenance();
}

function initializeGoalState() {
  const savedGoal = localStorage.getItem('formlyGoal');
  const safeGoal = getSafeGoal(savedGoal || 'cut');
  selectedGoal = safeGoal;
  selectedWeightPhase = safeGoal;
  localStorage.setItem('formlyWeightPhase', selectedWeightPhase);
  if (weightPhaseLabel) weightPhaseLabel.textContent = weightPhaseLabels[selectedWeightPhase];
  if (fysikStartWeight) fysikStartWeight.value = localStorage.getItem(`formlyFysikStartWeight:${selectedWeightPhase}`) || '';
  const savedIntensity = localStorage.getItem('formlyIntensity');
  const safeIntensity = getValidIntensityForGoal(safeGoal, savedIntensity || 'moderate');
  intensitySelect.value = safeIntensity;
  localStorage.setItem('formlyGoal', safeGoal);
  localStorage.setItem('formlyIntensity', safeIntensity);
  goalTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.goal === safeGoal));
  intensitySelect.disabled = safeGoal === 'maintain';
  updateIntensityLabels();
  updateGoal();
  updateMaintenance();
}

intensitySelect.addEventListener('change', () => {
  if (!goalData[selectedGoal]?.[intensitySelect.value]) {
    intensitySelect.value = getValidIntensityForGoal(selectedGoal, 'moderate');
  }
  localStorage.setItem('formlyIntensity', intensitySelect.value);
  updateIntensityLabels();
  updateGoal();
  updateMaintenance();
});
trainingWeekSelect.addEventListener('change', () => {
  const selectedDays = Number(trainingWeekSelect.value || 3);
  localStorage.setItem('formlyTrainingDays', String(selectedDays));
  applyTrainingDaySelection(selectedDays);
});
maintenanceInput.addEventListener('input', updateGoal);
goalTabs.forEach((tab) => tab.addEventListener('click', () => {
  syncGoalState(tab.dataset.goal);
}));

document.querySelectorAll('#trainingPicker button').forEach((button) => button.addEventListener('click', () => {
  applyTrainingDaySelection(button.dataset.days);
}));
const savedTrainingDays = Number(localStorage.getItem('formlyTrainingDays') || 3);
applyTrainingDaySelection(savedTrainingDays);
initializeGoalState();

if (trainingWeekSelect) {
  trainingWeekSelect.value = String(savedTrainingDays);
}

[profileWeight, profileHeight, profileAge, profileSex].forEach((input) => input.addEventListener('input', updateMaintenance));
if (calculateGoals) {
  calculateGoals.addEventListener('click', () => {
    updateMaintenance();
    showToast('Kcal-mål opdateret');
  });
}
updateMaintenance();

[profileWeight, profileHeight, profileAge, profileSex].forEach((input) => input.addEventListener('input', updateMaintenance));
updateMaintenance();
updateSteps();

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
  });
});

if (exerciseList) {
  exerciseList.addEventListener('click', (event) => {
    const button = event.target.closest('.complete-button');
    if (!button) return;
    const row = button.closest('.exercise-row');
    if (!row) return;
    const isDone = !button.classList.contains('done');
    button.classList.toggle('done', isDone);
    applyExerciseButtonState(button, isDone);
    row.classList.toggle('completed', isDone);
    persistCurrentWeekCompletion();
    showToast(isDone ? 'Øvelse markeret som færdig' : 'Øvelse markeret som aktiv');
  });
}

// Bench-baseret statsoverblik: alle hovedstatistikker skal bygge på Bench Press-historikken.
function renderWorkoutStats() {
  const activeView = [...progressViews].find((btn) => btn.classList.contains('active'))?.dataset.view || 'week';
  const benchEntries = workoutLog.filter((entry) => String(entry.exercise || '').trim().toLowerCase() === 'bench press');
  const groups = {};

  benchEntries.forEach((entry) => {
    const key = activeView === 'week' ? String(entry.week || 1) : (entry.date || 'Ukendt dato');
    (groups[key] = groups[key] || []).push(entry);
  });

  const keys = Object.keys(groups).sort((a, b) => (groups[a][0]?.timestamp || 0) - (groups[b][0]?.timestamp || 0));
  const currentKey = keys[keys.length - 1];
  const currentEntries = groups[currentKey] || [];
  const previousEntries = groups[keys[keys.length - 2]] || [];

  const volume = currentEntries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const previousVolume = previousEntries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const bestOrm = currentEntries.reduce((best, entry) => Math.max(best, (Number(entry.weight) || 0) * (1 + (Number(entry.reps) || 0) / 30)), 0);
  const reps = currentEntries.reduce((total, entry) => total + (Number(entry.reps) || 0) * getExerciseSetCount(entry), 0);
  const change = previousVolume ? Math.round((volume - previousVolume) / previousVolume * 100) : (volume ? 100 : 0);

  volumeStat.textContent = `${volume.toLocaleString('da-DK')} kg`;
  bestOrmStat.textContent = `${bestOrm.toFixed(1).replace('.', ',')} kg`;
  repsStat.textContent = String(reps);
  progressStat.textContent = `${change >= 0 ? '+' : ''}${change}%`;

  if (!benchEntries.length) {
    volumeStat.textContent = '0 kg';
    bestOrmStat.textContent = '0,0 kg';
    repsStat.textContent = '0';
    progressStat.textContent = '+0%';
    weekHistory.innerHTML = '<p>Ingen Bench Press-data endnu</p>';
    return;
  }

  const maxVolume = Math.max(1, ...keys.map((key) => groups[key].reduce((total, entry) => total + getExerciseVolume(entry), 0)));
  weekHistory.innerHTML = keys.length ? keys.map((key) => {
    const entries = groups[key];
    const groupVolume = entries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
    const width = Math.max(4, Math.round((groupVolume / maxVolume) * 100));
    const label = activeView === 'week' ? `Uge ${key}` : key;
    return `<div class="week-row"><strong>${label}</strong><div class="week-bar"><i style="width:${width}%"></i></div><span>${groupVolume.toLocaleString('da-DK')} kg</span></div>`;
  }).join('') : '<p>Ingen Bench Press-data endnu</p>';
}
progressViews.forEach((button) => button.addEventListener('click', () => {
  progressViews.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  renderWorkoutStats();
}));
renderWorkoutStats();


function applyExerciseInfo(row, titleText, statsText) {
  const info = row.querySelector('.exercise-info');
  if (!info) return;
  const category = row.dataset.category || getExerciseCategory(titleText);
  row.dataset.category = category;
  const p = document.createElement('p');
  p.innerHTML = statsText;
  const h3 = document.createElement('h3');
  h3.textContent = titleText;
  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'exercise-category';
  categoryBadge.textContent = category;
  info.innerHTML = '';
  info.append(categoryBadge, h3, p);
}

function refreshExerciseList() {
  document.querySelectorAll('#exerciseList .exercise-row').forEach((row, index) => {
    row.querySelector('.exercise-number').textContent = String(index + 1).padStart(2, '0');
  });
  Object.keys(weeklyCompletion).forEach((weekKey) => {
    const rowCount = document.querySelectorAll('#exerciseList .exercise-row').length;
    const completionState = Array.isArray(weeklyCompletion[weekKey]) ? weeklyCompletion[weekKey] : [];
    while (completionState.length < rowCount) completionState.push(false);
    weeklyCompletion[weekKey] = completionState.slice(0, rowCount);
  });
  exerciseCount.textContent = `${document.querySelectorAll('#exerciseList .exercise-row').length}/30 øvelser`;
  if (selectedProgramWeek) syncWeekProgressState(selectedProgramWeek);
}

function bindDeleteExercise(row) {
  const deleteButton = row.querySelector('.more-button');
  deleteButton.textContent = 'Slet';
  deleteButton.setAttribute('aria-label', `Slet ${row.querySelector('h3').textContent}`);
  deleteButton.addEventListener('click', () => {
    row.remove();
    refreshExerciseList();
    saveProgramExercises();
    showToast('Øvelse slettet fra Mit program');
  });
}

function normalizeExerciseKey(exerciseName = '') {
  return String(exerciseName).trim().toLowerCase().replace(/\s+/g, ' ');
}

function getExerciseImageRegistry() {
  try {
    const registry = JSON.parse(localStorage.getItem(exerciseImageRegistryKey) || '{}');
    let changed = false;
    Object.keys(registry).forEach((key) => {
      if (String(registry[key]).startsWith('data:video/')) {
        delete registry[key];
        localStorage.removeItem(`formlyExerciseImage:${key}`);
        changed = true;
      }
    });
    if (changed) localStorage.setItem(exerciseImageRegistryKey, JSON.stringify(registry));
    return registry;
  } catch {
    return {};
  }
}

function getSavedExerciseImage(exerciseName) {
  const key = normalizeExerciseKey(exerciseName);
  const registry = getExerciseImageRegistry();
  const aliases = [key];
  if (key === 'goblet squat' || key === 'barbell squat' || key === 'squat') {
    aliases.push('barbell squat', 'goblet squat', 'squat');
  }
  for (const alias of aliases) {
    if (registry[alias]) return registry[alias];
    const direct = localStorage.getItem(`formlyExerciseImage:${alias}`);
    if (direct && !direct.startsWith('data:video/')) return direct;
    if (direct?.startsWith('data:video/')) localStorage.removeItem(`formlyExerciseImage:${alias}`);
  }
  return '';
}

function saveExerciseImage(exerciseName, imageDataUrl) {
  const key = normalizeExerciseKey(exerciseName);
  if (String(imageDataUrl).startsWith('data:video/')) {
    localStorage.removeItem(`formlyExerciseImage:${key}`);
    return;
  }
  const registry = getExerciseImageRegistry();
  registry[key] = imageDataUrl;
  localStorage.setItem(exerciseImageRegistryKey, JSON.stringify(registry));
  localStorage.setItem(`formlyExerciseImage:${key}`, imageDataUrl);
}

function saveExerciseVideo(exerciseName, file) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open('all-in-one-fitness-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('exercise-videos');
    request.onsuccess = () => {
      const transaction = request.result.transaction('exercise-videos', 'readwrite');
      transaction.objectStore('exercise-videos').put(file, normalizeExerciseKey(exerciseName));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function loadExerciseVideo(exerciseName) {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open('all-in-one-fitness-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('exercise-videos');
    request.onsuccess = () => {
      const transaction = request.result.transaction('exercise-videos', 'readonly');
      const getRequest = transaction.objectStore('exercise-videos').get(normalizeExerciseKey(exerciseName));
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

async function restoreExerciseVideo(row) {
  const exerciseName = row?.querySelector('h3')?.textContent?.trim();
  if (!row || !exerciseName) return;
  const visual = row.querySelector('.exercise-visual');
  if (!visual || visual.dataset.videoRestorePending === 'true' || visual.dataset.videoRestored === 'true') return;
  visual.dataset.videoRestorePending = 'true';
  const file = await loadExerciseVideo(exerciseName);
  if (!file) {
    delete visual.dataset.videoRestorePending;
    return;
  }
  if (visual.dataset.customPlaybackUrl) URL.revokeObjectURL(visual.dataset.customPlaybackUrl);
  visual.dataset.customPlaybackUrl = URL.createObjectURL(file);
  visual.dataset.customImage = visual.dataset.customPlaybackUrl;
  visual.dataset.customMediaType = 'video';
  visual.dataset.videoRestored = 'true';
  delete visual.dataset.videoRestorePending;
  updateExerciseVisual(row, exerciseName);
}

function saveProgramExercises() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  const data = rows.map((row) => {
    const stats = row.querySelector('.exercise-info p').textContent.match(/([\d.]+)\s*kg.*?([\d.]+)\s*reps.*?([\d.]+)\s*sæt/i) || [];
    return { name: row.querySelector('h3').textContent.trim(), category: row.dataset.category || getExerciseCategory(row.querySelector('h3').textContent), kg: stats[1] || '20', reps: stats[2] || '10', sets: stats[3] || '3' };
  });
  localStorage.setItem(programExercisesKey, JSON.stringify(data));
}
const savedProgramExercises = JSON.parse(localStorage.getItem(programExercisesKey) || 'null');
if (Array.isArray(savedProgramExercises) && savedProgramExercises.length) {
  const exerciseListEl = document.querySelector('#exerciseList');
  const rowTemplate = exerciseListEl.querySelector('.exercise-row').cloneNode(true);
  exerciseListEl.innerHTML = '';
  savedProgramExercises.forEach((exercise, index) => {
    const row = rowTemplate.cloneNode(true);
    row.querySelector('.exercise-number').textContent = String(index + 1).padStart(2, '0');
    row.dataset.category = exercise.category || getExerciseCategory(exercise.name);
    applyExerciseInfo(row, exercise.name, formatExerciseLogSummary(exercise.kg, exercise.reps, exercise.sets));
    bindExerciseRow(row);
    exerciseListEl.append(row);
  });
  refreshExerciseList();
}

function bindExercisePhoto(row) {
  if (!row) return;
  let visual = row.querySelector('.exercise-visual');
  if (!visual) {
    visual = document.createElement('div');
    visual.className = 'exercise-visual';
    const info = row.querySelector('.exercise-info');
    if (info) row.insertBefore(visual, info);
    else row.append(visual);
  }

  const exerciseName = row.querySelector('h3')?.textContent?.trim() || 'Øvelse';
  const savedImage = getSavedExerciseImage(exerciseName);
  if (savedImage) visual.dataset.customImage = savedImage;

  let media = row.querySelector('.exercise-media');
  if (!media) {
    media = document.createElement('div');
    media.className = 'exercise-media';
    row.insertBefore(media, visual);
    media.append(visual);
  }
  let actions = media.querySelector('.exercise-photo-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'exercise-photo-actions';
    actions.innerHTML = '<button type="button" class="exercise-photo-button exercise-camera-button">Tag foto/video</button><button type="button" class="exercise-photo-button exercise-library-button">Vælg foto</button><button type="button" class="exercise-photo-button exercise-video-button">Vælg video</button><input class="exercise-camera-input" type="file" accept="image/*,video/*" capture="environment" hidden><input class="exercise-photo-input" type="file" accept="image/*" hidden><input class="exercise-video-input" type="file" accept="video/*" hidden>';
    media.append(actions);
  }
  const cameraButton = actions.querySelector('.exercise-camera-button');
  const libraryButton = actions.querySelector('.exercise-library-button');
  const videoButton = actions.querySelector('.exercise-video-button');
  const cameraInput = actions.querySelector('.exercise-camera-input');
  const photoInput = actions.querySelector('.exercise-photo-input');
  const videoInput = actions.querySelector('.exercise-video-input');
  const handlePhoto = (input) => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const selectedExercise = row.querySelector('h3')?.textContent?.trim() || 'Øvelse';
      visual.dataset.customImage = reader.result;
      visual.dataset.customMediaType = file.type.startsWith('video/') ? 'video' : 'image';
      if (file.type.startsWith('video/')) {
        visual.dataset.customPlaybackUrl = URL.createObjectURL(file);
        showToast('Videoen er klar til afspilning');
        saveExerciseVideo(selectedExercise, file).catch(() => showToast('Videoen kan kun bruges i denne session'));
      }
      if (!file.type.startsWith('video/')) saveExerciseImage(selectedExercise, reader.result);
      updateExerciseVisual(row, selectedExercise);
      showToast('Eget øvelsesfoto er tilføjet');
      input.value = '';
    });
    reader.readAsDataURL(file);
  };
  if (!cameraButton.dataset.bound) {
    cameraButton.dataset.bound = 'true';
    cameraButton.addEventListener('click', () => cameraInput.click());
    libraryButton.addEventListener('click', () => photoInput.click());
    videoButton.addEventListener('click', () => videoInput.click());
    cameraInput.addEventListener('change', () => handlePhoto(cameraInput));
    photoInput.addEventListener('change', () => handlePhoto(photoInput));
    videoInput.addEventListener('change', () => handlePhoto(videoInput));
  }
  updateExerciseVisual(row, exerciseName);
}

function ensureExerciseRowVisual(row) {
  if (!row) return;
  if (!row.querySelector('.exercise-visual')) {
    const visual = document.createElement('div');
    visual.className = 'exercise-visual';
    const info = row.querySelector('.exercise-info');
    if (info) row.insertBefore(visual, info);
    else row.append(visual);
  }
  if (!row.querySelector('.exercise-photo-button')) {
    bindExercisePhoto(row);
  }
  const exerciseName = row.querySelector('h3')?.textContent?.trim() || '';
  const imageElement = row.querySelector('.exercise-visual img');
  if (!imageElement || imageElement.src !== getSavedExerciseImage(exerciseName)) {
    updateExerciseVisual(row, exerciseName);
  }
}

function bindExerciseRow(row) {
  if (!row) return;
  if (row.dataset.bound === 'true') {
    ensureExerciseRowVisual(row);
    return;
  }
  row.dataset.bound = 'true';

  row.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    const name = row.querySelector('h3')?.textContent?.trim();
    if (!name) return;
    syncExerciseLibraryWithProgress(name);
    if (typeof progressExercisePicker !== 'undefined' && [...progressExercisePicker.options].some((option) => option.value.toLowerCase() === name.toLowerCase())) {
      progressExercisePicker.value = [...progressExercisePicker.options].find((option) => option.value.toLowerCase() === name.toLowerCase()).value;
      renderTrainingProgress();
    }
  });

  const controlWrap = row.querySelector('.exercise-entry-controls');
  if (!controlWrap) {
    const controls = document.createElement('div');
    controls.className = 'exercise-entry-controls';
    const initialStats = row.querySelector('.exercise-info p').textContent.match(/([\d.]+)\s*kg.*?([\d.]+)\s*reps.*?([\d.]+)\s*sæt/i) || [];
    controls.innerHTML = `<div class="exercise-log-heading"><div><span>REGISTRER TRÆNING</span><strong>Hvad gennemførte du?</strong></div><small>Én registrering gemmer hele øvelsen fra denne træning.</small></div><label>Øvelsesnavn<input class="exercise-name-input" type="text" list="exerciseOptions" value="${row.querySelector('h3').textContent}" aria-label="Søg eller vælg øvelse"></label><label>Kategori<select class="exercise-category-input" aria-label="Kategori">${exerciseCategoryOptions}</select></label><label>Vægt (kg)<input type="number" min="0" step="0.5" value="${initialStats[1] || 20}" aria-label="Vægt i kg"></label><label>Reps pr. sæt<input type="number" min="1" value="${initialStats[2] || 10}" aria-label="Reps i hvert sæt"></label><label>Arbejdssæt<input type="number" min="1" value="${initialStats[3] || 3}" aria-label="Antal arbejdssæt"></label><label>Træningsdato<input type="date" class="exercise-date-input" value="${getIsoDateValue(new Date())}" aria-label="Dato for træning"></label><div class="exercise-log-preview" aria-live="polite"><span>DU GEMMER</span><strong></strong><small></small></div><button type="button">Gem træning</button>`;
    row.querySelector('.more-button').before(controls);
  }

  const controls = row.querySelector('.exercise-entry-controls');
  const updateLogPreview = () => {
    const values = controls?.querySelectorAll('input');
    const preview = controls?.querySelector('.exercise-log-preview');
    if (!values || !preview) return;
    const weight = Number(values[1].value) || 0;
    const reps = Number(values[2].value) || 0;
    const sets = getExerciseSetCount(values[3].value);
    preview.querySelector('strong').textContent = `${sets} arbejdssæt × ${reps} reps med ${weight} kg`;
    preview.querySelector('small').textContent = `Samlet volumen: ${(weight * reps * sets).toLocaleString('da-DK')} kg`;
  };
  controls?.querySelectorAll('input').forEach((input) => input.addEventListener('input', updateLogPreview));
  updateLogPreview();
  const categoryInput = controls?.querySelector('.exercise-category-input');
  if (categoryInput && !categoryInput.dataset.bound) {
    categoryInput.dataset.bound = 'true';
    categoryInput.value = row.dataset.category || getExerciseCategory(row.querySelector('h3')?.textContent);
    categoryInput.addEventListener('change', () => {
      row.dataset.category = categoryInput.value;
      applyExerciseInfo(row, row.querySelector('h3')?.textContent || 'Øvelse', row.querySelector('.exercise-info p')?.innerHTML || '');
      saveProgramExercises();
    });
  }
  const saveButton = controls?.querySelector('button');
  if (saveButton && !boundSaveButtons.has(saveButton)) {
    boundSaveButtons.add(saveButton);
    controls.querySelector('.exercise-name-input').addEventListener('input', (event) => updateExerciseVisual(row, event.target.value));
    saveButton.addEventListener('click', () => {
      const values = controls.querySelectorAll('input');
      const currentName = values[0].value || 'Ny øvelse';
      const weight = Number(values[1].value || 0);
      const reps = Number(values[2].value || 0);
      const sets = Number(values[3].value || 0);
      const logDateValue = controls.querySelector('.exercise-date-input').value || getIsoDateValue(new Date());
      const parsedDate = parseWorkoutDateInput(logDateValue);
      const sessionDateValues = normalizeSessionDate(activeWorkoutSession, parsedDate);
      const progressEntry = {
        exercise: currentName,
        weight,
        reps,
        setNumber: sets,
        session: activeWorkoutSession,
        week: selectedProgramWeek,
        timestamp: sessionDateValues.timestamp,
        date: sessionDateValues.date,
        isPR: false,
        prType: ''
      };
      workoutLog.unshift(progressEntry);
      recalculatePrStatus(workoutLog);
      workoutLog.sort((a, b) => (getProgressTimestamp(b) || 0) - (getProgressTimestamp(a) || 0));
      localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
      row.querySelector('h3').textContent = currentName;
      const displayDate = new Date(`${logDateValue}T12:00:00`).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const rowText = formatExerciseLogSummary(weight, reps, sets, displayDate);
      applyExerciseInfo(row, currentName, rowText);
      syncProgressExerciseOptions();
      saveButton.classList.remove('saved');
      saveButton.textContent = 'Gem træning';
      saveProgramExercises();
      syncWeekProgressState(selectedProgramWeek);
      if (typeof renderExerciseTracker === 'function') renderExerciseTracker();
      if (typeof renderWorkoutStats === 'function') renderWorkoutStats();
      if (typeof renderWorkoutLog === 'function') renderWorkoutLog();
      showToast(`${row.querySelector('h3').textContent}: ${sets} arbejdssæt × ${reps} reps med ${weight} kg · ${displayDate}`);
    });
  }

  bindDeleteExercise(row);
  ensureExerciseRowVisual(row);
  const rowSaveButton = row.querySelector('.exercise-entry-controls button');
  if (rowSaveButton) rowSaveButton.textContent = 'Gem træning';
  restoreExerciseVideo(row);
}

function hydrateExerciseLibraryRows() {
  document.querySelectorAll('#exerciseList .exercise-row').forEach((row) => {
    row.dataset.bound = '';
    bindExerciseRow(row);
    ensureExerciseRowVisual(row);

    const exerciseName = row.querySelector('h3')?.textContent?.trim() || '';
    const savedImage = getSavedExerciseImage(exerciseName);
    if (savedImage) {
      const visual = row.querySelector('.exercise-visual');
      if (visual) visual.dataset.customImage = savedImage;
      updateExerciseVisual(row, exerciseName);
    }
    const rowSaveButton = row.querySelector('.exercise-entry-controls button');
    if (rowSaveButton) rowSaveButton.textContent = 'Gem træning';
    restoreExerciseVideo(row);
  });
}

function initializeExerciseLibrary() {
  const exerciseList = document.querySelector('#exerciseList');
  if (!exerciseList) return;
  const rows = [...exerciseList.querySelectorAll('.exercise-row')];
  if (!rows.length) return;
  rows.forEach((row) => {
    row.dataset.bound = '';
    bindExerciseRow(row);
    ensureExerciseRowVisual(row);
    const name = row.querySelector('h3')?.textContent?.trim() || '';
    if (name) {
      const statsElement = row.querySelector('.exercise-info p');
      const statsMarkup = statsElement?.innerHTML || '';
      const initialStats = statsElement?.textContent.match(/([\d.]+)\s*kg.*?([\d.]+)\s*reps.*?([\d.]+)\s*(?:arbejds)?sæt/i) || [];
      const initialDate = statsElement?.textContent.match(/\d{2}[./-]\d{2}[./-]\d{2,4}/)?.[0] || '';
      applyExerciseInfo(row, name, statsElement?.querySelector('.exercise-latest-values') || !initialStats.length ? statsMarkup : formatExerciseLogSummary(initialStats[1], initialStats[2], initialStats[3], initialDate));
      updateExerciseVisual(row, name);
    }
    const savedImage = getSavedExerciseImage(name);
    if (savedImage) {
      const visual = row.querySelector('.exercise-visual');
      if (visual) visual.dataset.customImage = savedImage;
      updateExerciseVisual(row, name);
    }
    const rowSaveButton = row.querySelector('.exercise-entry-controls button');
    if (rowSaveButton) rowSaveButton.textContent = 'Gem træning';
  });
}

const exerciseRows = document.querySelectorAll('.exercise-row');
exerciseRows.forEach((row) => {
  row.dataset.bound = '';
  bindExerciseRow(row);
});

function ensureAllExerciseRowsAreReady() {
  initializeExerciseLibrary();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(() => ensureAllExerciseRowsAreReady(), 30);
  }, { once: true });
} else {
  window.setTimeout(() => ensureAllExerciseRowsAreReady(), 30);
}

const appPageTargets = {
  overview: ['.welcome', '.daily-focus-card', '.daily-quick-actions', '.overview-quick-links', '.overview-categories', '.hero-grid', '.stats-grid'],
  training: ['#workout'],
  food: ['#food'],
  coach: ['.coach-panel'],
  profile: ['.profile-section'],
  weight: ['#weight'],
  progress: ['#progress', '.training-progress-panel'],
  physique: ['#physique-ai'],
  library: ['#library']
};
const appContent = document.querySelector('.content');
document.querySelector('.sidebar-bottom')?.remove();
const appPageElements = new Map();

if (appContent) {
  document.body.classList.add('app-single-page');
  [...appContent.children].forEach((element) => {
    if (element.id === 'mealOverviewModal' || element.classList.contains('topbar')) return;
    element.dataset.appPage = 'overview';
  });

  Object.entries(appPageTargets).forEach(([pageName, selectors]) => {
    const elements = new Set();
    selectors.forEach((selector) => document.querySelectorAll(selector).forEach((element) => {
      if (element !== appContent && appContent.contains(element)) {
        element.dataset.appPage = pageName;
        elements.add(element);
      }
    }));
    appPageElements.set(pageName, elements);
  });

    const backToOverviewButton = document.createElement('button');
    backToOverviewButton.type = 'button';
    backToOverviewButton.className = 'app-page-back';
    backToOverviewButton.setAttribute('aria-label', 'Tilbage til oversigt');
    backToOverviewButton.innerHTML = '<span class="app-page-back-icon" aria-hidden="true">←</span><span class="app-page-back-label">Tilbage til oversigt</span>';
    backToOverviewButton.hidden = true;
    appContent.prepend(backToOverviewButton);

  const showAppPage = (pageName, updateHash = true) => {
    const selectedPage = appPageTargets[pageName] ? pageName : 'overview';
    appContent.dataset.activeAppPage = selectedPage;
    appContent.classList.add('app-pages-mode');
    document.body.classList.toggle('app-overview-active', selectedPage === 'overview');
      backToOverviewButton.hidden = selectedPage === 'overview';
    appContent.querySelectorAll(':scope > [data-app-page]').forEach((element) => {
      element.hidden = element.dataset.appPage !== selectedPage;
      if (element.dataset.appPage === selectedPage && element.parentElement === appContent) element.scrollTop = 0;
    });
    document.querySelectorAll('.nav-link[data-app-page-target]').forEach((link) => {
      link.classList.toggle('active', link.dataset.appPageTarget === selectedPage);
    });
    if (updateHash) history.replaceState({}, '', selectedPage === 'overview' ? '#top' : `#${selectedPage}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  backToOverviewButton.addEventListener('click', () => showAppPage('overview'));

  document.querySelectorAll('.nav-link[data-app-page-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showAppPage(link.dataset.appPageTarget);
    });
  });

  showAppPage('overview');
  window.showAppPage = showAppPage;

  const pageForTarget = (target) => {
    if (!target) return 'overview';
    if (target.includes('food')) return 'food';
    if (target.includes('coach')) return 'coach';
    if (target.includes('weight')) return 'weight';
    if (target.includes('profile')) return 'profile';
    if (target.includes('physique-ai')) return 'physique';
    if (target.includes('workout')) return 'training';
    if (target.includes('library')) return 'library';
    if (target.includes('progress')) return 'progress';
    return 'overview';
  };
  document.addEventListener('click', (event) => {
    const shortcut = event.target.closest('[data-quick-action], [data-quick-target], [data-category-target]');
    if (!shortcut) return;
    const target = shortcut.dataset.quickAction || shortcut.dataset.quickTarget || shortcut.dataset.categoryTarget;
    const page = pageForTarget(target);
    if (page === 'overview') return;
    event.preventDefault();
    showAppPage(page);
    if (shortcut.dataset.categoryMuscle) {
      document.querySelector(`.training-progress-panel .training-tabs [data-muscle="${shortcut.dataset.categoryMuscle}"]`)?.click();
    }
  });
}

const exerciseListForObserver = document.querySelector('#exerciseList');
if (exerciseListForObserver) {
  const exerciseRowObserver = new MutationObserver(() => {
    window.setTimeout(() => ensureAllExerciseRowsAreReady(), 20);
  });
  exerciseRowObserver.observe(exerciseListForObserver, { childList: true, subtree: true });
}

window.addEventListener('load', () => {
  window.setTimeout(() => ensureAllExerciseRowsAreReady(), 50);
});

function addExerciseToLibrary(exerciseNameFromSelect = '') {
  const exerciseList = document.querySelector('#exerciseList') || document.querySelector('.exercise-list');
  const typedExerciseName = (customExerciseName?.value || '').trim();
  const explicitExerciseName = (exerciseNameFromSelect || '').trim();
  const selectValue = (newExerciseSelect?.value || '').trim();
  const selectedExerciseName = explicitExerciseName || selectValue || typedExerciseName;

  if (!exerciseList) return false;
  if (exerciseList.querySelectorAll('.exercise-row').length >= 30) {
    showToast('Mit program kan højst have 30 øvelser');
    return false;
  }
  if (!selectedExerciseName) {
    if (customExerciseName) {
      customExerciseName.focus();
      customExerciseName.classList.add('is-empty');
      setTimeout(() => customExerciseName.classList.remove('is-empty'), 500);
    }
    if (newExerciseSelect) {
      newExerciseSelect.classList.add('open');
      newExerciseSelect.focus();
    }
    return false;
  }

  const template = exerciseList.querySelector('.exercise-row');
  const newRow = template ? template.cloneNode(true) : document.createElement('article');
  newRow.className = 'exercise-row';
  newRow.dataset.bound = '';

  if (!template) {
    newRow.innerHTML = '<span class="exercise-number">01</span><div class="exercise-visual"></div><div class="exercise-info"><p>Ny øvelse <span>•</span> vælg dine værdier</p><h3>Ny øvelse</h3></div><button class="complete-button" type="button">✓</button><button class="more-button" type="button">Slet</button>';
  }

  const rowNumber = exerciseList.querySelectorAll('.exercise-row').length + 1;
  const numberEl = newRow.querySelector('.exercise-number');
  if (numberEl) numberEl.textContent = String(rowNumber).padStart(2, '0');

  const titleEl = newRow.querySelector('h3');
  if (titleEl) titleEl.textContent = selectedExerciseName;

  applyExerciseInfo(newRow, selectedExerciseName, 'Ny øvelse <span>•</span> vælg dine værdier');
  const completeButton = newRow.querySelector('.complete-button');
  if (completeButton) {
    completeButton.classList.remove('done');
    applyExerciseButtonState(completeButton, false);
  }

  if (newRow.querySelector('.exercise-entry-controls')) {
    const clonedControls = newRow.querySelector('.exercise-entry-controls');
    const nameInput = clonedControls.querySelector('.exercise-name-input');
    if (nameInput) nameInput.value = selectedExerciseName;
    const categoryInput = clonedControls.querySelector('.exercise-category-input');
    if (categoryInput) categoryInput.value = getExerciseCategory(selectedExerciseName);
    const [, weightInput, repsInput, setsInput] = clonedControls.querySelectorAll('input');
    if (weightInput) weightInput.value = '20';
    if (repsInput) repsInput.value = '10';
    if (setsInput) setsInput.value = '3';
    const dateInput = clonedControls.querySelector('.exercise-date-input');
    if (dateInput) dateInput.value = getIsoDateValue(new Date());
  }
  newRow.dataset.category = getExerciseCategory(selectedExerciseName);

  bindExerciseRow(newRow);
  ensureExerciseRowVisual(newRow);
  const newSaveButton = newRow.querySelector('.exercise-entry-controls button');
  if (newSaveButton) newSaveButton.textContent = 'Gem træning';

  exerciseList.appendChild(newRow);
  syncProgressExerciseOptions();
  refreshExerciseList();
  saveProgramExercises();
  localStorage.setItem('formlyExerciseCount', String(exerciseList.querySelectorAll('.exercise-row').length));
  syncWeekProgressState(selectedProgramWeek);

  if (customExerciseName) customExerciseName.value = '';
  if (newExerciseSelect) {
    newExerciseSelect.value = '';
    newExerciseSelect.classList.remove('open');
  }
  showToast(`${selectedExerciseName} er tilføjet til Mit program`);
  return true;
}

if (addExercise) {
  const handleAddExerciseClick = () => {
    const currentSelectedValue = (newExerciseSelect?.value || '').trim();
    const currentCustomValue = (customExerciseName?.value || '').trim();
    const chosenName = currentSelectedValue || currentCustomValue;
    addExerciseToLibrary(chosenName);
  };
  addExercise.addEventListener('click', handleAddExerciseClick);
  addExercise.onclick = handleAddExerciseClick;
}

if (customExerciseName) {
  customExerciseName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addExerciseToLibrary();
    }
  });
  customExerciseName.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addExerciseToLibrary();
    }
  };
}

if (newExerciseSelect) {
  const handleExerciseSelectChange = () => {
    if (customExerciseName && newExerciseSelect.value) {
      customExerciseName.value = '';
    }
  };
  newExerciseSelect.addEventListener('change', handleExerciseSelectChange);
  newExerciseSelect.onchange = handleExerciseSelectChange;
}

function primeLibraryState() {
  initializeExerciseLibrary();
  refreshExerciseList();
  syncWeekProgressState(selectedProgramWeek);
}

window.addEventListener('pageshow', () => {
  primeLibraryState();
});

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  window.setTimeout(() => primeLibraryState(), 10);
} else {
  window.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(() => primeLibraryState(), 20);
  }, { once: true });
}

function updateProgramWeek() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  if (!Array.isArray(weeklyCompletion[selectedProgramWeek]) || weeklyCompletion[selectedProgramWeek].length !== rows.length) {
    weeklyCompletion[selectedProgramWeek] = Array(rows.length).fill(false);
  }
  programWeekLabel.textContent = `Uge ${selectedProgramWeek}`;
  localStorage.setItem('formlySelectedProgramWeek', String(selectedProgramWeek));
  localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(weeklyCompletion));
  renderProgramOverview();
  syncWeekProgressState(selectedProgramWeek);
  showToast(`Uge ${selectedProgramWeek} er klar - øvelser vises`);
}

programResetButton.addEventListener('click', () => {
  resetWeekCompletionState(selectedProgramWeek);
  syncWeekProgressState(selectedProgramWeek);
  showToast(`Uge ${selectedProgramWeek} er nulstillet`);
});

programPreviousWeek.addEventListener('click', () => {
  selectedProgramWeek = Math.max(1, selectedProgramWeek - 1);
  updateProgramWeek();
});

programNextWeek.addEventListener('click', () => {
  persistCurrentWeekCompletion();
  selectedProgramWeek += 1;
  resetWeekCompletionState(selectedProgramWeek);
  updateProgramWeek();
});

syncWeekProgressState(selectedProgramWeek);
initializeExerciseLibrary();
window.requestAnimationFrame(() => initializeExerciseLibrary());
window.setTimeout(() => initializeExerciseLibrary(), 80);
