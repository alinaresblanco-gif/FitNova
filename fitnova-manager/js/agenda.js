const sesionesUI = window.FitNovaSesiones;
let sesionesManager = [];
let clientesAgenda = [];
let profesionalAgendaId;
let mesAgenda = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let diaAgenda = '';
let operacionSesion = false;

function tarjetaSesion(sesion) {
  const e = sesionesUI.escapar;
  const editable = sesion.estado === 'programada';
  return `<article class="sesion-card">
    <div><h3>${e(sesion.titulo)}</h3>
      <p>${e(sesionesUI.nombre(sesion.clientes))} · ${e(sesionesUI.tipos[sesion.tipo])}</p>
      <p>${e(sesionesUI.horario(sesion))}</p>
      <p>${e(sesion.lugar || 'Sin lugar indicado')}</p>
      <span class="status-dot ${sesion.estado === 'cancelada' ? 'off' : ''}">${e(sesionesUI.estados[sesion.estado])}</span>
    </div>
    <div class="sesion-acciones">
      ${editable ? `<button type="button" class="btn-outline" data-sesion="${sesion.id}" data-accion="editar">Editar</button>
      <button type="button" class="btn-outline" data-sesion="${sesion.id}" data-accion="cancelada">Cancelar sesión</button>
      ${new Date(sesion.fin) <= new Date() ? `<button type="button" class="btn-primary" data-sesion="${sesion.id}" data-accion="completada">Marcar completada</button>` : ''}` : ''}
      <button type="button" class="btn-outline" data-sesion="${sesion.id}" data-accion="eliminar">Eliminar sesión</button>
    </div>
  </article>`;
}

function sesionesFiltradas() {
  const cliente = document.getElementById('agenda-cliente').value;
  const estado = document.getElementById('agenda-estado').value;
  return sesionesManager.filter((sesion) => (!cliente || sesion.cliente_id === cliente)
    && (!estado || sesion.estado === estado));
}

