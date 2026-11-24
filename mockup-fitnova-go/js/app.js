// Utilidades genéricas para el mockup de FitNova Go (sin backend, solo simulación visual)

// Incrementar en cada cambio visible del mockup para que se muestre el aviso de actualización.
const APP_VERSION = '2026.11.24.4';
const ACTIVITIES_KEY = 'fitnova_activities';
let selectedAgendaDay = '';
let agendaFechaBase = new Date();

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
  navigator.serviceWorker.register('./service-worker.js?v=20261124.4').then((registration) => {
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

// ---------- Actividades personales (Supabase: clientes_actividades) ----------
const goAct = {
  clienteId: null, filas: [], cargadas: false, error: '', archivo: null, quitarFoto: false, fotoActual: null,
  importacion: null, caloriasDispositivo: null,
};

// Pasos y calorías estimados a partir de la distancia (no se guardan); si la
// actividad viene de un archivo con calorías del reloj, se muestran esas.
function calcularActividad() {
  const km = parseFloat(String(document.getElementById('act-distancia').value).replace(',', '.')) || 0;
  const estimado = FitNovaActividades.estimaciones(km);
  document.getElementById('act-pasos').value = km ? estimado.pasos : '';
  document.getElementById('act-calorias').value = goAct.caloriasDispositivo || (km ? estimado.calorias : '');
  document.getElementById('act-calorias-label').textContent = goAct.caloriasDispositivo ? 'Calorías (reloj)' : 'Calorías (est.)';
}

function avisoImportacion(texto) {
  const modal = document.getElementById('modal-actividad');
  if (modal && modal.classList.contains('open')) actividadError(texto);
  else alert(texto);
}

function elegirArchivoActividad() {
  ensureActivityModal();
  document.getElementById('act-import-input').click();
}

async function importarArchivoActividad(archivo) {
  document.getElementById('act-import-input').value = '';
  if (!archivo) return;
  const A = FitNovaActividades;
  let datos;
  try {
    datos = await FitNovaImportar.leer(archivo);
  } catch (e) {
    return avisoImportacion(`No se pudo importar «${archivo.name}»: ${e.message}`);
  }
  const repetida = datos.inicio && goAct.filas.find((a) => a.inicio && Date.parse(a.inicio) === Date.parse(datos.inicio));
  if (repetida) {
    return avisoImportacion(`Esta actividad ya está importada: «${repetida.nombre}» del ${A.fechaCorta(repetida.fecha)}.`);
  }
  openActivityModal(null, datos.fecha || todayIso());
  const importacion = { inicio: datos.inicio, calorias_kcal: datos.calorias_kcal };
  goAct.importacion = importacion;
  goAct.caloriasDispositivo = datos.calorias_kcal;
  document.getElementById('act-nombre').value = datos.nombre;
  document.getElementById('act-duracion').value = A.minutosATexto(datos.duracion_min);
  document.getElementById('act-distancia').value = datos.distancia_km || '';
  document.getElementById('act-importar-bloque').hidden = true;
  calcularActividad();
  const nota = document.getElementById('act-import-nota');
  nota.hidden = false;
  nota.textContent = `Datos leídos de «${archivo.name}»${datos.fecha ? '' : ' (sin fecha: elige el día)'}. Revisa nombre y datos, añade un comentario si quieres y pulsa Guardar.`;
  const foto = await FitNovaImportar.imagenRuta(datos.puntos, A.detalle(datos)).catch(() => null);
  if (foto && goAct.importacion === importacion && !goAct.archivo) {
    goAct.archivo = foto;
    mostrarFotoActividad(URL.createObjectURL(foto));
    nota.textContent += ' Hemos dibujado tu recorrido como foto de la ruta; puedes cambiarla o quitarla.';
  }
}

function getActivities() {
  return goAct.filas;
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function ensureActivityModal() {
  if (document.getElementById('modal-actividad')) return;
  document.querySelector('.app').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modal-actividad">
      <div class="modal">
        <div class="modal-header">
          <h2 id="actividad-modal-title">Registrar actividad</h2>
          <button class="modal-close" type="button" onclick="closeModal('modal-actividad')">✕</button>
        </div>
        <input type="hidden" id="actividad-id" />
        <div class="act-importar" id="act-importar-bloque">
          <button class="btn-secondary" type="button" onclick="elegirArchivoActividad()">⌚ Importar desde reloj o app</button>
          <span>Archivo GPX, TCX o FIT (Garmin, Polar, Suunto, Coros, Strava...)</span>
        </div>
        <input type="file" id="act-import-input" hidden />
        <p class="act-nota act-import-nota" id="act-import-nota" hidden></p>
        <label for="act-nombre">Nombre de la actividad</label>
        <input type="text" id="act-nombre" maxlength="120" placeholder="Ej. Carrera en el parque" />
        <div class="field-row">
          <div><label for="act-fecha">Fecha</label><input type="date" id="act-fecha" /></div>
          <div><label for="act-duracion">Duración (h:mm)</label><input type="text" id="act-duracion" inputmode="numeric" placeholder="Ej. 00:45" /></div>
        </div>
        <p class="section-title">Detalles de la actividad</p>
        <div class="field-row field-row-align">
          <div><label for="act-distancia">Distancia (Km)</label><input type="number" id="act-distancia" step="0.01" min="0" inputmode="decimal" oninput="calcularActividad()" /></div>
          <div><label for="act-pasos">Pasos (est.)</label><input type="number" id="act-pasos" readonly /></div>
          <div><label for="act-calorias" id="act-calorias-label">Calorías (est.)</label><input type="number" id="act-calorias" readonly /></div>
        </div>
        <p class="act-nota">Los pasos (y las calorías, salvo que vengan del reloj) son una estimación a partir de la distancia: 0,63 m por paso y 60 kcal por km.</p>
        <label for="act-comentario">Deja un comentario de la actividad</label>
        <textarea id="act-comentario" maxlength="1000" placeholder="¿Cómo te has sentido?"></textarea>
        <label for="act-foto-input">Foto de la ruta (opcional)</label>
        <div class="upload-box act-foto">
          <img id="act-foto-preview" alt="Foto de la ruta" hidden />
          <label class="act-foto-elegir" for="act-foto-input" id="act-foto-elegir">📷 Subir foto de la ruta</label>
          <input type="file" id="act-foto-input" accept="image/jpeg,image/png,image/webp" hidden />
          <button type="button" class="btn-link" id="act-foto-quitar" onclick="quitarFotoActividad()" hidden>Quitar foto</button>
        </div>
        <p id="actividad-error" class="sesion-error" role="alert"></p>
        <div class="row" style="margin-top:18px;">
          <button class="btn-secondary" type="button" onclick="closeModal('modal-actividad')">Cancelar</button>
          <button class="btn-primary" type="button" id="actividad-guardar" onclick="saveActivity()">Guardar</button>
        </div>
        <button id="actividad-delete" type="button" class="btn-link" onclick="deleteActivity()" style="display:none;margin:14px auto 0;">Eliminar actividad</button>
      </div>
    </div>`);
  document.getElementById('act-foto-input').addEventListener('change', (event) => elegirFotoActividad(event.target.files[0]));
  document.getElementById('act-import-input').addEventListener('change', (event) => importarArchivoActividad(event.target.files[0]));
}

function actividadError(texto) {
  document.getElementById('actividad-error').textContent = texto || '';
}

function mostrarFotoActividad(url) {
  const img = document.getElementById('act-foto-preview');
  img.hidden = !url;
  if (url) img.src = url;
  else img.removeAttribute('src');
  document.getElementById('act-foto-quitar').hidden = !url;
  document.getElementById('act-foto-elegir').textContent = url ? '📷 Cambiar foto' : '📷 Subir foto de la ruta';
}

function elegirFotoActividad(archivo) {
  if (!archivo) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    document.getElementById('act-foto-input').value = '';
    actividadError('Formato no admitido: usa una imagen JPG, PNG o WebP.');
    return;
  }
  actividadError('');
  goAct.archivo = archivo;
  goAct.quitarFoto = false;
  mostrarFotoActividad(URL.createObjectURL(archivo));
}

function quitarFotoActividad() {
  goAct.archivo = null;
  goAct.quitarFoto = Boolean(goAct.fotoActual);
  document.getElementById('act-foto-input').value = '';
  mostrarFotoActividad(null);
}

function openActivityModal(activityId, fecha) {
  ensureActivityModal();
  closeModal('modal-dia');
  const activity = goAct.filas.find((item) => item.id === activityId);
  document.getElementById('actividad-id').value = activity ? activity.id : '';
  document.getElementById('actividad-modal-title').textContent = activity ? 'Editar actividad' : 'Registrar actividad';
  document.getElementById('actividad-delete').style.display = activity ? 'block' : 'none';
  document.getElementById('act-nombre').value = activity ? activity.nombre : '';
  document.getElementById('act-fecha').value = activity ? activity.fecha : (fecha || todayIso());
  document.getElementById('act-duracion').value = activity ? FitNovaActividades.minutosATexto(activity.duracion_min) : '';
  document.getElementById('act-distancia').value = activity && activity.distancia_km ? activity.distancia_km : '';
  document.getElementById('act-comentario').value = activity ? (activity.comentario || '') : '';
  goAct.archivo = null;
  goAct.quitarFoto = false;
  goAct.fotoActual = activity ? activity.foto_ruta : null;
  goAct.importacion = null;
  goAct.caloriasDispositivo = activity ? activity.calorias_kcal : null;
  document.getElementById('act-importar-bloque').hidden = Boolean(activity);
  const nota = document.getElementById('act-import-nota');
  nota.hidden = !(activity && activity.origen === 'archivo');
  nota.textContent = nota.hidden ? '' : '⌚ Actividad importada desde un archivo del reloj o app.';
  document.getElementById('act-foto-input').value = '';
  mostrarFotoActividad(null);
  actividadError('');
  calcularActividad();
  openModal('modal-actividad');
  if (activity && activity.foto_ruta) {
    FitNovaActividades.urlFoto(supabaseClient, activity.foto_ruta).then((url) => {
      if (document.getElementById('actividad-id').value === activity.id && !goAct.archivo && !goAct.quitarFoto) mostrarFotoActividad(url);
    }).catch(() => actividadError('No se pudo cargar la foto de la ruta.'));
  }
}

async function saveActivity() {
  const { fila, error } = FitNovaActividades.validar({
    nombre: document.getElementById('act-nombre').value,
    fecha: document.getElementById('act-fecha').value,
    duracion: document.getElementById('act-duracion').value,
    distancia: document.getElementById('act-distancia').value,
    comentario: document.getElementById('act-comentario').value,
  });
  if (error) return actividadError(error);
  if (!goAct.clienteId) return actividadError('No se ha podido identificar tu cuenta. Revisa tu conexión y recarga la página.');
  const boton = document.getElementById('actividad-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await FitNovaActividades.guardar(supabaseClient, goAct.clienteId, document.getElementById('actividad-id').value || null, fila, {
      archivo: goAct.archivo, quitarFoto: goAct.quitarFoto, fotoAnterior: goAct.fotoActual, importacion: goAct.importacion,
    });
    closeModal('modal-actividad');
    await cargarActividades();
  } catch (e) {
    actividadError(`No se pudo guardar la actividad: ${e.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function eliminarActividad(activity) {
  if (!activity || !confirm(`¿Eliminar la actividad «${activity.nombre}» del ${FitNovaActividades.fechaCorta(activity.fecha)}?`)) return false;
  try {
    await FitNovaActividades.eliminar(supabaseClient, activity);
  } catch (e) {
    alert(`No se pudo eliminar la actividad: ${e.message}`);
    return false;
  }
  await cargarActividades();
  return true;
}

async function deleteActivity() {
  const activity = goAct.filas.find((item) => item.id === document.getElementById('actividad-id').value);
  if (await eliminarActividad(activity)) closeModal('modal-actividad');
}

async function deleteActivityById(activityId) {
  await eliminarActividad(goAct.filas.find((item) => item.id === activityId));
}

async function cargarActividades() {
  try {
    if (!goAct.clienteId) {
      if (!await requireSessionGo()) return;
      const { data, error } = await supabaseClient.rpc('cliente_actual_id');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No hay un cliente vinculado a esta cuenta.');
      goAct.clienteId = data;
    }
    goAct.filas = await FitNovaActividades.consultar(supabaseClient, goAct.clienteId);
    goAct.cargadas = true;
    goAct.error = '';
  } catch (e) {
    goAct.cargadas = false;
    goAct.error = `No se pudieron cargar tus actividades: ${e.message}. Revisa tu conexión y recarga la página.`;
  }
  renderActividades();
}

function renderActividades() {
  if (document.getElementById('agenda-calendar')) renderAgenda();
  if (document.getElementById('inicio-semana')) renderInicio();
  const dia = document.getElementById('modal-dia');
  if (dia && dia.classList.contains('open')) openDayModal(selectedAgendaDay);
  renderAvisoLocales();
}

function renderInicio() {
  const A = FitNovaActividades;
  const hoy = todayIso();
  const deHoy = goAct.filas.filter((a) => a.fecha === hoy);
  const texto = document.getElementById('inicio-hoy-texto');
  if (goAct.error) texto.textContent = goAct.error;
  else if (!goAct.cargadas) texto.textContent = 'Cargando tu actividad de hoy...';
  else if (deHoy.length) {
    texto.innerHTML = `¡Bien hecho! Hoy has registrado: ${deHoy.map((a) => {
      const detalle = A.detalle(a);
      return `<strong>${A.escapar(a.nombre)}</strong>${detalle ? ` (${A.escapar(detalle)})` : ''}`;
    }).join(', ')} 💪`;
  } else texto.textContent = 'Hoy aún no has registrado ninguna actividad. ¡Vamos, tú puedes con esto! 💪';
  document.getElementById('inicio-hoy-boton').textContent = deHoy.length ? 'Registrar otra actividad' : 'Registrar Actividad de Hoy';
  const resumen = A.semana(goAct.cargadas ? goAct.filas : [], hoy);
  document.getElementById('inicio-semana').innerHTML = A.barrasHtml(resumen);
  document.getElementById('inicio-semana-texto').textContent = goAct.error
    ? 'No se pudo calcular el resumen.'
    : (goAct.cargadas ? A.textoSemana(resumen) : 'Cargando...');
}

// Actividades que quedaron en localStorage de versiones anteriores de la app.
function actividadesLocales() {
  try {
    const lista = JSON.parse(localStorage.getItem(ACTIVITIES_KEY));
    return Array.isArray(lista) ? lista : [];
  } catch (error) {
    return [];
  }
}

function renderAvisoLocales() {
  const cont = document.getElementById('actividades-locales');
  if (!cont) return;
  const total = actividadesLocales().length;
  cont.hidden = !total || !goAct.clienteId;
  if (cont.hidden) return;
  cont.innerHTML = `<p>Tienes ${total} ${total === 1 ? 'actividad guardada' : 'actividades guardadas'} solo en este navegador (versión anterior de la app). Súbelas a tu cuenta para no perderlas y que tu profesional las vea.</p>
    <div class="row">
      <button class="btn-secondary" type="button" onclick="descartarActividadesLocales()">Descartar</button>
      <button class="btn-primary" type="button" id="actividades-locales-subir" onclick="migrarActividadesLocales()">Subir a mi cuenta</button>
    </div>
    <p class="sesion-error" id="actividades-locales-error" role="alert"></p>`;
}

async function migrarActividadesLocales() {
  document.getElementById('actividades-locales-subir').disabled = true;
  const fallidas = [];
  for (const a of actividadesLocales()) {
    const { fila, error } = FitNovaActividades.validar({ nombre: a.name, fecha: a.date, duracion: a.duration, distancia: a.distance, comentario: a.comment });
    if (error) {
      fallidas.push(a);
      continue;
    }
    try {
      await FitNovaActividades.guardar(supabaseClient, goAct.clienteId, null, fila);
    } catch (e) {
      fallidas.push(a);
    }
  }
  if (fallidas.length) localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(fallidas));
  else localStorage.removeItem(ACTIVITIES_KEY);
  await cargarActividades();
  const aviso = document.getElementById('actividades-locales-error');
  if (fallidas.length && aviso) aviso.textContent = `${fallidas.length} ${fallidas.length === 1 ? 'no se pudo subir' : 'no se pudieron subir'} (datos incompletos o error de conexión). Puedes reintentarlo o descartarlas.`;
}

function descartarActividadesLocales() {
  if (!confirm('¿Descartar las actividades guardadas solo en este navegador? No se podrán recuperar.')) return;
  localStorage.removeItem(ACTIVITIES_KEY);
  renderAvisoLocales();
}

function openDayModal(date) {
  const A = FitNovaActividades;
  selectedAgendaDay = date;
  const activities = goAct.filas.filter((activity) => activity.fecha === date);
  document.getElementById('dia-modal-title').textContent = formatDate(date);
  const citas = window.FitNovaAgendaGo ? window.FitNovaAgendaGo.htmlDia(date) : '';
  const lista = goAct.error ? `<p class="sesion-error">${A.escapar(goAct.error)}</p>`
    : !goAct.cargadas ? '<p>Cargando actividades...</p>'
    : activities.length ? activities.map((activity) => {
      const detalle = A.detalle(activity);
      return `
    <div class="day-activity">
      <div class="day-activity-info" onclick="openActivityModal('${activity.id}')">
        <strong>${A.escapar(activity.nombre)}${activity.origen === 'archivo' ? ' ⌚' : ''}${activity.foto_ruta ? ' 📷' : ''}</strong>
        <span>${detalle ? `${A.escapar(detalle)} · ` : ''}Pulsa para consultar o editar</span>
      </div>
      <button class="day-activity-open" onclick="openActivityModal('${activity.id}')" title="Abrir actividad">›</button>
      <button class="day-activity-delete" onclick="deleteActivityById('${activity.id}')" title="Eliminar actividad">🗑</button>
    </div>`;
    }).join('') : '<p class="agenda-empty">No hay actividades personales para este día.</p>';
  document.getElementById('dia-activity-list').innerHTML = citas + lista;
  openModal('modal-dia');
}

function addActivityForSelectedDay() {
  openActivityModal(null, selectedAgendaDay);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('inicio-semana') && !document.getElementById('agenda-calendar')) return;
  ensureActivityModal();
  cargarActividades();
});

function toggleAgendaView() {
  const calendar = document.getElementById('agenda-calendar');
  if (!calendar) return;
  calendar.dataset.view = calendar.dataset.view === 'month' ? 'week' : 'month';
  renderAgenda();
}

function cambiarPeriodoAgenda(cambio) {
  const calendar = document.getElementById('agenda-calendar');
  if (calendar.dataset.view === 'month') {
    agendaFechaBase = new Date(agendaFechaBase.getFullYear(), agendaFechaBase.getMonth() + cambio, 1);
  } else agendaFechaBase.setDate(agendaFechaBase.getDate() + cambio * 7);
  renderAgenda();
}

function initAgenda() {
  const calendar = document.getElementById('agenda-calendar');
  if (!calendar.dataset.view) calendar.dataset.view = 'week';
  calendar.onclick = (event) => {
    const dayButton = event.target.closest('[data-agenda-date]');
    if (dayButton) openDayModal(dayButton.dataset.agendaDate);
  };
  renderAgenda();
}

function initEvolution() {
  const tabs = document.querySelectorAll('[data-evolution-tab]');
  if (!tabs.length) return;

  document.querySelectorAll('.metric-help').forEach((button) => button.addEventListener('click', () => openMetricHelp(button.dataset.help)));

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const selectedTab = tab.dataset.evolutionTab;
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    document.getElementById('evolution-metrics').hidden = selectedTab !== 'metrics';
    document.getElementById('evolution-photos').hidden = selectedTab !== 'photos';
    document.querySelector('.evolution-add').hidden = selectedTab !== 'metrics';
  }));
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

