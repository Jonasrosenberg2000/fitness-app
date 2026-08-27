const exerciseInput = document.querySelector('#workoutExercise');
const previewName = document.querySelector('#previewName');
const workoutImage = document.querySelector('#workoutImage');
const setList = document.querySelector('#workoutSetList');
const toast = document.querySelector('#workoutToast');
const doneButtons = document.querySelectorAll('.check');
const afterWorkout = document.createElement('section');
afterWorkout.className = 'after-workout';
afterWorkout.hidden = true;
afterWorkout.innerHTML = '<p class="eyebrow">EFTER TRÆNING</p><h2>Session gennemført</h2><p id="afterWorkoutMessage">Godt arbejde. Din indsats er gemt i logbogen.</p><div class="after-workout-stats"><span><strong id="afterWorkoutVolume">0 kg</strong><small>volumen</small></span><span><strong id="afterWorkoutSets">0</strong><small>loggede sæt</small></span><span><strong id="afterWorkoutProgress">+0%</strong><small>progression</small></span></div>';
document.querySelector('.shell').append(afterWorkout);

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}

exerciseInput.addEventListener('input', () => {
  const name = exerciseInput.value.trim() || 'Vælg en øvelse';
  if (previewName) previewName.textContent = name;
  if (workoutImage) workoutImage.alt = `${name} træning`;
});

// Restores a per-device saved value (if any); fresh installs keep the input's default HTML value.
function restorePersistedInput(input, key) {
  if (!input) return;
  const saved = localStorage.getItem(key);
  if (saved !== null) input.value = saved;
  input.addEventListener('input', () => localStorage.setItem(key, input.value));
}
restorePersistedInput(document.querySelector('#workoutWeight'), 'formlyLogWeight');
restorePersistedInput(document.querySelector('#workoutReps'), 'formlyLogReps');
restorePersistedInput(document.querySelector('#workoutSet'), 'formlyLogSet');

// Shared with index.html so sets logged here also count in the training progress tracker.
const workoutLog = JSON.parse(localStorage.getItem('formlyWorkoutLog') || '[]');
const sessionSetsKey = 'formlyWorkoutSessionSets';
function renderSetList() {
  const sessionSets = JSON.parse(localStorage.getItem(sessionSetsKey) || '[]');
  setList.innerHTML = sessionSets.length ? sessionSets.map((set) => `<div class="set-row" data-volume="${set.weight * set.reps}"><strong>${set.exercise}</strong><span>${set.weight} kg x ${set.reps}</span><b>Sæt ${set.setNumber}</b></div>`).join('') : '<p>Ingen sæt gemt endnu</p>';
}
renderSetList();

document.querySelector('#saveWorkoutSet').addEventListener('click', () => {
  const weight = Number(document.querySelector('#workoutWeight').value);
  const reps = Number(document.querySelector('#workoutReps').value);
  const setNumber = Number(document.querySelector('#workoutSet').value);
  const exercise = exerciseInput.value;
  const sessionSets = JSON.parse(localStorage.getItem(sessionSetsKey) || '[]');
  sessionSets.unshift({ exercise, weight, reps, setNumber });
  localStorage.setItem(sessionSetsKey, JSON.stringify(sessionSets));
  renderSetList();
  workoutLog.unshift({ exercise, weight, reps, setNumber, timestamp: Date.now(), date: new Date().toLocaleDateString('da-DK') });
  localStorage.setItem('formlyWorkoutLog', JSON.stringify(workoutLog));
  notify('Sæt gemt i sessionen');
});

const doneStateKey = 'formlyWorkoutSessionDone';
const savedDoneState = JSON.parse(localStorage.getItem(doneStateKey) || '[]');
doneButtons.forEach((button, index) => {
  if (savedDoneState[index]) {
    button.classList.add('done');
    button.closest('.item').classList.add('completed');
  }
});
document.querySelector('#workoutProgress').textContent = `${document.querySelectorAll('.check.done').length} / ${doneButtons.length}`;
document.querySelector('#sessionProgressBar').style.width = `${document.querySelectorAll('.check.done').length / doneButtons.length * 100}%`;

doneButtons.forEach((button) => button.addEventListener('click', () => {
  button.classList.toggle('done');
  button.closest('.item').classList.toggle('completed');
  localStorage.setItem(doneStateKey, JSON.stringify([...doneButtons].map((item) => item.classList.contains('done'))));
  const completed = document.querySelectorAll('.check.done').length;
  document.querySelector('#workoutProgress').textContent = `${completed} / ${doneButtons.length}`;
  document.querySelector('#sessionProgressBar').style.width = `${completed / doneButtons.length * 100}%`;
  if (completed === doneButtons.length) {
    const volume = [...document.querySelectorAll('.set-row')].reduce((total, row) => total + Number(row.dataset.volume || 0), 0);
    const previousVolume = Number(localStorage.getItem('formlyLastWorkoutVolume') || 0);
    const progression = previousVolume ? Math.round((volume - previousVolume) / previousVolume * 100) : 0;
    afterWorkout.hidden = false;
    afterWorkout.querySelector('#afterWorkoutVolume').textContent = `${volume.toLocaleString('da-DK')} kg`;
    afterWorkout.querySelector('#afterWorkoutSets').textContent = document.querySelectorAll('.set-row').length;
    afterWorkout.querySelector('#afterWorkoutProgress').textContent = `${progression >= 0 ? '+' : ''}${progression}%`;
    localStorage.setItem('formlyLastWorkoutVolume', String(volume));
    localStorage.setItem('formlyLastWorkoutDate', new Date().toLocaleDateString('da-DK'));
  }
  notify(completed === doneButtons.length ? 'Session gennemført' : 'Øvelse markeret som færdig');
}));
