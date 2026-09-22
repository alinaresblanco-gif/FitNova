// Utilidades genéricas para el mockup de FitNova Go (sin backend, solo simulación visual)

// Incrementar en cada cambio visible del mockup para que se muestre el aviso de actualización.
const APP_VERSION = '2026.09.22.1';
const ACTIVITIES_KEY = 'fitnova_activities';

// Comprueba si hay una versión nueva del mockup y muestra el modal de actualización en Inicio.
function checkForAppUpdate() {
  const seenVersion = localStorage.getItem('fitnova_seen_version');
  const dismissedVersion = localStorage.getItem('fitnova_dismissed_version');

  if (seenVersion === null) {
    // Primera visita: no mostramos aviso, solo dejamos constancia de la versión actual.
    localStorage.setItem('fitnova_seen_version', APP_VERSION);
    return;
  }

  if (seenVersion !== APP_VERSION && dismissedVersion !== APP_VERSION) {
    openModal('modal-actualizacion');
  }
}

function descartarActualizacion() {
  localStorage.setItem('fitnova_dismissed_version', APP_VERSION);
  closeModal('modal-actualizacion');
}

function aplicarActualizacion() {
  localStorage.setItem('fitnova_seen_version', APP_VERSION);
  localStorage.removeItem('fitnova_dismissed_version');
  location.reload();
}

function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('open');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('open');
}

// Cierra el modal si se pulsa fuera de su contenido
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

function toggleAccordion(header) {
  const item = header.closest('.accordion-item');
  const wasOpen = item.classList.contains('open');
  item.parentElement.querySelectorAll('.accordion-item').forEach((el) => el.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}

// Selector tipo "chip" reutilizable (métricas, tipo de comida, etc.)
function selectChip(button) {
  const group = button.closest('.chip-select');
  group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  const onSelect = group.dataset.onSelect;
  if (onSelect && window[onSelect]) window[onSelect](button.dataset.value);
}

// Cálculo automático de pasos y calorías a partir de la distancia (mock simplificado)
function calcularActividad() {
  const distanciaInput = document.getElementById('act-distancia');
  const pasosInput = document.getElementById('act-pasos');
  const caloriasInput = document.getElementById('act-calorias');
  const km = parseFloat(distanciaInput.value) || 0;
  const metrosPorPaso = 0.63;
  const pasos = Math.round((km * 1000) / metrosPorPaso);
  const calorias = Math.round(km * 60); // estimación simple: ~60 kcal/km
  pasosInput.value = pasos;
  caloriasInput.value = calorias;
}

function getActivities() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITIES_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveActivities(activities) {
  localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(activities));
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function openActivityModal(activityId) {
  const activity = getActivities().find((item) => item.id === activityId);
  document.getElementById('actividad-id').value = activity ? activity.id : '';
  document.getElementById('actividad-modal-title').textContent = activity ? 'Editar actividad' : 'Registrar actividad';
  document.getElementById('actividad-delete').style.display = activity ? 'block' : 'none';
  document.getElementById('act-nombre').value = activity ? activity.name : '';
  document.getElementById('act-fecha').value = activity ? activity.date : todayIso();
  document.getElementById('act-duracion').value = activity ? activity.duration : '';
  document.getElementById('act-distancia').value = activity ? activity.distance : '';
  document.getElementById('act-comentario').value = activity ? activity.comment : '';
  calcularActividad();
  openModal('modal-actividad');
}

function saveActivity() {
  const name = document.getElementById('act-nombre').value.trim();
  const date = document.getElementById('act-fecha').value;
  if (!name || !date) return;

  const idInput = document.getElementById('actividad-id');
  const id = (idInput ? idInput.value : '') || String(Date.now());
  const activity = {
    id,
    name,
    date,
    duration: document.getElementById('act-duracion').value.trim(),
    distance: document.getElementById('act-distancia').value,
    comment: document.getElementById('act-comentario').value.trim()
  };
  const activities = getActivities().filter((item) => item.id !== id);
  activities.push(activity);
  saveActivities(activities);
  closeModal('modal-actividad');
  if (typeof initAgenda === 'function' && document.getElementById('agenda-calendar')) initAgenda();
}

function deleteActivity() {
  const id = document.getElementById('actividad-id').value;
  saveActivities(getActivities().filter((item) => item.id !== id));
  closeModal('modal-actividad');
  if (typeof initAgenda === 'function' && document.getElementById('agenda-calendar')) initAgenda();
}

function toggleAgendaView() {
  const calendar = document.getElementById('agenda-calendar');
  if (!calendar) return;
  calendar.dataset.view = calendar.dataset.view === 'month' ? 'week' : 'month';
  renderAgenda();
}

function initAgenda() {
  const calendar = document.getElementById('agenda-calendar');
  if (!calendar.dataset.view) calendar.dataset.view = 'week';
  renderAgenda();
}

function renderAgenda() {
  const calendar = document.getElementById('agenda-calendar');
  const list = document.getElementById('agenda-activity-list');
  if (!calendar || !list) return;
  const view = calendar.dataset.view || 'week';
  document.getElementById('agenda-view-toggle').textContent = view === 'week' ? '▦' : '▤';
  calendar.innerHTML = view === 'week' ? renderWeek() : renderMonth();

  const activities = getActivities()
    .filter((activity) => activity.date >= todayIso())
    .sort((first, second) => first.date.localeCompare(second.date));
  list.innerHTML = activities.length ? activities.map((activity) => `
    <button class="activity-item" onclick="openActivityModal('${activity.id}')">
      <span><strong>${escapeHtml(activity.name)}</strong><span>${formatDate(activity.date)}${activity.duration ? ` · ${escapeHtml(activity.duration)}` : ''}</span></span><span>›</span>
    </button>`).join('') : '<p class="agenda-empty">Hoy no hay planificado ninguna actividad, puedes incluir tu próxima actividad o tomarte un merecido descanso</p>';
}

function renderWeek() {
  const today = new Date(`${todayIso()}T12:00:00`);
  const monday = new Date(today);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return `<div class="agenda-week-day${iso === todayIso() ? ' today' : ''}">${date.toLocaleDateString('es-ES', { weekday: 'short' })}<strong>${date.getDate()}</strong></div>`;
  }).join('');
  return `<div class="agenda-calendar-title"><span>Esta semana</span><span>${formatDate(todayIso())}</span></div><div class="agenda-week">${days}</div>`;
}

function renderMonth() {
  const today = new Date(`${todayIso()}T12:00:00`);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() || 7) - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + totalDays }, (_, index) => index < firstDay ? '<span></span>' : `<span class="${index - firstDay + 1 === today.getDate() ? 'today' : ''}">${index - firstDay + 1}</span>`).join('');
  return `<div class="agenda-calendar-title"><span>${today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span><span>Mes</span></div><div class="calendar-grid"><span class="weekday">L</span><span class="weekday">M</span><span class="weekday">X</span><span class="weekday">J</span><span class="weekday">V</span><span class="weekday">S</span><span class="weekday">D</span>${cells}</div>`;
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