function renderAgenda() {
  const calendar = document.getElementById('agenda-calendar');
  const list = document.getElementById('agenda-activity-list');
  if (!calendar || !list) return;
  const view = calendar.dataset.view || 'week';
  document.getElementById('agenda-view-toggle').textContent = view === 'week' ? '▦' : '▤';
  calendar.innerHTML = view === 'week' ? renderWeek() : renderMonth();

  const A = FitNovaActividades;
  calendar.querySelectorAll('[data-agenda-date]').forEach((boton) => {
    const cuenta = goAct.filas.filter((a) => a.fecha === boton.dataset.agendaDate).length;
    if (cuenta) boton.insertAdjacentHTML('beforeend', `<small class="act-count">${cuenta} act.</small>`);
  });
  const item = (activity) => {
    const detalle = A.detalle(activity);
    return `<button class="activity-item" onclick="openActivityModal('${activity.id}')">
      <span><strong>${A.escapar(activity.nombre)}${activity.origen === 'archivo' ? ' ⌚' : ''}${activity.foto_ruta ? ' 📷' : ''}</strong><span>${formatDate(activity.fecha)}${detalle ? ` · ${A.escapar(detalle)}` : ''}</span></span><span>›</span>
    </button>`;
  };
  if (goAct.error) {
    list.innerHTML = `<p class="sesion-error" role="alert">${A.escapar(goAct.error)}</p>`;
  } else if (!goAct.cargadas) {
    list.innerHTML = '<p>Cargando actividades...</p>';
  } else {
    const hoy = todayIso();
    const proximas = goAct.filas.filter((a) => a.fecha >= hoy).sort((x, y) => x.fecha.localeCompare(y.fecha));
    const anteriores = goAct.filas.filter((a) => a.fecha < hoy);
    const abierto = list.querySelector('details')?.open;
    list.innerHTML = `<h3>Hoy y próximas</h3>${proximas.length ? proximas.map(item).join('')
      : '<p class="agenda-empty">Hoy no hay planificado ninguna actividad, puedes incluir tu próxima actividad o tomarte un merecido descanso</p>'}
      <details${abierto ? ' open' : ''}><summary>Actividades anteriores (${anteriores.length})</summary>
        ${anteriores.slice(0, 30).map(item).join('') || '<p>Aún no has registrado actividades anteriores.</p>'}
        ${anteriores.length > 30 ? '<p class="agenda-local-aviso">Se muestran las 30 más recientes. Consulta las demás pulsando su día en el calendario.</p>' : ''}
      </details>`;
  }
  if (window.FitNovaAgendaGo) window.FitNovaAgendaGo.render();
}

function renderWeek() {
  const today = new Date(agendaFechaBase);
  const monday = new Date(today);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = FitNovaSesiones.fechaLocal(date);
    return `<button type="button" class="agenda-week-day${iso === todayIso() ? ' today' : ''}" data-agenda-date="${iso}">${date.toLocaleDateString('es-ES', { weekday: 'short' })}<strong>${date.getDate()}</strong></button>`;
  }).join('');
  return `<div class="agenda-calendar-title"><span>Semana</span><span>${formatDate(FitNovaSesiones.fechaLocal(monday))}</span></div><div class="agenda-week">${days}</div>`;
}

function renderMonth() {
  const today = new Date(agendaFechaBase);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() || 7) - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + totalDays }, (_, index) => {
    if (index < firstDay) return '<span></span>';
    const day = index - firstDay + 1;
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `<button type="button" class="calendar-day${iso === todayIso() ? ' today' : ''}" data-agenda-date="${iso}">${day}</button>`;
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