function renderAgendaManager() {
  const sesiones = sesionesFiltradas();
  const ahora = new Date();
  const proximas = sesiones.filter((s) => s.estado === 'programada' && new Date(s.fin) > ahora);
  const historial = sesiones.filter((s) => !proximas.includes(s)).reverse();
  document.getElementById('agenda-sesiones').innerHTML = sesiones.length
    ? `<h2>Próximas sesiones</h2>${proximas.map(tarjetaSesion).join('') || '<p>No hay próximas sesiones.</p>'}
       <h2>Historial y cancelaciones</h2>${historial.map(tarjetaSesion).join('') || '<p>No hay sesiones en el historial.</p>'}`
    : '<div class="empty-state"><h3>No hay sesiones con estos filtros</h3><p>Puedes agendar una sesión para un cliente activo.</p></div>';
  document.getElementById('agenda-mes').textContent = mesAgenda.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const primerDia = (mesAgenda.getDay() + 6) % 7;
  const total = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + 1, 0).getDate();
  const celdas = Array.from({ length: primerDia }, () => '<span></span>');
  for (let dia = 1; dia <= total; dia++) {
    const fecha = sesionesUI.fechaLocal(new Date(mesAgenda.getFullYear(), mesAgenda.getMonth(), dia));
    const cuenta = sesiones.filter((s) => sesionesUI.enDia(s, fecha)).length;
    celdas.push(`<button type="button" data-dia="${fecha}" class="${diaAgenda === fecha ? 'seleccionado' : ''}" aria-label="${fecha}: ${cuenta} sesiones">${dia}${cuenta ? `<small>${cuenta} sesión(es)</small>` : ''}</button>`);
  }
  document.getElementById('agenda-calendario').innerHTML =
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<strong>${d}</strong>`).join('') + celdas.join('');
  const delDia = sesiones.filter((s) => sesionesUI.enDia(s, diaAgenda));
  document.getElementById('agenda-dia').innerHTML = diaAgenda
    ? `<h3>${sesionesUI.escapar(diaAgenda)}</h3>${delDia.map(tarjetaSesion).join('') || '<p>No hay sesiones para este día.</p>'}`
    : '<p>Selecciona un día para consultar sus sesiones.</p>';
}

async function cargarAgendaManager() {
  const { data, error } = await supabaseClient.from('profesional_cliente')
    .select('clientes(id, nombre, apellidos, estado)')
    .eq('profesional_id', profesionalAgendaId);
  if (error) throw new Error(error.message);
  const sesiones = await sesionesUI.consultar(supabaseClient, { profesionalId: profesionalAgendaId });
  clientesAgenda = Array.from(new Map(data.filter((r) => r.clientes).map((r) => [r.clientes.id, r.clientes])).values());
  sesionesManager = sesiones;
  const filtro = document.getElementById('agenda-cliente');
  const filtroAnterior = filtro.value;
  filtro.innerHTML = '<option value="">Todos mis clientes</option>'
    + clientesAgenda.map((c) => `<option value="${c.id}">${sesionesUI.escapar(sesionesUI.nombre(c))}</option>`).join('');
  filtro.value = filtroAnterior;
  const selector = document.getElementById('ses-cliente');
  const clienteAnterior = selector.value;
  selector.innerHTML = '<option value="">Selecciona un cliente</option>'
    + clientesAgenda.filter((c) => c.estado === 'activo').map((c) =>
      `<option value="${c.id}">${sesionesUI.escapar(sesionesUI.nombre(c))}</option>`).join('');
  selector.value = clienteAnterior;
  renderAgendaManager();
}

function abrirSesion(sesionId, fechaInicial = null) {
  if (operacionSesion) return;
  if (!clientesAgenda.some((c) => c.estado === 'activo')) {
    document.getElementById('agenda-error').textContent = 'Para agendar una sesión necesitas un cliente activo y la agenda cargada.';
    return;
  }
  const sesion = sesionId ? sesionesManager.find((s) => s.id === sesionId) : null;
  const errorEl = document.getElementById('ses-error');
  document.getElementById('ses-form').reset();
  errorEl.textContent = '';
  document.getElementById('ses-id').value = sesion ? sesion.id : '';
  document.getElementById('ses-modal-titulo').textContent = sesion ? 'Editar sesión' : 'Agendar sesión';
  document.getElementById('ses-cliente').value = sesion ? sesion.cliente_id
    : document.getElementById('agenda-cliente').value;
  document.getElementById('ses-fecha').value = sesion
    ? sesionesUI.fechaLocal(sesion.inicio)
    : fechaInicial || sesionesUI.fechaLocal(new Date());
  document.getElementById('ses-hora').value = sesion ? sesionesUI.horaLocal(sesion.inicio) : '09:00';
  if (sesion) {
    document.getElementById('ses-nombre').value = sesion.titulo;
    document.getElementById('ses-tipo').value = sesion.tipo;
    document.getElementById('ses-duracion').value = (new Date(sesion.fin) - new Date(sesion.inicio)) / 60000;
    document.getElementById('ses-lugar').value = sesion.lugar || '';
  }
  openModal('modal-nueva-sesion');
}

async function guardarSesion(event) {
  event.preventDefault();
  if (operacionSesion) return;
  const errorEl = document.getElementById('ses-error');
  const guardar = document.getElementById('ses-guardar');
  errorEl.textContent = '';
  operacionSesion = true;
  guardar.disabled = true;
  let guardada = false;
  try {
    const titulo = document.getElementById('ses-nombre').value.trim();
    if (!titulo) throw new Error('Escribe el nombre de la sesión.');
    const horario = sesionesUI.intervalo(document.getElementById('ses-fecha').value,
      document.getElementById('ses-hora').value, document.getElementById('ses-duracion').value);
    const { error } = await supabaseClient.rpc('guardar_sesion', {
      p_cliente_id: document.getElementById('ses-cliente').value,
      p_titulo: titulo,
      p_tipo: document.getElementById('ses-tipo').value,
      p_inicio: horario.inicio, p_fin: horario.fin,
      p_lugar: document.getElementById('ses-lugar').value.trim() || null,
      p_sesion_id: document.getElementById('ses-id').value || null,
    });
    if (error) throw new Error(sesionesUI.mensajeError(error));
    guardada = true;
    closeModal('modal-nueva-sesion');
    document.getElementById('agenda-info').textContent = 'Sesión guardada en Supabase. El cliente la verá al actualizar Go.';
    document.getElementById('agenda-error').textContent = '';
    await cargarAgendaManager();
  } catch (error) {
    (guardada ? document.getElementById('agenda-error') : errorEl).textContent =
      `${guardada ? 'Guardada, pero no se pudo actualizar la lista: ' : ''}${error.message}`;
  } finally {
    operacionSesion = false;
    guardar.disabled = false;
  }
}

async function accionSesion(event) {
  const boton = event.target.closest('[data-accion]');
  if (!boton || operacionSesion) return;
  if (boton.dataset.accion === 'editar') {
    abrirSesion(boton.dataset.sesion);
    return;
  }
  const accion = boton.dataset.accion;
  if (!['cancelada', 'completada', 'eliminar'].includes(accion)) return;
  const mensaje = accion === 'eliminar'
    ? '¿Eliminar definitivamente esta sesión? Desaparecerá del historial y de la agenda del cliente en Go. Esta acción no se puede deshacer.'
    : accion === 'cancelada' ? '¿Cancelar esta sesión? El cliente verá la cancelación en Go.' : '¿Marcar esta sesión como completada?';
  if (!confirm(mensaje)) return;
  operacionSesion = true;
  boton.disabled = true;
  const errorEl = document.getElementById('agenda-error');
  errorEl.textContent = '';
  document.getElementById('agenda-info').textContent = '';
  let guardada = false;
  try {
    const { error } = accion === 'eliminar'
      ? await supabaseClient.rpc('eliminar_sesion', { p_sesion_id: boton.dataset.sesion })
      : await supabaseClient.rpc('cambiar_estado_sesion', { p_sesion_id: boton.dataset.sesion, p_estado: accion });
    if (error) throw new Error(sesionesUI.mensajeError(error));
    guardada = true;
    document.getElementById('agenda-info').textContent = accion === 'eliminar'
      ? 'Sesión eliminada. El cliente dejará de verla al actualizar Go.'
      : 'Estado guardado en Supabase.';
    await cargarAgendaManager();
  } catch (error) {
    errorEl.textContent = `${guardada ? (accion === 'eliminar' ? 'Sesión eliminada, pero no se pudo actualizar la lista: ' : 'Estado guardado, pero no se pudo actualizar la lista: ') : ''}${error.message}`;
  } finally {
    operacionSesion = false;
    boton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireSession()) return;
  const errorEl = document.getElementById('agenda-error');
  const zona = `Horario local: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  document.getElementById('agenda-zona').textContent = zona;
  document.getElementById('ses-zona').textContent = zona;
  document.getElementById('ses-form').addEventListener('submit', guardarSesion);
  document.getElementById('agenda-cliente').addEventListener('change', renderAgendaManager);
  document.getElementById('agenda-estado').addEventListener('change', renderAgendaManager);
  document.querySelector('.page-body').addEventListener('click', accionSesion);
  document.getElementById('agenda-calendario').addEventListener('click', (event) => {
    const boton = event.target.closest('[data-dia]');
    if (boton) { diaAgenda = boton.dataset.dia; renderAgendaManager(); }
  });
  for (const [id, cambio] of [['agenda-anterior', -1], ['agenda-siguiente', 1]]) {
    document.getElementById(id).addEventListener('click', () => {
      mesAgenda.setMonth(mesAgenda.getMonth() + cambio);
      renderAgendaManager();
    });
  }
  async function actualizar() {
    errorEl.textContent = '';
    const boton = document.getElementById('agenda-actualizar');
    boton.disabled = true;
    document.getElementById('agenda-crear').disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('profesional_actual_id');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Completa tu perfil profesional para acceder a la agenda.');
      profesionalAgendaId = data;
      await cargarAgendaManager();
    } catch (error) {
      errorEl.textContent = `No se pudo cargar la agenda: ${error.message}`;
      document.getElementById('agenda-sesiones').innerHTML = '';
    } finally {
      boton.disabled = false;
      document.getElementById('agenda-crear').disabled = !clientesAgenda.some((c) => c.estado === 'activo');
    }
  }
  document.getElementById('agenda-actualizar').addEventListener('click', actualizar);
  await actualizar();
  const clienteId = new URLSearchParams(location.search).get('cliente');
  if (clienteId) {
    const existe = clientesAgenda.some((c) => c.id === clienteId);
    if (existe) {
      document.getElementById('agenda-cliente').value = clienteId;
      document.getElementById('ses-cliente').value = clienteId;
      renderAgendaManager();
    } else errorEl.textContent = 'El cliente solicitado no está disponible en tu cartera.';
  }
  const params = new URLSearchParams(location.search);
  if (params.get('open') === 'modal-nueva-sesion' && clientesAgenda.length) {
    if (clienteId && !clientesAgenda.some((c) => c.id === clienteId && c.estado === 'activo')) {
      errorEl.textContent = 'El cliente solicitado no está activo o no está disponible en tu cartera.';
      return;
    }
    const fecha = params.get('fecha');
    if (fecha) {
      try { sesionesUI.intervalo(fecha, '09:00', 60); }
      catch (error) { errorEl.textContent = `La fecha solicitada no es válida: ${error.message}`; return; }
    }
    abrirSesion(null, fecha);
  }
});
