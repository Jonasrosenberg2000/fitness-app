const toast = document.querySelector('#toast');

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
const exerciseOptions = ['Barbell squat', 'Front squat', 'Deadlift', 'Romanian deadlift', 'Bench press', 'Incline bench press', 'Overhead press', 'Barbell row', 'Pull-up', 'Chin-up', 'Dips', 'Goblet squat', 'Dumbbell press', 'Dumbbell row', 'Dumbbell curl', 'Hammer curl', 'Kettlebell swing', 'Leg press machine', 'Hack squat machine', 'Chest press machine', 'Pec deck machine', 'Shoulder press machine', 'Lat pulldown machine', 'Seated row machine', 'Cable crossover', 'Cable curl', 'Triceps pushdown', 'Leg extension machine', 'Lunge', 'Bulgarian split squat'];
const workoutFlow = document.createElement('div');
workoutFlow.className = 'workout-flow';
workoutFlow.innerHTML = '<div class="workout-flow-heading"><p class="eyebrow">WORKOUT FLOW</p><span>SESSION GUIDE</span></div><div class="workout-flow-steps"><button type="button" data-flow-target="#log"><b>01</b><strong>Vælg øvelse</strong><small>Find dagens bevægelse</small></button><button type="button" data-flow-target="#log"><b>02</b><strong>Log dit sæt</strong><small>Vægt · reps · sæt</small></button><button type="button" data-flow-target="#log"><b>03</b><strong>Hold pause</strong><small>Start rest-timeren</small></button><button type="button" data-flow-target="#library"><b>04</b><strong>Markér færdig</strong><small>Følg din progression</small></button></div>';
document.querySelector('#workout').after(workoutFlow);
workoutFlow.querySelectorAll('[data-flow-target]').forEach((step) => step.addEventListener('click', () => document.querySelector(step.dataset.flowTarget).scrollIntoView({ behavior: 'smooth', block: 'start' })));
const progressButton = document.querySelector('#viewProgress');
const setForm = document.querySelector('#setForm');
const workoutDateInput = document.querySelector('#workoutDateInput');
const loggedSets = document.querySelector('#loggedSets');

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
  const value = rawValue || getIsoDateValue();
  const date = new Date(`${value}T12:00:00`);
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
let activeWorkoutSession = Number(localStorage.getItem('formlyActiveWorkoutSession') || 1);
let sessionStarted = false;
const bodyWeightInput = document.querySelector('#bodyWeightInput');
const durationInput = document.querySelector('#durationInput');
const kcalResult = document.querySelector('#kcalResult');
const ormWeightInput = document.querySelector('#ormWeightInput');
const ormRepsInput = document.querySelector('#ormRepsInput');
const ormResult = document.querySelector('#ormResult');
const ormExerciseInput = document.querySelector('#ormExerciseInput');
const ormExerciseLabel = document.querySelector('#ormExerciseLabel');
const exerciseInput = document.querySelector('#exerciseInput');
exerciseOptions.forEach((exercise) => {
  if (![...exerciseInput.options].some((option) => option.value === exercise)) exerciseInput.insertAdjacentHTML('beforeend', `<option value="${exercise}">${exercise}</option>`);
});
const searchPreviewImage = document.querySelector('#searchPreviewImage');
const searchPreviewName = document.querySelector('#searchPreviewName');
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

// Restores a per-device saved value (if any) and keeps it in sync with localStorage.
// New installs have no saved value, so they fall back to the input's default HTML value.
function restorePersistedInput(input, key, eventName = 'input') {
  if (!input) return;
  const saved = localStorage.getItem(key);
  if (saved !== null) input.value = saved;
  input.addEventListener(eventName, () => localStorage.setItem(key, input.value));
}
restorePersistedInput(bodyWeightInput, 'formlyBodyWeight');
restorePersistedInput(durationInput, 'formlyDuration');
restorePersistedInput(ormWeightInput, 'formlyOrmWeight');
restorePersistedInput(ormRepsInput, 'formlyOrmReps');
restorePersistedInput(ormExerciseInput, 'formlyOrmExercise');
restorePersistedInput(profileHeight, 'formlyProfileHeight');
restorePersistedInput(profileAge, 'formlyProfileAge');
restorePersistedInput(profileSex, 'formlyProfileSex', 'change');
restorePersistedInput(document.querySelector('#weightInput'), 'formlyLogWeight');
restorePersistedInput(document.querySelector('#repsInput'), 'formlyLogReps');
restorePersistedInput(document.querySelector('#setInput'), 'formlyLogSet');
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
  if (!Number(maintenanceInput.value) || Number(maintenanceInput.value) < 1000) {
    maintenanceInput.value = maintenanceEstimate;
  }
  const adjustment = getGoalAdjustment();
  const target = Number(maintenanceInput.value) + adjustment;
  profileSummary.textContent = `${target.toLocaleString('da-DK')} kcal · ${getIntensityData().pros}`;
  updateIntensityLabels();
  updateGoal();
}
const healthOverview = document.createElement('section');
healthOverview.className = 'health-overview';
healthOverview.innerHTML = '<div><p class="eyebrow">SUNDHED I DAG</p><h2>Dit overblik</h2><small id="healthOverviewStatus">Apple Watch / iPhone-data</small></div><div class="health-overview-grid"><div><strong id="overviewSteps">0</strong><span>steps</span></div><div><strong id="overviewEnergy">0</strong><span>aktive kcal</span></div><div><strong id="overviewDistance">0</strong><span>meter</span></div><div><strong id="overviewSleep">-</strong><span>søvn / recovery</span></div></div>';
document.querySelector('.welcome').after(healthOverview);
const savedHealth = JSON.parse(localStorage.getItem('formlyHealthOverview') || '{}');
const updateHealthOverview = (health = {}) => {
  const values = { steps: Number(health.steps) || 0, energy: Number(health.energy) || 0, distance: Number(health.distance) || 0, sleep: health.sleep || '-' };
  healthOverview.querySelector('#overviewSteps').textContent = values.steps.toLocaleString('da-DK');
  healthOverview.querySelector('#overviewEnergy').textContent = values.energy.toLocaleString('da-DK');
  healthOverview.querySelector('#overviewDistance').textContent = values.distance.toLocaleString('da-DK');
  healthOverview.querySelector('#overviewSleep').textContent = values.sleep;
  if (health.source) healthOverview.querySelector('#healthOverviewStatus').textContent = `Synkroniseret fra ${health.source}`;
};
updateHealthOverview(savedHealth);
if (savedHealth.steps) {
  stepsInput.value = Math.min(20000, Number(savedHealth.steps));
  exactStepsInput.value = Number(savedHealth.steps);
  healthSteps.innerHTML = `${Number(savedHealth.steps).toLocaleString('da-DK')} <small>steps</small>`;
  healthStatus.textContent = 'Indlæst fra Apple Watch / iPhone Sundhed';
} else {
  const savedSteps = localStorage.getItem('formlySteps');
  if (savedSteps) {
    stepsInput.value = Math.min(20000, Number(savedSteps));
    exactStepsInput.value = Number(savedSteps);
  }
}
const coachPanel = document.createElement('section');
coachPanel.className = 'coach-panel';
coachPanel.innerHTML = `<div class="coach-header"><div><p class="eyebrow">ALL IN ONE FITNESS COACH</p><h2>Din træningsassistent</h2><p>Spørg om din træning, mad eller dagens mål.</p></div><span class="coach-mark">AI</span></div><div id="coachAnswer" class="coach-answer">Hej${getUserName() ? ` ${getUserName()}` : ''}. Hvad vil du gerne vide?</div><form id="coachForm" class="coach-form"><input id="coachQuestion" placeholder="Fx hvor meget protein skal jeg spise?" autocomplete="off"><button type="submit">Spørg</button></form><div class="coach-suggestions"><button type="button" data-question="Hvor mange kcal mangler jeg?">Kcal tilbage</button><button type="button" data-question="Hvor meget protein skal jeg spise?">Protein</button><button type="button" data-question="Hvordan går mine steps?">Steps</button><button type="button" data-question="Hvad skal jeg træne i dag?">Træning</button></div>`;
document.querySelector('.welcome').after(coachPanel);
const coachAnswer = coachPanel.querySelector('#coachAnswer');
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
  if (text.includes('makro') || text.includes('fedt') || text.includes('kulhydrat')) return `Dit dashboard samler protein (${protein} g), kulhydrat (${carbs} g) og fedt (${fat} g). Brug makroerne til at justere måltiderne.`;
  return 'Jeg kan hjælpe med kcal, makroer, protein, steps og dagens træning. Prøv at spørge mere konkret.';
};
coachPanel.querySelector('#coachForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const question = coachPanel.querySelector('#coachQuestion').value.trim();
  if (!question) return;
  coachAnswer.textContent = answerCoach(question);
  coachPanel.querySelector('#coachQuestion').value = '';
});
coachPanel.querySelectorAll('.coach-suggestions button').forEach((button) => button.addEventListener('click', () => {
  coachAnswer.textContent = answerCoach(button.dataset.question);
}));

