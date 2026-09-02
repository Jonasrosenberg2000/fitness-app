const toast = document.querySelector('#toast');
const programExercisesKey = 'formlyProgramExercises';
const exerciseImageRegistryKey = 'formlyExerciseImageRegistry';
const APP_OPEN_ACCESS = true;
let selectedHomePhotoIndex = -1;
let selectedProgressPhotoIndex = -1;
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
  isOwner: false,
  billingEnvironment: 'live',
  testMode: false,
  billingPlan: '',
  priceDkk: 39,
  plans: {
    weekly: { configured: false, priceDkk: 20 },
    monthly: { configured: false, priceDkk: 39 },
    annual: { configured: false, priceDkk: 468, introPriceDkk: 280.8, introDiscountPercent: 40 }
  },
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
  const proHomeKcalStreak = document.querySelector('#proHomeKcalStreak');
  if (proHomeKcalStreak) proHomeKcalStreak.textContent = String(streak).padStart(2, '0');
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
  const danishMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  const shortDanishMatch = value.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (shortDanishMatch) {
    const currentYear = new Date().getFullYear();
    const shortDate = new Date(`${currentYear}-${shortDanishMatch[2].padStart(2, '0')}-${shortDanishMatch[1].padStart(2, '0')}T12:00:00`);
    return Number.isNaN(shortDate.getTime()) ? new Date() : shortDate;
  }
  const danishYear = danishMatch?.[3]?.length === 2 ? `20${danishMatch[3]}` : danishMatch?.[3];
  const isoValue = danishMatch ? `${danishYear}-${danishMatch[2].padStart(2, '0')}-${danishMatch[1].padStart(2, '0')}` : value;
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
function formatElapsedSinceDate(entry, now = Date.now()) {
  const timestamp = getProgressTimestamp(entry);
  const days = Math.max(0, Math.floor((now - timestamp) / 86400000));
  if (days === 0) return 'I dag';
  if (days === 1) return '1 dag siden';
  if (days < 7) return `${days} dage siden`;
  const weeks = Math.floor(days / 7);
  return `${weeks} uge${weeks === 1 ? '' : 'r'} siden`;
}
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
if (maintenanceInput) {
  maintenanceInput.readOnly = true;
  maintenanceInput.setAttribute('aria-readonly', 'true');
  maintenanceInput.title = 'Beregnes automatisk ud fra dine kropsdata og træningsintensitet';
  const maintenanceLabel = maintenanceInput.closest('label');
  if (maintenanceLabel?.firstChild) maintenanceLabel.firstChild.textContent = 'Beregnet vedligeholdelse';
}
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
const profileWeightGoal = document.querySelector('#profileWeightGoal');

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
restorePersistedInput(stepsInput, 'formlySteps');
restorePersistedInput(exactStepsInput, 'formlyExactSteps');
if (Number(maintenanceInput.value) <= 0 || Number(maintenanceInput.value) > 10000) {
  maintenanceInput.value = '';
  localStorage.removeItem('formlyMaintenance');
}
const profileDefaults = { weight: '70', height: '175', age: '30', steps: '6000', trainingDays: '3' };
if (!(Number(profileWeight.value) > 0)) profileWeight.value = profileDefaults.weight;
if (!(Number(profileHeight.value) > 0)) profileHeight.value = profileDefaults.height;
if (!(Number(profileAge.value) > 0)) profileAge.value = profileDefaults.age;
if (!(Number(exactStepsInput.value) >= 0)) exactStepsInput.value = profileDefaults.steps;
if (!(Number(stepsInput.value) >= 0)) stepsInput.value = exactStepsInput.value || profileDefaults.steps;
if (!(Number(trainingWeekSelect.value) > 0)) trainingWeekSelect.value = profileDefaults.trainingDays;
restorePersistedInput(trainingWeekSelect, 'formlyTrainingDays', 'change');
restorePersistedInput(intensitySelect, 'formlyIntensity', 'change');
if (Number(profileHeight.value) < 120 || Number(profileHeight.value) > 230) profileHeight.value = profileDefaults.height;
if (Number(profileAge.value) < 13 || Number(profileAge.value) > 100) profileAge.value = profileDefaults.age;
if (Number(exactStepsInput.value) < 0 || Number(exactStepsInput.value) > 20000) exactStepsInput.value = profileDefaults.steps;
if (Number(stepsInput.value) < 0 || Number(stepsInput.value) > 20000) stepsInput.value = exactStepsInput.value;
maintenanceInput.value = '';
localStorage.removeItem('formlyMaintenance');
const calculateGoals = document.querySelector('#calculateGoals');
const syncHealth = document.querySelector('#syncHealth');
const healthStatus = document.querySelector('#healthStatus');
const healthSteps = document.querySelector('#healthSteps');
const sessionComplete = document.querySelector('#sessionComplete');

function calculateMaintenanceCalories(weight, height, age, sex, steps, trainingDays, intensity = 'moderate') {
  if (weight <= 0 || height <= 0 || age <= 0) return 0;
  const bmr = sex === 'male'
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161;
  const normalizedSteps = Math.max(0, Math.min(20000, Number(steps) || 0));
  const normalizedTrainingDays = Math.max(0, Math.min(7, Number(trainingDays) || 0));
  const dailyActivity = bmr * (1.2 + ((normalizedSteps / 20000) * 0.4));
  const intensityFactors = { low: 0.8, moderate: 1, moderateHigh: 1.1, high: 1.2, failure: 1.3 };
  const caloriesPerWorkout = weight * 60 * 5 * 0.0175 * (intensityFactors[intensity] || intensityFactors.moderate);
  const dailyTrainingAverage = (caloriesPerWorkout * normalizedTrainingDays) / 7;
  return Math.round(dailyActivity + dailyTrainingAverage);
}

function updateMaintenance() {
  const weight = Number(profileWeight.value) || 0;
  const height = Number(profileHeight.value) || 0;
  const age = Number(profileAge.value) || 0;
  const sex = profileSex.value === 'male' ? 'male' : 'female';
  const maintenanceEstimate = calculateMaintenanceCalories(
    weight,
    height,
    age,
    sex,
    stepsInput.value,
    getSelectedTrainingDays(),
    intensitySelect?.value || 'moderate'
  );
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
    <span class="pro-gate-lock" aria-hidden="true"></span>
    <div><span>KRÆVER PRO</span><strong>Personlig AI-coach</strong><small>39 kr./måned + 20 kr./uge · eller samlet årlig plan</small></div>
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
proAccessButton.textContent = 'PRO · 40 % ÅR 1';
document.body.append(proAccessButton);

const proAccessDialog = document.createElement('div');
proAccessDialog.id = 'proAccessDialog';
proAccessDialog.className = 'pro-access-dialog';
proAccessDialog.hidden = true;
proAccessDialog.innerHTML = `
  <section class="pro-access-sheet" role="dialog" aria-modal="true" aria-labelledby="proAccessTitle">
    <button type="button" class="pro-access-close" aria-label="Luk">×</button>
    <div class="billing-test-badge" role="status" hidden>STRIPE TEST · INGEN RIGTIGE BETALINGER</div>
    <div class="pro-access-heading">
      <span>AIO PRO</span>
      <h2 id="proAccessTitle">Pro-funktioner, på din konto</h2>
      <p>Workout-log, mad/kcal, manuel vægt og egne billeder er gratis. Pro åbner AI, lineær progression og sundhedssynk.</p>
    </div>
    <section class="pro-demo" aria-labelledby="proDemoTitle">
      <header class="pro-demo-header">
        <div><span id="proDemoEyebrow">INTERAKTIV 3D</span><h3 id="proDemoTitle">Se din udvikling fra alle vinkler</h3></div>
        <button type="button" id="proDemoToggle" class="pro-demo-toggle" aria-label="Sæt demo på pause" aria-pressed="false" title="Pause">Ⅱ</button>
      </header>
      <div class="pro-demo-player" data-demo-scene="physique">
        <div class="pro-demo-scene pro-demo-scene-physique" data-demo-panel="physique">
          <div class="pro-demo-appbar"><b>TOOLNOVA</b><span>RANGE OF MOTION ANALYTICS</span><i>LIVE</i></div>
          <div class="pro-demo-analytics-layout">
            <div class="pro-demo-left-panel">
              <div class="pro-demo-patient">
                <span>PATIENT OVERVIEW</span>
                <h4>ALEX MORGAN</h4>
                <small>28 years</small>
              </div>
              <div class="pro-demo-session-summary">
                <div><span>Duration</span><strong>45 min</strong></div>
                <div><span>Exercises</span><strong>7</strong></div>
                <div><span>Calories</span><strong>320 kcal</strong></div>
              </div>
              <div class="pro-demo-ring">
                <div class="pro-demo-ring-inner">
                  <strong>126°</strong>
                  <small>Current</small>
                </div>
                <div class="pro-demo-ring-meta">
                  <span>Current</span>
                  <span>Target</span>
                </div>
              </div>
            </div>
            <div class="pro-demo-right-panel">
              <div class="pro-demo-topline">
                <div class="pro-demo-angle-readout">
                  <span>KNEE FLEXION</span>
                  <strong>126°</strong>
                  <em>135°</em>
                </div>
                <div class="pro-demo-angle-readout accent">
                  <span>IMPROVEMENT</span>
                  <strong>+18%</strong>
                  <em>vs last week</em>
                </div>
              </div>
              <div class="pro-demo-body-stage">
                <img class="pro-demo-hologram-photo" src="assets/anatomy-hologram.jpg" alt="Anatomisk hologram af en mand under træning" loading="lazy">
                <span class="pro-demo-body-stage-label">3D MOVEMENT TRACKING</span>
              </div>
              <div class="pro-demo-metrics-panel">
                <div><span>Hip flexion</span><strong>98°</strong></div>
                <div><span>Knee flexion</span><strong>126°</strong></div>
                <div><span>Ankle dorsiflexion</span><strong>24°</strong></div>
              </div>
              <div class="pro-demo-footer-nav" aria-label="Sektioner i dashboardet">
                <span>DASHBOARD</span>
                <span>SESSIONS</span>
                <span>EXERCISES</span>
                <span>REPORTS</span>
                <span>SETTINGS</span>
              </div>
            </div>
          </div>
        </div>
        <div class="pro-demo-scene pro-demo-scene-coach" data-demo-panel="coach" hidden>
          <div class="pro-demo-appbar"><b>AIO</b><span>AI-COACH</span><i>ONLINE</i></div>
          <div class="pro-demo-chat">
            <p><small>DIT SPØRGSMÅL</small>Hvordan øger jeg min bænkpres uden et ekstra træningspas?</p>
            <p><small>AI-COACH</small>Behold tre pas. Læg 2,5 kg på dit topsæt og stop med to reps i reserve.</p>
          </div>
          <div class="pro-demo-metrics"><span><b>+2,5 kg</b>næste topsæt</span><span><b>2 RIR</b>intensitet</span><span><b>3 pas</b>pr. uge</span></div>
        </div>
        <div class="pro-demo-scene pro-demo-scene-analysis" data-demo-panel="analysis" hidden>
          <div class="pro-demo-appbar"><b>AIO</b><span>FYSIKANALYSE</span><i>KLAR</i></div>
          <div class="pro-demo-angles"><span>FRONT<i></i></span><span>HØJRE<i></i></span><span>VENSTRE<i></i></span></div>
          <div class="pro-demo-result"><b>Fokus de næste 4 uger</b><span>Øvre ryg · Skulderkontrol · Symmetri</span></div>
        </div>
        <div class="pro-demo-scene pro-demo-scene-training" data-demo-panel="training" hidden>
          <div class="pro-demo-appbar"><b>AIO</b><span>DAGENS TRÆNING</span><i>67%</i></div>
          <div class="pro-demo-workout"><p><span>01</span><b>Bench press</b><small>62,5 kg · 8 reps · 3 sæt</small><i>✓</i></p><p><span>02</span><b>Barbell row</b><small>55 kg · 10 reps · 3 sæt</small><i>✓</i></p><p><span>03</span><b>Shoulder press</b><small>32,5 kg · 8 reps · 3 sæt</small><i></i></p></div>
        </div>
        <div class="pro-demo-scene pro-demo-scene-progress" data-demo-panel="progress" hidden>
          <div class="pro-demo-appbar"><b>AIO</b><span>DIN UDVIKLING</span><i>+12%</i></div>
          <div class="pro-demo-chart" aria-hidden="true"><i style="--value:34%"></i><i style="--value:43%"></i><i style="--value:48%"></i><i style="--value:60%"></i><i style="--value:72%"></i><i style="--value:88%"></i></div>
          <div class="pro-demo-metrics"><span><b>82,5 kg</b>bedste 1RM</span><span><b>+8,5 kg</b>siden start</span><span><b>12 uger</b>registreret</span></div>
        </div>
        <div class="pro-demo-scene pro-demo-scene-food" data-demo-panel="food" hidden>
          <div class="pro-demo-appbar"><b>AIO</b><span>MAD & KCal</span><i>I DAG</i></div>
          <div class="pro-demo-food"><div><strong>1.842</strong><small>af 2.200 kcal</small></div><p><span style="--fill:78%"><b>156 g</b>Protein</span><span style="--fill:64%"><b>210 g</b>Kulhydrat</span><span style="--fill:52%"><b>58 g</b>Fedt</span></p></div>
        </div>
      </div>
      <p id="proDemoCaption" class="pro-demo-caption">Se den levende 3D-krop fremhæve de muskelgrupper, din analyse finder.</p>
      <div class="pro-demo-controls">
        <div class="pro-demo-progress" aria-hidden="true"><i></i></div>
        <div class="pro-demo-dots" aria-label="Vælg scene">
          <button type="button" class="active" data-demo-target="physique" aria-label="3D-krop"></button>
          <button type="button" data-demo-target="coach" aria-label="AI-coach"></button>
          <button type="button" data-demo-target="analysis" aria-label="Fysikanalyse"></button>
          <button type="button" data-demo-target="training" aria-label="Træning"></button>
          <button type="button" data-demo-target="progress" aria-label="Progression"></button>
          <button type="button" data-demo-target="food" aria-label="Mad og kcal"></button>
        </div>
      </div>
    </section>
    <section class="pro-monthly-news" aria-labelledby="proMonthlyNewsTitle">
      <header>
        <div><span>NYT HVER MÅNED</span><h3 id="proMonthlyNewsTitle">Nye Pro-funktioner gennem hele året</h3></div>
        <b>INKLUDERET I PRO</b>
      </header>
      <div id="proMonthlyNewsList" class="pro-monthly-news-list"></div>
      <p>Den næste opdatering offentliggøres her. Alle månedlige Pro-opdateringer er med i abonnementet uden ekstra køb.</p>
    </section>
    <div class="pro-plan-grid" role="radiogroup" aria-label="Vælg Pro-abonnement">
      <button type="button" class="pro-plan-card pro-plan-annual" data-pro-plan="annual" role="radio" aria-checked="false">
        <span>40 PROCENT PÅ FØRSTE ÅR</span><h3>Årlig Pro</h3><div><strong>39</strong> kr./md. + <strong>20</strong> kr./uge</div>
        <p>Alle Pro-funktioner · AI-coach · 3D-analyse · progression · sundhedssynk</p>
        <small>Fuld adgang til alle Pro-funktioner · automatisk fornyelse · skift eller opsig når som helst</small>
      </button>
      <button type="button" class="pro-plan-card pro-plan-month" data-pro-plan="monthly" role="radio" aria-checked="false">
        <span>FLEKSIBEL</span><h3>Månedlig Pro</h3><div><strong>39</strong> kr./md.</div>
        <p>Alle Pro-funktioner · AI-coach · 3D-analyse · progression · sundhedssynk</p>
        <small>Fuld adgang til alle Pro-funktioner · automatisk fornyelse · skift eller opsig når som helst</small>
      </button>
      <button type="button" class="pro-plan-card pro-plan-week is-selected" data-pro-plan="weekly" role="radio" aria-checked="true">
        <span>7 DAGE AD GANGEN</span><h3>1 uges Pro</h3><div><strong>20</strong> kr./uge</div>
        <p>Alle Pro-funktioner · AI-coach · 3D-analyse · progression · sundhedssynk</p>
        <small>Fuld adgang til alle Pro-funktioner · automatisk fornyelse · skift eller opsig når som helst</small>
      </button>
    </div>
    <ul class="pro-access-features">
      <li><b>AI</b><span>personlig coaching ud fra dine mål og registreringer</span></li>
      <li><b>3D</b><span>visuelt muskelkort fra din 4-vinkels fysikanalyse</span></li>
      <li><b>Fri</b><span>workout-log, mad/kcal, manuel vægt og egne billeder uden abonnement</span></li>
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
    <button type="button" id="startProCheckout" class="pro-checkout-button">Start års-Pro for 280,80 kr.</button>
    <small id="proCheckoutStatus" class="pro-checkout-status">Sikker betaling håndteres af Stripe. Opsig når som helst.</small>
  </section>`;
document.querySelector('.content').append(proAccessDialog);

const billingTestBadge = proAccessDialog.querySelector('.billing-test-badge');
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
const proDemoPlayer = proAccessDialog.querySelector('.pro-demo-player');
const proDemoToggle = proAccessDialog.querySelector('#proDemoToggle');
const proDemoEyebrow = proAccessDialog.querySelector('#proDemoEyebrow');
const proDemoTitle = proAccessDialog.querySelector('#proDemoTitle');
const proDemoCaption = proAccessDialog.querySelector('#proDemoCaption');
const proDemoProgress = proAccessDialog.querySelector('.pro-demo-progress i');
const proPlanCards = [...proAccessDialog.querySelectorAll('[data-pro-plan]')];
const proMonthlyNewsList = proAccessDialog.querySelector('#proMonthlyNewsList');
let authMode = 'login';
let selectedProPlan = 'weekly';
let proStartWasAutomatic = !window.location.hash || window.location.hash === '#top';
let pendingAccountLandingPage = '';

function showAccountLanding(pageName) {
  if (typeof window.showAppPage === 'function') {
    window.showAppPage(pageName);
    return;
  }
  pendingAccountLandingPage = pageName;
}

const proMonthlyDrops = [
  {
    id: '2026-08-3d-pro-preview',
    month: 'August 2026',
    label: 'MÅNEDENS NYHED',
    title: 'Mandlig 3D Body Scan',
    text: 'En levende anatomisk 3D-model viser kropsvinkler og muskelområder. Free-brugere kan se funktionen bag en tydelig Pro-lås.'
  }
];

function renderProMonthlyNews() {
  proMonthlyNewsList.innerHTML = [...proMonthlyDrops].reverse().slice(0, 3).map((drop, index) => `
    <article class="${index === 0 ? 'is-latest' : ''}">
      <span>${drop.label}</span><small>${drop.month}</small>
      <h4>${drop.title}</h4><p>${drop.text}</p>
    </article>`).join('');
}

function announceLatestProDrop(hasOnlineAccess) {
  const latestDrop = proMonthlyDrops.at(-1);
  if (!hasOnlineAccess || !latestDrop) return;
  const seenKey = 'formlyLatestProDrop';
  if (localStorage.getItem(seenKey) === latestDrop.id) return;
  localStorage.setItem(seenKey, latestDrop.id);
  showToast(`Nyt i Pro: ${latestDrop.title}`);
}

renderProMonthlyNews();

const proDemoScenes = [
  { key: 'physique', eyebrow: 'INTERAKTIV 3D', title: 'Se din udvikling fra alle vinkler', caption: 'Se den levende 3D-krop fremhæve de muskelgrupper, din analyse finder.' },
  { key: 'coach', eyebrow: 'PERSONLIG AI-COACH', title: 'Få et konkret næste skridt', caption: 'AI-coachen bruger dine mål, træningspas og registreringer til et personligt svar.' },
  { key: 'analysis', eyebrow: '4-VINKELS ANALYSE', title: 'Gør billeder til et træningsfokus', caption: 'Front, højre side, venstre side og ryg samles i synlige prioriteter og en praktisk plan.' },
  { key: 'training', eyebrow: 'TRÆNINGSLOG', title: 'Registrér hvert arbejdssæt', caption: 'Vægt, reps og sæt samles i én rolig træningsoversigt.' },
  { key: 'progress', eyebrow: 'PROGRESSION', title: 'Se styrken bevæge sig', caption: 'Følg volumen, personlige rekorder og estimeret 1RM på tværs af uger.' },
  { key: 'food', eyebrow: 'MAD & KCAL', title: 'Hold styr på dagens mål', caption: 'Kalorier og makroer opdateres, når du registrerer dagens måltider.' }
];
let proDemoIndex = 0;
let proDemoPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let proDemoTimer = null;

function renderProDemo(index, restart = true) {
  proDemoIndex = (index + proDemoScenes.length) % proDemoScenes.length;
  const scene = proDemoScenes[proDemoIndex];
  proDemoPlayer.dataset.demoScene = scene.key;
  proAccessDialog.querySelectorAll('[data-demo-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.demoPanel !== scene.key;
  });
  proAccessDialog.querySelectorAll('[data-demo-target]').forEach((button) => {
    button.classList.toggle('active', button.dataset.demoTarget === scene.key);
  });
  proDemoEyebrow.textContent = scene.eyebrow;
  proDemoTitle.textContent = scene.title;
  proDemoCaption.textContent = scene.caption;
  proDemoProgress.classList.remove('is-running');
  void proDemoProgress.offsetWidth;
  if (!proDemoPaused) proDemoProgress.classList.add('is-running');
  if (restart) scheduleProDemo();
}

function scheduleProDemo() {
  window.clearTimeout(proDemoTimer);
  if (!proDemoPaused) proDemoTimer = window.setTimeout(() => renderProDemo(proDemoIndex + 1), 5200);
}

