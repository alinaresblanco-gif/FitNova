// Utilidades genéricas para el mockup de FitNova Go (sin backend, solo simulación visual)

// Incrementar en cada cambio visible del mockup para que se muestre el aviso de actualización.
const APP_VERSION = '2026.09.23.18';
const ACTIVITIES_KEY = 'fitnova_activities';
const METRICS_KEY = 'fitnova_metrics';
let selectedAgendaDay = '';

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

function ensureUpdateModal() {
  if (document.getElementById('modal-actualizacion')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modal-actualizacion">
      <div class="modal">
        <div class="modal-header"><h2>Actualización disponible</h2></div>
        <p style="font-size:14px;color:#55606f;margin:0 0 18px;">Hay una nueva versión de FitNova Go con mejoras y correcciones. Actualiza para disfrutar de los últimos cambios.</p>
        <div class="row">
          <button class="btn-secondary" onclick="descartarActualizacion()">Ahora no</button>
          <button class="btn-primary" onclick="aplicarActualizacion()">Actualizar aplicación</button>
        </div>
      </div>
    </div>`);
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

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js?v=20260923.18').then((registration) => {
    registration.update();
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'APP_UPDATED') {
      ensureUpdateModal();
      checkForAppUpdate();
    }
  });
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
  closeModal('modal-dia');
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

function deleteActivityById(activityId) {
  saveActivities(getActivities().filter((item) => item.id !== activityId));
  renderAgenda();
  openDayModal(selectedAgendaDay);
}

function openDayModal(date) {
  selectedAgendaDay = date;
  const activities = getActivities().filter((activity) => activity.date === date);
  document.getElementById('dia-modal-title').textContent = formatDate(date);
  document.getElementById('dia-activity-list').innerHTML = activities.length ? activities.map((activity) => `
    <div class="day-activity">
      <div class="day-activity-info" onclick="openActivityModal('${activity.id}')">
        <strong>${escapeHtml(activity.name)}</strong>
        <span>${activity.duration ? `${escapeHtml(activity.duration)} · ` : ''}Pulsa para consultar o editar</span>
      </div>
      <button class="day-activity-open" onclick="openActivityModal('${activity.id}')" title="Abrir actividad">›</button>
      <button class="day-activity-delete" onclick="deleteActivityById('${activity.id}')" title="Eliminar actividad">🗑</button>
    </div>`).join('') : '<p class="agenda-empty">No hay actividades para este día.</p>';
  openModal('modal-dia');
}

function addActivityForSelectedDay() {
  closeModal('modal-dia');
  openActivityModal();
  document.getElementById('act-fecha').value = selectedAgendaDay;
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
  calendar.addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-agenda-date]');
    if (dayButton) openDayModal(dayButton.dataset.agendaDate);
  });
  renderAgenda();
}

function initEvolution() {
  const tabs = document.querySelectorAll('[data-evolution-tab]');
  const metricSelect = document.getElementById('evolution-metric-select');
  const photoInput = document.getElementById('evolution-photo-input');
  if (!tabs.length) return;

  const dateInput = document.getElementById('metric-date');
  if (dateInput) dateInput.value = todayIso();
  document.querySelectorAll('.metric-help').forEach((button) => button.addEventListener('click', () => openMetricHelp(button.dataset.help)));

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const selectedTab = tab.dataset.evolutionTab;
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    document.getElementById('evolution-metrics').hidden = selectedTab !== 'metrics';
    document.getElementById('evolution-photos').hidden = selectedTab !== 'photos';
  }));

  metricSelect.addEventListener('change', () => {
    const chart = document.querySelector('#evolution-chart polyline');
    const points = metricSelect.value === 'Grasa corporal' ? '0,40 50,45 100,52 150,48 200,58 250,62 300,68' : '0,80 50,75 100,68 150,60 200,55 250,48 300,42';
    chart.setAttribute('points', points);
  });

  photoInput.addEventListener('change', () => {
    const grid = document.getElementById('evolution-photo-grid');
    grid.querySelector('.evolution-empty')?.remove();
    Array.from(photoInput.files).forEach((file) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const image = document.createElement('img');
        image.src = reader.result;
        image.alt = 'Foto de progreso';
        grid.appendChild(image);
      });
      reader.readAsDataURL(file);
    });
    photoInput.value = '';
  });
}

function openMetricHelp(type) {
  const help = {
    fat: ['Grasa corporal', 'Añade tu % de grasa directamente, si tienes una báscula avanzada. En cualquier farmacia, puedes encontrar una, o bien pregunta a tu profesional cómo calcularlo.'],
    chest: ['Pecho', 'En posición de pie, rodeate con una cinta métrica la parte más grande del pecho. No aprietes la cinta sobre el cuerpo.'],
    neck: ['Cuello', 'Con la cabeza mirando al frente y hombros relajados, con una cinta métrica mediremos la parte más estrecha del cuello, justo encima de los hombros.'],
    shoulders: ['Hombros', 'Utilizamos la cinta métrica y situándola en la espalda mediremos de borde externo a borde externo. La cinta métrica debe estar paralela a los pies.'],
    biceps: ['Bíceps', 'Con la cinta métrica rodea la zona más ancha del brazo, como a 5 cm desde la axila. Flexiona el brazo y haz fuerza.'],
    forearm: ['Antebrazo', 'Con el brazo relajado y la palma de la mano hacia arriba, rodea con tu cinta métrica la zona más ancha del antebrazo.'],
    waist: ['Cintura', 'En posición de pie y derecho pero relajado, sin meter tripa, rodeamos con la cinta métrica la zona más estrecha del abdomen.'],
    hip: ['Cadera', 'De pie y en posición erguida, rodearemos con la cinta métrica la zona más ancha de la cintura.'],
    thigh: ['Muslo', 'De pie, rodeamos con la cinta métrica la zona más ancha del muslo.'],
    calf: ['Gemelo', 'De pie y con las piernas separadas, con el peso equilibrado entre las dos piernas, rodeamos con nuestra cinta métrica la zona más ancha de la pantorrilla.']
  }[type];
  if (!help) return;
  document.getElementById('metric-help-title').textContent = help[0];
  document.getElementById('metric-help-text').textContent = help[1];
  openModal('modal-metric-help');
}

function saveMetrics(event) {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  const metrics = JSON.parse(localStorage.getItem(METRICS_KEY) || '[]');
  metrics.unshift(values);
  localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  closeModal('modal-registrar-metricas');
  form.reset();
  document.getElementById('metric-date').value = todayIso();
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
    return `<button type="button" class="agenda-week-day${iso === todayIso() ? ' today' : ''}" data-agenda-date="${iso}">${date.toLocaleDateString('es-ES', { weekday: 'short' })}<strong>${date.getDate()}</strong></button>`;
  }).join('');
  return `<div class="agenda-calendar-title"><span>Esta semana</span><span>${formatDate(todayIso())}</span></div><div class="agenda-week">${days}</div>`;
}

function renderMonth() {
  const today = new Date(`${todayIso()}T12:00:00`);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() || 7) - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + totalDays }, (_, index) => {
    if (index < firstDay) return '<span></span>';
    const day = index - firstDay + 1;
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `<button type="button" class="calendar-day${day === today.getDate() ? ' today' : ''}" data-agenda-date="${iso}">${day}</button>`;
  }).join('');
  return `<div class="agenda-calendar-title"><span>${today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span><span>Mes</span></div><div class="calendar-grid"><span class="weekday">L</span><span class="weekday">M</span><span class="weekday">X</span><span class="weekday">J</span><span class="weekday">V</span><span class="weekday">S</span><span class="weekday">D</span>${cells}</div>`;
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

const VIDEO_LIBRARY = [
  { id: 'v1', title: 'Movilidad para empezar el día', date: '22 sep 2026', activity: 'Movilidad', duration: '12 min', favorite: true, color: 'orange' },
  { id: 'v2', title: 'Fuerza de tren inferior', date: '20 sep 2026', activity: 'Fuerza', duration: '28 min', favorite: false, color: 'blue' },
  { id: 'v3', title: 'Estiramientos después de correr', date: '18 sep 2026', activity: 'Running', duration: '15 min', favorite: true, color: 'green' },
  { id: 'v4', title: 'Core y estabilidad', date: '15 sep 2026', activity: 'Core', duration: '20 min', favorite: false, color: 'navy' }
];
let videoLibrary = 'all';
let videoFilter = 'name';

function initVideos() {
  document.querySelectorAll('.video-tab').forEach((tab) => tab.addEventListener('click', () => {
    videoLibrary = tab.dataset.library;
    document.querySelectorAll('.video-tab').forEach((item) => item.classList.toggle('active', item === tab));
    renderVideos();
  }));
  document.getElementById('video-search').addEventListener('input', renderVideos);
  document.querySelectorAll('.video-filter-option').forEach((option) => option.addEventListener('click', () => {
    videoFilter = option.dataset.filter;
    document.querySelectorAll('.video-filter-option').forEach((item) => item.classList.toggle('active', item === option));
    document.getElementById('video-filter-summary').textContent = `Buscando por ${filterLabel(videoFilter).toLowerCase()}`;
    closeModal('modal-filtros-video');
    renderVideos();
  }));
  renderVideos();
}

function openVideoFilters() {
  openModal('modal-filtros-video');
}

function filterLabel(filter) {
  return { name: 'Nombre', date: 'Fecha', activity: 'Actividad' }[filter];
}

function toggleVideoFavorite(videoId) {
  const video = VIDEO_LIBRARY.find((item) => item.id === videoId);
  if (!video) return;
  video.favorite = !video.favorite;
  renderVideos();
}

function renderVideos() {
  const query = document.getElementById('video-search').value.trim().toLowerCase();
  const field = { name: 'title', date: 'date', activity: 'activity' }[videoFilter];
  const videos = VIDEO_LIBRARY.filter((video) => (videoLibrary === 'all' || video.favorite) && (!query || video[field].toLowerCase().includes(query)));
  document.getElementById('video-list').innerHTML = videos.length ? videos.map((video) => `
    <article class="video-card">
      <div class="video-thumb ${video.color}"><span>▶</span><small>${escapeHtml(video.duration)}</small></div>
      <div class="video-card-body"><div><h2>${escapeHtml(video.title)}</h2><p>${escapeHtml(video.activity)} · ${escapeHtml(video.date)}</p></div><button class="video-favorite${video.favorite ? ' active' : ''}" onclick="toggleVideoFavorite('${video.id}')" title="${video.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${video.favorite ? '★' : '☆'}</button></div>
    </article>`).join('') : '<p class="agenda-empty">No hemos encontrado vídeos con esos criterios.</p>';
}

registerServiceWorker();
