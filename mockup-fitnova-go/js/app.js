// Utilidades genéricas para el mockup de FitNova Go (sin backend, solo simulación visual)

// Incrementar en cada cambio visible del mockup para que se muestre el aviso de actualización.
const APP_VERSION = '2026.09.21.3';

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