function setProDemoPaused(paused) {
  proDemoPaused = paused;
  proDemoToggle.setAttribute('aria-pressed', String(paused));
  proDemoToggle.setAttribute('aria-label', paused ? 'Afspil demo' : 'Sæt demo på pause');
  proDemoToggle.title = paused ? 'Afspil' : 'Pause';
  proDemoToggle.textContent = paused ? '▶' : 'Ⅱ';
  renderProDemo(proDemoIndex);
}

proDemoToggle.addEventListener('click', () => setProDemoPaused(!proDemoPaused));
proAccessDialog.querySelectorAll('[data-demo-target]').forEach((button) => button.addEventListener('click', () => {
  renderProDemo(proDemoScenes.findIndex((scene) => scene.key === button.dataset.demoTarget));
}));
setProDemoPaused(proDemoPaused);

function openProAccess() {
  proStartWasAutomatic = false;
  if (typeof window.showAppPage === 'function') {
    window.showAppPage(billingState.isPro ? 'overview' : 'pro');
  } else {
    history.replaceState({}, '', billingState.isPro ? '#top' : '#pro');
  }
}

function closeProAccess() {
  if (typeof window.showAppPage === 'function') {
    window.showAppPage(billingState.isPro ? 'overview' : 'pro');
  } else {
    history.replaceState({}, '', billingState.isPro ? '#top' : '#pro');
  }
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
  billingState.isOwner = false;
  updateBillingUi();
  openProAccess();
  proAuthEmail.focus();
}

function selectProPlan(plan) {
  if (!billingState.plans[plan]) return;
  selectedProPlan = plan;
  updateBillingUi();
}

proPlanCards.forEach((card) => card.addEventListener('click', () => selectProPlan(card.dataset.proPlan)));

function formatDkk(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function getProCheckoutLabel(plan = selectedProPlan) {
  const details = billingState.plans[plan];
  if (plan === 'annual') return `Start års-Pro for ${formatDkk(details?.introPriceDkk || 280.8)} kr.`;
  if (plan === 'weekly') return `Start 1 uges Pro for ${formatDkk(details?.priceDkk || 20)} kr.`;
  return `Start Pro for ${formatDkk(details?.priceDkk || 39)} kr./måned`;
}

function getProPlanName(plan = selectedProPlan) {
  if (plan === 'annual') return 'års-Pro';
  if (plan === 'weekly') return '1 uges Pro';
  return 'månedlig Pro';
}

function applyBillingEnvironment(status) {
  const environment = String(status?.billing_environment || '').toLowerCase();
  if (environment === 'live' || environment === 'test') billingState.billingEnvironment = environment;
  billingState.testMode = Boolean(status?.test_mode) || billingState.billingEnvironment === 'test';
}

function hasFullAppAccess() {
  return APP_OPEN_ACCESS || Boolean(authState.authenticated && (billingState.isPro || billingState.isOwner || localStorage.getItem('formlyOwnerAccessOverride') === '1'));
}

function updateBillingUi() {
  const configuredPlanOrder = ['weekly', 'monthly', 'annual'];
  const selectedPlanConfigured = Boolean(billingState.plans[selectedProPlan]?.configured);
  if (!selectedPlanConfigured) {
    const fallbackPlan = configuredPlanOrder.find((plan) => Boolean(billingState.plans[plan]?.configured));
    if (fallbackPlan) {
      selectedProPlan = fallbackPlan;
    }
  }
  const hasOnlineAccess = hasFullAppAccess();
  const selectedPlan = billingState.plans[selectedProPlan];
  const planAvailabilityKnown = authState.authenticated && billingState.loaded;
  proPlanCards.forEach((card) => {
    const selected = card.dataset.proPlan === selectedProPlan;
    const current = hasOnlineAccess && card.dataset.proPlan === billingState.billingPlan;
    const available = billingState.plans[card.dataset.proPlan]?.configured;
    card.classList.toggle('is-selected', selected);
    card.classList.toggle('is-current', current);
    card.classList.toggle('is-unavailable', planAvailabilityKnown && !available);
    card.setAttribute('aria-checked', String(selected));
    card.setAttribute('aria-disabled', String(planAvailabilityKnown && !available));
  });
  document.body.classList.toggle('has-pro-access', hasOnlineAccess);
  document.body.classList.toggle('app-open-access', APP_OPEN_ACCESS);
  proAccessButton.hidden = APP_OPEN_ACCESS;
  document.querySelectorAll('.nav-link-pro, [data-open-pro]').forEach((control) => {
    control.hidden = APP_OPEN_ACCESS;
  });
  document.body.classList.toggle('billing-test-mode', billingState.testMode);
  billingTestBadge.hidden = !billingState.testMode;
  proAccessButton.textContent = billingState.testMode
    ? (hasOnlineAccess ? 'TEST · PRO AKTIV' : 'TEST · PRO')
    : (hasOnlineAccess ? 'PRO AKTIV' : 'PRO · 40 % ÅR 1');
  proAccessButton.classList.toggle('is-active', billingState.isPro);
  coachPanel.classList.toggle('is-pro-locked', !hasOnlineAccess);
  const coachGate = coachPanel.querySelector('#coachProGate');
  if (coachGate) coachGate.hidden = hasOnlineAccess;
  coachPanel.querySelectorAll('#coachForm input, #coachForm button, .coach-suggestions button').forEach((control) => {
    control.disabled = !hasOnlineAccess;
  });
  const physiquePanel = document.querySelector('#physique-ai');
  if (physiquePanel) {
    physiquePanel.classList.toggle('is-pro-locked', false);
    const gate = physiquePanel.querySelector('#physiqueProGate');
    if (gate) gate.hidden = true;
    const previewLock = physiquePanel.querySelector('#physiquePreviewLock');
    if (previewLock) previewLock.hidden = true;
    physiquePanel.querySelectorAll('.physique-scan-row input').forEach((control) => {
      control.disabled = false;
    });
    physiquePanel.querySelectorAll('.physique-angle-card input[type="file"]').forEach((control) => {
      control.disabled = false;
    });
    const analyzeButton = physiquePanel.querySelector('#physiqueAnalyzeBtn');
    const readyPhotos = [...physiquePanel.querySelectorAll('.physique-angle-card')].filter((card) => card.classList.contains('is-ready')).length;
    if (analyzeButton) analyzeButton.disabled = readyPhotos < 4;
  }
  const progressPanel = document.querySelector('.training-progress-panel');
  if (progressPanel) {
    progressPanel.classList.toggle('is-pro-locked', !hasOnlineAccess);
    const gate = progressPanel.querySelector('#progressProGate');
    if (gate) gate.hidden = hasOnlineAccess;
    progressPanel.querySelectorAll('.training-tabs button, .progress-range-tabs button, .progress-period-nav button, .progress-year-nav button, #progressExercisePicker').forEach((control) => {
      control.disabled = !hasOnlineAccess;
    });
    const liveBadge = progressPanel.querySelector('.progress-live');
    if (liveBadge) liveBadge.textContent = hasOnlineAccess ? 'LIVE DATA' : 'PRO DATA';
    if (typeof renderTrainingProgress === 'function') renderTrainingProgress();
  }
  const healthPanel = document.querySelector('.health-providers');
  if (healthPanel) {
    healthPanel.classList.toggle('is-pro-locked', !hasOnlineAccess);
    const gate = healthPanel.querySelector('#healthProGate');
    if (gate) gate.hidden = hasOnlineAccess;
    healthPanel.querySelectorAll('.provider-grid button').forEach((control) => {
      control.disabled = !hasOnlineAccess;
    });
    if (typeof applyWithingsConnectionState === 'function') {
      applyWithingsConnectionState(localStorage.getItem('formlyWithingsConnected') === '1');
    }
    if (hasOnlineAccess && typeof refreshHealthProviderStatus === 'function') refreshHealthProviderStatus();
  }
  if (syncHealth) syncHealth.disabled = !hasOnlineAccess;
  const sourcePicker = document.querySelector('#weightSource');
  if (sourcePicker) {
    [...sourcePicker.options].forEach((option) => {
      option.disabled = option.value !== 'manual' && !hasOnlineAccess;
    });
    if (!hasOnlineAccess && sourcePicker.value !== 'manual') {
      sourcePicker.value = 'manual';
      localStorage.setItem('formlyWeightSource', 'manual');
    }
  }
  if (!authState.authenticated) {
    proUsageSummary.hidden = true;
    proCheckoutButton.textContent = 'Log ind for at fortsætte';
    proCheckoutButton.disabled = !authState.configured;
    proCheckoutStatus.textContent = 'En konto sikrer, at abonnementet tilhører dig på tværs af enheder.';
  } else if (billingState.isOwner) {
    proUsageSummary.hidden = false;
    proUsageSummary.innerHTML = '<strong>Permanent ejeradgang</strong><span>Alle Pro-funktioner er aktive uden Stripe-abonnement.</span>';
    proCheckoutButton.textContent = 'Ejeradgang aktiv';
    proCheckoutButton.disabled = true;
    proCheckoutStatus.textContent = 'Denne verificerede konto er registreret som ejer.';
  } else if (billingState.isPro) {
    const isChangingPlan = Boolean(billingState.billingPlan) && selectedProPlan !== billingState.billingPlan;
    proUsageSummary.hidden = false;
    proUsageSummary.innerHTML = `<strong>Din Pro-kvote</strong><span>${billingState.remaining.coach} coachbeskeder · ${billingState.remaining.vision} fysikanalyser tilbage</span>`;
    proCheckoutButton.textContent = isChangingPlan ? `Skift til ${getProPlanName()}` : 'Administrér abonnement';
    proCheckoutButton.disabled = !billingState.configured;
    proCheckoutStatus.textContent = isChangingPlan
      ? `Stripe viser pris, eventuel forholdsmæssig betaling og bekræftelse for skift til ${getProPlanName()}.`
      : 'Vælg en anden plan ovenfor for at skifte, eller administrér kort og opsigelse hos Stripe.';
  } else {
    proUsageSummary.hidden = true;
    const selectedPlanConfigured = Boolean(selectedPlan?.configured);
    proCheckoutButton.textContent = getProCheckoutLabel();
    proCheckoutButton.disabled = !billingState.configured || !selectedPlanConfigured;
    if (!selectedPlanConfigured) {
      const unavailablePlanName = selectedProPlan === 'annual' ? 'Årsabonnementet' : selectedProPlan === 'weekly' ? 'Ugeabonnementet' : 'Månedsabonnementet';
      proCheckoutStatus.textContent = `${unavailablePlanName} klargøres i Stripe. Vælg en anden plan for at fortsætte.`;
    } else if (selectedProPlan === 'annual') {
      proCheckoutStatus.textContent = `40 PROCENT PÅ FØRSTE ÅR: Du betaler ${formatDkk(selectedPlan.introPriceDkk)} kr. nu. Abonnementet fornyes automatisk til ${formatDkk(selectedPlan.priceDkk)} kr./år efter 12 måneder.`;
    } else if (selectedProPlan === 'weekly') {
      proCheckoutStatus.textContent = `Du betaler ${formatDkk(selectedPlan.priceDkk)} kr. nu. Abonnementet fornyes automatisk hver 7. dag, indtil du skifter eller opsiger.`;
    } else {
      proCheckoutStatus.textContent = 'Sikker betaling håndteres af Stripe. 39 kr. trækkes hver måned. Opsig når som helst.';
    }
  }
  if (billingState.testMode) {
    proCheckoutStatus.textContent = `TESTMILJØ: Ingen rigtige penge trækkes. ${proCheckoutStatus.textContent}`;
  }
  updateAuthUi();
  announceLatestProDrop(hasOnlineAccess);
  if (typeof renderProHome === 'function') renderProHome();
  if (typeof renderProProgress === 'function') renderProProgress();
}

function applyBillingStatus(status) {
  if (!status) return;
  applyBillingEnvironment(status);
  billingState.loaded = true;
  billingState.configured = Boolean(status.configured);
  billingState.isPro = Boolean(status.is_pro);
  billingState.isOwner = Boolean(status.is_owner);
  billingState.billingPlan = String(status.billing_plan || '');
  billingState.priceDkk = Number(status.price_dkk) || 39;
  const planStatus = status.plans || {};
  billingState.plans = {
    weekly: {
      configured: Boolean(planStatus.weekly?.configured),
      priceDkk: Number(planStatus.weekly?.price_dkk) || 20
    },
    monthly: {
      configured: Boolean(planStatus.monthly?.configured ?? status.configured),
      priceDkk: Number(planStatus.monthly?.price_dkk) || 39
    },
    annual: {
      configured: Boolean(planStatus.annual?.configured),
      priceDkk: Number(planStatus.annual?.price_dkk) || 468,
      introPriceDkk: Number(planStatus.annual?.intro_price_dkk) || 280.8,
      introDiscountPercent: Number(planStatus.annual?.intro_discount_percent) || 40
    }
  };
  if (billingState.isPro && billingState.plans[billingState.billingPlan]) selectedProPlan = billingState.billingPlan;
  billingState.limits = status.limits || billingState.limits;
  billingState.remaining = status.remaining || billingState.remaining;
  updateBillingUi();
}

async function loadBillingStatus() {
  const params = new URLSearchParams(window.location.search);
  const checkoutState = params.get('checkout');
  const sessionId = params.get('session_id');
  const planChanged = params.get('plan_changed') === '1';
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
    if (billingState.isPro && (proStartWasAutomatic || checkoutState === 'success')) {
      proStartWasAutomatic = false;
      showAccountLanding('overview');
    }
    if (checkoutState === 'success') {
      showToast('Pro er aktivt. Velkommen til online coaching.');
    }
    if (planChanged) showToast('Dit Pro-abonnement er skiftet hos Stripe.');
  } catch {
    billingState.loaded = true;
    updateBillingUi();
    if (checkoutState === 'success') showToast('Betalingen kontrolleres stadig. Prøv igen om lidt.');
  } finally {
    if (checkoutState || planChanged) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('checkout');
      cleanUrl.searchParams.delete('session_id');
      cleanUrl.searchParams.delete('plan_changed');
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
    applyBillingEnvironment(result);
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
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.querySelector('#featureHelpDialog:not([hidden])') && !proAccessDialog.hidden) closeProAccess();
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
      body: JSON.stringify({ plan: selectedProPlan })
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
    proCheckoutButton.textContent = billingState.isPro ? 'Administrér abonnement' : getProCheckoutLabel();
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
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    try {
      const endpointUrl = new URL(selected, window.location.origin);
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(endpointUrl.hostname)) return '/api/coach';
    } catch {}
  }
  return normalizeCoachEndpoint(selected);
}