const trainingProgressPanel = document.createElement('section');
trainingProgressPanel.className = 'training-progress-panel';
trainingProgressPanel.innerHTML = '<div class="training-progress-header"><div><p class="eyebrow">DIN PERFORMANCE</p><h2>Progression i træningen</h2><p>Vægt over sessioner, uger, måneder og år.</p></div><span class="progress-live">LIVE LOG</span></div><div class="training-tabs"><button type="button" class="active" data-muscle="push">Push</button><button type="button" data-muscle="pull">Pull</button><button type="button" data-muscle="legs">Ben</button></div><div class="training-progress-content"><div><h3 id="progressExerciseName">Bench press</h3><p id="progressExerciseMeta">Seneste sæt og udvikling</p><div id="progressChart" class="progress-chart"></div></div><div class="progress-callout"><strong id="progressChange">+0 kg</strong><span>øgning siden sidste session</span><small id="progressNext">Log dit næste sæt for at fortsætte grafen.</small></div></div>';
coachPanel.after(trainingProgressPanel);
const progressRangeTabs = document.createElement('div');
progressRangeTabs.className = 'progress-range-tabs';
progressRangeTabs.innerHTML = '<button type="button" class="active" data-range="session">Sessioner</button><button type="button" data-range="week">Uger</button><button type="button" data-range="month">Måneder</button><button type="button" data-range="year">År</button>';
trainingProgressPanel.querySelector('.training-tabs').after(progressRangeTabs);
let progressRange = 'session';
let progressRangeOffset = 0;
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
let touchStartX = null;
window.addEventListener('touchstart', (event) => {
  if (event.touches && event.touches[0]) {
    touchStartX = event.touches[0].clientX;
  }
}, { passive: true });
window.addEventListener('touchend', (event) => {
  if (touchStartX === null) return;
  const endX = event.changedTouches[0].clientX;
  const delta = endX - touchStartX;
  if (Math.abs(delta) > 40) {
    shiftProgressRange(delta < 0 ? 'right' : 'left');
  }
  touchStartX = null;
}, { passive: true });
progressRangeTabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
  progressRangeTabs.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  progressRange = button.dataset.range;
  progressRangeOffset = 0;
  renderTrainingProgress(trainingProgressPanel.querySelector('.training-tabs button.active').dataset.muscle);
}));
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
progressExercisePicker.addEventListener('change', () => renderTrainingProgress());
function renderTrainingProgress(muscle = 'push') {
  const exercise = progressExercisePicker.value || progressExercises[muscle][0];
  const entries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === exercise.toLowerCase()).map((entry) => ({ ...entry, weight: Number(entry.weight) || 0, reps: Number(entry.reps) || 0 }));
  const sortedEntries = [...entries].sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
  const firstProgressTimestamp = sortedEntries.length ? getProgressTimestamp(sortedEntries[0]) : Date.now();
  const formatRangeDateLabel = (eventDate, range = progressRange) => {
    const base = eventDate instanceof Date ? eventDate : new Date(eventDate);
    if (!Number.isFinite(base.getTime())) return '';
    if (range === 'session') return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' });
    if (range === 'week') return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
    if (range === 'month') return base.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '');
    if (range === 'year') return String(base.getFullYear());
    return base.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
  };
  const getRangeGroupKey = (entry) => {
    const timestamp = getProgressTimestamp(entry);
    const date = new Date(timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const yearBucket = String(date.getFullYear());
    if (progressRange === 'session') return `${dateKey}-${timestamp}`;
    if (progressRange === 'week') {
      const elapsedDays = Math.floor((timestamp - firstProgressTimestamp) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.max(0, Math.floor(elapsedDays / 7));
      return `week-${weekIndex}`;
    }
    if (progressRange === 'month') {
      const firstDate = sortedEntries.length ? new Date(getProgressTimestamp(sortedEntries[0])) : new Date(timestamp);
      const monthIndex = Math.max(0, (date.getFullYear() - firstDate.getFullYear()) * 12 + (date.getMonth() - firstDate.getMonth()));
      return `month-${monthIndex}`;
    }
    if (progressRange === 'year') return yearBucket;
    return dateKey;
  };
  const grouped = sortedEntries.reduce((groups, entry) => {
    const key = getRangeGroupKey(entry);
    const current = groups[key];
    const entryTimestamp = getProgressTimestamp(entry);
    if (!current) {
      groups[key] = { ...entry, timestamp: entryTimestamp };
      return groups;
    }
    const currentWeight = Number(current.weight) || 0;
    const entryWeight = Number(entry.weight) || 0;
    const shouldReplace = progressRange === 'session'
      ? entryTimestamp >= getProgressTimestamp(current)
      : entryWeight > currentWeight || (entryWeight === currentWeight && entryTimestamp >= getProgressTimestamp(current));
    if (shouldReplace) {
      groups[key] = { ...entry, timestamp: entryTimestamp };
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

  if (progressRange === 'year') {
    const yearValues = Object.values(grouped).sort((a, b) => getProgressTimestamp(a) - getProgressTimestamp(b));
    groupedEntries = yearValues.length ? yearValues.map((entry) => ({
      ...entry,
      periodLabel: formatRangeDateLabel(getProgressTimestamp(entry), 'year'),
      hasData: true,
      historicalActual: true
    })) : [];
  }

  const chartEntries = [...getProgressWindowEntries(groupedEntries)].reverse();
  let points = chartEntries.length ? chartEntries.map((entry) => Number(entry.weight) || 0) : [0, 0, 0, 0, 0];
  if (points.length === 1) points = [points[0], points[0]];
  const minValue = Math.min(...points, 0);
  const maxValue = Math.max(...points, 1);
  const valueRange = Math.max(1, maxValue - minValue);
  const max = maxValue;
  const lastActualEntry = [...groupedEntries].reverse().find((entry) => entry.hasData !== false);
  const last = lastActualEntry?.weight || points[points.length - 1];
  const latestBestEntry = [...entries].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).find((entry) => entry.weight === Math.max(...entries.map((item) => item.weight), 0));
  const previousBest = entries.filter((entry) => entry !== latestBestEntry).reduce((value, entry) => Math.max(value, entry.weight), 0);
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
  const currentOneRepMax = entries.reduce((best, entry) => Math.max(best, entry.weight * (1 + entry.reps / 30)), 0);
  const increaseFromStart = currentPR - startWeight;
  const startOneRepMax = chronologicalEntries[0] ? chronologicalEntries[0].weight * (1 + chronologicalEntries[0].reps / 30) : 0;
  const oneRepMaxIncrease = entries.length ? Math.max(0, currentOneRepMax - startOneRepMax) : 0;
  const repsIncreaseFromStart = latestEntry && startReps ? latestEntry.reps - startReps : 0;
  if (progressRange === 'year') change = Number.isFinite(increaseFromStart) ? increaseFromStart : 0;
  const comparisonWeight = progressRange === 'year' ? startWeight : progressRange === 'session' ? previousBest : previousGroupedEntry?.weight || 0;
  changePercent = comparisonWeight > 0 ? (change / comparisonWeight) * 100 : 0;
  const startTimestamp = chronologicalEntries[0] ? getProgressTimestamp(chronologicalEntries[0]) : 0;
  const latestProgressTimestamp = entries.length ? Date.now() : 0;
  const progressDays = startTimestamp && latestProgressTimestamp ? Math.max(0, Math.round((latestProgressTimestamp - startTimestamp) / (1000 * 60 * 60 * 24))) : 0;
  const changeDays = progressRange === 'week' ? 7 : progressRange === 'month' ? 30 : progressRange === 'year' ? 360 : 4;
  const monthChangeName = latestGroupedEntry ? monthNames[new Date(getProgressTimestamp(latestGroupedEntry)).getMonth()] : 'måned';
  const changeLabel = progressRange === 'year' && progressDays < 360 ? `faktisk øgning siden start (${progressDays} dage)` : progressRange === 'month' ? `faktisk øgning i ${monthChangeName}` : `øgning på ${changeDays} dage`;
  trainingProgressPanel.querySelector('#progressExerciseName').textContent = exercise;
  trainingProgressPanel.querySelector('#progressExerciseMeta').textContent = entries.length ? `${entries.length} loggede sæt · vist pr. ${rangeNames[progressRange]} · seneste ${latestEntryDate || 'ingen dato'}` : 'Ingen loggede sæt endnu';
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
  const chartValueLabels = chartEntries.map((entry) => {
    const weight = Number(entry.weight) || 0;
    const reps = Number(entry.reps) || 0;
    return `${weight}X${reps}`;
  });
  const chartPoints = points.map((point, index) => {
    const y = chartHeight - (((point - minValue) / valueRange) * 112 + 12);
    return `${index * (chartWidth / Math.max(1, points.length - 1))},${y}`;
  }).join(' ');
  // Historik-listen viser hvert enkelt logget sæt (nyeste øverst), i modsætning til grafen der grupperer pr. session.
  const historyEntries = [...sortedEntries].reverse();
  const historyRows = historyEntries.length ? historyEntries.map((entry, index) => {
    const previous = historyEntries[index - 1];
    const rowChange = previous ? entry.weight - previous.weight : 0;
    const label = entry.date || (entry.session ? getBenchSessionDate(entry.session) : '');
    return `<div class="progress-history-row"><strong>${label}</strong><span>${entry.weight} kg × ${entry.reps}</span><b>${rowChange ? `${rowChange >= 0 ? '+' : ''}${rowChange} kg` : '-'}</b><em>${entry.isPR ? 'PR' : ''}</em></div>`;
  }).join('') : '<p>Ingen loggede sæt endnu</p>';
  progressChart.innerHTML = `<svg class="progress-line-chart" style="width:${chartWidth}px;min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} ${chartHeight + 28}" role="img" aria-label="Progression over ${rangeNames[progressRange]}"><line x1="0" y1="138" x2="${chartWidth}" y2="138"></line><polyline points="${chartPoints}"></polyline>${points.map((point, index) => { const x = index * (chartWidth / Math.max(1, points.length - 1)); const labelX = Math.max(42, x); const y = chartHeight - (((point - minValue) / valueRange) * 112 + 12); const deltaText = chartChanges[index] ? `${chartChanges[index] >= 0 ? '+' : ''}${chartChanges[index].toFixed(1)} kg` : '0.0 kg'; const dateBelow = progressRange === 'session' && chartLabels[index] ? `<text class="chart-point-date" x="${labelX}" y="${chartHeight + 18}" text-anchor="middle">${chartLabels[index]}</text><text class="chart-point-date" x="${labelX}" y="${chartHeight + 30}" text-anchor="middle">${deltaText}</text>` : ''; return `<g class="chart-point"><circle cx="${x}" cy="${y}" r="4"><title>${chartFullLabels[index] || `${rangeNames[progressRange]} ${index + 1}`}: ${chartValueLabels[index]}, ændring ${chartChanges[index] || 0} kg</title></circle><text class="chart-point-label" x="${labelX}" y="${Math.max(11, y - 9)}" text-anchor="middle">${chartValueLabels[index]}</text>${dateBelow}</g>`; }).join('')}</svg><div class="chart-labels" style="width:${chartWidth}px;min-width:${chartWidth}px">${points.map((point, index) => { const entry = chartEntries[index] || {}; return `<small>${chartLabels[index] || `${rangeNames[progressRange]} ${index + 1}`} · ${chartValueLabels[index]} · ${entry.hasData === false ? '-' : `${chartChanges[index] >= 0 ? '+' : ''}${chartChanges[index] || 0} kg`}</small>`; }).join('')}</div><div class="progress-history"><div class="progress-history-heading"><strong>Historik</strong><span>dato · løft · ændring · PR</span></div>${historyRows}</div>`;
}
trainingProgressPanel.querySelectorAll('.training-tabs button').forEach((button) => button.addEventListener('click', () => {
  trainingProgressPanel.querySelectorAll('.training-tabs button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  const groupExercises = progressExercises[button.dataset.muscle];
  const latestGroupEntry = workoutLog.find((entry) => groupExercises.includes(entry.exercise.toLowerCase()));
  progressExercisePicker.value = latestGroupEntry?.exercise || groupExercises[0];
  trackerExercise.value = progressExercisePicker.value;
  renderExerciseTracker();
  renderTrainingProgress(button.dataset.muscle);
}));
renderTrainingProgress();

const weightHistory = JSON.parse(localStorage.getItem('formlyWeightHistory') || '[]');
const weightTracker = document.createElement('section');
weightTracker.className = 'weight-tracker-panel';
weightTracker.id = 'weight';
weightTracker.innerHTML = '<div class="training-progress-header"><div><p class="eyebrow">KROPSVÆGT OVER TID</p><h2>Kropsvægt uge for uge</h2><p>Følg din kropsvægt separat fra løfteprogressionen.</p></div><span class="progress-live">TRACKER</span></div><form id="weightHistoryForm" class="weight-history-form"><label>Uge<input id="weightWeek" type="number" min="1" value="1" required></label><label>Vægt (kg)<input id="weightEntry" type="number" min="1" step="0.1" placeholder="Fx 82.4" required></label><button type="submit">Gem uge</button></form><div id="weightChart" class="weight-chart"></div><div id="weightHistoryList" class="weight-history-list"></div>';
trainingProgressPanel.after(weightTracker);
const weightChart = weightTracker.querySelector('#weightChart');
const weightHistoryList = weightTracker.querySelector('#weightHistoryList');
function renderWeightHistory() {
  const entries = [...weightHistory].sort((a, b) => a.week - b.week);
  const overviewWeightStat = document.querySelector('#overviewWeightStat');
  const overviewWeightNote = document.querySelector('#overviewWeightNote');
  const latestWeightEntry = entries[entries.length - 1];
  if (overviewWeightStat) overviewWeightStat.textContent = latestWeightEntry ? `${latestWeightEntry.weight.toFixed(1)} kg` : '-';
  if (overviewWeightNote) overviewWeightNote.textContent = latestWeightEntry ? `Uge ${latestWeightEntry.week} - tryk for at veje dig ind` : 'Tryk for at veje dig ind ->';
  if (!entries.length) {
    weightChart.innerHTML = '<p>Tilføj din første uge for at se udviklingen.</p>';
    weightHistoryList.innerHTML = '';
    return;
  }
  const weights = entries.map((entry) => entry.weight);
  const minWeight = Math.min(...weights) - 1;
  const maxWeight = Math.max(...weights) + 1;
  const range = Math.max(1, maxWeight - minWeight);
  weightChart.innerHTML = entries.map((entry, index) => {
    const previous = entries[index - 1];
    const change = previous ? entry.weight - previous.weight : 0;
    const height = Math.max(12, ((entry.weight - minWeight) / range) * 100);
    return `<div class="weight-point"><i style="height:${height}%"></i><strong>${entry.weight.toFixed(1)}</strong><small>Uge ${entry.week}</small><em>${previous ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : 'Start'}</em></div>`;
  }).join('');
  weightHistoryList.innerHTML = entries.slice().reverse().map((entry, index) => `<div class="weight-history-row"><strong>Uge ${entry.week}</strong><span>${entry.weight.toFixed(1)} kg</span><small>${entry.date}</small><button type="button" class="weight-remove" data-index="${weightHistory.length - 1 - index}">Slet</button></div>`).join('');
  weightHistoryList.querySelectorAll('.weight-remove').forEach((button) => button.addEventListener('click', () => {
    weightHistory.splice(Number(button.dataset.index), 1);
    localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
    renderWeightHistory();
  }));
}
weightTracker.querySelector('#weightHistoryForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const week = Number(weightTracker.querySelector('#weightWeek').value);
  const weight = Number(weightTracker.querySelector('#weightEntry').value);
  const existing = weightHistory.findIndex((entry) => entry.week === week);
  const entry = { week, weight, date: new Date().toLocaleDateString('da-DK') };
  if (existing >= 0) weightHistory[existing] = entry;
  else weightHistory.push(entry);
  localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
  profileWeight.value = weight;
  updateMaintenance();
  renderWeightHistory();
  showToast(`Uge ${week} er gemt med ${weight.toFixed(1)} kg`);
  weightTracker.querySelector('#weightWeek').value = week + 1;
  weightTracker.querySelector('#weightEntry').value = '';
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
  foodDateLabel.textContent = `${selectedFoodDate.getDate()}. ${foodMonthNames[selectedFoodDate.getMonth()]}`;
  const isToday = isViewingToday();
  foodDateLabel.title = isToday ? 'I dag' : 'Anden dag (kun visning) - i dags mad er stadig gemt';
  [foodForm, document.querySelector('.meal-quick-select'), document.querySelector('.scanner-controls'), document.querySelector('#scannerStatus')].forEach((el) => { if (el) el.style.display = isToday ? '' : 'none'; });
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
// Clicking a meal shortcut opens an overview panel for that meal (kcal + logged items), with scanning tucked in the corner.
const mealOverviewModal = document.querySelector('#mealOverviewModal');
const mealOverviewTitle = document.querySelector('#mealOverviewTitle');
const mealOverviewKcal = document.querySelector('#mealOverviewKcal');
const mealOverviewList = document.querySelector('#mealOverviewList');
function renderMealOverview(meal) {
  mealOverviewTitle.textContent = meal.toUpperCase();
  const mealEntries = foodEntries.filter((entry) => entry.meal === meal && entry.date === todayFoodDateKey());
  const mealKcal = mealEntries.reduce((total, entry) => total + entry.kcal, 0);
  mealOverviewKcal.textContent = `${mealKcal.toLocaleString('da-DK')} kcal`;
  mealOverviewList.innerHTML = mealEntries.length ? mealEntries.map((entry) => `<div class="food-entry"><strong>${entry.name}</strong><span>${entry.grams} g · ${entry.kcal} kcal</span><b>${entry.protein || 0}P · ${entry.carbs || 0}K · ${entry.fat || 0}F</b></div>`).join('') : '<p>Intet logget endnu i denne kategori.</p>';
}
document.querySelectorAll('.meal-quick-select button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.meal-quick-select button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelector('#mealInput').value = button.dataset.meal;
  renderMealOverview(button.dataset.meal);
  mealOverviewModal.hidden = false;
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
const exerciseCount = document.querySelector('#exerciseCount');
const programTitle = document.querySelector('#library h2');
const imageCredit = document.createElement('small');
imageCredit.textContent = 'Billeder: Wikimedia Commons';
imageCredit.className = 'image-credit';
programTitle.parentElement.append(imageCredit);
exerciseOptions.forEach((option) => {
  newExerciseSelect.insertAdjacentHTML('beforeend', `<option value="${option}">${option}</option>`);
});
const exerciseList = document.querySelector('#exerciseList');
exerciseCount.textContent = `${exerciseList.querySelectorAll('.exercise-row').length}/30 øvelser`;
const programWeekLabel = document.querySelector('#programWeekLabel');
const programPreviousWeek = document.querySelector('#programPreviousWeek');
const programNextWeek = document.querySelector('#programNextWeek');
let selectedProgramWeek = 1;
const weeklyCompletion = JSON.parse(localStorage.getItem('formlyWeeklyCompletion') || '{}');
const progressViews = document.querySelectorAll('#progressViews button');
const weekHistory = document.querySelector('#weekHistory');
const volumeStat = document.querySelector('#volumeStat');
const bestOrmStat = document.querySelector('#bestOrmStat');
const repsStat = document.querySelector('#repsStat');
const exerciseImages = {
  'bench press': 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=240&q=80',
  'barbell squat': 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=240&q=80',
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
  const image = exerciseImages[exerciseName.trim().toLowerCase()];
  let imageElement = visual.querySelector('img');
  if (!imageElement) {
    imageElement = document.createElement('img');
    visual.append(imageElement);
  }
  if (visual.dataset.customImage) {
    imageElement.src = visual.dataset.customImage;
    imageElement.alt = `${exerciseName} billede`;
    visual.classList.add('photo-visual');
    return;
  }
  const normalizedName = exerciseName.trim().toLowerCase();
  const movementType = normalizedName.includes('row') || normalizedName.includes('pull') ? 'RYG' : normalizedName.includes('squat') || normalizedName.includes('leg') || normalizedName.includes('lunge') ? 'BEN' : normalizedName.includes('press') || normalizedName.includes('push') ? 'PRESS' : normalizedName.includes('deadlift') || normalizedName.includes('hip') ? 'HOFTE' : 'CORE';
  const graphic = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" fill="#020711"/><circle cx="120" cy="68" r="38" fill="#082b55" stroke="#2cc8ff" stroke-width="3"/><path d="M62 112 Q120 76 178 112" fill="none" stroke="#ff3655" stroke-width="10" stroke-linecap="round"/><path d="M75 43 L165 43" stroke="#2cc8ff" stroke-width="4"/><text x="120" y="132" text-anchor="middle" fill="#edf7ff" font-family="Arial" font-size="13" font-weight="bold">${movementType}</text><text x="120" y="151" text-anchor="middle" fill="#8ba5c1" font-family="Arial" font-size="10">${exerciseName}</text></svg>`;
  imageElement.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(graphic)}`;
  imageElement.alt = `${exerciseName} øvelse`;
  visual.dataset.exercise = exerciseName.toUpperCase();
  imageElement.onerror = () => {
    imageElement.onerror = null;
    imageElement.src = `https://loremflickr.com/240/160/${encodeURIComponent(exerciseName)},fitness?lock=backup`;
  };
  visual.classList.add('photo-visual');
  imageElement.onerror = null;
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
const weightDevicePanel = document.createElement('div');
weightDevicePanel.className = 'weight-device-panel';
weightDevicePanel.innerHTML = '<div><p class="eyebrow">VÆGTMÅLER</p><h3>Seneste vejning</h3><strong><span id="weightReading">70</span> kg</strong><small id="weightSyncStatus">Indtastet manuelt</small></div><div class="weight-device-controls"><label>Kilde<select id="weightSource"><option value="manual">Manuel vejning</option><option value="withings">Withings</option><option value="apple">Apple Sundhed</option><option value="google">Google Fit</option><option value="fitbit">Fitbit</option><option value="oura">Oura</option><option value="whoop">WHOOP</option></select></label><button id="syncWeight" type="button">Synkroniser vægt</button></div>';
profileSection.querySelector('.section-heading').after(weightDevicePanel);
const weightReading = weightDevicePanel.querySelector('#weightReading');
const weightSyncStatus = weightDevicePanel.querySelector('#weightSyncStatus');
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

const healthProviders = document.createElement('div');
healthProviders.className = 'health-providers';
healthProviders.innerHTML = '<p class="eyebrow">FLERE SUNDHEDSKILDER</p><div class="provider-grid"><button type="button" data-provider="oura">Forbind Oura</button><button type="button" data-provider="whoop">Forbind WHOOP</button></div><small id="providerStatus">Vælg en kilde for at forbinde recovery, søvn og puls.</small>';
profileSection.append(healthProviders);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

startButton.addEventListener('click', () => {
  if (!sessionStarted) {
    activeWorkoutSession += 1;
    sessionStarted = true;
    localStorage.setItem('formlyActiveWorkoutSession', String(activeWorkoutSession));
    renderSessionSchedule();
  }
  document.querySelector('#log').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`Session ${activeWorkoutSession} er klar på dashboardet`);
});
sessionComplete.addEventListener('click', () => {
  sessionComplete.classList.toggle('done');
  showToast(sessionComplete.classList.contains('done') ? 'Hele træningen er markeret som færdig' : 'Træningen er markeret som aktiv');
});
progressButton.addEventListener('click', () => document.querySelector('#progress').scrollIntoView({ behavior: 'smooth' }));

function updateKcal() {
  const kcal = Number(bodyWeightInput.value) * Number(durationInput.value) * 5 * 0.0175;
  kcalResult.innerHTML = `${Math.round(kcal)} <small>kcal</small>`;
}

function updateOneRepMax() {
  const oneRepMax = Number(ormWeightInput.value) * (1 + Number(ormRepsInput.value) / 30);
  ormExerciseLabel.textContent = ormExerciseInput.value;
  ormResult.innerHTML = `${oneRepMax.toFixed(1)} <small>kg</small>`;
}

setForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const exercise = document.querySelector('#exerciseInput').value;
  const weight = document.querySelector('#weightInput').value;
  const reps = document.querySelector('#repsInput').value;
  const setNumber = document.querySelector('#setInput').value;
  const previousEntries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === exercise.toLowerCase());
  const previousBest = previousEntries.reduce((best, entry) => Math.max(best, entry.weight), 0);
  const previousBestRepsAtWeight = previousEntries.filter((entry) => entry.weight === Number(weight)).reduce((best, entry) => Math.max(best, entry.reps), 0);
  const previousBestWeightAtTheseReps = previousEntries.filter((entry) => Number(entry.reps) === Number(reps)).reduce((best, entry) => Math.max(best, entry.weight), 0);
  const prType = Number(weight) > previousBest || Number(weight) > previousBestWeightAtTheseReps ? 'Vægt-PR'
    : Number(weight) === previousBest && Number(reps) > previousBestRepsAtWeight ? 'Reps-PR' : '';
  const selectedWorkoutDate = parseWorkoutDateInput(workoutDateInput ? workoutDateInput.value : '');
  const sessionDateValues = normalizeSessionDate(activeWorkoutSession, selectedWorkoutDate);
  const newEntry = { exercise, weight: Number(weight), reps: Number(reps), setNumber: Number(setNumber), session: activeWorkoutSession, week: selectedProgramWeek, timestamp: sessionDateValues.timestamp, date: sessionDateValues.date, isPR: Boolean(prType), prType };
  workoutLog.unshift(newEntry);
  recalculatePrStatus(workoutLog);
  workoutLog.sort((a, b) => (getProgressTimestamp(b) || 0) - (getProgressTimestamp(a) || 0));
  localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
  if (workoutDateInput) {
    workoutDateInput.value = getIsoDateValue(selectedWorkoutDate);
    syncTopbarWithWorkoutDate();
  }
  renderWorkoutLog();
  if (typeof renderExerciseTracker === 'function') renderExerciseTracker();
  if (typeof progressExercisePicker !== 'undefined' && [...progressExercisePicker.options].some((option) => option.value.toLowerCase() === exercise.toLowerCase())) {
    progressExercisePicker.value = [...progressExercisePicker.options].find((option) => option.value.toLowerCase() === exercise.toLowerCase()).value;
  }
  if (typeof renderTrainingProgress === 'function') renderTrainingProgress();
  if (typeof renderWorkoutStats === 'function') renderWorkoutStats();
  if (typeof logProgressLink !== 'undefined') logProgressLink.textContent = `${exercise}: ${weight} kg x ${reps} · sendt til progressionen${prType ? ` · NY ${prType}` : ''}`;
  if (exercise.toLowerCase() === 'bench press' && Number(weight) >= previousBest) {
    document.querySelector('#weightInput').value = (Number(weight) + 2.5).toFixed(1);
    logProgressLink.textContent += ` · næste mål: ${Number(weight) + 2.5} kg`;
  }
  showToast(prType ? `Ny ${prType}: ${exercise} ${weight} kg x ${reps}` : `${exercise} er logget`);
});

function renderWorkoutLog() {
  if (!workoutLog.length) {
    loggedSets.innerHTML = '<p class="empty-log">Ingen sæt logget endnu</p>';
    return;
  }
  const currentSession = workoutLog.filter((entry) => (entry.session || 1) === activeWorkoutSession);
  const sessionVolume = currentSession.reduce((total, entry) => total + (entry.weight * entry.reps), 0);
  const totalVolume = workoutLog.reduce((total, entry) => total + (entry.weight * entry.reps), 0);
  const rankedEntries = workoutLog.map((entry, index) => ({ entry, index })).sort((a, b) => (b.entry.timestamp || 0) - (a.entry.timestamp || 0) || (b.entry.session || 1) - (a.entry.session || 1)).slice(0, 12);
  loggedSets.innerHTML = `<div class="log-summary"><span><strong>Session ${activeWorkoutSession}</strong> aktiv</span><span><strong>${currentSession.length}</strong> sæt</span><span><strong>${sessionVolume.toLocaleString('da-DK')} kg</strong> sessionvolumen</span><span>${totalVolume.toLocaleString('da-DK')} kg total</span></div>${rankedEntries.map(({ entry, index }) => { const displayDate = entry.date || new Date(entry.timestamp || Date.now()).toLocaleDateString('da-DK'); return `<div class="logged-set ${entry.isPR ? 'personal-record' : ''}"><span class="logged-exercise">${entry.exercise}</span><span>${entry.weight} kg x ${entry.reps}</span><b>Sæt ${entry.setNumber}</b><em class="session-tag">S${entry.session || 1}</em>${entry.isPR ? '<em class="pr-badge">PR</em>' : ''}<small>${displayDate}</small><button class="log-remove" type="button" data-index="${index}" aria-label="Slet logget sæt">x</button></div>`; }).join('')}`;
  loggedSets.querySelectorAll('.log-remove').forEach((button) => button.addEventListener('click', () => {
    workoutLog.splice(Number(button.dataset.index), 1);
    localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
    renderWorkoutLog();
    renderExerciseTracker();
  }));
}

renderWorkoutLog();
const logProgressLink = document.createElement('div');
logProgressLink.className = 'log-progress-link';
logProgressLink.textContent = 'Log et sæt kobles automatisk til Progression i træningen.';
setForm.closest('.log-card')?.append(logProgressLink);
const sessionSchedule = document.createElement('div');
sessionSchedule.className = 'session-schedule';
sessionSchedule.innerHTML = '<div><p class="eyebrow">SESSION PLAN</p><strong>4 dage mellem hver session</strong></div><div id="sessionScheduleList"></div>';
setForm.closest('.log-card')?.append(sessionSchedule);
const sessionScheduleList = sessionSchedule.querySelector('#sessionScheduleList');
function renderSessionSchedule() {
  const sessions = [1, 2, 3, 4, 5];
  sessionScheduleList.innerHTML = sessions.map((session) => {
    const dateText = getActualSessionDate(session) || 'Ingen dato';
    const active = session === activeWorkoutSession;
    return `<span class="${active ? 'active' : ''}"><b>Session ${session}</b><small>${dateText}</small></span>`;
  }).join('');
}
renderSessionSchedule();
const logExerciseManager = document.createElement('div');
logExerciseManager.className = 'log-exercise-manager';
logExerciseManager.innerHTML = '<div class="manager-heading"><strong>Øvelser i denne træning</strong><small>Tilføj eller fjern øvelser</small></div><div class="manager-add"><select id="logExercisePicker"></select><button id="addLogExercise" type="button">Tilføj øvelse +</button></div><div id="logExerciseList" class="log-exercise-list"></div>';
setForm.closest('.log-card')?.append(logExerciseManager);
const logExercisePicker = logExerciseManager.querySelector('#logExercisePicker');
const logExerciseList = logExerciseManager.querySelector('#logExerciseList');
const sessionExercises = new Set(['Bench press']);
exerciseOptions.forEach((option) => logExercisePicker.insertAdjacentHTML('beforeend', `<option value="${option}">${option}</option>`));
function renderLogExercises() {
  logExerciseList.innerHTML = [...sessionExercises].map((exercise) => `<div class="log-exercise-item"><span>${exercise}</span><button type="button" data-exercise="${exercise}">Fjern</button></div>`).join('');
  logExerciseList.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    sessionExercises.delete(button.dataset.exercise);
    if (exerciseInput.value.toLowerCase() === button.dataset.exercise.toLowerCase()) exerciseInput.value = [...sessionExercises][0] || 'Bench press';
    renderLogExercises();
  }));
}
logExerciseManager.querySelector('#addLogExercise').addEventListener('click', () => {
  const exercise = logExercisePicker.value;
  if (!exercise) return;
  sessionExercises.add(exercise);
  if (![...exerciseInput.options].some((option) => option.value === exercise)) exerciseInput.insertAdjacentHTML('beforeend', `<option>${exercise}</option>`);
  renderLogExercises();
  showToast(`${exercise} er tilføjet til træningen`);
});
renderLogExercises();