function getHealthEndpoint() {
  const stored = localStorage.getItem('formlyAiEndpoint');
  if (!stored) return '/api/health';
  const base = String(stored).trim();
  if (!base) return '/api/health';
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    try {
      const endpointUrl = new URL(base, window.location.origin);
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(endpointUrl.hostname)) return '/api/health';
    } catch {}
  }
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
overviewQuickLinks.querySelectorAll('[data-quick-target]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.quickTarget;
  const targetPage = pageForTarget(target);
  if (appPageTargets[targetPage]) {
    showAppPage(targetPage);
    return;
  }
  document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
const overviewStatsGrid = document.querySelector('.stats-grid');
const overviewCategories = document.createElement('section');
overviewCategories.className = 'overview-categories';
overviewCategories.innerHTML = `
  <div class="overview-categories-heading">
    <div>
      <p class="eyebrow">OVERSIGT</p>
      <h2>Vælg en kategori</h2>
    </div>
    <button type="button" class="overview-help-button" data-open-feature-help aria-label="Hjælp til funktionerne" title="Hjælp til funktionerne">?</button>
  </div>
  <div class="overview-category-grid">
    <button type="button" data-category-target="#workout"><strong>Træning</strong><span>Sessioner og øvelser</span></button>
    <button type="button" data-category-target="#food"><strong>Mad &amp; kcal</strong><span>Kalorier og makroer</span></button>
    <button type="button" data-category-target="#weight"><strong>Krop</strong><span>Billeder og vægt</span></button>
    <button type="button" data-category-target=".training-progress-panel"><strong>Progression</strong><span>1RM og volumen</span></button>
    <button type="button" data-category-target="#library"><strong>Øvelser</strong><span>Bibliotek og log</span></button>
    <button type="button" data-category-target=".coach-panel"><strong>AI-coach</strong><span>Personlig guidance</span></button>
    <button type="button" data-category-target="#profile"><strong>Kcal-beregner</strong><span>Personlige mål og kalorier</span></button>
    <button type="button" data-category-target="#weight"><strong>Kropsvægt</strong><span>Vejninger og trend</span></button>
    <button type="button" data-category-target=".coach-panel"><strong>Coach</strong><span>Samtale og forslag</span></button>
    <button type="button" data-category-target="#physique-ai"><strong>Fysik vurdering AI</strong><span>4-vinkels body scan</span></button>
  </div>
`;
const overviewCategoryGrid = overviewCategories.querySelector('.overview-category-grid');
const quickAccessIcons = {
  'Træning': '📅', 'Mad & kcal': '🍎', 'Krop': '❤️', 'Progression': '📊', 'Øvelser': '🏋️',
  'AI-coach': '🧠', 'Kcal-beregner': '🧮', 'Kropsvægt': '🖼️', 'Coach': '💬', 'Fysik vurdering AI': '🧍'
};
overviewCategoryGrid?.querySelectorAll('button').forEach((button) => {
  const label = button.querySelector('strong')?.textContent?.trim() || '';
  const icon = quickAccessIcons[label] || '⭐';
  button.insertAdjacentHTML('afterbegin', `<span class="quick-icon" aria-hidden="true">${icon}</span>`);
});
const proPreviewTargets = new Set(['.training-progress-panel', '.coach-panel', '#physique-ai']);
function labelProPreviewControls(root) {
  root?.querySelectorAll('[data-category-target], [data-quick-target]').forEach((button) => {
    const target = button.dataset.categoryTarget || button.dataset.quickTarget;
    if (!proPreviewTargets.has(target)) return;
    button.classList.add('requires-pro-access');
    button.insertAdjacentHTML('beforeend', '<small class="feature-pro-badge">KRÆVER PRO</small>');
  });
}
labelProPreviewControls(overviewQuickLinks);
labelProPreviewControls(overviewCategories);
document.querySelectorAll('[data-app-page-target="coach"], [data-app-page-target="progress"]').forEach((link) => {
  link.classList.add('requires-pro-access');
  link.insertAdjacentHTML('beforeend', '<small class="nav-pro-access">KRÆVER PRO</small>');
});
if (overviewQuickLinks) overviewQuickLinks.before(overviewCategories);
else overviewStatsGrid?.before(overviewCategories);
overviewCategories.querySelectorAll('[data-category-target]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.categoryTarget;
  const targetPage = pageForTarget(target);
  if (appPageTargets[targetPage]) {
    if (targetPage === 'progress') {
      const muscle = button.dataset.categoryMuscle;
      if (muscle) document.querySelector(`.training-progress-panel .training-tabs [data-muscle="${muscle}"]`)?.click();
    }
    showAppPage(targetPage);
    return;
  }
  document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const muscle = button.dataset.categoryMuscle;
  if (muscle) document.querySelector(`.training-progress-panel .training-tabs [data-muscle="${muscle}"]`)?.click();
}));
const proOverviewCategories = overviewCategories.cloneNode(true);
proOverviewCategories.classList.add('pro-overview-categories');
proOverviewCategories.setAttribute('aria-label', 'Oversigt over appens funktioner');
proOverviewCategories.querySelector('.overview-categories-heading .eyebrow').textContent = 'APP OVERSIGT';
proOverviewCategories.querySelector('.overview-categories-heading h2').textContent = 'Fortsæt til en funktion';
proAccessDialog.append(proOverviewCategories);
const trainingOverviewCategories = overviewCategories.cloneNode(true);
trainingOverviewCategories.classList.add('training-overview-categories');
trainingOverviewCategories.setAttribute('aria-label', 'Oversigt over appens funktioner');
trainingOverviewCategories.querySelector('.overview-categories-heading .eyebrow').textContent = 'OVERSIGT';
trainingOverviewCategories.querySelector('.overview-categories-heading h2').textContent = 'Vælg en funktion';
const workoutSection = document.querySelector('#workout');
const exerciseLibrarySection = document.querySelector('#library');
if (workoutSection) {
  workoutSection.after(overviewCategories);
}
const featureHelpItems = [
  { name: 'Træning', access: 'Gratis', page: 'training', text: 'Se dagens træning, åbn øvelserne og registrér sæt, reps og vægt.' },
  { name: 'Mad & kcal', access: 'Gratis', page: 'food', text: 'Registrér måltider og følg kalorier, protein, kulhydrat og fedt.' },
  { name: 'Krop', access: 'Gratis', page: 'weight', text: 'Saml din fase, dine kropsmål, vejninger og udviklingsbilleder.' },
  { name: 'Progression', access: 'KRÆVER PRO', page: 'progress', text: 'Lås lineær udvikling, volumen, rekorder og beregnet 1RM op fra din gratis workout-log.' },
  { name: 'Øvelser', access: 'Gratis', page: 'library', text: 'Byg dit øvelsesbibliotek og vælg de bevægelser, du vil træne.' },
  { name: 'AI-coach', access: 'KRÆVER PRO', page: 'coach', text: 'Få personlige AI-svar ud fra dine mål, måltider og træningsdata.' },
  { name: 'Kcal-beregner', access: 'Gratis', page: 'profile', text: 'Beregn et personligt kaloriemål ud fra krop, aktivitet og mål.' },
  { name: 'Kropsvægt', access: 'Gratis', page: 'weight', text: 'Registrér vejninger og se den langsigtede vægttrend uge for uge.' },
  { name: 'Coach', access: 'KRÆVER PRO', page: 'coach', text: 'Åbn coachens samtale, forslag og tidligere personlige svar.' },
  { name: 'Fysik vurdering AI', access: 'KRÆVER PRO', page: 'physique', text: 'Upload tre vinkler og få fokusområder, træningsplan og 3D-muskelkort.' }
];
const featureHelpDialog = document.createElement('div');
featureHelpDialog.id = 'featureHelpDialog';
featureHelpDialog.className = 'feature-help-dialog';
featureHelpDialog.hidden = true;
featureHelpDialog.innerHTML = `
  <section class="feature-help-sheet" role="dialog" aria-modal="true" aria-labelledby="featureHelpTitle">
    <header><div><span>HJÆLP</span><h2 id="featureHelpTitle">Hvad kan funktionerne?</h2><p>Vælg en funktion for at gå direkte til den.</p></div><button type="button" class="feature-help-close" aria-label="Luk hjælpen">×</button></header>
    <ol class="feature-help-list">${featureHelpItems.map((item, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><div><strong>${item.name}</strong><small class="${item.access.includes('Pro') ? 'is-pro' : ''}">${item.access}</small></div><p>${item.text}</p></div><button type="button" data-help-page="${item.page}">Åbn</button></li>`).join('')}</ol>
  </section>`;
document.body.append(featureHelpDialog);
let featureHelpTrigger = null;

function closeFeatureHelp(restoreFocus = true) {
  featureHelpDialog.hidden = true;
  document.body.classList.remove('feature-help-open');
  if (restoreFocus) featureHelpTrigger?.focus();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-feature-help]');
  if (!trigger) return;
  featureHelpTrigger = trigger;
  featureHelpDialog.hidden = false;
  document.body.classList.add('feature-help-open');
  featureHelpDialog.querySelector('.feature-help-close').focus();
});
featureHelpDialog.querySelector('.feature-help-close').addEventListener('click', () => closeFeatureHelp());
featureHelpDialog.addEventListener('click', (event) => {
  if (event.target === featureHelpDialog) closeFeatureHelp();
});
featureHelpDialog.querySelectorAll('[data-help-page]').forEach((button) => button.addEventListener('click', () => {
  closeFeatureHelp(false);
  window.showAppPage?.(button.dataset.helpPage);
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !featureHelpDialog.hidden) closeFeatureHelp();
});
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
  let storedFoodEntries = [];
  try {
    const parsedFoodEntries = JSON.parse(localStorage.getItem('formlyFoodEntries') || '[]');
    storedFoodEntries = Array.isArray(parsedFoodEntries) ? parsedFoodEntries : [];
  } catch {
    storedFoodEntries = [];
  }
  const dashboardFoodDate = typeof selectedFoodDate !== 'undefined' ? foodDateKey(selectedFoodDate) : todayFoodDateKey();
  const foodEntriesToday = storedFoodEntries.filter((entry) => entry.date === dashboardFoodDate);
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
  if (!hasFullAppAccess()) {
    coachStatus.textContent = authState.authenticated ? 'KRÆVER PRO · ONLINE AI' : 'Log ind for at bruge online AI';
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
      coachStatus.textContent = 'KRÆVER PRO · ONLINE AI';
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
        body: JSON.stringify({ model: physiqueQuestion && imageData.length ? 'llava' : 'llama3.2', stream: false, messages: [{ role: 'system', content: 'Du er den danske AI-coach inde i All In One Fitness. Besvar kun spørgsmål om appens funktioner eller brugerens medsendte appdata om træning, mad, kcal, vægt, kropsbilleder, søvn, restitution og tilknyttede sundhedsdata. Afvis kort spørgsmål uden for appens område. Opfind aldrig personlige tal, bland aldrig brugeres data og giv ikke medicinske diagnoser. Data: ' + JSON.stringify(getLocalCoachContext()) }, { role: 'user', content: question, ...(physiqueQuestion && imageData.length ? { images: imageData } : {}) }] })
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
trainingProgressPanel.innerHTML = '<div class="training-progress-header"><div><p class="eyebrow">STYRKE & PERFORMANCE</p><h2>Progression i træningen</h2><p>Workout-loggen er gratis. Pro omsætter dine registreringer til lineær udvikling.</p></div><span class="progress-live">PRO DATA</span></div><div id="progressProGate" class="pro-inline-gate"><span class="pro-gate-lock" aria-hidden="true"></span><div><span>KRÆVER PRO</span><strong>Grøn lineær progression</strong><small>Fortsæt gratis med at logge sæt, reps og vægt. Dataene ligger klar efter køb.</small></div><button type="button">Se Pro</button></div><div class="training-tabs"><button type="button" class="active" data-muscle="push">Pres</button><button type="button" data-muscle="pull">Træk</button><button type="button" data-muscle="legs">Ben</button></div><div class="training-progress-content"><div><h3 id="progressExerciseName">Lineær progression</h3><p id="progressExerciseMeta">Aktivér Pro for at vise udviklingen fra din workout-log.</p><div id="progressChart" class="progress-chart"></div></div><div class="progress-callout"><strong id="progressChange">PRO</strong><span>grafen er låst</span><small id="progressNext">Dine workout-data gemmes stadig gratis.</small></div></div>';
trainingProgressPanel.querySelector('#progressProGate button').addEventListener('click', openProAccess);
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
  if (!hasFullAppAccess()) {
    trainingProgressPanel.querySelector('#progressExerciseName').textContent = 'Lineær progression';
    trainingProgressPanel.querySelector('#progressExerciseMeta').textContent = 'Aktivér Pro for at vise udviklingen fra din workout-log.';
    trainingProgressPanel.querySelector('#progressChange').textContent = 'PRO';
    trainingProgressPanel.querySelector('.progress-callout span').textContent = 'grafen er låst';
    trainingProgressPanel.querySelector('#progressNext').textContent = 'Sæt, reps og vægt gemmes stadig gratis og ligger klar efter køb.';
    trainingProgressPanel.querySelectorAll('.long-progress-summary strong').forEach((value) => { value.textContent = '-'; });
    progressChart.innerHTML = '<div class="progress-locked-chart"><span>WORKOUT-LOG GEMMES</span><strong>Den grønne kurve starter med Pro</strong><p>Fortsæt med at registrere din træning. Ingen af dine data går tabt.</p></div>';
    return;
  }
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

const existingExerciseTracker = document.querySelector('.exercise-tracker');
if (!existingExerciseTracker && document.querySelector('#library')) {
  const exerciseTracker = document.createElement('div');
  exerciseTracker.className = 'exercise-tracker';
  exerciseTracker.innerHTML = '<div class="tracker-heading"><div><p class="eyebrow">ØVELSE TRACKER</p><h3>Goblet squat</h3></div><select id="trackerExercise"><option value="Goblet squat">Goblet squat</option><option value="Bench press">Bench press</option><option value="Deadlift">Deadlift</option><option value="Push-up">Push-up</option><option value="Shoulder press">Shoulder press</option></select></div><div class="tracker-stats"><span><strong id="trackerBest">0 kg</strong><small>bedste vægt</small></span><span><strong id="trackerPR">-</strong><small>seneste PR</small></span><span><strong id="trackerIncrease">+0 kg</strong><small>øgning siden sidst</small></span><span><strong id="trackerVolume">0 kg</strong><small>samlet volumen</small></span><span><strong id="trackerReps">0</strong><small>reps i alt</small></span></div><div id="trackerHistory" class="tracker-history">Ingen loggede sæt endnu</div><div class="session-week-heading"><strong>Styrke-sessioner</strong><small>kg · reps · volumen</small></div><div id="strengthSessionHistory" class="strength-session-history"></div><div class="session-week-heading"><strong>Sessions pr. uge</strong><small>mål: 2 pr. muskelgruppe</small></div><div id="sessionWeekGrid" class="session-week-grid"></div>';
  document.querySelector('#library').append(exerciseTracker);

  const trackerExercise = exerciseTracker.querySelector('#trackerExercise');
  const squatOverview = document.createElement('div');
  squatOverview.className = 'bench-overview';
  squatOverview.innerHTML = '<div class="session-week-heading"><strong>Goblet squat overblik</strong><small>4 dage mellem sessioner · fokus på goblet squat</small></div><div id="benchOverviewList" class="bench-overview-list"></div>';
  exerciseTracker.append(squatOverview);

  function getExerciseSessionHistory(exerciseName) {
    const entries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === exerciseName.toLowerCase()).map((entry) => ({ ...entry, weight: Number(entry.weight) || 0, reps: Number(entry.reps) || 0 }));
    return [...entries.reduce((map, entry) => {
      const key = entry.date ? `date:${entry.date}` : `session:${entry.session || entry.timestamp}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
      return map;
    }, new Map()).values()].sort((a, b) => getProgressTimestamp(b[0]) - getProgressTimestamp(a[0]));
  }

  function renderSquatOverview() {
    const sessionEntries = getExerciseSessionHistory(trackerExercise.value || 'Goblet squat');
    const list = squatOverview.querySelector('#benchOverviewList');
    list.innerHTML = sessionEntries.length ? sessionEntries.slice(0, 20).map((session, index) => {
      const entry = session.reduce((best, item) => item.weight > best.weight ? item : best, session[0]);
      const previous = sessionEntries[index + 1]?.reduce((best, item) => item.weight > best.weight ? item : best, sessionEntries[index + 1][0]);
      const increase = previous && entry.weight > previous.weight ? entry.weight - previous.weight : 0;
      const volume = session.reduce((total, item) => total + (Number(item.weight) || 0) * (Number(item.reps) || 0), 0);
      const displayDate = entry.date || new Date(getProgressTimestamp(entry)).toLocaleDateString('da-DK');
      return `<div class="bench-overview-row"><strong>Session ${index + 1}</strong><span>${displayDate}</span><b>${entry.weight} kg × ${entry.reps}</b><span>${volume.toLocaleString('da-DK')} kg</span><em>${increase ? `+${increase} kg` : '-'}</em></div>`;
    }).join('') : '<p>Log Goblet squat for at se dit overblik.</p>';
  }

  exerciseOptions.forEach((exercise) => {
    if (![...trackerExercise.options].some((option) => option.value.toLowerCase() === exercise.toLowerCase())) {
      trackerExercise.insertAdjacentHTML('beforeend', `<option value="${exercise}">${exercise}</option>`);
    }
  });

  if (!trackerExercise.value) trackerExercise.value = 'Goblet squat';

  function renderExerciseTracker() {
    const selectedExercise = (trackerExercise.value || 'Goblet squat').toLowerCase();
    const sessionEntries = getExerciseSessionHistory(selectedExercise);
    const entries = sessionEntries.flat();
    const sortedEntries = [...entries].sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a));
    const best = entries.reduce((value, entry) => Math.max(value, entry.weight), 0);
    const volume = entries.reduce((value, entry) => value + entry.weight * entry.reps, 0);
    const reps = entries.reduce((value, entry) => value + entry.reps, 0);
    const previousSessionBest = sessionEntries[1]?.reduce((value, entry) => Math.max(value, entry.weight), 0) || 0;
    const latestSessionBest = sessionEntries[0]?.reduce((value, entry) => Math.max(value, entry.weight), 0) || 0;
    const increase = sessionEntries.length > 1 && latestSessionBest > previousSessionBest ? latestSessionBest - previousSessionBest : 0;
    exerciseTracker.querySelector('#trackerBest').textContent = `${best} kg`;
    const latestPR = entries.find((entry) => entry.isPR);
    exerciseTracker.querySelector('#trackerPR').textContent = latestPR ? `${latestPR.weight} kg` : '-';
    exerciseTracker.querySelector('#trackerIncrease').textContent = `${increase >= 0 ? '+' : ''}${increase} kg`;
    exerciseTracker.querySelector('#trackerVolume').textContent = `${volume.toLocaleString('da-DK')} kg`;
    exerciseTracker.querySelector('#trackerReps').textContent = reps;
    exerciseTracker.querySelector('#trackerHistory').textContent = entries.length ? `${entries.length} loggede sæt · senest ${entries[0].date}` : 'Ingen loggede sæt endnu';

    const sessionHistory = exerciseTracker.querySelector('#strengthSessionHistory');
    sessionHistory.innerHTML = sessionEntries.length ? sessionEntries.slice(0, 10).map((session, index) => {
      const entry = session.reduce((bestEntry, item) => item.weight > bestEntry.weight ? item : bestEntry, session[0]);
      const previous = sessionEntries[index + 1]?.reduce((bestEntry, item) => item.weight > bestEntry.weight ? item : bestEntry, sessionEntries[index + 1][0]);
      const sessionIncrease = previous && entry.weight > previous.weight ? entry.weight - previous.weight : 0;
      const sessionVolume = session.reduce((total, item) => total + item.weight * item.reps, 0);
      const sessionDate = entry.date || new Date(getProgressTimestamp(entry)).toLocaleDateString('da-DK');
      return `<div class="strength-session-row"><strong>Session ${index + 1}</strong><span>${entry.weight} kg × ${entry.reps}</span><span>${sessionVolume.toLocaleString('da-DK')} kg</span><b>${sessionIncrease ? `+${sessionIncrease}` : '+0'} kg</b><small>Uge ${entry.week || 1} · ${sessionDate}</small></div>`;
    }).join('') : '<p>Log dit første sæt for at starte styrke-trackingen.</p>';

    const groups = { Push: ['bench press', 'push-up', 'shoulder press'], Pull: ['barbell row', 'deadlift'], Ben: ['goblet squat', 'leg press machine'] };
    exerciseTracker.querySelector('#sessionWeekGrid').innerHTML = Object.entries(groups).map(([group, exercises]) => `<div class="session-week-row"><strong>${group}</strong>${[1, 2, 3, 4, 5].map((week) => {
      const sessions = new Set(workoutLog.filter((entry) => exercises.includes(entry.exercise.toLowerCase()) && (entry.week || 1) === week).map((entry) => entry.date)).size;
      return `<span class="session-cell ${sessions >= 2 ? 'complete' : ''}"><b>${sessions}/2</b><small>U${week}</small></span>`;
    }).join('')}</div>`).join('');

    renderSquatOverview();
    const heading = exerciseTracker.querySelector('.tracker-heading h3');
    if (heading) heading.textContent = trackerExercise.value || 'Goblet squat';
  }

  trackerExercise.addEventListener('change', () => {
    if (typeof progressExercisePicker !== 'undefined' && progressExercisePicker) {
      progressExercisePicker.value = trackerExercise.value;
      if (typeof renderTrainingProgress === 'function') renderTrainingProgress();
    }
    renderExerciseTracker();
  });

  renderExerciseTracker();
}

const weightHistory = JSON.parse(localStorage.getItem('formlyWeightHistory') || '[]');
const MAX_PHYSIQUE_HISTORY_PAGES = 20000;
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
const weightPhotoSchedule = document.createElement('p');
weightPhotoSchedule.className = 'weight-photo-schedule';
weightTracker.querySelector('.weight-photo-label')?.append(weightPhotoSchedule);
let selectedWeightPhotoIndex = -1;
const weightPhotoPager = document.createElement('section');
weightPhotoPager.className = 'weight-photo-pager';
weightPhotoPager.innerHTML = '<div class="weight-photo-pager-copy"><span class="weight-photo-pager-label">FYSIKFOTO-HISTORIK</span><strong id="weightPhotoPagerTitle">Ingen billeder endnu</strong><small id="weightPhotoPagerMeta"></small></div><img id="weightPhotoPagerImage" alt="Valgt fysikfoto" hidden><div class="weight-photo-pager-actions"><button id="weightPhotoPrevious" type="button" aria-label="Forrige billede">←</button><span id="weightPhotoPagerIndex">0/0</span><button id="weightPhotoNext" type="button" aria-label="Næste billede">→</button></div>';
weightTracker.querySelector('#weightHistoryList')?.before(weightPhotoPager);
const physiquePhotoArchive = document.createElement('section');
physiquePhotoArchive.className = 'physique-photo-archive';
physiquePhotoArchive.innerHTML = '<div class="physique-photo-archive-head"><div><span>FYSIK UDVIKLING</span><h3>Fotos måned for måned</h3><small>Gem et nyt foto ved din ugentlige måling. Billederne arkiveres automatisk efter måned.</small></div><button type="button" id="openWeeklyPhysiquePhoto">Tilføj foto</button></div><div id="physiquePhotoMonths" class="physique-photo-months"></div><div id="physiquePhotoArchiveGrid" class="physique-photo-archive-grid"></div>';
weightPhotoPager.after(physiquePhotoArchive);
let selectedPhysiquePhotoMonth = '';

function getPhysiquePhotoMonthKey(entry) {
  const timestamp = getProgressTimestamp(entry);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toISOString().slice(0, 7);
  return String(entry.dateValue || '').slice(0, 7) || 'uden-dato';
}

function formatPhysiquePhotoMonth(monthKey) {
  if (monthKey === 'uden-dato') return 'Uden dato';
  const date = new Date(`${monthKey}-01T12:00:00`);
  return Number.isNaN(date.getTime()) ? monthKey : date.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
}

function renderPhysiquePhotoArchive() {
  const monthPicker = physiquePhotoArchive.querySelector('#physiquePhotoMonths');
  const grid = physiquePhotoArchive.querySelector('#physiquePhotoArchiveGrid');
  const photos = weightHistory.filter((entry) => entry.photo).slice().sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a));
  const months = [...new Set(photos.map(getPhysiquePhotoMonthKey))];
  if (!months.includes(selectedPhysiquePhotoMonth)) selectedPhysiquePhotoMonth = months[0] || '';
  monthPicker.innerHTML = months.length ? months.map((monthKey) => `<button type="button" class="${monthKey === selectedPhysiquePhotoMonth ? 'active' : ''}" data-physique-photo-month="${monthKey}">${formatPhysiquePhotoMonth(monthKey)}</button>`).join('') : '<span>Dit første fotoarkiv starter, når du gemmer en ugentlig måling med foto.</span>';
  const monthlyPhotos = photos.filter((entry) => getPhysiquePhotoMonthKey(entry) === selectedPhysiquePhotoMonth);
  grid.innerHTML = monthlyPhotos.length ? monthlyPhotos.map((entry) => `<article><img src="${entry.photo}" alt="Fysikfoto fra ${entry.date || 'ukendt dato'}"><strong>${entry.date || 'Uden dato'}</strong><small>${formatWeight(entry.weight)} kg · ${entry.phase || 'bulk'}</small></article>`).join('') : '<p>Vælg en måned for at se dine gemte fysikfotos.</p>';
  monthPicker.querySelectorAll('[data-physique-photo-month]').forEach((button) => button.addEventListener('click', () => {
    selectedPhysiquePhotoMonth = button.dataset.physiquePhotoMonth;
    renderPhysiquePhotoArchive();
  }));
}

physiquePhotoArchive.querySelector('#openWeeklyPhysiquePhoto').addEventListener('click', () => {
  weightTracker.querySelector('#weightPhotoInput')?.click();
});
function renderWeightPhotoPager() {
  const photos = weightHistory.filter((entry) => entry.photo).sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
  const title = weightPhotoPager.querySelector('#weightPhotoPagerTitle');
  const meta = weightPhotoPager.querySelector('#weightPhotoPagerMeta');
  const index = weightPhotoPager.querySelector('#weightPhotoPagerIndex');
  const image = weightPhotoPager.querySelector('#weightPhotoPagerImage');
  if (!photos.length) {
    title.textContent = 'Ingen billeder endnu';
    meta.textContent = 'Gem et billede sammen med din vægt.';
    index.textContent = `0/${MAX_PHYSIQUE_HISTORY_PAGES.toLocaleString('da-DK')}`;
    image.hidden = true;
    return;
  }
  selectedWeightPhotoIndex = selectedWeightPhotoIndex < 0 ? photos.length - 1 : Math.min(selectedWeightPhotoIndex, photos.length - 1);
  const entry = photos[selectedWeightPhotoIndex];
  const previous = photos[selectedWeightPhotoIndex - 1];
  const daysSincePrevious = previous ? Math.max(0, Math.floor((getProgressTimestamp(entry) - getProgressTimestamp(previous)) / 86400000)) : 0;
  title.textContent = `Billede ${selectedWeightPhotoIndex + 1} · ${formatWeight(entry.weight)} kg · ${entry.date || 'Uden dato'}`;
  image.src = entry.photo;
  image.hidden = false;
  const intervalLabel = previous ? (daysSincePrevious ? `${daysSincePrevious} dag${daysSincePrevious === 1 ? '' : 'e'} siden sidste billede` : 'Samme dato som sidste billede') : 'Første billede';
  meta.textContent = `${formatElapsedSinceDate(entry)} · ${intervalLabel} · ${selectedWeightPhotoIndex + 1} af ${photos.length} gemte`;
  index.textContent = `${(selectedWeightPhotoIndex + 1).toLocaleString('da-DK')}/${MAX_PHYSIQUE_HISTORY_PAGES.toLocaleString('da-DK')}`;
}
weightPhotoPager.querySelector('#weightPhotoPrevious').addEventListener('click', () => {
  const count = weightHistory.filter((entry) => entry.photo).length;
  if (!count) return;
  selectedWeightPhotoIndex = (selectedWeightPhotoIndex - 1 + count) % count;
  renderWeightPhotoPager();
});
weightPhotoPager.querySelector('#weightPhotoNext').addEventListener('click', () => {
  const count = weightHistory.filter((entry) => entry.photo).length;
  if (!count) return;
  selectedWeightPhotoIndex = (selectedWeightPhotoIndex + 1) % count;
  renderWeightPhotoPager();
});
renderWeightPhotoPager();
renderPhysiquePhotoArchive();
const physiqueAiPanel = document.createElement('section');
physiqueAiPanel.className = 'physique-ai-panel';
physiqueAiPanel.id = 'physique-ai';
physiqueAiPanel.innerHTML = `
  <div class="training-progress-header">
    <div>
      <p class="eyebrow">FYSIK VURDERING AI</p>
      <h2>4-vinkels AI Body Scan</h2>
      <p>Tilføj hel krop forfra, højre side, venstre side og hel krop bagfra. AI sammenligner vinklerne og bygger en målrettet muskelplan.</p>
    </div>
    <div class="physique-header-actions">
      <button type="button" id="physiqueGoldModeButton" class="physique-gold-mode-button">♛ Guld Overkrop</button>
      <button type="button" id="physiqueBackButton" class="physique-back-button">← Tilbage til oversigt</button>
      <span class="progress-live">4 ANGLE SCAN</span>
    </div>
  </div>
  <div id="physiqueProGate" class="pro-inline-gate">
    <span class="pro-gate-lock" aria-hidden="true"></span>
    <div><span>KRÆVER PRO</span><strong>4-vinkels AI Body Scan</strong><small>4 personlige scanninger hver måned · 39 kr./måned + 20 kr./uge</small></div>
    <button type="button" data-open-pro>Se Pro</button>
  </div>
  <div id="physique3dStage" class="physique-3d-stage" role="group" aria-label="Interaktiv tredimensionel visualisering af AI kropsscanning">
    <canvas id="physique3dCanvas" aria-hidden="true"></canvas>
    <img id="physiquePosterPhoto" class="physique-poster-photo" src="assets/anatomy-hologram.jpg" alt="" aria-hidden="true" hidden>
    <div id="physiquePreviewLock" class="pro-preview-lock">
      <span class="pro-gate-lock" aria-hidden="true"></span>
      <div><small>LEVENDE 3D PREVIEW</small><strong>KRÆVER PRO</strong><span>Se din krop fra tre vinkler og få muskelområder fremhævet af AI.</span></div>
      <button type="button" data-open-pro>Se Pro</button>
    </div>
    <div class="physique-3d-hud"><span>AI BODY MATRIX</span><strong id="physique3dStatus">ANATOMY MODEL READY</strong><small>LIVE ANATOMY MODEL</small></div>
    <div class="physique-3d-angles" role="group" aria-label="Vælg kropsvinkel">
      <button type="button" data-physique-view="front" class="active" aria-pressed="true"><span>Front</span><small>0°</small></button>
      <button type="button" data-physique-view="right" aria-pressed="false"><span>Højre</span><small>90°</small></button>
      <button type="button" data-physique-view="left" aria-pressed="false"><span>Venstre</span><small>-90°</small></button>
    </div>
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
          <input id="physiqueLeftSidePhotoInput" type="file" accept="image/*" capture="environment">
          <span class="physique-angle-index">03</span>
          <span class="physique-angle-copy"><strong>Venstre side</strong><small>Stå afslappet fra siden</small></span>
          <span class="physique-angle-state">Tilføj foto</span>
          <img id="physiqueLeftSidePreview" class="physique-angle-preview" alt="Venstre sidefoto til fysik AI" hidden>
        </label>
        <label class="physique-angle-card" data-angle="back">
          <input id="physiqueLeftPhotoInput" type="file" accept="image/*" capture="environment">
          <span class="physique-angle-index">04</span>
          <span class="physique-angle-copy"><strong>Ryg</strong><small>Hele kroppen bagfra i samme lys</small></span>
          <span class="physique-angle-state">Tilføj foto</span>
          <img id="physiqueLeftPreview" class="physique-angle-preview" alt="Rygfoto til fysik AI" hidden>
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
    <section class="physique-analysis-block physique-history-block">
      <div class="physique-analysis-heading"><span>04</span><div><small>UGE FOR UGE</small><h3>Fremgang i svage muskelgrupper</h3></div></div>
      <p id="physiqueProgressStatus" class="physique-progress-status"></p>
      <ul id="physiqueProgressFindings"></ul>
    </section>
    <p id="physiqueAnalysisNote" class="physique-analysis-note"></p>
  </div>
  <section class="physique-gold-report" aria-live="polite">
    <div class="physique-gold-report-title"><span class="physique-gold-crown" aria-hidden="true">♛</span><div><p class="eyebrow">AI FYSIK VURDERING</p><h2>GULD OVERKROP</h2><p>Din samlede vurdering ud fra dine mål, målinger og seneste analyse.</p></div></div>
    <div class="physique-gold-report-grid">
      <article class="physique-gold-score"><div class="physique-gold-score-ring"><strong id="physiqueGoldScore">0</strong><small>/100</small></div><div><span>DIN FYSIK SCORE</span><h3 id="physiqueGoldGrade">Venter på data</h3><p id="physiqueGoldSummary">Indtast dine mål for at få din personlige vurdering.</p></div></article>
      <article class="physique-gold-metrics"><span>OVERORDNET VURDERING</span><div id="physiqueGoldMetricList"></div></article>
    </div>
    <div class="physique-gold-lower-grid"><article><span>✦ FOKUSOMRÅDER</span><h3 id="physiqueGoldFocusTitle">Venter på AI-analyse</h3><ul id="physiqueGoldFocusList"></ul></article><article><span>DIN SENESTE SCAN</span><div class="physique-gold-photo-grid"><img id="physiqueGoldPhotoFront" alt="Seneste frontfoto" hidden><img id="physiqueGoldPhotoRight" alt="Seneste højre sidefoto" hidden><img id="physiqueGoldPhotoLeft" alt="Seneste venstre sidefoto" hidden><img id="physiqueGoldPhotoBack" alt="Seneste rygfoto" hidden></div></article></div>
  </section>
`;
trainingProgressPanel.after(physiqueAiPanel);
const physiqueGoldReport = physiqueAiPanel.querySelector('.physique-gold-report');
const physiqueScanGrid = physiqueAiPanel.querySelector('.physique-ai-grid');
if (physiqueGoldReport && physiqueScanGrid) physiqueScanGrid.before(physiqueGoldReport);
const physiqueProgressPanel = document.querySelector('#proProgress');
if (physiqueProgressPanel) {
  physiqueProgressPanel.dataset.appPage = 'progress';
  physiqueProgressPanel.hidden = true;
  document.querySelector('.content')?.insertBefore(physiqueProgressPanel, physiqueAiPanel);
}
physiqueAiPanel.querySelector('#physiqueBackButton').addEventListener('click', () => window.showAppPage?.('overview'));
physiqueAiPanel.querySelector('#physiqueGoldModeButton').addEventListener('click', () => {
  physiqueAiPanel.querySelector('.physique-gold-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
physiqueAiPanel.querySelectorAll('[data-open-pro]').forEach((button) => button.addEventListener('click', openProAccess));
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
const physiqueLeftSidePhotoInput = physiqueAiPanel.querySelector('#physiqueLeftSidePhotoInput');
const physiquePreview = physiqueAiPanel.querySelector('#physiquePreview');
const physiqueRightPreview = physiqueAiPanel.querySelector('#physiqueRightPreview');
const physiqueLeftPreview = physiqueAiPanel.querySelector('#physiqueLeftPreview');
const physiqueLeftSidePreview = physiqueAiPanel.querySelector('#physiqueLeftSidePreview');
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
const physiqueProgressStatus = physiqueAiPanel.querySelector('#physiqueProgressStatus');
const physiqueProgressFindings = physiqueAiPanel.querySelector('#physiqueProgressFindings');
const physiqueAnalysisNote = physiqueAiPanel.querySelector('#physiqueAnalysisNote');
const physiqueGoldScoreEl = physiqueAiPanel.querySelector('#physiqueGoldScore');
const physiqueGoldGradeEl = physiqueAiPanel.querySelector('#physiqueGoldGrade');
const physiqueGoldSummaryEl = physiqueAiPanel.querySelector('#physiqueGoldSummary');
const physiqueGoldMetricList = physiqueAiPanel.querySelector('#physiqueGoldMetricList');
const physiqueGoldFocusTitle = physiqueAiPanel.querySelector('#physiqueGoldFocusTitle');
const physiqueGoldFocusList = physiqueAiPanel.querySelector('#physiqueGoldFocusList');

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

function renderPhysiqueGoldReport(profile, score, grade, summary, analysis = null) {
  if (!physiqueGoldScoreEl) return;
  const metricValue = (value) => Math.round(clampPhysiqueValue(value || 0, 0, 100));
  const symmetry = profile.shoulders && profile.waist ? metricValue(100 - Math.abs(0.6 - profile.shoulders / profile.waist) * 180) : score;
  const definition = profile.height && profile.waist ? metricValue(100 - Math.max(0, profile.waist / profile.height - 0.42) * 260) : score;
  const proportions = profile.waist && profile.chest ? metricValue(70 + (profile.chest / profile.waist - 1) * 100) : score;
  const balance = metricValue((score + symmetry + definition + proportions) / 4);
  physiqueGoldScoreEl.textContent = String(score);
  physiqueGoldGradeEl.textContent = grade;
  physiqueGoldSummaryEl.textContent = summary;
  const metrics = [['Muskelmasse', score], ['Symmetri', symmetry], ['Definition', definition], ['Proportioner', proportions], ['Samlet balance', balance]];
  physiqueGoldMetricList.innerHTML = metrics.map(([label, value]) => `<div class="physique-gold-metric"><div><span>${label}</span><b>${value}/100</b></div><i><em style="width:${value}%"></em></i></div>`).join('');
  const priorities = analysis?.priorities || [];
  physiqueGoldFocusTitle.textContent = priorities.length ? `${priorities.length} primære fokusområder` : 'Klar til AI-analyse';
  physiqueGoldFocusList.innerHTML = priorities.slice(0, 4).map((item) => `<li>${item.muscle}${item.reason ? ` <small>${item.reason}</small>` : ''}</li>`).join('');
  const photos = getPhysiquePhotos();
  ['front', 'right', 'left', 'back'].forEach((name) => {
    const image = physiqueAiPanel.querySelector(`#physiqueGoldPhoto${name[0].toUpperCase()}${name.slice(1)}`);
    const photo = photos.find((item) => item.name === name);
    image.src = photo?.data || '';
    image.hidden = !photo?.data;
  });
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
  window.updatePhysique3DProfile?.(profile);
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
  const savedAnalysis = JSON.parse(localStorage.getItem('formlyPhysiqueMuscleAnalysis') || 'null');
  renderPhysiqueGoldReport(profile, score, grade, summary, savedAnalysis);
  localStorage.setItem('formlyPhysiqueAi', JSON.stringify({ ...profile, score, grade, summary, updatedAt: new Date().toISOString() }));
}

const physiquePhotoAngles = [
  { name: 'front', label: 'Front', key: 'formlyPhysiquePhoto', input: physiquePhotoInput, preview: physiquePreview },
  { name: 'right', label: 'Højre side', key: 'formlyPhysiquePhotoRight', input: physiqueRightPhotoInput, preview: physiqueRightPreview },
  { name: 'left', label: 'Venstre side', key: 'formlyPhysiquePhotoLeftSide', input: physiqueLeftSidePhotoInput, preview: physiqueLeftSidePreview },
  { name: 'back', label: 'Ryg', key: 'formlyPhysiquePhotoLeft', input: physiqueLeftPhotoInput, preview: physiqueLeftPreview }
];
const requiredPhysiquePhotoCount = physiquePhotoAngles.length;

function getPhysiquePhotos() {
  return physiquePhotoAngles.map((angle) => ({ ...angle, data: localStorage.getItem(angle.key) || '' }));
}

const physiqueAssessmentHistoryKey = 'formlyPhysiqueAssessmentHistory';
const physiqueHistoryDatabaseName = 'formlyPhysiqueHistory';
const physiqueHistoryStoreName = 'scans';
const physiqueComparisonIntervalMs = 7 * 24 * 60 * 60 * 1000;

function getPhysiqueAssessmentTimestamp(assessment) {
  return Number(assessment?.timestamp) || Date.parse(assessment?.createdAt || '') || 0;
}

function getPhysiqueHistoryOwnerId() {
  return authState.authenticated && authState.user?.id ? `account:${authState.user.id}` : `device:${userId}`;
}

function getPhysiqueAssessmentHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(physiqueAssessmentHistoryKey) || '[]');
    return Array.isArray(history)
      ? history.filter((assessment) => getPhysiqueAssessmentTimestamp(assessment) > 0).sort((a, b) => getPhysiqueAssessmentTimestamp(a) - getPhysiqueAssessmentTimestamp(b))
      : [];
  } catch {
    return [];
  }
}

function openPhysiqueHistoryDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('physique-history-unavailable'));
      return;
    }
    const request = indexedDB.open(physiqueHistoryDatabaseName, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(physiqueHistoryStoreName)) {
        request.result.createObjectStore(physiqueHistoryStoreName, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error || new Error('physique-history-unavailable')));
  });
}

async function savePhysiqueAssessmentPhotos(id, photos) {
  const database = await openPhysiqueHistoryDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(physiqueHistoryStoreName, 'readwrite');
    transaction.objectStore(physiqueHistoryStoreName).put({
      id,
      photos: photos.map((photo) => ({ name: photo.name, data: photo.data })),
      savedAt: new Date().toISOString()
    });
    transaction.addEventListener('complete', () => {
      database.close();
      resolve();
    });
    transaction.addEventListener('error', () => {
      database.close();
      reject(transaction.error || new Error('physique-history-write-failed'));
    });
    transaction.addEventListener('abort', () => {
      database.close();
      reject(transaction.error || new Error('physique-history-write-failed'));
    });
  });
}

async function getPhysiqueAssessmentPhotos(id) {
  const database = await openPhysiqueHistoryDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(physiqueHistoryStoreName, 'readonly').objectStore(physiqueHistoryStoreName).get(id);
    request.addEventListener('success', () => {
      database.close();
      resolve(Array.isArray(request.result?.photos) ? request.result.photos : []);
    });
    request.addEventListener('error', () => {
      database.close();
      reject(request.error || new Error('physique-history-read-failed'));
    });
  });
}

async function findPhysiqueComparisonBaseline(timestamp) {
  const ownerId = getPhysiqueHistoryOwnerId();
  const eligible = getPhysiqueAssessmentHistory()
    .filter((assessment) => assessment.ownerId === ownerId && assessment.source === 'vision' && assessment.photosStored && timestamp - getPhysiqueAssessmentTimestamp(assessment) >= physiqueComparisonIntervalMs)
    .sort((a, b) => getPhysiqueAssessmentTimestamp(b) - getPhysiqueAssessmentTimestamp(a));
  for (const assessment of eligible) {
    try {
      const photos = await getPhysiqueAssessmentPhotos(assessment.id);
      if (photos.length === requiredPhysiquePhotoCount && photos.every((photo) => photo.data)) return { assessment, photos };
    } catch {
      return null;
    }
  }
  return null;
}

async function archivePhysiqueAssessment(analysis, profile, photos, timestamp, baseline) {
  const idSuffix = globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const id = `physique-${timestamp}-${idSuffix}`;
  let photosStored = false;
  try {
    await savePhysiqueAssessmentPhotos(id, photos);
    photosStored = true;
  } catch {
    photosStored = false;
  }
  const assessment = {
    id,
    ownerId: getPhysiqueHistoryOwnerId(),
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    source: 'vision',
    profile,
    analysis,
    photosStored,
    baselineId: baseline?.assessment.id || '',
    baselineDate: baseline?.assessment.createdAt || ''
  };
  const history = getPhysiqueAssessmentHistory();
  history.push(assessment);
  localStorage.setItem(physiqueAssessmentHistoryKey, JSON.stringify(history));
  return assessment;
}

function formatPhysiqueAssessmentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'ukendt dato' : date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
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
  physiqueScanReadiness.textContent = `${readyCount}/${requiredPhysiquePhotoCount} VINKLER KLAR`;
  physiqueScanReadiness.parentElement.classList.toggle('is-ready', readyCount === requiredPhysiquePhotoCount);
  physiqueAnalyzeBtn.disabled = readyCount < requiredPhysiquePhotoCount;
  if (!physiqueAiStatus.dataset.source) {
    physiqueAiStatus.textContent = readyCount === requiredPhysiquePhotoCount ? 'BODY SCAN READY' : `MANGLER ${requiredPhysiquePhotoCount - readyCount} VINKEL${requiredPhysiquePhotoCount - readyCount === 1 ? '' : 'ER'}`;
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
    window.updatePhysique3DMuscles?.([]);
    physiqueAiPanel.querySelector('#physique3dStage')?.classList.remove('is-scanned');
    delete physiqueAiStatus.dataset.source;
    physiqueMuscleAnalysis.hidden = true;
    angle.preview.src = photoData;
    angle.preview.hidden = false;
    updatePhysiqueScanReadiness();
    window.__physique3d?.setView(angle.name);
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
  const priorities = normalizeItems(data.priorities, fallback.priorities, ['muscle', 'reason', 'priority'], 4);
  const priorityNames = new Set(priorities.map((item) => item.muscle.trim().toLowerCase()));
  const progress = Array.isArray(data.progress)
    ? data.progress.slice(0, 6).map((item) => {
      const muscle = String(item?.muscle || '').trim();
      let status = String(item?.status || '').trim().toLowerCase();
      if (!['improved', 'still_priority', 'uncertain'].includes(status)) status = 'uncertain';
      if (status === 'improved' && priorityNames.has(muscle.toLowerCase())) status = 'still_priority';
      return { muscle, status, reason: String(item?.reason || '').trim() };
    }).filter((item) => item.muscle)
    : [];
  return {
    summary: String(data.summary || fallback.summary),
    strengths: normalizeItems(data.strengths, fallback.strengths, ['muscle', 'reason'], 4),
    priorities,
    progress,
    plan: normalizeItems(data.plan, fallback.plan, ['exercise', 'target', 'sets', 'reps', 'rest', 'frequency'], 7),
    note: String(data.note || fallback.note)
  };
}

function appendPhysiqueFinding(list, title, description, badge = '', state = '') {
  const item = document.createElement('li');
  const heading = document.createElement('strong');
  const copy = document.createElement('p');
  if (state) item.dataset.state = state;
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

function getNextPhysiqueComparisonAt(timestamp) {
  const ownerId = getPhysiqueHistoryOwnerId();
  const nextDates = getPhysiqueAssessmentHistory()
    .filter((assessment) => assessment.ownerId === ownerId && assessment.source === 'vision' && assessment.photosStored)
    .map((assessment) => getPhysiqueAssessmentTimestamp(assessment) + physiqueComparisonIntervalMs)
    .filter((nextTimestamp) => nextTimestamp > timestamp)
    .sort((a, b) => a - b);
  return nextDates[0] || timestamp + physiqueComparisonIntervalMs;
}

function normalizeMuscleLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-zæøå]/g, '');
}

function computePhysiqueTrendFromHistory(analysis, currentProfile) {
  const history = getPhysiqueAssessmentHistory()
    .filter((assessment) => assessment.ownerId === getPhysiqueHistoryOwnerId() && assessment.profile)
    .sort((left, right) => getPhysiqueAssessmentTimestamp(left) - getPhysiqueAssessmentTimestamp(right));

  if (history.length < 2) return analysis.progress;

  const previous = history[history.length - 2];
  const priorProfile = previous.profile || {};
  const shoulderDelta = (Number(currentProfile.shoulders) || 0) - (Number(priorProfile.shoulders) || 0);
  const chestDelta = (Number(currentProfile.chest) || 0) - (Number(priorProfile.chest) || 0);
  const armDelta = (Number(currentProfile.arm) || 0) - (Number(priorProfile.arm) || 0);
  const waistDelta = (Number(currentProfile.waist) || 0) - (Number(priorProfile.waist) || 0);
  const weightDelta = (Number(currentProfile.weight) || 0) - (Number(priorProfile.weight) || 0);
  const standardGroups = [
    'Skuldre',
    'Bryst',
    'Ryg',
    'Arme',
    'Ben',
    'Glutes',
    'Core',
    'Talje'
  ];
  const muscleNames = [...new Set([
    ...analysis.priorities.map((item) => item.muscle),
    ...analysis.strengths.map((item) => item.muscle),
    ...standardGroups
  ])];

  const progress = muscleNames.map((muscle) => {
    const label = normalizeMuscleLabel(muscle);
    let status = 'still_priority';
    let reason = 'Denne muskelgruppe er stadig i fokus og kræver mere målrettet belastning for at vise tydelig fremgang.';

    if (/arm|biceps|triceps/.test(label) || /arme/.test(label)) {
      if (armDelta > 0.4 && waistDelta <= 2) {
        status = 'improved';
        reason = `Armene er faktisk vokset med ${armDelta.toFixed(1)} cm siden sidste vurdering, hvilket viser reel muscle development.`;
      }
    } else if (/shoulder|skuld|delt/.test(label)) {
      if (shoulderDelta > 0.4 && waistDelta <= 2) {
        status = 'improved';
        reason = `Skuldrene er steget med ${shoulderDelta.toFixed(1)} cm og viser mere bredde uden stor taljeøgning.`;
      }
    } else if (/chest|bryst|pec/.test(label)) {
      if (chestDelta > 0.5 && waistDelta <= 2) {
        status = 'improved';
        reason = `Brystet har udviklet sig med ${chestDelta.toFixed(1)} cm uden at taljen stiger for hurtigt.`;
      }
    } else if (/back|ryg|lat/.test(label)) {
      if ((shoulderDelta > 0.4 || chestDelta > 0.5) && waistDelta <= 2) {
        status = 'improved';
        reason = `Ryg og bredde er kommet frem, fordi skuldre og bryst har udviklet sig sammenhængende.`;
      }
    } else if (/leg|ben|lår|quad|hamstring|glute|baller/.test(label)) {
      if ((weightDelta > 0.5 && waistDelta <= 2) || (shoulderDelta > 0.4 && chestDelta > 0.4)) {
        status = 'improved';
        reason = `Underkroppen viser bedre belastningsrespons og mere stabil udvikling over tid.`;
      }
    } else if (/core|mave|abs|talje/.test(label)) {
      if (waistDelta < 0) {
        status = 'improved';
        reason = `Taljeprofilen er blevet mere stram, så den centrale muskulatur ser mere defineret ud.`;
      }
    }

    const isPriority = analysis.priorities.some((item) => normalizeMuscleLabel(item.muscle) === label);
    if (status === 'still_priority' && isPriority) {
      reason = 'Dette er stadig et fokusområde. Der er ikke nok reel linær udvikling endnu til at markere det som grønt.';
    }
    if (status === 'still_priority' && !isPriority) {
      status = 'uncertain';
      reason = 'Denne muskelgruppe har ikke nok tydelig trend endnu til at klassificere den som forbedret eller klart svag.';
    }

    return { muscle, status, reason };
  });

  const score = (entry) => {
    if (entry.status === 'improved') return 0;
    if (entry.status === 'still_priority') return 1;
    return 2;
  };
  return progress.sort((a, b) => score(a) - score(b));
}