const exerciseTracker = document.createElement('div');
exerciseTracker.className = 'exercise-tracker';
exerciseTracker.innerHTML = '<div class="tracker-heading"><div><p class="eyebrow">ØVELSE TRACKER</p><h3>Bench press</h3></div><select id="trackerExercise"><option>Bench press</option><option>Goblet squat</option><option>Deadlift</option><option>Push-up</option><option>Shoulder press</option></select></div><div class="tracker-stats"><span><strong id="trackerBest">0 kg</strong><small>bedste vægt</small></span><span><strong id="trackerPR">-</strong><small>seneste PR</small></span><span><strong id="trackerIncrease">+0 kg</strong><small>øgning siden sidst</small></span><span><strong id="trackerVolume">0 kg</strong><small>samlet volumen</small></span><span><strong id="trackerReps">0</strong><small>reps i alt</small></span></div><div id="trackerHistory" class="tracker-history">Ingen loggede sæt endnu</div><div class="session-week-heading"><strong>Styrke-sessioner</strong><small>kg · reps · volumen</small></div><div id="strengthSessionHistory" class="strength-session-history"></div><div class="session-week-heading"><strong>Sessions pr. uge</strong><small>mål: 2 pr. muskelgruppe</small></div><div id="sessionWeekGrid" class="session-week-grid"></div>';
document.querySelector('#library').append(exerciseTracker);
const logSectionHeading = document.querySelector('#log');
const logToolsGrid = document.querySelector('.tools-grid');
if (logSectionHeading && logToolsGrid) {
  document.querySelector('#library').append(trainingProgressPanel, logSectionHeading, logToolsGrid);
}
const liveWorkoutLink = document.createElement('div');
liveWorkoutLink.className = 'live-workout-link';
liveWorkoutLink.innerHTML = '<span class="live-dot"></span><strong>Live workout-log</strong><span>Log et sæt opdaterer kg, volumen og progression herunder.</span>';
document.querySelector('#library').insertBefore(liveWorkoutLink, exerciseTracker);
const trackerExercise = exerciseTracker.querySelector('#trackerExercise');
const benchOverview = document.createElement('div');
benchOverview.className = 'bench-overview';
benchOverview.innerHTML = '<div class="session-week-heading"><strong>Bench Press overblik</strong><small>4 dage mellem sessioner · kun Bench Press</small></div><div id="benchOverviewList" class="bench-overview-list"></div>';
exerciseTracker.append(benchOverview);
function getExerciseSessionHistory(exerciseName) {
  const entries = workoutLog.filter((entry) => entry.exercise.toLowerCase() === exerciseName.toLowerCase()).map((entry) => ({ ...entry, weight: Number(entry.weight) || 0, reps: Number(entry.reps) || 0 }));
  return [...entries.reduce((map, entry) => {
    const key = entry.date ? `date:${entry.date}` : `session:${entry.session || entry.timestamp}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
    return map;
  }, new Map()).values()].sort((a, b) => getProgressTimestamp(b[0]) - getProgressTimestamp(a[0]));
}
function renderBenchOverview() {
  const sessionEntries = getExerciseSessionHistory('bench press');
  const progressionEntries = sessionEntries;
  const list = benchOverview.querySelector('#benchOverviewList');
  list.innerHTML = progressionEntries.length ? progressionEntries.slice(0, 20).map((session, index) => { const entry = session.reduce((best, item) => item.weight > best.weight ? item : best, session[0]); const previous = progressionEntries[index + 1]?.reduce((best, item) => item.weight > best.weight ? item : best, progressionEntries[index + 1][0]); const increase = previous && entry.weight > previous.weight ? entry.weight - previous.weight : 0; const volume = session.reduce((total, item) => total + (Number(item.weight) || 0) * (Number(item.reps) || 0), 0); const displayDate = entry.date || new Date(getProgressTimestamp(entry)).toLocaleDateString('da-DK'); return `<div class="bench-overview-row"><strong>Session ${index + 1}</strong><span>${displayDate}</span><b>${entry.weight} kg × ${entry.reps}</b><span>${volume.toLocaleString('da-DK')} kg</span><em>${increase ? `+${increase} kg` : '-'}</em></div>`; }).join('') : '<p>Log Bench Press for at se dit overblik.</p>';
}
exerciseOptions.forEach((exercise) => {
  if (![...trackerExercise.options].some((option) => option.value === exercise)) trackerExercise.insertAdjacentHTML('beforeend', `<option value="${exercise}">${exercise}</option>`);
});
if (!trackerExercise.value) trackerExercise.value = 'Bench press';
function renderExerciseTracker() {
  const selectedExercise = trackerExercise.value.toLowerCase();
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
  sessionHistory.innerHTML = sessionEntries.length ? sessionEntries.slice(0, 10).map((session, index) => { const entry = session.reduce((bestEntry, item) => item.weight > bestEntry.weight ? item : bestEntry, session[0]); const previous = sessionEntries[index + 1]?.reduce((bestEntry, item) => item.weight > bestEntry.weight ? item : bestEntry, sessionEntries[index + 1][0]); const sessionIncrease = previous && entry.weight > previous.weight ? entry.weight - previous.weight : 0; const sessionVolume = session.reduce((total, item) => total + item.weight * item.reps, 0); const sessionDate = entry.date || new Date(getProgressTimestamp(entry)).toLocaleDateString('da-DK'); return `<div class="strength-session-row"><strong>Session ${index + 1}</strong><span>${entry.weight} kg × ${entry.reps}</span><span>${sessionVolume.toLocaleString('da-DK')} kg</span><b>${sessionIncrease ? `+${sessionIncrease}` : '+0'} kg</b><small>Uge ${entry.week || 1} · ${sessionDate}</small></div>`; }).join('') : '<p>Log dit første sæt for at starte styrke-trackingen.</p>';
  renderSessionWeeks();
  renderBenchOverview();
}
function renderSessionWeeks() {
  const groups = { Push: ['bench press', 'push-up', 'shoulder press'], Pull: ['barbell row', 'deadlift'], Ben: ['goblet squat', 'leg press machine'] };
  exerciseTracker.querySelector('#sessionWeekGrid').innerHTML = Object.entries(groups).map(([group, exercises]) => `<div class="session-week-row"><strong>${group}</strong>${[1, 2, 3, 4, 5].map((week) => { const sessions = new Set(workoutLog.filter((entry) => exercises.includes(entry.exercise.toLowerCase()) && (entry.week || 1) === week).map((entry) => entry.date)).size; return `<span class="session-cell ${sessions >= 2 ? 'complete' : ''}"><b>${sessions}/2</b><small>U${week}</small></span>`; }).join('')}</div>`).join('');
}
trackerExercise.addEventListener('change', () => {
  progressExercisePicker.value = trackerExercise.value;
  renderExerciseTracker();
  renderTrainingProgress();
});
renderExerciseTracker();
window.setInterval(() => renderTrainingProgress(), 60 * 60 * 1000);

const restTimer = document.createElement('div');
restTimer.className = 'rest-timer';
restTimer.innerHTML = '<div><p class="eyebrow">PAUSE SYSTEM</p><h3>Rest mellem sæt</h3><strong id="restTime">01:30</strong></div><div class="rest-controls"><select id="restDuration"><option value="60">60 sek</option><option value="90" selected>90 sek</option><option value="120">120 sek</option><option value="180">180 sek</option></select><button id="startRest" type="button">Start pause</button><button id="resetRest" type="button">Nulstil</button></div>';
exerciseTracker.after(restTimer);
let restSeconds = 90;
let restInterval;
const restTime = restTimer.querySelector('#restTime');
const formatRestTime = () => `${String(Math.floor(restSeconds / 60)).padStart(2, '0')}:${String(restSeconds % 60).padStart(2, '0')}`;
const updateRestTime = () => { restTime.textContent = formatRestTime(); };
const savedRestDuration = localStorage.getItem('formlyRestDuration');
if (savedRestDuration) {
  restTimer.querySelector('#restDuration').value = savedRestDuration;
  restSeconds = Number(savedRestDuration);
  updateRestTime();
}
restTimer.querySelector('#restDuration').addEventListener('change', (event) => { restSeconds = Number(event.target.value); localStorage.setItem('formlyRestDuration', event.target.value); updateRestTime(); });
restTimer.querySelector('#startRest').addEventListener('click', () => {
  window.clearInterval(restInterval);
  restTimer.classList.add('running');
  restInterval = window.setInterval(() => {
    restSeconds -= 1;
    updateRestTime();
    if (restSeconds <= 0) {
      window.clearInterval(restInterval);
      restTimer.classList.remove('running');
      showToast('Pause slut - klar til næste sæt');
      restSeconds = Number(restTimer.querySelector('#restDuration').value);
      updateRestTime();
    }
  }, 1000);
});
restTimer.querySelector('#resetRest').addEventListener('click', () => { window.clearInterval(restInterval); restTimer.classList.remove('running'); restSeconds = Number(restTimer.querySelector('#restDuration').value); updateRestTime(); });

[bodyWeightInput, durationInput].forEach((input) => input.addEventListener('input', updateKcal));
[ormWeightInput, ormRepsInput, ormExerciseInput].forEach((input) => input.addEventListener('input', updateOneRepMax));

function updateSteps() {
  const steps = Number(stepsInput.value);
  exactStepsInput.value = steps;
  stepsValue.textContent = steps.toLocaleString('da-DK');
  const stepKcal = steps * Number(profileWeight.value) * 0.0005;
  stepKcalResult.innerHTML = `${Math.round(stepKcal)} <small>kcal</small>`;
  localStorage.setItem('formlySteps', String(steps));
  updateMaintenance();
}

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
  foodEntries.push({ meal: document.querySelector('#mealInput').value, name: document.querySelector('#foodNameInput').value.trim(), grams, kcal: Math.round(grams / 100 * kcalPer100g), protein: Math.round(grams / 100 * proteinPer100g), carbs: Math.round(grams / 100 * carbsPer100g), fat: Math.round(grams / 100 * fatPer100g), date: todayFoodDateKey() });
  localStorage.setItem('formlyFoodEntries', JSON.stringify(foodEntries));
  foodForm.reset();
  renderFood();
  showToast('Mad tilføjet til dagens tracker');
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

healthProviders.querySelectorAll('[data-provider]').forEach((button) => button.addEventListener('click', () => {
  const provider = button.dataset.provider === 'oura' ? 'Oura' : 'WHOOP';
  healthProviders.querySelector('#providerStatus').textContent = `${provider} er klar til OAuth/API-forbindelse. Direkte data kræver en sikker HTTPS-server og din tilladelse.`;
  showToast(`${provider}-forbindelse valgt`);
}));
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
  // Kobler vægtmålingen fra skalaen ind i "Kropsvægt uge for uge" for den aktuelle uge.
  const scaleWeek = selectedProgramWeek;
  const existingWeekIndex = weightHistory.findIndex((entry) => entry.week === scaleWeek);
  const scaleEntry = { week: scaleWeek, weight, date: new Date().toLocaleDateString('da-DK') };
  if (existingWeekIndex >= 0) weightHistory[existingWeekIndex] = scaleEntry;
  else weightHistory.push(scaleEntry);
  localStorage.setItem('formlyWeightHistory', JSON.stringify(weightHistory));
  renderWeightHistory();
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

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
  });
});

document.querySelectorAll('.complete-button').forEach((button) => button.addEventListener('click', () => {
  button.classList.toggle('done');
  button.closest('.exercise-row').classList.toggle('completed');
  weeklyCompletion[selectedProgramWeek] = [...document.querySelectorAll('#exerciseList .complete-button')].map((item) => item.classList.contains('done'));
  localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(weeklyCompletion));
  showToast(button.classList.contains('done') ? 'Øvelse markeret som færdig' : 'Øvelse markeret som aktiv');
}));

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

  const volume = currentEntries.reduce((total, entry) => total + (Number(entry.weight) || 0) * (Number(entry.reps) || 0), 0);
  const previousVolume = previousEntries.reduce((total, entry) => total + (Number(entry.weight) || 0) * (Number(entry.reps) || 0), 0);
  const bestOrm = currentEntries.reduce((best, entry) => Math.max(best, (Number(entry.weight) || 0) * (1 + (Number(entry.reps) || 0) / 30)), 0);
  const reps = currentEntries.reduce((total, entry) => total + (Number(entry.reps) || 0), 0);
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

  const maxVolume = Math.max(1, ...keys.map((key) => groups[key].reduce((total, entry) => total + (Number(entry.weight) || 0) * (Number(entry.reps) || 0), 0)));
  weekHistory.innerHTML = keys.length ? keys.map((key) => {
    const entries = groups[key];
    const groupVolume = entries.reduce((total, entry) => total + (Number(entry.weight) || 0) * (Number(entry.reps) || 0), 0);
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


function refreshExerciseList() {
  document.querySelectorAll('#exerciseList .exercise-row').forEach((row, index) => {
    row.querySelector('.exercise-number').textContent = String(index + 1).padStart(2, '0');
  });
  exerciseCount.textContent = `${document.querySelectorAll('#exerciseList .exercise-row').length}/30 øvelser`;
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

// Persists the full 'Mit program' list per device so custom exercises and edited kg/reps/sæt survive a reload.
const programExercisesKey = 'formlyProgramExercises';
function saveProgramExercises() {
  const rows = [...document.querySelectorAll('#exerciseList .exercise-row')];
  const data = rows.map((row) => {
    const stats = row.querySelector('.exercise-info p').textContent.match(/([\d.]+)\s*kg.*?([\d.]+)\s*reps.*?([\d.]+)\s*sæt/i) || [];
    return { name: row.querySelector('h3').textContent.trim(), kg: stats[1] || '20', reps: stats[2] || '10', sets: stats[3] || '3' };
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
    row.querySelector('h3').textContent = exercise.name;
    row.querySelector('.exercise-info p').innerHTML = `${exercise.kg} kg <span>•</span> ${exercise.reps} reps <span>•</span> ${exercise.sets} sæt`;
    exerciseListEl.append(row);
  });
  refreshExerciseList();
}

function bindExercisePhoto(row) {
  const visual = row.querySelector('.exercise-visual');
  const imageKey = `formlyExerciseImage:${row.querySelector('h3').textContent.trim().toLowerCase()}`;
  const savedImage = localStorage.getItem(imageKey);
  if (savedImage) visual.dataset.customImage = savedImage;
  const photoButton = document.createElement('button');
  const photoInput = document.createElement('input');
  photoButton.type = 'button';
  photoButton.className = 'exercise-photo-button';
  photoButton.textContent = 'Foto';
  photoButton.title = 'Tilføj eget billede af øvelsen';
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.capture = 'environment';
  photoInput.hidden = true;
  photoButton.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      visual.dataset.customImage = reader.result;
      localStorage.setItem(imageKey, reader.result);
      updateExerciseVisual(row, row.querySelector('h3').textContent);
      showToast('Eget øvelsesfoto er tilføjet');
    });
    reader.readAsDataURL(file);
  });
  row.append(photoButton, photoInput);
}

document.querySelectorAll('.exercise-row').forEach((row) => {
  const controls = document.createElement('div');
  controls.className = 'exercise-entry-controls';
  const initialStats = row.querySelector('.exercise-info p').textContent.match(/([\d.]+)\s*kg.*?([\d.]+)\s*reps.*?([\d.]+)\s*sæt/i) || [];
  controls.innerHTML = `<label>Øvelse<input class="exercise-name-input" type="text" list="exerciseOptions" value="${row.querySelector('h3').textContent}" aria-label="Søg eller vælg øvelse"></label><label>KG<input type="number" min="0" step="0.5" value="${initialStats[1] || 20}" aria-label="Vægt i kg"></label><label>Reps<input type="number" min="1" value="${initialStats[2] || 10}" aria-label="Reps"></label><label>Sæt<input type="number" min="1" value="${initialStats[3] || 3}" aria-label="Antal sæt"></label><button type="button">Log</button>`;
  updateExerciseVisual(row, row.querySelector('h3').textContent);
  const saveButton = controls.querySelector('button');
  controls.querySelector('.exercise-name-input').addEventListener('input', (event) => updateExerciseVisual(row, event.target.value));
  saveButton.addEventListener('click', () => {
    const values = controls.querySelectorAll('input');
    row.querySelector('h3').textContent = values[0].value || 'Ny øvelse';
    row.querySelector('.exercise-info p').innerHTML = `${values[1].value} kg <span>•</span> ${values[2].value} reps <span>•</span> ${values[3].value} sæt`;
    saveButton.classList.add('saved');
    saveButton.textContent = 'OK';
    saveProgramExercises();
    showToast(`${row.querySelector('h3').textContent}: ${values[1].value} kg, ${values[2].value} reps x ${values[3].value} sæt`);
  });
  row.querySelector('.more-button').before(controls);
  bindDeleteExercise(row);
  bindExercisePhoto(row);
});

exerciseInput.addEventListener('input', () => {
  const exerciseName = exerciseInput.value.trim() || 'Vælg en øvelse';
  searchPreviewName.textContent = exerciseName;
  searchPreviewImage.src = exerciseImages[exerciseName.toLowerCase()] || `https://loremflickr.com/240/160/${encodeURIComponent(exerciseName)},fitness?lock=search`;
  searchPreviewImage.alt = `${exerciseName} øvelse`;
  searchPreviewImage.onerror = () => {
    searchPreviewImage.onerror = null;
    searchPreviewImage.src = `https://loremflickr.com/240/160/${encodeURIComponent(exerciseName)},fitness?lock=search-backup`;
  };
  document.querySelectorAll('.exercise-row').forEach((row) => {
    row.classList.toggle('session-selected', row.querySelector('h3').textContent.toLowerCase() === exerciseInput.value.trim().toLowerCase());
  });
});

searchPreviewImage.src = exerciseImages[exerciseInput.value.toLowerCase()] || `https://loremflickr.com/240/160/${encodeURIComponent(exerciseInput.value)},fitness?lock=search`;

addExercise.addEventListener('click', () => {
  const exerciseList = document.querySelector('#exerciseList') || document.querySelector('.exercise-list');
  if (exerciseList.querySelectorAll('.exercise-row').length >= 30) {
    showToast('Mit program kan højst have 30 øvelser');
    return;
  }
  if (!newExerciseSelect.value) {
    newExerciseSelect.classList.add('open');
    newExerciseSelect.focus();
    return;
  }
  const exerciseName = newExerciseSelect.value.trim();
  const template = exerciseList.querySelector('.exercise-row');
  const newRow = template ? template.cloneNode(true) : document.createElement('article');
  if (!template) {
    newRow.className = 'exercise-row';
    newRow.innerHTML = '<span class="exercise-number">01</span><div class="exercise-visual"></div><div class="exercise-info"><h3>Ny øvelse</h3><p>Ny øvelse <span>•</span> vælg dine værdier</p></div><button class="complete-button" type="button">✓</button><button class="more-button" type="button">Slet</button><div class="exercise-entry-controls"><label>Øvelse<input class="exercise-name-input" type="text" value="Ny øvelse"></label><label>KG<input type="number" value="20"></label><label>Reps<input type="number" value="10"></label><label>Sæt<input type="number" value="3"></label><button type="button">Log</button></div>';
  }
  const exerciseNumber = exerciseList.querySelectorAll('.exercise-row').length + 1;
  newRow.querySelector('.exercise-number').textContent = String(exerciseNumber).padStart(2, '0');
  newRow.querySelector('h3').textContent = exerciseName.trim();
  newRow.querySelector('.exercise-info p').innerHTML = 'Ny øvelse <span>•</span> vælg dine værdier';
  newRow.querySelector('.complete-button').classList.remove('done');
  newRow.querySelector('.complete-button').addEventListener('click', () => {
    newRow.querySelector('.complete-button').classList.toggle('done');
    newRow.classList.toggle('completed');
    weeklyCompletion[selectedProgramWeek] = [...document.querySelectorAll('#exerciseList .complete-button')].map((item) => item.classList.contains('done'));
    localStorage.setItem('formlyWeeklyCompletion', JSON.stringify(weeklyCompletion));
  });
  bindDeleteExercise(newRow);
  bindExercisePhoto(newRow);
  const newControls = newRow.querySelector('.exercise-entry-controls');
  newControls.querySelector('.exercise-name-input').value = exerciseName.trim();
  newControls.querySelector('.exercise-name-input').addEventListener('input', (event) => updateExerciseVisual(newRow, event.target.value));
  updateExerciseVisual(newRow, exerciseName.trim());
  newControls.querySelector('button').addEventListener('click', () => {
    const values = newControls.querySelectorAll('input');
    newRow.querySelector('h3').textContent = values[0].value || 'Ny øvelse';
    newRow.querySelector('.exercise-info p').innerHTML = `${values[1].value} kg <span>•</span> ${values[2].value} reps <span>•</span> ${values[3].value} sæt`;
    saveProgramExercises();
    showToast('Ny øvelse er logget');
  });
  exerciseList.append(newRow);
  refreshExerciseList();
  localStorage.setItem('formlyExerciseCount', String(exerciseList.querySelectorAll('.exercise-row').length));
  saveProgramExercises();
  newExerciseSelect.value = '';
  newExerciseSelect.classList.remove('open');
  showToast(`${exerciseName.trim()} er tilføjet til Mit program`);
});

newExerciseSelect.addEventListener('change', () => {
  if (newExerciseSelect.value) addExercise.click();
});

function updateProgramWeek() {
  programWeekLabel.textContent = `Uge ${selectedProgramWeek}`;
  const completedForWeek = weeklyCompletion[selectedProgramWeek] || [];
  document.querySelectorAll('#exerciseList .exercise-row').forEach((row) => {
    const index = [...document.querySelectorAll('#exerciseList .exercise-row')].indexOf(row);
    row.classList.remove('completed', 'session-selected');
    row.querySelector('.complete-button')?.classList.toggle('done', Boolean(completedForWeek[index]));
    row.classList.toggle('completed', Boolean(completedForWeek[index]));
  });
  showToast(`Uge ${selectedProgramWeek} er klar - øvelser nulstillet`);
}

programPreviousWeek.addEventListener('click', () => {
  selectedProgramWeek = Math.max(1, selectedProgramWeek - 1);
  updateProgramWeek();
});

programNextWeek.addEventListener('click', () => {
  selectedProgramWeek += 1;
  updateProgramWeek();
});

const initialWeekCompletion = weeklyCompletion[selectedProgramWeek] || [];
document.querySelectorAll('#exerciseList .exercise-row').forEach((row, index) => {
  const done = Boolean(initialWeekCompletion[index]);
  row.querySelector('.complete-button')?.classList.toggle('done', done);
  row.classList.toggle('completed', done);
});