function renderPhysiqueProgress(analysis, source, comparison) {
  physiqueProgressFindings.replaceChildren();
  if (source !== 'vision') {
    physiqueProgressStatus.textContent = 'Online billed-AI kræves for at gemme og sammenligne din udvikling uge for uge.';
    return;
  }
  if (!comparison?.baselineDate) {
    const assessmentDate = comparison?.assessmentDate || new Date().toISOString();
    const nextComparisonAt = comparison?.nextComparisonAt || new Date(Date.parse(assessmentDate) + physiqueComparisonIntervalMs).toISOString();
    physiqueProgressStatus.textContent = comparison?.photosStored === false
      ? 'Vurderingen er færdig, men billederne kunne ikke arkiveres på denne enhed.'
      : `Ugens billeder er gemt ${formatPhysiqueAssessmentDate(assessmentDate)}. Upload nye billeder om 7 dage for at se din udvikling.`;
    analysis.priorities.forEach((item) => appendPhysiqueFinding(physiqueProgressFindings, item.muscle, 'Startpunkt gemt til næste ugentlige vurdering.', 'UGE 1', 'baseline'));
    return;
  }
  const improved = analysis.progress.filter((item) => item.status === 'improved');
  const days = Number(comparison.daysSinceBaseline) || 7;
  physiqueProgressStatus.textContent = `Sammenlignet med ${formatPhysiqueAssessmentDate(comparison.baselineDate)} over ${days} dage. ${improved.length ? `${improved.length} muskelgruppe${improved.length === 1 ? '' : 'r'} viser fremgang.` : 'Ingen tidligere svag muskel er sikkert forbedret endnu.'}`;
  if (!analysis.progress.length) {
    appendPhysiqueFinding(physiqueProgressFindings, 'Sammenligning usikker', 'AI kunne ikke sammenligne muskelgrupperne sikkert. De tidligere fokusområder forbliver røde.', 'BEHOLD FOKUS', 'uncertain');
    return;
  }
  const progressLabels = {
    improved: ['FORBEDRET', 'improved'],
    still_priority: ['FORTSAT FOKUS', 'still-priority'],
    uncertain: ['USIKKER', 'uncertain']
  };
  analysis.progress.forEach((item) => {
    const [badge, state] = progressLabels[item.status] || progressLabels.uncertain;
    appendPhysiqueFinding(physiqueProgressFindings, item.muscle, item.reason || 'Ingen sikker visuel konklusion.', badge, state);
  });
}

function loadImageFromDataUrl(data) {
  return new Promise((resolve, reject) => {
    if (!data) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('load-image-failed'));
    image.src = data;
  });
}

function getPhysiquePriorityOverlay(targetName) {
  const value = String(targetName || '').toLowerCase();
  // Ryg og lats
  if (/ryg|back|lat|lats/.test(value)) return { area: 'back', color: 'rgba(255, 79, 99, 0.42)' };
  // Side- og bagskulder
  if (/side.*skuld|bag.*skuld|rear.*delt|posterior/.test(value)) return { area: 'rear-shoulder', color: 'rgba(255, 79, 99, 0.42)' };
  // Ben og baller
  if (/ben|lår|leg|quad|glute|baller|hamstring/.test(value)) return { area: 'legs', color: 'rgba(255, 79, 99, 0.42)' };
  // Skuldre generelt
  if (/skuld|shoulder|delt|trap/.test(value)) return { area: 'shoulders', color: 'rgba(255, 79, 99, 0.42)' };
  // Bryst
  if (/bryst|chest|pec/.test(value)) return { area: 'chest', color: 'rgba(255, 79, 99, 0.38)' };
  // Arme
  if (/arm|biceps|triceps/.test(value)) return { area: 'arms', color: 'rgba(255, 79, 99, 0.35)' };
  // Core
  if (/core|mave|abs|talje/.test(value)) return { area: 'core', color: 'rgba(255, 79, 99, 0.36)' };
  return { area: 'chest', color: 'rgba(255, 79, 99, 0.34)' };
}

function drawPhysiquePriorityOverlay(ctx, x, y, w, h, priorityName) {
  const overlay = getPhysiquePriorityOverlay(priorityName);
  const left = x + 18;
  const top = y + 12;
  const right = x + w - 18;
  const bottom = y + h - 10;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 95, 110, 0.9)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = overlay.color;
  ctx.strokeStyle = 'rgba(255, 230, 234, 0.96)';
  ctx.lineWidth = 3;
  if (overlay.area === 'shoulders') {
    // Front delts (foreste)
    ctx.beginPath();
    ctx.ellipse(left + 0.15 * w, top + 0.28 * h, 0.09 * w, 0.08 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Side delts (siden i midten - det vigtigste)
    ctx.beginPath();
    ctx.ellipse(left + 0.3 * w, top + 0.22 * h, 0.12 * w, 0.1 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.3 * w, top + 0.22 * h, 0.12 * w, 0.1 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rear delts (bagsiden)
    ctx.beginPath();
    ctx.ellipse(left + 0.08 * w, top + 0.3 * h, 0.09 * w, 0.08 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.08 * w, top + 0.3 * h, 0.09 * w, 0.08 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'rear-shoulder') {
    // SIDE- OG BAGSKULDER: side delts (vigtigste) og rear delts
    // Side delts - STOR
    ctx.beginPath();
    ctx.ellipse(left + 0.25 * w, top + 0.2 * h, 0.14 * w, 0.12 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.25 * w, top + 0.2 * h, 0.14 * w, 0.12 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rear delts - bageste del
    ctx.beginPath();
    ctx.ellipse(left + 0.06 * w, top + 0.32 * h, 0.1 * w, 0.09 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.06 * w, top + 0.32 * h, 0.1 * w, 0.09 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'back') {
    // RYG OG LATS - hele ryggen ned
    ctx.beginPath();
    ctx.ellipse(left + 0.5 * w, top + 0.42 * h, 0.22 * w, 0.35 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'legs') {
    // BEN OG BALLER
    // Baller (øverste del af bagdelen)
    ctx.beginPath();
    ctx.ellipse(left + 0.35 * w, top + 0.55 * h, 0.13 * w, 0.1 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.35 * w, top + 0.55 * h, 0.13 * w, 0.1 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Lår (ned ad benene)
    ctx.beginPath();
    ctx.ellipse(left + 0.32 * w, top + 0.72 * h, 0.1 * w, 0.15 * h, 0, 0, Math.PI * 2);
    ctx.ellipse(right - 0.32 * w, top + 0.72 * h, 0.1 * w, 0.15 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'chest') {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.26, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'arms') {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.2, y + h * 0.5, w * 0.12, h * 0.25, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.8, y + h * 0.5, w * 0.12, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (overlay.area === 'core') {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.52, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.24, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPhysiqueBackPriorityOverlay(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 79, 99, 0.42)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.22, y + h * 0.25, w * 0.16, h * 0.1, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.78, y + h * 0.25, w * 0.16, h * 0.1, 0.2, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.25, y + h * 0.45, w * 0.2, h * 0.24, 0.28, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.75, y + h * 0.45, w * 0.2, h * 0.24, -0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getPhysiqueFrontPhotoData() {
  const photos = getPhysiquePhotos();
  const frontPhoto = photos.find((photo) => photo.name === 'front' || photo.key === 'formlyPhysiquePhoto') || photos[0];
  return frontPhoto?.data || '';
}

async function renderPhysiqueResultPoster(analysis = null) {
  if (!physiqueResultPoster) return;
  const canvas = physiqueResultPoster;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const photos = getPhysiquePhotos().map((photo) => photo.data).filter(Boolean);
  const sourceImages = [];
  for (const photo of photos) {
    try {
      const image = await loadImageFromDataUrl(photo);
      sourceImages.push(image);
    } catch {
      sourceImages.push(null);
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#061821');
  gradient.addColorStop(0.55, '#0b2333');
  gradient.addColorStop(1, '#071824');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photoCard = (x, y, w, h, image, label, index) => {
    ctx.fillStyle = '#0a1b2a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(154,245,180,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    if (image) {
      const ratio = Math.min(w / image.width, h / image.height);
      const drawW = image.width * ratio;
      const drawH = image.height * ratio;
      const drawX = x + (w - drawW) / 2;
      const drawY = y + (h - drawH) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 12, y + 12, w - 24, h - 24);
      ctx.clip();
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
      if (index === 0 && analysis?.priorities?.length) {
        drawPhysiquePriorityOverlay(ctx, x + 12, y + 12, w - 24, h - 24, analysis.priorities[0].muscle);
      }
      ctx.restore();
    }
    ctx.fillStyle = '#aaf8bf';
    ctx.font = '700 22px "Space Grotesk", sans-serif';
    ctx.fillText(`${index + 1}`, x + 22, y + 34);
    ctx.fillStyle = '#dfeaf7';
    ctx.font = '600 16px "DM Sans", sans-serif';
    ctx.fillText(label, x + 22, y + h - 24);
  };

  const labels = ['Front', 'Højre side', 'Ryg'];
  const cardWidth = 240;
  const cardHeight = 250;
  const startX = 40;
  const cardGap = 22;
  sourceImages.forEach((image, index) => {
    const x = startX + index * (cardWidth + cardGap);
    const y = 60;
    photoCard(x, y, cardWidth, cardHeight, image, labels[index] || 'Foto', index);
  });

  const frontPhotoData = getPhysiqueFrontPhotoData();
  const mainPhoto = frontPhotoData ? (await loadImageFromDataUrl(frontPhotoData)) : null;
  const resultAreaX = 760;
  const resultAreaY = 70;
  const resultAreaW = 380;
  const resultAreaH = 510;
  ctx.fillStyle = 'rgba(10, 28, 38, 0.9)';
  ctx.fillRect(resultAreaX, resultAreaY, resultAreaW, resultAreaH);
  ctx.strokeStyle = 'rgba(154,245,180,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(resultAreaX, resultAreaY, resultAreaW, resultAreaH);

  if (mainPhoto) {
    const ratio = Math.min((resultAreaW - 72) / mainPhoto.width, (resultAreaH - 96) / mainPhoto.height);
    const drawW = mainPhoto.width * ratio;
    const drawH = mainPhoto.height * ratio;
    const drawX = resultAreaX + 36 + (resultAreaW - 72 - drawW) / 2;
    const drawY = resultAreaY + 48 + (resultAreaH - 96 - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(resultAreaX + 36, resultAreaY + 48, resultAreaW - 72, resultAreaH - 96);
    ctx.clip();
    ctx.drawImage(mainPhoto, drawX, drawY, drawW, drawH);
    // Tegn rødt på ALLE prioriteter, ikke kun den første
    if (analysis?.priorities && analysis.priorities.length > 0) {
      analysis.priorities.forEach((priority, index) => {
        drawPhysiquePriorityOverlay(ctx, resultAreaX + 36, resultAreaY + 48, resultAreaW - 72, resultAreaH - 96, priority.muscle);
      });
    }
    ctx.restore();
    ctx.fillStyle = '#ffdfe4';
    ctx.font = '700 14px "DM Sans", sans-serif';
    const priorityName = analysis?.priorities?.[0]?.muscle || 'bryst';
    ctx.fillText(`FOKUS: ${priorityName}`.toUpperCase(), resultAreaX + 36, resultAreaY + resultAreaH - 18);
  } else {
    ctx.fillStyle = '#aaf8bf';
    ctx.font = '600 18px "DM Sans", sans-serif';
    ctx.fillText('DINE BILLEDER', resultAreaX + 36, resultAreaY + 42);
  }

  ctx.fillStyle = '#0a1114';
  ctx.fillRect(resultAreaX + 28, resultAreaY + resultAreaH - 72, resultAreaW - 56, 30);
  ctx.fillStyle = '#24f58a';
  ctx.fillRect(resultAreaX + 28, resultAreaY + resultAreaH - 72, (resultAreaW - 56) * 0.68, 30);
  ctx.fillStyle = '#ff4a5e';
  ctx.fillRect(resultAreaX + 28 + (resultAreaW - 56) * 0.68, resultAreaY + resultAreaH - 72, (resultAreaW - 56) * 0.32, 30);
  ctx.fillStyle = '#061b15';
  ctx.font = '700 13px "DM Sans", sans-serif';
  ctx.fillText('STÆRKE MUSKELGRUPPER', resultAreaX + 36, resultAreaY + resultAreaH - 48);
  ctx.fillStyle = '#ffd7dc';
  ctx.fillText('SVAGE PUNKTER', resultAreaX + 252, resultAreaY + resultAreaH - 48);

  const headline = analysis?.summary ? analysis.summary.replace(/\s+/g, ' ').trim().slice(0, 80) : 'DINE BILLEDER ER FIGUREN';
  ctx.font = '700 28px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#edf7ff';
  ctx.fillText('RESULTAT', 40, 360);
  ctx.font = '500 18px "DM Sans", sans-serif';
  ctx.fillStyle = '#a4bfd5';
  const wrapped = headline.length > 56 ? `${headline.slice(0, 56)}…` : headline;
  ctx.fillText(wrapped, 40, 392);

  const strengthNames = (analysis?.strengths || []).slice(0, 3).map((item) => item.muscle);
  const priorityNames = (analysis?.priorities || []).slice(0, 3).map((item) => item.muscle);
  if (strengthNames.length) {
    ctx.fillStyle = '#24f58a';
    ctx.fillRect(40, 430, 220, 28);
    ctx.fillStyle = '#061b15';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.fillText('GOOD: ' + strengthNames.join(', '), 52, 450);
  }
  if (priorityNames.length) {
    ctx.fillStyle = '#ff4a5e';
    ctx.fillRect(40, 472, 220, 28);
    ctx.fillStyle = '#fff3f4';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.fillText('WEAK: ' + priorityNames.join(', '), 52, 492);
  }
}

function renderPhysiqueMuscleAnalysis(analysis, source, comparison = null) {
  const computedProgress = computePhysiqueTrendFromHistory(analysis, getPhysiqueProfile());
  const progress = (analysis.progress && analysis.progress.length)
    ? analysis.progress
    : (computedProgress || []);
  const nextAnalysis = { ...analysis, progress };

  physiqueStrengths.replaceChildren();
  physiquePriorities.replaceChildren();
  physiqueExercisePlan.replaceChildren();
  nextAnalysis.strengths.forEach((item) => appendPhysiqueFinding(physiqueStrengths, item.muscle, item.reason));
  nextAnalysis.priorities.forEach((item) => appendPhysiqueFinding(physiquePriorities, item.muscle, item.reason, item.priority));
  nextAnalysis.plan.forEach((item) => {
    const row = document.createElement('div');
    [item.exercise, item.target, `${item.sets} × ${item.reps}`, item.rest, item.frequency].forEach((value) => {
      const cell = document.createElement('span');
      cell.textContent = value;
      row.append(cell);
    });
    physiqueExercisePlan.append(row);
  });
  physiqueSummaryEl.textContent = nextAnalysis.summary;
  physiqueAnalysisNote.textContent = nextAnalysis.note;
  physiqueAiStatus.textContent = source === 'vision' ? '3-ANGLE ANALYSIS COMPLETE' : 'OFFLINE PROGRAM ACTIVE';
  physiqueAiStatus.dataset.source = source;
  physiqueMuscleAnalysis.hidden = false;
  physiqueAiPanel.querySelector('#physique3dStage')?.classList.add('is-scanned');
  renderPhysiqueProgress(nextAnalysis, source, comparison);
  const improvedMuscles = nextAnalysis.progress.filter((item) => item.status === 'improved').map((item) => item.muscle);
  const unresolvedMuscles = nextAnalysis.progress.filter((item) => item.status !== 'improved').map((item) => item.muscle);
  window.updatePhysique3DMuscles?.([...nextAnalysis.priorities.map((item) => item.muscle), ...unresolvedMuscles], improvedMuscles);
}

async function requestPhysiqueVisionAnalysis(profile, photos, baseline = null) {
  const toBase64 = (photo) => photo.data.includes(',') ? photo.data.split(',')[1] : photo.data;
  const currentImages = photos.map(toBase64);
  const hasBaseline = Boolean(baseline?.assessment && baseline.photos?.length === requiredPhysiquePhotoCount);
  const images = hasBaseline ? [...baseline.photos.map(toBase64), ...currentImages] : currentImages;
  const baselinePriorities = hasBaseline ? baseline.assessment.analysis?.priorities || [] : [];
  const photoOrder = hasBaseline
    ? `Du modtager otte fotos i denne faste rækkefølge: 1-4 er sidste uges scanning fra ${formatPhysiqueAssessmentDate(baseline.assessment.createdAt)} (front, højre side, venstre side, ryg), og 5-8 er denne uges scanning (front, højre side, venstre side, ryg). Sammenlign samme synlige muskelgruppe på tværs af de to tidspunkter. Baselines svage muskelgrupper er: ${JSON.stringify(baselinePriorities)}. Returnér én progress-post for hver af disse grupper med præcis status "improved", "still_priority" eller "uncertain". Brug kun "improved", når sammenlignelige vinkler tydeligt viser positiv udvikling; brug "still_priority", hvis området fortsat bør prioriteres, og "uncertain", hvis lys, pose, tøj eller vinkel ikke giver sikkert grundlag.`
    : 'Du modtager fire fotos i denne faste rækkefølge: 1) front, 2) højre side, 3) venstre side, 4) ryg. Dette er brugerens første baseline, så progress skal være en tom liste.';
  const prompt = `${photoOrder} Vurder alle vinkler som en forsigtig træningscoach. Vurder kun synlige muskelgrupper, proportioner og sideforskelle. Gæt ikke identitet, køn, etnicitet, sygdom eller præcis fedtprocent, og opfind ikke observationer om muskler som vinklerne ikke viser. Tag højde for lys, pose, tøj og kameravinkel. Nye mål: ${JSON.stringify(profile)}.${hasBaseline ? ` Baseline-mål: ${JSON.stringify(baseline.assessment.profile || {})}.` : ''} Returnér KUN gyldig JSON: {"summary":"samlet vurdering med usikkerhed","strengths":[{"muscle":"muskelgruppe","reason":"synligt grundlag på tværs af vinkler"}],"priorities":[{"muscle":"muskelgruppe","reason":"hvorfor den bør prioriteres","priority":"Høj eller Mellem"}],"progress":[{"muscle":"tidligere svag muskelgruppe","status":"improved, still_priority eller uncertain","reason":"synligt sammenligningsgrundlag"}],"plan":[{"exercise":"øvelse","target":"muskelgruppe","sets":4,"reps":"8-12","rest":"90 sek","frequency":"2 gange"}],"note":"begrænsning og progressionsregel"}. Giv 2-4 styrker, 2-4 fokusområder og 5-7 øvelser med konkrete sæt, reps, pause og ugentlig frekvens.`;
  const response = await fetch(getCoachEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: prompt, context: { physique: profile, photoAngles: ['front', 'right', 'left', 'back'], baselineId: baseline?.assessment.id || null }, images, isPhysiqueQuestion: true })
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
  renderPhysiqueAssessment();
  const photos = getPhysiquePhotos();
  if (photos.some((photo) => !photo.data)) {
    showToast('Tilføj front, højre side, venstre side og ryg først');
    return;
  }
  const profile = getPhysiqueProfile();
  const fallback = getFallbackMuscleAnalysis(profile);
  physiqueAnalyzeBtn.disabled = true;
  physiqueAnalyzeBtn.textContent = 'Scanner 3 vinkler...';
  physiqueAiStatus.textContent = 'ANALYSERER MUSKELGRUPPER';
  try {
    const assessmentTimestamp = Date.now();
    const baseline = await findPhysiqueComparisonBaseline(assessmentTimestamp);
    const aiResult = await requestPhysiqueVisionAnalysis(profile, photos, baseline);
    const analysis = normalizePhysiqueAnalysis(aiResult, fallback);
    if (!baseline) analysis.progress = [];
    const assessment = await archivePhysiqueAssessment(analysis, profile, photos, assessmentTimestamp, baseline);
    const comparison = {
      assessmentDate: assessment.createdAt,
      baselineDate: assessment.baselineDate,
      daysSinceBaseline: baseline ? Math.round((assessmentTimestamp - getPhysiqueAssessmentTimestamp(baseline.assessment)) / 86400000) : 0,
      nextComparisonAt: baseline ? '' : new Date(getNextPhysiqueComparisonAt(assessmentTimestamp)).toISOString(),
      photosStored: assessment.photosStored
    };
    renderPhysiqueMuscleAnalysis(analysis, 'vision', comparison);
    localStorage.setItem('formlyPhysiqueMuscleAnalysis', JSON.stringify({ ...analysis, source: 'vision', ownerId: assessment.ownerId, updatedAt: assessment.createdAt, assessmentId: assessment.id, comparison }));
    showToast(baseline ? 'Ugentlig AI-sammenligning er klar' : 'Ugens 4-vinkels scan er gemt');
  } catch (error) {
    if (error.message === 'auth-required') {
      physiqueAiStatus.textContent = 'LOG IND FOR ONLINE AI';
      showToast('Log ind for at bruge AI-fysikanalyse');
      return;
    }
    if (error.message === 'pro-required') {
      physiqueAiStatus.textContent = 'KRÆVER PRO';
      showToast('KRÆVER PRO · AI-fysikanalyse');
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
  renderPhysiqueMuscleAnalysis(normalizePhysiqueAnalysis(savedMuscleAnalysis, fallback), savedMuscleAnalysis.source || 'fallback', savedMuscleAnalysis.comparison || null);
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
  fysikCurrentWeight.textContent = currentWeight
    ? `Seneste måling: ${formatWeight(currentWeight)} kg · ${latestMeasurement?.date || new Date().toLocaleDateString('da-DK')}`
    : 'Seneste måling: -';
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
    const modeDifference = Math.round((maintenance * mode.data.rate) / 10) * 10;
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
    return `<div class="weight-history-row">${image}<strong>${formatWeight(entry.weight)} kg</strong><span>${formatElapsedSinceDate(entry)} · ${entry.date || 'Uden dato'}</span><small>${feedback}</small><div class="weight-photo-feedback"><span><b>Ros:</b> ${praise}</span><span><b>Cons:</b> ${caution}</span></div>${aiReview}</div>`;
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
function updateWeightPhotoSchedule() {
  const latestPhoto = weightHistory.filter((entry) => entry.photo && Number.isFinite(getProgressTimestamp(entry))).sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a))[0];
  if (!latestPhoto) {
    weightPhotoSchedule.textContent = 'Første fysikfoto kan gemmes nu.';
    return;
  }
  weightPhotoSchedule.textContent = `Nyt fysikfoto kan gemmes nu. Sidste billede: ${latestPhoto.date || 'Uden dato'} (${formatElapsedSinceDate(latestPhoto)}).`;
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
  const entry = { dateValue: getIsoDateValue(parsedDate), timestamp, weight, date: parsedDate.toLocaleDateString('da-DK'), photo: pendingWeightPhoto, phase: selectedWeightPhase };
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
  renderWeightPhotoPager();
  if (typeof renderProHome === 'function') renderProHome();
  if (typeof renderProProgress === 'function') renderProProgress();
  showToast(`${entry.date} er gemt med ${formatWeight(weight)} kg`);
  const nextMonday = new Date(parsedDate);
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  weightTracker.querySelector('#weightDate').value = nextMonday.toLocaleDateString('da-DK');
  weightTracker.querySelector('#weightEntry').value = '';
  weightTracker.querySelector('#weightPhotoInput').value = '';
  weightTracker.querySelector('#weightPhotoPreview').innerHTML = '';
  pendingWeightPhoto = '';
  updateWeightPhotoSchedule();
  saveButton.disabled = false;
});
weightTracker.querySelector('#weightDate').value = new Date().toLocaleDateString('da-DK');
updateWeightPhotoSchedule();
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
  if (!hasFullAppAccess()) {
    openProAccess();
    showToast('KRÆVER PRO · Withings');
    return;
  }
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
  if (maintenance <= 0) return 0;
  const adjustment = getGoalAdjustment(selectedGoal, intensitySelect.value);
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
const bulkGoalPanel = document.createElement('div');
bulkGoalPanel.className = 'bulk-goal-panel';
bulkGoalPanel.innerHTML = '<div class="bulk-goal-panel-heading"><span>BULK STRATEGI</span><small>Vælg dit tempo</small></div><div class="bulk-goal-tabs"><button type="button" data-bulk-intensity="low">Slow bulk</button><button type="button" data-bulk-intensity="moderate">Moderat bulk</button><button type="button" data-bulk-intensity="moderateHigh">Moderat til høj</button><button type="button" data-bulk-intensity="high">Aggressiv</button></div>';
const goalTempo = document.createElement('span');
goalTempo.className = 'profile-goal-tempo';
const goalTarget = document.createElement('span');
goalTarget.className = 'profile-goal-target';
const goalStrategy = document.createElement('p');
goalStrategy.className = 'profile-goal-strategy';
const bulkStrategyOptions = document.createElement('div');
bulkStrategyOptions.className = 'bulk-strategy-options';
bulkStrategyOptions.innerHTML = '<div class="bulk-strategy-option" data-strategy-option="low"><div><b>Slow bulk</b><strong data-option-delta></strong></div><p>Langsom vægtstigning med fokus på en kontrolleret udvikling.</p></div><div class="bulk-strategy-option" data-strategy-option="moderate"><div><b>Moderat bulk</b><strong data-option-delta></strong></div><p>En kontrolleret tilgang med fokus på stabil fremgang.</p></div><div class="bulk-strategy-option" data-strategy-option="moderateHigh"><div><b>Moderat til høj</b><strong data-option-delta></strong></div><p>Mere energi til træning med en tydelig, men stadig kontrolleret vægtstigning.</p></div><div class="bulk-strategy-option" data-strategy-option="high"><div><b>Aggressiv bulk</b><strong data-option-delta></strong></div><p>Hurtigere vægtstigning med større risiko for unødvendig fedtøgning.</p></div><div class="bulk-smart-goal"><b>AIO Smart Goal</b><span>Efter dine næste vejninger kan appen sammenligne målet med din faktiske vægttrend.</span></div>';

profileResultPanel.append(bulkGoalPanel, goalTabsElement, goalPrimary, goalTempo, goalTarget, goalStrategy, goalInsights, bulkStrategyOptions, profileSummary, profileActivitySummary, profileHealthSync);
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
weightSource.addEventListener('change', () => {
  if (weightSource.value !== 'manual' && (!authState.authenticated || !billingState.isPro)) {
    weightSource.value = 'manual';
    openProAccess();
    showToast('KRÆVER PRO · automatiske sundhedsdata');
  }
  localStorage.setItem('formlyWeightSource', weightSource.value);
});
const savedWeight = localStorage.getItem('formlyWeight');
if (savedWeight) {
  profileWeight.value = savedWeight;
  weightReading.textContent = savedWeight;
  weightSyncStatus.textContent = 'Sidst gemt fra denne enhed';
}

async function syncWithingsWeightFromBackend() {
  if (!hasFullAppAccess()) return;
  try {
    const response = await fetch('/api/provider/weight?provider=withings', { cache: 'no-store' });
    const data = await response.json();
    if (response.status === 401) {
      requireFreshLogin();
      return;
    }
    if (response.status === 402) {
      applyBillingStatus(data.billing);
      openProAccess();
      return;
    }
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
healthProviders.innerHTML = '<p class="eyebrow">FLERE SUNDHEDSKILDER</p><div id="healthProGate" class="pro-inline-gate"><span class="pro-gate-lock" aria-hidden="true"></span><div><span>KRÆVER PRO</span><strong>Automatisk sundhedssynk</strong><small>Withings, Apple Health, Oura og WHOOP. Manuel vægt og egne billeder er stadig gratis.</small></div><button type="button">Se Pro</button></div><div class="provider-grid"><button type="button" data-provider="apple">Forbind Apple Health</button><button type="button" data-provider="oura">Forbind Oura</button><button type="button" data-provider="whoop">Forbind WHOOP</button><button type="button" data-provider="withings">Forbind Withings</button></div><small id="providerStatus">Vælg en kilde for at forbinde recovery, søvn og puls.</small><button type="button" id="withingsDisconnect" hidden>Deaktivér Withings</button>';
profileSection.append(healthProviders);
healthProviders.querySelector('#healthProGate button').addEventListener('click', openProAccess);
const withingsButton = healthProviders.querySelector('[data-provider="withings"]');
const withingsDisconnect = healthProviders.querySelector('#withingsDisconnect');
function applyWithingsConnectionState(connected) {
  const connectionActive = connected && hasFullAppAccess();
  withingsButton.textContent = connectionActive ? 'Withings forbundet' : 'Forbind Withings';
  withingsDisconnect.hidden = !connected;
  profileWeight.readOnly = connectionActive;
  weightEntry.disabled = connectionActive;
  weightEntry.placeholder = connectionActive ? 'Withings styrer vægten' : 'Fx 82,4';
}
withingsDisconnect.addEventListener('click', async () => {
  await fetch('/api/provider/disconnect', { method: 'POST' });
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
  window.setTimeout(() => autoSyncWithingsWeight(), 0);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
}
else if (providerCallbackParams.get('provider') === 'withings' && providerCallbackParams.get('pro_required') === '1') {
  openProAccess();
  showToast('KRÆVER PRO · Withings');
  window.history.replaceState({}, document.title, `${window.location.pathname}#pro`);
}
else if (localStorage.getItem('formlyWithingsConnected') === '1') {
  applyWithingsConnectionState(true);
  healthProviders.querySelector('#providerStatus').textContent = billingState.isPro ? 'Forbundet med Withings. Henter seneste vægt...' : 'KRÆVER PRO · Withings er gemt, men synkronisering er låst.';
  window.setTimeout(() => autoSyncWithingsWeight(), 0);
}

async function syncWithingsActivityFromBackend() {
  if (!hasFullAppAccess()) return;
  try {
    const response = await fetch('/api/provider/activity?provider=withings', { cache: 'no-store' });
    const data = await response.json();
    if (response.status === 401) {
      requireFreshLogin();
      return;
    }
    if (response.status === 402) {
      applyBillingStatus(data.billing);
      return;
    }
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
  if (hasFullAppAccess() && localStorage.getItem('formlyWithingsConnected') === '1') {
    syncWithingsWeightFromBackend();
    syncWithingsActivityFromBackend();
  }
};
let healthProviderStatusRequest = null;
function refreshHealthProviderStatus() {
  if (!hasFullAppAccess() || healthProviderStatusRequest) return healthProviderStatusRequest;
  healthProviderStatusRequest = fetch('/api/provider/status', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => {
    if (data?.withings_connected) {
      localStorage.setItem('formlyWithingsConnected', '1');
      applyWithingsConnectionState(true);
      healthProviders.querySelector('#providerStatus').textContent = 'Forbundet med Withings. Henter seneste vægt...';
      syncWithingsWeightFromBackend();
      syncWithingsActivityFromBackend();
    } else if (data?.ok) {
      localStorage.removeItem('formlyWithingsConnected');
      applyWithingsConnectionState(false);
      healthProviders.querySelector('#providerStatus').textContent = 'Ingen sundhedskilde er forbundet endnu.';
    }
    return data;
  })
    .catch(() => null)
    .finally(() => { healthProviderStatusRequest = null; });
  return healthProviderStatusRequest;
}
updateBillingUi();
window.addEventListener('pageshow', autoSyncWithingsWeight);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autoSyncWithingsWeight();
});
window.setInterval(autoSyncWithingsWeight, 60000);

window.AIOHealthKitBridge = window.AIOHealthKitBridge || {
  requestHealthData: function requestHealthData() {
    if (!hasFullAppAccess()) {
      openProAccess();
      showToast('KRÆVER PRO · Apple Health');
      return false;
    }
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
    if (!hasFullAppAccess()) {
      openProAccess();
      showToast('KRÆVER PRO · sundhedsdata');
      return false;
    }
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
    return true;
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
  const nextExerciseRow = rows.find((row) => !row.classList.contains('completed')) || rows[0];
  const nextExerciseName = nextExerciseRow?.querySelector('h3')?.textContent?.trim() || 'Din første øvelse';
  const sessionEntries = workoutLog.filter((entry) => Number(entry.session || 1) === activeWorkoutSession);
  const completedExercises = rows.filter((row) => row.classList.contains('completed')).length;
  const isSessionComplete = localStorage.getItem(`formlyWorkoutSessionComplete:${activeWorkoutSession}`) === 'true';
  const loggedSets = sessionEntries.reduce((total, entry) => total + getExerciseSetCount(entry), 0);
  const sessionVolume = sessionEntries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const completionPercent = isSessionComplete ? 100 : rows.length ? Math.round((completedExercises / rows.length) * 100) : 0;
  const latestEntry = [...sessionEntries].sort((a, b) => getProgressTimestamp(b) - getProgressTimestamp(a))[0];

  document.querySelector('#workoutSessionBadge').textContent = `SESSION ${String(activeWorkoutSession).padStart(2, '0')}`;
  document.querySelector('#workoutStatusLabel').textContent = isSessionComplete ? 'Session gennemført' : sessionEntries.length ? 'Træning i gang' : 'Klar til at starte';
  document.querySelector('#workoutOverviewTitle').textContent = isSessionComplete ? 'Dagens arbejde er gemt' : sessionEntries.length ? 'Fortsæt hvor du slap' : `${nextExerciseName} er klar`;
  document.querySelector('#workoutOverviewLead').textContent = isSessionComplete ? `${loggedSets} arbejdssæt og ${sessionVolume.toLocaleString('da-DK')} kg volumen er registreret.` : sessionEntries.length ? `${loggedSets} arbejdssæt er logget. Fortsæt med næste øvelse.` : `Start med ${nextExerciseName}, og registrér derefter dagens arbejdssæt.`;
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
  renderProHome();
  if (typeof renderProProgress === 'function') renderProProgress();
}

function goToProHomeTarget(target) {
  if (!target) return;
  const pageMap = {
    '#food': 'food', '.coach-panel': 'coach', '#weight': 'weight', '#profile': 'profile',
    '#physique-ai': 'physique', '#workout': 'training', '#library': 'library', '#progress': 'progress',
    '.training-progress-panel': 'progress', '#pro': 'pro', '#top': 'overview'
  };
  const targetPage = pageMap[target];
  if (targetPage && typeof window.showAppPage === 'function') {
    window.showAppPage(targetPage);
    return;
  }
  document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fuldt Pro-forsidedesign (viser rigtige data, kun synligt for Pro-brugere via .has-pro-access).
window.changeHomePhotoPage = (direction) => {
  const count = weightHistory.filter((entry) => entry.photo).length;
  if (!count) return;
  selectedHomePhotoIndex = Math.min(count - 1, Math.max(0, selectedHomePhotoIndex + Number(direction || 0)));
  renderProHome();
};

function renderProHome() {
  const proHome = document.querySelector('#proHome');
  if (!proHome) return;
  const hasOnlineAccess = hasFullAppAccess();
  proHome.hidden = !hasOnlineAccess;
  const bottomNavEl = document.querySelector('#proHomeBottomNav');
  if (bottomNavEl) bottomNavEl.hidden = !hasOnlineAccess;
  if (!hasOnlineAccess) return;

  const dashboardTabs = proHome.querySelectorAll('[data-dashboard-view]');
  const selectDashboardView = (view) => {
    proHome.dataset.dashboardView = view;
    dashboardTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.dashboardView === view));
  };
  dashboardTabs.forEach((tab) => {
    if (tab.dataset.wired) return;
    tab.dataset.wired = '1';
    tab.addEventListener('click', () => selectDashboardView(tab.dataset.dashboardView));
  });
  const physiquePhotoButton = proHome.querySelector('#proHomePhysiquePhoto');
  if (physiquePhotoButton && !physiquePhotoButton.dataset.wired) {
    physiquePhotoButton.dataset.wired = '1';
    physiquePhotoButton.addEventListener('click', () => selectDashboardView('physique'));
  }
  const quickToggle = proHome.querySelector('#proHomeQuickToggle');
  if (quickToggle && !quickToggle.dataset.wired) {
    quickToggle.dataset.wired = '1';
    quickToggle.addEventListener('click', () => {
      const isOpen = proHome.classList.toggle('quick-menu-open');
      quickToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
  if (!proHome.dataset.dashboardView) selectDashboardView('overview');

  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Godmorgen' : hour < 12 ? 'God formiddag' : hour < 18 ? 'God eftermiddag' : 'God aften';
  const name = getUserName();
  document.querySelector('#proHomeGreeting').innerHTML = `${greeting}${name ? `, ${name}` : ''} <span aria-hidden="true">👋</span>`;

  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  const completedExercises = rows.filter((row) => row.classList.contains('completed')).length;
  const isSessionComplete = localStorage.getItem(`formlyWorkoutSessionComplete:${activeWorkoutSession}`) === 'true';
  const sessionEntries = workoutLog.filter((entry) => Number(entry.session || 1) === activeWorkoutSession);
  const loggedSets = sessionEntries.reduce((total, entry) => total + getExerciseSetCount(entry), 0);
  const sessionVolume = sessionEntries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const completionPercent = isSessionComplete ? 100 : rows.length ? Math.round((completedExercises / rows.length) * 100) : 0;
  const nextExerciseRow = rows.find((row) => !row.classList.contains('completed')) || rows[0];
  const nextExerciseName = nextExerciseRow?.querySelector('h3')?.textContent?.trim() || 'din første øvelse';

  document.querySelector('#proHomeWorkoutTitle').textContent = isSessionComplete ? 'Session gennemført' : sessionEntries.length ? 'Fortsæt hvor du slap' : `${nextExerciseName} er klar`;
  document.querySelector('#proHomeWorkoutProgressLabel').textContent = `${completedExercises} / ${rows.length} øvelser færdiggjort`;
  document.querySelector('#proHomeProgressBar').style.width = `${completionPercent}%`;
  document.querySelector('#proHomeWorkoutTime').textContent = loggedSets ? `${loggedSets * 3} min` : '–';
  document.querySelector('#proHomeWorkoutKcal').textContent = sessionVolume ? String(Math.round(sessionVolume * 0.12)) : '–';
  const startProButton = document.querySelector('#proHomeStartWorkout');
  if (startProButton && !startProButton.dataset.wired) {
    startProButton.dataset.wired = '1';
    startProButton.addEventListener('click', () => startButton?.click());
  }

  const benchEntries = workoutLog.filter((entry) => String(entry.exercise || '').trim().toLowerCase() === 'bench press');
  const weeklyGroups = {};
  benchEntries.forEach((entry) => {
    const key = String(entry.week || entry.session || 1);
    (weeklyGroups[key] = weeklyGroups[key] || []).push(entry);
  });
  const weekKeys = Object.keys(weeklyGroups).sort((a, b) => (weeklyGroups[a][0]?.timestamp || 0) - (weeklyGroups[b][0]?.timestamp || 0));
  const weeklyVolumes = weekKeys.map((key) => weeklyGroups[key].reduce((total, entry) => total + getExerciseVolume(entry), 0));
  const weeklyBestOrm = weekKeys.map((key) => weeklyGroups[key].reduce((best, entry) => Math.max(best, (Number(entry.weight) || 0) * (1 + (Number(entry.reps) || 0) / 30)), 0));
  const currentVolume = weeklyVolumes[weeklyVolumes.length - 1] || 0;
  const previousVolume = weeklyVolumes[weeklyVolumes.length - 2] || 0;
  const currentBestOrm = weeklyBestOrm[weeklyBestOrm.length - 1] || 0;
  const bodyweight = Number(profileWeight.value) || 0;
  const strengthPercent = bodyweight ? Math.min(100, Math.round((currentBestOrm / (bodyweight * 1.5)) * 100)) : 0;
  const strengthChange = previousVolume ? Math.round((currentVolume - previousVolume) / previousVolume * 100) : (currentVolume ? 100 : 0);
  const progressKg = Math.round((currentVolume - previousVolume) * 10) / 10;

  const lastWorkoutTimestamp = workoutLog.length ? Math.max(...workoutLog.map((entry) => getProgressTimestamp(entry))) : 0;
  const daysSinceLastWorkout = lastWorkoutTimestamp ? Math.floor((Date.now() - lastWorkoutTimestamp) / 86400000) : 2;
  const recoveryPercent = Math.max(35, Math.min(100, 55 + daysSinceLastWorkout * 15));

  // The dashboard chart mirrors the order in which the user saved measurements.
  const sortedWeightEntries = weightHistory.slice();
  const latestWeightEntry = sortedWeightEntries.at(-1);
  const firstWeightEntry = sortedWeightEntries[0];
  const weightChange = latestWeightEntry && firstWeightEntry ? Number(latestWeightEntry.weight) - Number(firstWeightEntry.weight) : 0;
  const strengthGroups = new Map();
  workoutLog.forEach((entry) => {
    const exerciseName = String(entry.exercise || '').trim();
    if (!exerciseName || Number(entry.weight) <= 0 || Number(entry.reps) <= 0) return;
    const exerciseKey = normalizeExerciseNameForComparison(exerciseName);
    const entries = strengthGroups.get(exerciseKey) || [];
    entries.push(entry);
    strengthGroups.set(exerciseKey, entries);
  });
  const strengthChanges = [...strengthGroups.values()].map((entries) => {
    const chronologicalEntries = entries.slice().sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
    if (chronologicalEntries.length < 2) return null;
    const startOneRepMax = estimateOneRepMax(chronologicalEntries[0].weight, chronologicalEntries[0].reps);
    const currentOneRepMax = estimateOneRepMax(chronologicalEntries.at(-1).weight, chronologicalEntries.at(-1).reps);
    return startOneRepMax > 0 ? ((currentOneRepMax - startOneRepMax) / startOneRepMax) * 100 : null;
  }).filter((value) => Number.isFinite(value));
  const strengthLiftChange = strengthChanges.length
    ? Math.round((strengthChanges.reduce((total, value) => total + value, 0) / strengthChanges.length) * 10) / 10
    : 0;
  const allVolume = workoutLog.reduce((total, entry) => total + getExerciseVolume(entry), 0);
  const fitnessScore = Math.round(Math.min(100, Math.max(0, (strengthPercent * 0.45) + (recoveryPercent * 0.3) + (latestWeightEntry ? 18 : 0) + (allVolume ? 7 : 0))));
  const setPremiumText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };
  setPremiumText('#premiumFitnessScore', String(fitnessScore));
  setPremiumText('#premiumHeaderFitnessScore', String(fitnessScore));
  setPremiumText('#premiumFitnessDelta', strengthChanges.length ? `${strengthLiftChange >= 0 ? '+' : ''}${strengthLiftChange}% styrke` : 'Klar');
  setPremiumText('#premiumFitnessSummary', allVolume ? 'Baseret på din træning, restitution og vægtudvikling.' : 'Log træning og vægt for din personlige score.');
  document.querySelector('#premiumFitnessRing')?.style.setProperty('--premium-score', `${fitnessScore}%`);
  setPremiumText('#premiumStrengthValue', strengthChanges.length ? `${strengthLiftChange >= 0 ? '+' : ''}${strengthLiftChange}%` : '0%');
  setPremiumText('#premiumStrengthDetail', currentBestOrm ? `${currentBestOrm.toFixed(1).replace('.', ',')} kg bedste 1RM` : 'Log et løft for at starte');
  setPremiumText('#premiumStrengthDelta', strengthChanges.length ? `${strengthLiftChange >= 0 ? '+' : ''}${strengthLiftChange}%` : 'Ingen trend');
  setPremiumText('#premiumWeightValue', latestWeightEntry ? `${formatWeight(latestWeightEntry.weight)} kg` : '- kg');
  setPremiumText('#premiumWeightDetail', latestWeightEntry && firstWeightEntry ? `${weightChange >= 0 ? '+' : ''}${formatWeight(weightChange)} kg siden start` : 'Registrér din vægt');
  setPremiumText('#premiumWeightDelta', latestWeightEntry && firstWeightEntry ? `${weightChange >= 0 ? '+' : ''}${formatWeight(weightChange)} kg` : '-');
  setPremiumText('#premiumVolumeValue', `${allVolume.toLocaleString('da-DK')} kg`);
  setPremiumText('#premiumVolumeDetail', workoutLog.length ? `${workoutLog.length} loggede sæt` : 'Denne uge');
  setPremiumText('#premiumVolumeDelta', `${strengthChange >= 0 ? '+' : ''}${strengthChange}%`);
  setPremiumText('#premiumRecoveryValue', `${recoveryPercent}%`);
  setPremiumText('#premiumRecoveryDetail', lastWorkoutTimestamp ? `${Math.max(0, daysSinceLastWorkout)} dag(e) siden sidst` : 'Klar til træning');
  setPremiumText('#premiumRecoveryDelta', `${recoveryPercent}%`);
  setPremiumText('#premiumTrendWeight', latestWeightEntry ? `${formatWeight(latestWeightEntry.weight)} kg` : '- kg');
  setPremiumText('#premiumTrendDetail', latestWeightEntry && firstWeightEntry ? `${weightChange >= 0 ? '+' : ''}${formatWeight(weightChange)} kg siden din første måling` : 'Tilføj vejninger for at se din trend.');
  const trendBars = document.querySelector('#premiumTrendBars');
  if (trendBars) {
    const trendValues = sortedWeightEntries.slice(-7).map((entry) => Number(entry.weight) || 0);
    if (trendValues.length) {
      const minTrend = Math.min(...trendValues);
      const maxTrend = Math.max(...trendValues);
      const trendRange = maxTrend - minTrend || 1;
      const points = trendValues.map((value, index) => {
        const x = trendValues.length > 1 ? (index / (trendValues.length - 1)) * 700 : 350;
        const y = 132 - ((value - minTrend) / trendRange) * 100;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const firstPoint = points[0];
      const lastPoint = points.at(-1);
      trendBars.innerHTML = `<svg viewBox="0 0 700 145" preserveAspectRatio="none" aria-label="Vægtudvikling"><defs><linearGradient id="premiumWeightArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c457ff" stop-opacity=".42"></stop><stop offset=".28" stop-color="#a43ced" stop-opacity=".22"></stop><stop offset=".72" stop-color="#7020bd" stop-opacity=".06"></stop><stop offset="1" stop-color="#521883" stop-opacity="0"></stop></linearGradient></defs><path class="premium-weight-area" d="M${firstPoint} L${points.slice(1).join(' L')} L${lastPoint.split(',')[0]},145 L${firstPoint.split(',')[0]},145 Z"></path><polyline class="premium-weight-glow" points="${points.join(' ')}"></polyline><polyline class="premium-weight-line" points="${points.join(' ')}"></polyline></svg>`;
    } else {
      trendBars.innerHTML = '<span>Ingen vægtdata endnu</span>';
    }
  }
  const dailySteps = Number(exactStepsInput?.value || stepsInput?.value || 0);
  const stepGoal = 10000;
  const stepsPercent = Math.min(100, Math.round((dailySteps / stepGoal) * 100));
  setPremiumText('#premiumStepsValue', dailySteps.toLocaleString('da-DK'));
  setPremiumText('#premiumStepsPercent', `${stepsPercent}%`);
  setPremiumText('#premiumStepsDetail', `${Math.max(0, stepGoal - dailySteps).toLocaleString('da-DK')} steps til ${stepGoal.toLocaleString('da-DK')}`);
  document.querySelector('#premiumStepsBar')?.style.setProperty('width', `${stepsPercent}%`);
  const exerciseGroups = new Map();
  workoutLog.forEach((entry) => {
    const name = String(entry.exercise || '').trim();
    if (!name) return;
    const key = normalizeExerciseNameForComparison(name);
    const group = exerciseGroups.get(key) || { name, entries: [] };
    group.entries.push(entry);
    exerciseGroups.set(key, group);
  });
  const premiumStrengthRows = document.querySelector('#premiumStrengthRows');
  if (premiumStrengthRows) {
    premiumStrengthRows.innerHTML = [...exerciseGroups.values()].slice(0, 4).map((group) => {
      const entries = group.entries.slice().sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
      const start = estimateOneRepMax(entries[0].weight, entries[0].reps);
      const current = estimateOneRepMax(entries.at(-1).weight, entries.at(-1).reps);
      const change = start ? Math.round((current - start) / start * 100) : 0;
      return `<div class="premium-strength-row"><div><strong>${group.name}</strong><small>1RM</small></div><span>${start.toFixed(1).replace('.', ',')} → ${current.toFixed(1).replace('.', ',')} kg</span><svg viewBox="0 0 80 22" aria-hidden="true"><polyline points="0,19 12,15 24,17 36,10 50,13 64,6 80,2"></polyline></svg><b>${change >= 0 ? '+' : ''}${change}%</b></div>`;
    }).join('') || '<p>Log øvelser for at se din progression her.</p>';
  }
  let storedFoodEntries = [];
  try {
    const parsedFoodEntries = JSON.parse(localStorage.getItem('formlyFoodEntries') || '[]');
    storedFoodEntries = Array.isArray(parsedFoodEntries) ? parsedFoodEntries : [];
  } catch {
    storedFoodEntries = [];
  }
  try {
    const dashboardFoodDate = typeof selectedFoodDate !== 'undefined' ? foodDateKey(selectedFoodDate) : todayFoodDateKey();
    const foodEntriesToday = storedFoodEntries.filter((entry) => entry.date === dashboardFoodDate);
    const foodCalories = foodEntriesToday.reduce((total, entry) => total + (Number(entry.kcal) || 0), 0);
    const foodProtein = foodEntriesToday.reduce((total, entry) => total + (Number(entry.protein) || 0), 0);
    const foodCarbs = foodEntriesToday.reduce((total, entry) => total + (Number(entry.carbs) || 0), 0);
    const foodFat = foodEntriesToday.reduce((total, entry) => total + (Number(entry.fat) || 0), 0);
    const calorieTarget = calculateCalorieTarget();
    const proteinTarget = Math.round((Number(profileWeight.value) || 0) * proteinPerKg);
    const fatTarget = fatGramsByGoal[selectedGoal] || 0;
    const carbsTarget = calorieTarget ? Math.max(0, Math.round((calorieTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4)) : 0;
    const caloriePercent = calorieTarget ? Math.min(100, Math.round((foodCalories / calorieTarget) * 100)) : 0;
  setPremiumText('#premiumWeekVolume', `${allVolume.toLocaleString('da-DK')} kg`);
  setPremiumText('#premiumWeekVolumeChange', workoutLog.length ? `${workoutLog.length} loggede sæt` : 'Log din første træning');
  const volumeBars = document.querySelector('#premiumVolumeBars');
  if (volumeBars) {
    const sessions = [...new Set(workoutLog.map((entry) => String(entry.session || entry.date || entry.timestamp)))].slice(-7);
    const volumes = sessions.map((session) => workoutLog.filter((entry) => String(entry.session || entry.date || entry.timestamp) === session).reduce((total, entry) => total + getExerciseVolume(entry), 0));
    const highestVolume = Math.max(...volumes, 1);
    volumeBars.innerHTML = volumes.length ? volumes.map((value) => `<i style="height:${Math.max(18, Math.round(value / highestVolume * 100))}%"></i>`).join('') : '<span>Ingen træningsdata endnu</span>';
  }
  setPremiumText('#premiumCaloriesValue', foodCalories.toLocaleString('da-DK'));
  setPremiumText('#premiumCaloriesSummary', calorieTarget ? `${Math.max(0, calorieTarget - foodCalories).toLocaleString('da-DK')} kcal tilbage` : 'Beregn dit kcal-mål');
  setPremiumText('#premiumCaloriesTarget', calorieTarget ? `Mål: ${calorieTarget.toLocaleString('da-DK')} kcal` : 'Mål: -');
  setPremiumText('#premiumCaloriesRing', `${caloriePercent}%`);
  document.querySelector('#premiumCaloriesRing')?.style.setProperty('--premium-calories', `${caloriePercent}%`);
  const setMacro = (valueSelector, barSelector, value, target) => {
    setPremiumText(valueSelector, `${Math.round(value)} / ${target} g`);
    document.querySelector(barSelector)?.style.setProperty('width', `${target ? Math.min(100, Math.round(value / target * 100)) : 0}%`);
  };
    setMacro('#premiumProteinValue', '#premiumProteinBar', foodProtein, proteinTarget);
    setMacro('#premiumCarbsValue', '#premiumCarbsBar', foodCarbs, carbsTarget);
    setMacro('#premiumFatValue', '#premiumFatBar', foodFat, fatTarget);
  } catch {
    // Kostmodulet udfylder kortene ved næste normale render efter opstart.
  }

  document.querySelector('#proHomeStrengthValue').textContent = `${strengthPercent}%`;
  const strengthDeltaEl = document.querySelector('#proHomeStrengthDelta');
  strengthDeltaEl.textContent = weeklyVolumes.length > 1 ? `${strengthChange >= 0 ? '+' : ''}${strengthChange}% fra sidste uge` : 'Log Bench press for trend';
  strengthDeltaEl.classList.toggle('is-positive', weeklyVolumes.length > 1 && strengthChange >= 0);
  document.querySelector('#proHomeRecoveryValue').textContent = `${recoveryPercent}%`;
  document.querySelector('#proHomeRecoveryDelta').textContent = lastWorkoutTimestamp ? `${daysSinceLastWorkout} dag(e) siden sidste pas` : 'Klar til at træne';
  document.querySelector('#proHomeProgressValue').textContent = `${progressKg >= 0 ? '+' : ''}${progressKg} kg`;
  document.querySelector('#proHomeProgressDelta').textContent = 'Total løftet vægt';

  const physiqueAnalysisRaw = localStorage.getItem('formlyPhysiqueMuscleAnalysis');
  if (physiqueAnalysisRaw) {
    try {
      const parsed = JSON.parse(physiqueAnalysisRaw);
      const topPriority = parsed?.priorities?.[0];
      if (topPriority) {
        document.querySelector('#proHomeInsightTitle').textContent = `${topPriority.muscle} er dit største udviklingsområde lige nu.`;
        document.querySelector('#proHomeInsightText').textContent = topPriority.reason || 'Prioritér denne muskelgruppe i din næste uge.';
      }
    } catch {
      // Ignorer korrupt gemt analyse.
    }
  }

  const photoRow = document.querySelector('#proHomePhotoRow');
  const photoNav = document.querySelector('#proHomePhotoNav');
  const photoEntries = weightHistory.filter((entry) => entry.photo).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const headerPhysiquePhoto = document.querySelector('#proHomePhysiquePhotoImage');
  const headerPhysiquePlaceholder = document.querySelector('#proHomePhysiquePhotoPlaceholder');
  const newestPhysiquePhoto = photoEntries.at(-1);
  if (headerPhysiquePhoto && headerPhysiquePlaceholder) {
    headerPhysiquePhoto.src = newestPhysiquePhoto?.photo || '';
    headerPhysiquePhoto.hidden = !newestPhysiquePhoto?.photo;
    headerPhysiquePlaceholder.hidden = Boolean(newestPhysiquePhoto?.photo);
  }
  if (photoEntries.length) {
    selectedHomePhotoIndex = selectedHomePhotoIndex < 0 ? photoEntries.length - 1 : Math.min(selectedHomePhotoIndex, photoEntries.length - 1);
    const selectedPhoto = photoEntries[selectedHomePhotoIndex];
    const last = photoEntries[photoEntries.length - 1];
    const formatAgo = (entry) => `${formatElapsedSinceDate(entry)} · ${entry.date || ''}`;
    const nextPhotoText = `Nyt fysikfoto kan gemmes nu. Sidste billede: ${last.date || 'Uden dato'} (${formatElapsedSinceDate(last)}).`;
    photoRow.innerHTML = `<div class="pro-home-photo-card"><img src="${selectedPhoto.photo}" alt="Fysikfoto"><span>${formatAgo(selectedPhoto)} · ${formatWeight(selectedPhoto.weight)} kg</span></div><small class="pro-home-photo-schedule">${nextPhotoText}</small>`;
    if (photoNav) photoNav.innerHTML = `<button type="button" aria-label="Forrige billede" onclick="window.changeHomePhotoPage(-1)">←</button><span>${(selectedHomePhotoIndex + 1).toLocaleString('da-DK')}/${MAX_PHYSIQUE_HISTORY_PAGES.toLocaleString('da-DK')}</span><button type="button" aria-label="Næste billede" onclick="window.changeHomePhotoPage(1)">→</button>`;
    photoRow.scrollLeft = photoRow.scrollWidth;
  } else {
    photoRow.innerHTML = '<p class="pro-home-photo-empty">Tilføj et fysikfoto ved vejning for at se din udvikling her. Første foto kan gemmes nu.</p>';
    if (photoNav) photoNav.innerHTML = `<button type="button" aria-label="Forrige billede" disabled>←</button><span>0/${MAX_PHYSIQUE_HISTORY_PAGES.toLocaleString('da-DK')}</span><button type="button" aria-label="Næste billede" disabled>→</button>`;
  }

  const quickGrid = document.querySelector('#proHomeQuickGrid');
  if (quickGrid && !quickGrid.childElementCount && overviewCategoryGrid) {
    [...overviewCategoryGrid.querySelectorAll('button')].forEach((sourceButton) => {
      const icon = sourceButton.querySelector('.quick-icon')?.textContent || '⭐';
      const label = sourceButton.querySelector('strong')?.textContent || '';
      const clone = document.createElement('button');
      clone.type = 'button';
      clone.dataset.categoryTarget = sourceButton.dataset.categoryTarget;
      clone.innerHTML = `<span class="quick-icon" aria-hidden="true">${icon}</span>${label}`;
      quickGrid.append(clone);
    });
  }

  proHome.querySelectorAll('[data-category-target]').forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = '1';
    button.addEventListener('click', () => goToProHomeTarget(button.dataset.categoryTarget));
  });

  const bottomNav = document.querySelector('#proHomeBottomNav');
  if (bottomNav) {
    bottomNav.querySelectorAll('[data-category-target]').forEach((button) => {
      if (button.dataset.wired) return;
      button.dataset.wired = '1';
      button.addEventListener('click', () => {
        bottomNav.querySelectorAll('button').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        goToProHomeTarget(button.dataset.categoryTarget);
      });
    });
  }
}

window.changeProgressPhotoPage = (direction) => {
  selectedProgressPhotoIndex = Math.min(MAX_PHYSIQUE_HISTORY_PAGES - 1, Math.max(0, selectedProgressPhotoIndex + Number(direction || 0)));
  const photoGrid = document.querySelector('#proProgressPhotos');
  if (photoGrid) photoGrid.dataset.pageIndex = String(selectedProgressPhotoIndex);
  renderProProgress();
};
// Grøn Progression-side (viser rigtige data), matcher AIO_Fitness_Progression_AKTIV.html.
function renderProProgress() {
  const panel = document.querySelector('#proProgress');
  if (!panel) return;
  const hasOnlineAccess = hasFullAppAccess();
  const physiquePageActive = document.querySelector('.content')?.dataset.activeAppPage === 'physique';
  panel.hidden = !hasOnlineAccess || physiquePageActive;
  if (!hasOnlineAccess) return;

  panel.querySelectorAll('[data-category-target]').forEach((button) => {
    if (button.dataset.wired) return;
    button.dataset.wired = '1';
    button.addEventListener('click', () => goToProHomeTarget(button.dataset.categoryTarget));
  });
  panel.querySelectorAll('.pro-progress-tabs button').forEach((tab) => {
    if (tab.dataset.wired) return;
    tab.dataset.wired = '1';
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.pro-progress-tabs button').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      renderProProgress();
    });
  });

  const exerciseGroups = new Map();
  workoutLog.forEach((entry) => {
    const name = String(entry.exercise || '').trim();
    if (!name) return;
    const key = normalizeExerciseNameForComparison(name);
    const group = exerciseGroups.get(key) || { name, entries: [] };
    group.entries.push(entry);
    exerciseGroups.set(key, group);
  });
  const rankedExercises = [...exerciseGroups.values()]
    .map((group) => ({ ...group, entries: group.entries.slice().sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b)) }))
    .filter((group) => group.entries.length)
    .sort((a, b) => b.entries.length - a.entries.length)

  const strengthRows = document.querySelector('#proProgressStrengthRows');
  if (strengthRows) {
    strengthRows.innerHTML = rankedExercises.length ? rankedExercises.map((group) => {
      const first = Number(group.entries[0].weight) || 0;
      const last = Number(group.entries[group.entries.length - 1].weight) || 0;
      const gain = Math.round((last - first) * 10) / 10;
      const percent = first ? Math.max(4, Math.min(100, Math.round((last / (first * 1.3)) * 100))) : 0;
      const firstDate = group.entries[0].date || new Date(getProgressTimestamp(group.entries[0])).toLocaleDateString('da-DK');
      const lastDate = group.entries[group.entries.length - 1].date || new Date(getProgressTimestamp(group.entries[group.entries.length - 1])).toLocaleDateString('da-DK');
      return `<div class="pro-progress-strength-row"><div class="pro-progress-strength-top"><span>${group.name}<small>START · ${first} kg · ${firstDate}</small><small>NU · ${last} kg · ${lastDate}</small></span><span class="pro-progress-gain"><strong>${last} kg</strong><b>${gain >= 0 ? '+' : ''}${gain} kg <small>INCREASE SIDEN START</small></b></span></div><div class="pro-progress-track"><i style="width:${percent}%"></i></div></div>`;
    }).join('') : '<p class="pro-home-photo-empty">Log øvelser i biblioteket for at se din styrkeudvikling her.</p>';
  }

  const prGrid = document.querySelector('#proProgressPrs');
  if (prGrid) {
    prGrid.innerHTML = rankedExercises.length ? rankedExercises.map((group) => {
      const bestOrm = group.entries.reduce((best, entry) => Math.max(best, estimateOneRepMax(entry.weight, entry.reps)), 0);
      const first = Number(group.entries[0].weight) || 0;
      const gain = Math.round((bestOrm - first) * 10) / 10;
      return `<article class="pro-progress-pr"><small>${group.name.toUpperCase()}</small><strong>${bestOrm.toFixed(1).replace('.', ',')} kg</strong><b>${gain >= 0 ? '+' : ''}${gain} kg</b></article>`;
    }).join('') : '';
  }

  const gains = rankedExercises.map((group) => {
    const firstOneRepMax = estimateOneRepMax(group.entries[0].weight, group.entries[0].reps);
    const currentOneRepMax = estimateOneRepMax(group.entries[group.entries.length - 1].weight, group.entries[group.entries.length - 1].reps);
    return firstOneRepMax ? ((currentOneRepMax - firstOneRepMax) / firstOneRepMax) * 100 : 0;
  });
  const avgGainPercent = gains.length ? gains.reduce((sum, value) => sum + value, 0) / gains.length : 0;
  const score = Math.max(0, Math.min(100, Math.round(50 + avgGainPercent)));
  const scoreEl = document.querySelector('#proProgressScore');
  if (scoreEl) scoreEl.textContent = String(score);
  const scoreRing = document.querySelector('#proProgressScoreRing');
  if (scoreRing) scoreRing.style.setProperty('--score-percent', `${score}%`);
  const scoreNote = document.querySelector('#proProgressScoreNote');
  if (scoreNote) scoreNote.textContent = score >= 80 ? 'Virkelig godt gået!' : score >= 50 ? 'Godt på vej.' : 'Log flere træninger for at se din score.';

  const weightEntries = weightHistory.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const chartSvg = document.querySelector('#proProgressChartSvg');
  const axisEl = document.querySelector('#proProgressAxis');
  const weightValueEl = document.querySelector('#proProgressWeight');
  const weightDeltaEl = document.querySelector('#proProgressWeightDelta');
  if (weightEntries.length) {
    const recentEntries = weightEntries.slice(-6);
    const values = recentEntries.map((entry) => Number(entry.weight) || 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const stepX = recentEntries.length > 1 ? 600 / (recentEntries.length - 1) : 600;
    const points = values.map((value, index) => ({ x: index * stepX, y: 165 - ((value - min) / range) * 150 - 8 }));
    if (chartSvg) {
      const polylinePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      const circles = points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5" fill="#a33fff"></circle>`).join('');
      chartSvg.innerHTML = `<polyline points="${polylinePoints}" fill="none" stroke="#a33fff" stroke-width="3"></polyline>${circles}`;
    }
    if (axisEl) axisEl.innerHTML = recentEntries.map((entry) => `<span>${entry.date || ''}</span>`).join('');
    const latest = values[values.length - 1];
    const previous = values.length > 1 ? values[0] : latest;
    if (weightValueEl) weightValueEl.textContent = `${formatWeight(latest)} kg`;
    if (weightDeltaEl) {
      const delta = Math.round((latest - previous) * 10) / 10;
      weightDeltaEl.textContent = `${delta >= 0 ? '+' : ''}${formatWeight(delta)} kg siden start`;
    }
  } else {
    if (chartSvg) chartSvg.innerHTML = '<g stroke="#1d1825" stroke-width="1"><line x1="0" y1="25" x2="600" y2="25"></line><line x1="0" y1="70" x2="600" y2="70"></line><line x1="0" y1="115" x2="600" y2="115"></line></g><polyline points="0,82 600,82" fill="none" stroke="#a33fff" stroke-width="3"></polyline><circle cx="0" cy="82" r="5" fill="#a33fff"></circle><circle cx="600" cy="82" r="5" fill="#a33fff"></circle>';
    if (axisEl) axisEl.innerHTML = '<span>Startpunkt</span><span>Indtast vejning for trend</span>';
    if (weightValueEl) weightValueEl.textContent = '– kg';
    if (weightDeltaEl) weightDeltaEl.textContent = 'Registrér din vægt for at se udviklingen';
  }

  const photoGrid = document.querySelector('#proProgressPhotos');
  const photoNav = document.querySelector('#proProgressPhotoNav');
  if (photoGrid) {
    const progressEntries = weightHistory.filter((entry) => entry.photo).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const storedProgressPhotoIndex = Number(photoGrid.dataset.pageIndex);
    selectedProgressPhotoIndex = Number.isFinite(storedProgressPhotoIndex) && storedProgressPhotoIndex >= 0
      ? Math.min(storedProgressPhotoIndex, MAX_PHYSIQUE_HISTORY_PAGES - 1)
      : Math.max(0, progressEntries.length - 1);
      photoGrid.dataset.pageIndex = String(selectedProgressPhotoIndex);
    {
      const entry = progressEntries[selectedProgressPhotoIndex];
      const previousEntry = progressEntries[selectedProgressPhotoIndex - 1];
      const daysSincePrevious = previousEntry ? Math.max(0, Math.floor((getProgressTimestamp(entry) - getProgressTimestamp(previousEntry)) / 86400000)) : 0;
      const intervalLabel = previousEntry ? (daysSincePrevious ? `${daysSincePrevious} dag${daysSincePrevious === 1 ? '' : 'e'} siden sidste billede` : 'Samme dato som sidste billede') : 'Første billede';
      const previousButton = `<button type="button" class="pro-progress-photo-nav" data-progress-photo-direction="previous" onclick="window.changeProgressPhotoPage(-1)" aria-label="Forrige billede">←</button>`;
      const nextButton = `<button type="button" class="pro-progress-photo-nav" data-progress-photo-direction="next" onclick="window.changeProgressPhotoPage(1)" aria-label="Næste billede">→</button>`;
      const content = !entry
        ? '<p class="pro-home-photo-empty">Denne side er ikke gemt endnu. Gem vægt og billede under Kropsvægt.</p>'
        : entry.photo
        ? `<div class="pro-progress-photo"><img src="${entry.photo}" alt="Fysikfoto"><span>${formatElapsedSinceDate(entry)} · ${entry.date || ''} · ${formatWeight(entry.weight)} kg · ${intervalLabel}</span></div>`
        : `<div class="pro-progress-photo pro-progress-photo-weight"><strong>${formatWeight(entry.weight)} kg</strong><span>${formatElapsedSinceDate(entry)} · ${entry.date || 'Uden dato'} · ${intervalLabel}</span></div>`;
      if (photoNav) photoNav.innerHTML = `${previousButton}<span class="pro-progress-photo-index">${(selectedProgressPhotoIndex + 1).toLocaleString('da-DK')}/${MAX_PHYSIQUE_HISTORY_PAGES.toLocaleString('da-DK')}</span>${nextButton}`;
      photoGrid.innerHTML = content;
    }
  }
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
window.setInterval(() => renderProHome(), 60 * 60 * 1000);
window.setInterval(() => renderProProgress(), 60 * 60 * 1000);

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
    low: { rate: -0.1, label: 'Lav', pros: 'Roligt fedttab med god energi og lav risiko for tab af muskelmasse.', cons: 'Fremgangen er langsommere og kræver tålmodighed.' },
    moderate: { rate: -0.15, label: 'Moderat', pros: 'Et balanceret fedttab med god mulighed for at bevare styrke og muskelmasse.', cons: 'Sult og lidt lavere træningsenergi kan forekomme.' },
    moderateHigh: { rate: -0.2, label: 'Moderat til høj', pros: 'Et tydeligt kalorieunderskud og hurtigere vægttab.', cons: 'Kræver fokus på protein, søvn og styrketræning for at bevare muskelmasse.' },
    high: { rate: -0.25, label: 'Høj', pros: 'Hurtigt vægttab i en kortere periode.', cons: 'Større risiko for sult, lav energi og tab af muskelmasse; bør ikke bruges længe.' }
  },
  maintain: {
    moderate: { rate: 0, label: 'Vedligehold', pros: 'Stabil vægt, god energi og et stærkt udgangspunkt for træning.', cons: 'Kropssammensætningen ændrer sig typisk langsommere.' }
  },
  bulk: {
    low: { rate: 0.02, label: 'Slow bulk', pros: 'Langsom, kontrolleret vægtstigning med minimal unødig fedtøgning.', cons: 'Muskel- og vægtstigningen går langsomt.' },
    moderate: { rate: 0.04, label: 'Moderat', pros: 'Et moderat overskud med god balance mellem muskelopbygning og fedtøgning.', cons: 'Kræver løbende vægtkontrol for at ramme det ønskede tempo.' },
    moderateHigh: { rate: 0.08, label: 'Moderat til høj', pros: 'Mere energi til træning og et tydeligt, men stadig kontrolleret kalorieoverskud.', cons: 'Risikoen for fedtøgning er højere end ved et forsigtigt bulk.' },
    high: { rate: 0.115, label: 'Aggressiv', pros: 'Hurtigere vægtstigning og rigeligt med energi til hård træning.', cons: 'En større del af vægtstigningen kan være fedt frem for muskelmasse.' }
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

function getGoalAdjustment(goalKey = selectedGoal, intensityKey = intensitySelect.value) {
  const safeGoal = goalData[goalKey] ? goalKey : 'cut';
  const safeIntensity = goalData[safeGoal][intensityKey] ? intensityKey : 'moderate';
  const rate = goalData[safeGoal][safeIntensity]?.rate ?? goalData[safeGoal].moderate.rate ?? 0;
  if (safeGoal === 'maintain') return 0;
  const maintenance = Math.max(0, Number(maintenanceInput.value) || 0);
  return Math.round((maintenance * rate) / 10) * 10;
}

function updateIntensityLabels() {
  const safeGoal = getSafeGoal(selectedGoal);
  const selectedIntensity = getValidIntensityForGoal(safeGoal, intensitySelect.value || 'moderate');
  intensitySelect.replaceChildren();
  const intensityLabelsByValue = { low: 'Lav alene', moderate: 'Moderat alene', moderateHigh: 'Moderat-højt (blandet)', high: 'Højt alene', failure: 'Failure' };
  Object.entries(goalData[safeGoal]).forEach(([value, data]) => {
    const option = document.createElement('option');
    const adjustedAmount = getGoalAdjustment(safeGoal, value);
    const sign = adjustedAmount > 0 ? '+' : '';
    const percentage = Math.round(Math.abs(data.rate) * 100);
    option.value = value;
    option.text = `${intensityLabelsByValue[value] || data.label} · (${sign}${adjustedAmount} kcal)`;
    intensitySelect.append(option);
  });
  intensitySelect.value = selectedIntensity;
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
  const bulkActive = selectedGoal === 'bulk';
  bulkGoalPanel.hidden = !bulkActive;
  bulkStrategyOptions.hidden = !bulkActive;
  bulkGoalPanel.querySelectorAll('[data-bulk-intensity]').forEach((button) => button.classList.toggle('active', bulkActive && button.dataset.bulkIntensity === intensitySelect.value));
  bulkStrategyOptions.querySelectorAll('[data-strategy-option]').forEach((option) => {
    const intensity = option.dataset.strategyOption;
    const optionData = goalData.bulk[intensity];
    const delta = getGoalAdjustment('bulk', intensity);
    option.classList.toggle('selected', bulkActive && intensity === intensitySelect.value);
    option.querySelector('[data-option-delta]').textContent = `+${delta} kcal`;
    option.onclick = () => {
      syncGoalState('bulk');
      intensitySelect.value = intensity;
      localStorage.setItem('formlyIntensity', intensity);
      updateIntensityLabels();
      updateGoal();
    };
  });
  const weeklyChange = Number(profileWeight.value) > 0 ? Math.abs(change * 7 / 7700) : 0;
  goalTempo.textContent = `Forventet tempo: ${change > 0 ? '+' : ''}${weeklyChange.toFixed(2).replace('.', ',')} kg / uge`;
  const targetWeight = Number(document.querySelector('#profileWeightGoal')?.value) || 0;
  const currentWeight = Number(profileWeight.value) || 0;
  goalTarget.textContent = targetWeight ? `Mål: ${targetWeight.toFixed(1).replace('.', ',')} kg · ${Math.abs(targetWeight - currentWeight).toFixed(1).replace('.', ',')} kg fra nu` : 'Mål: tilføj din målvægt for at se afstanden';
  goalStrategy.textContent = bulkActive ? `${getIntensityData().label} bulk: ${getIntensityData().pros}` : `${getIntensityData().label}: ${getIntensityData().pros}`;
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
  const kcalPercent = goals.kcal ? Math.max(0, Math.min(100, Math.round((calories / goals.kcal) * 100))) : 0;
  foodTotal.textContent = calories.toLocaleString('da-DK');
  const proHomeFoodCalories = document.querySelector('#proHomeFoodCalories');
  const proHomeFoodTarget = document.querySelector('#proHomeFoodTarget');
  const proHomeFoodRemaining = document.querySelector('#proHomeFoodRemaining');
  if (proHomeFoodCalories) proHomeFoodCalories.textContent = calories.toLocaleString('da-DK');
  if (proHomeFoodTarget) proHomeFoodTarget.textContent = goals.kcal.toLocaleString('da-DK');
  if (proHomeFoodRemaining) proHomeFoodRemaining.textContent = goals.kcal ? `${Math.max(0, goals.kcal - calories).toLocaleString('da-DK')} kcal tilbage` : 'Beregn dit mål i Kcal-beregneren';
  const foodTotalBigEl = document.querySelector('#foodTotalBig');
  if (foodTotalBigEl) foodTotalBigEl.textContent = calories.toLocaleString('da-DK');
  foodTarget.textContent = `${goals.kcal.toLocaleString('da-DK')} kcal`;
  const foodKcalRing = document.querySelector('#foodKcalRing');
  if (foodKcalRing) foodKcalRing.style.setProperty('--kcal-percent', `${kcalPercent}%`);
  const foodKcalBar = document.querySelector('#foodKcalBar');
  if (foodKcalBar) foodKcalBar.style.width = `${kcalPercent}%`;
  if (kcalRemainingLabel) kcalRemainingLabel.textContent = `KCAL TILBAGE (${goalLabels[selectedGoal]})`;
  if (kcalRemainingValue) kcalRemainingValue.textContent = `${Math.max(0, goals.kcal - calories).toLocaleString('da-DK')} kcal tilbage`;
  updateMacroCard('protein', protein, goals.protein);
  updateMacroCard('carbs', carbs, goals.carbs);
  updateMacroCard('fat', fat, goals.fat);
  const mealIcons = { 'Morgenmad': '☀', 'Frokost': '☀', 'Aftensmad': '◐', 'Snack': '♟' };
  const mealOrder = ['Morgenmad', 'Frokost', 'Aftensmad', 'Snack'];
  const indexedEntries = foodEntries.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.date === viewedDateKey);
  foodList.innerHTML = dayEntries.length ? mealOrder.map((meal) => {
    const mealEntries = indexedEntries.filter((entry) => entry.meal === meal);
    if (!mealEntries.length) return '';
    const mealKcal = mealEntries.reduce((total, entry) => total + entry.kcal, 0);
    const mealDescription = mealEntries.map((entry) => entry.name).join(', ');
    return `<div class="food-meal-group collapsed"><div class="food-meal-heading"><span class="food-meal-icon">${mealIcons[meal] || '●'}</span><div class="food-meal-main"><strong>${meal}</strong><p class="food-meal-desc">${mealDescription}</p></div><span class="food-meal-kcal">${mealKcal.toLocaleString('da-DK')} kcal</span></div><div class="food-meal-items">${mealEntries.map((entry) => `<div class="food-entry"><strong>${entry.name}</strong><span>${entry.grams} g · ${entry.kcal} kcal</span><b>${entry.protein || 0}P · ${entry.carbs || 0}K · ${entry.fat || 0}F</b><button class="food-remove" data-index="${entry.index}" type="button">x</button></div>`).join('')}</div></div>`;
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
    if (!hasFullAppAccess()) {
      healthProviders.querySelector('#providerStatus').textContent = 'KRÆVER PRO · Automatiske sundhedsdata er låst. Manuel vægt og egne billeder er stadig gratis.';
      openProAccess();
      showToast('KRÆVER PRO · sundhedsdata');
      return;
    }
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
      fetch(`/api/provider/start?provider=${providerKey}`)
        .then((response) => response.json())
        .then((data) => {
          if (data?.billing && !data.billing.is_pro) applyBillingStatus(data.billing);
          if (data && data.ok && data.url) {
            localStorage.setItem(`formly${providerKey}AuthUrl`, data.url);
            healthProviders.querySelector('#providerStatus').textContent = `${provider} er valgt. OAuth-flow åbner nu via din backend.`;
            showToast(`${provider}-forbindelse startet`);
            window.location.assign(data.url);
            return;
          }

          healthProviders.querySelector('#providerStatus').textContent = data?.message || `${provider} kunne ikke forbindes.`;
          showToast(data?.code === 'pro_required' ? 'KRÆVER PRO · sundhedsdata' : `${provider}-credentials mangler`);
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
maintenanceInput.addEventListener('input', () => {
  updateIntensityLabels();
  updateGoal();
});
goalTabs.forEach((tab) => tab.addEventListener('click', () => {
  syncGoalState(tab.dataset.goal);
}));
bulkGoalPanel.querySelectorAll('[data-bulk-intensity]').forEach((button) => button.addEventListener('click', () => {
  syncGoalState('bulk');
  intensitySelect.value = getValidIntensityForGoal('bulk', button.dataset.bulkIntensity);
  localStorage.setItem('formlyIntensity', intensitySelect.value);
  updateIntensityLabels();
  updateGoal();
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

[profileWeight, profileHeight, profileAge, profileSex, stepsInput, exactStepsInput, trainingWeekSelect, profileWeightGoal].forEach((input) => {
  if (!input) return;
  input.addEventListener('input', updateMaintenance);
  input.addEventListener('change', updateMaintenance);
});
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

// Samler den separate gratis statsvisning fra alle registrerede øvelser.
function renderWorkoutStats() {
  const activeView = [...progressViews].find((btn) => btn.classList.contains('active'))?.dataset.view || 'week';
  const entries = workoutLog.filter((entry) => String(entry.exercise || '').trim() && Number(entry.weight) > 0 && Number(entry.reps) > 0);
  const groups = {};

  entries.forEach((entry) => {
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

  if (!entries.length) {
    volumeStat.textContent = '0 kg';
    bestOrmStat.textContent = '0,0 kg';
    repsStat.textContent = '0';
    progressStat.textContent = '+0%';
    weekHistory.innerHTML = '<p>Ingen træningsdata endnu</p>';
    return;
  }

  const maxVolume = Math.max(1, ...keys.map((key) => groups[key].reduce((total, entry) => total + getExerciseVolume(entry), 0)));
  weekHistory.innerHTML = keys.length ? keys.map((key) => {
    const entries = groups[key];
    const groupVolume = entries.reduce((total, entry) => total + getExerciseVolume(entry), 0);
    const width = Math.max(4, Math.round((groupVolume / maxVolume) * 100));
    const label = activeView === 'week' ? `Uge ${key}` : key;
    return `<div class="week-row"><strong>${label}</strong><div class="week-bar"><i style="width:${width}%"></i></div><span>${groupVolume.toLocaleString('da-DK')} kg</span></div>`;
  }).join('') : '<p>Ingen træningsdata endnu</p>';
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
      if (typeof renderProProgress === 'function') renderProProgress();
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
  overview: ['#proHome'],
  training: ['#workout', '.training-overview-categories'],
  food: ['#food'],
  coach: ['.coach-panel'],
  profile: ['.profile-section'],
  weight: ['#weight'],
  progress: ['#proProgress', '#progress', '.training-progress-panel'],
  physique: ['#physique-ai'],
  library: ['#library'],
  pro: ['#proAccessDialog']
};
const appContent = document.querySelector('.content');
document.querySelector('.sidebar-bottom')?.remove();
const appPageElements = new Map();

if (appContent) {
  document.body.classList.add('app-single-page');
  [...appContent.children].forEach((element) => {
    if (element.id === 'mealOverviewModal' || element.classList.contains('topbar')) return;
    element.dataset.appPage = 'inactive';
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

  const resolveLandingPage = () => (hasFullAppAccess() ? 'overview' : 'pro');

  const showAppPage = (pageName, updateHash = true) => {
    const normalizedPage = pageName === 'overview' || (APP_OPEN_ACCESS && pageName === 'pro') ? resolveLandingPage() : pageName;
    const selectedPage = appPageTargets[normalizedPage] ? normalizedPage : resolveLandingPage();
    const visiblePage = selectedPage === 'pro' ? 'pro' : selectedPage;
    const renderedPage = selectedPage === 'overview' || selectedPage === 'pro' ? selectedPage : visiblePage;
    if (selectedPage === 'pro' && updateHash) proStartWasAutomatic = false;
    appContent.dataset.activeAppPage = visiblePage;
    appContent.classList.add('app-pages-mode');
    document.body.classList.toggle('app-overview-active', renderedPage === 'overview' && !hasFullAppAccess());
    document.body.classList.toggle('app-paid-overview-active', selectedPage === 'overview' && hasFullAppAccess());
    document.body.classList.toggle('app-pro-active', selectedPage === 'pro');
    document.body.classList.toggle('app-physique-active', selectedPage === 'physique');
    const proHomePanel = document.querySelector('#proHome');
    if (proHomePanel) {
      if (selectedPage === 'overview') proHomePanel.style.removeProperty('display');
      else proHomePanel.style.setProperty('display', 'none', 'important');
    }
    if (physiqueProgressPanel) {
      if (selectedPage === 'progress') physiqueProgressPanel.style.removeProperty('display');
      else physiqueProgressPanel.style.setProperty('display', 'none', 'important');
    }
    backToOverviewButton.hidden = selectedPage === 'overview' || selectedPage === 'pro';
    appContent.querySelectorAll(':scope > [data-app-page]').forEach((element) => {
      const isLandingSection = selectedPage === 'overview' && element.dataset.appPage === 'overview';
      const isVisiblePage = element.dataset.appPage === visiblePage;
      element.hidden = !isVisiblePage && !isLandingSection;
      if (isVisiblePage && element.parentElement === appContent) element.scrollTop = 0;
    });
    document.querySelectorAll('.nav-link[data-app-page-target]').forEach((link) => {
      const target = link.dataset.appPageTarget === 'overview' ? resolveLandingPage() : link.dataset.appPageTarget;
      link.classList.toggle('active', target === visiblePage);
    });
    if (updateHash) history.replaceState({}, '', selectedPage === 'overview' ? '#top' : selectedPage === 'pro' ? '#pro' : `#${selectedPage}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  backToOverviewButton.addEventListener('click', () => showAppPage(hasFullAppAccess() ? 'overview' : 'pro'));

  document.querySelectorAll('.nav-link[data-app-page-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showAppPage(link.dataset.appPageTarget);
    });
  });

  const initialPage = window.location.hash.slice(1);
  const homePage = resolveLandingPage();
  showAppPage(appPageTargets[initialPage] ? initialPage : homePage, false);
  window.showAppPage = showAppPage;
  if (pendingAccountLandingPage) {
    const landingPage = pendingAccountLandingPage;
    pendingAccountLandingPage = '';
    showAppPage(landingPage);
  }

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
    if (target.includes('pro')) return 'pro';
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

  document.querySelectorAll('[data-category-target="#weight"], [data-quick-target="#weight"]').forEach((button) => {
    button.addEventListener('click', () => window.setTimeout(() => window.showAppPage?.('weight'), 0));
  });

  document.addEventListener('click', (event) => {
    const shortcut = event.target.closest('[data-category-target="#weight"], [data-quick-target="#weight"]');
    if (!shortcut) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.showAppPage('weight');
  }, true);
}

document.querySelectorAll('[data-category-target="#library"]').forEach((button) => {
  button.addEventListener('click', () => window.showAppPage?.('library'));
});

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
