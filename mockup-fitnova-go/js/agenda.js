(() => {
  const ui = window.FitNovaSesiones;
  let sesiones = [];
  let cargadas = false;
  let errorCarga = '';

  function tarjeta(sesion) {
    return `<article class="sesion-go ${sesion.estado}">
      <h3>${ui.escapar(sesion.titulo)}</h3>
      <p>${ui.escapar(ui.nombre(sesion.profesionales))} · ${ui.escapar(ui.tipos[sesion.tipo])}</p>
      <p>${ui.escapar(ui.horario(sesion))}</p>
      <p>Duración: ${(new Date(sesion.fin) - new Date(sesion.inicio)) / 60000} min</p>
      <p>${ui.escapar(sesion.lugar || 'Sin lugar indicado')}</p>
      <strong>${ui.estados[sesion.estado]}</strong>
    </article>`;
  }

  function htmlDia(fecha) {
    const citas = sesiones.filter((s) => ui.enDia(s, fecha));
    return `<h3>Citas del profesional</h3>${errorCarga ? `<p class="sesion-error">${ui.escapar(errorCarga)}</p>` :
      !cargadas ? '<p>Cargando citas...</p>' : citas.map(tarjeta).join('') || '<p>No hay citas para este día.</p>'}
      <h3>Mis actividades personales</h3>`;
  }

  function render() {
    const contenedor = document.getElementById('go-agenda-sesiones');
    const historialAbierto = contenedor.querySelector('details')?.open;
    if (!cargadas) {
      contenedor.innerHTML = errorCarga ? '' : '<p>Cargando citas...</p>';
      return;
    }
    const proximas = sesiones.filter((s) => s.estado === 'programada' && new Date(s.fin) > new Date());
    const historial = sesiones.filter((s) => !proximas.includes(s)).reverse();
    contenedor.innerHTML = `<h3>Próximas citas</h3>${proximas.map(tarjeta).join('') || '<p>No hay próximas citas.</p>'}
      <details${historialAbierto ? ' open' : ''}><summary>Historial y cancelaciones (${historial.length})</summary>
        ${historial.map(tarjeta).join('') || '<p>No hay citas en el historial.</p>'}</details>`;
    document.querySelectorAll('[data-agenda-date]').forEach((boton) => {
      const cuenta = sesiones.filter((s) => ui.enDia(s, boton.dataset.agendaDate)).length;
      boton.querySelector('.sesion-count')?.remove();
      if (cuenta) {
        const marca = document.createElement('small');
        marca.className = 'sesion-count';
        marca.textContent = `${cuenta} cita(s)`;
        boton.appendChild(marca);
      }
    });
  }

  async function actualizar() {
    const boton = document.getElementById('go-agenda-actualizar');
    boton.disabled = true;
    errorCarga = '';
    document.getElementById('go-agenda-error').textContent = '';
    try {
      if (!await requireSessionGo()) return;
      const { data, error } = await supabaseClient.rpc('cliente_actual_id');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No hay un cliente vinculado a esta cuenta.');
      sesiones = await ui.consultar(supabaseClient, { clienteId: data });
      cargadas = true;
    } catch (error) {
      errorCarga = `No se pudieron cargar las citas: ${error.message}. Pulsa Actualizar citas para reintentar.`;
      document.getElementById('go-agenda-error').textContent = errorCarga;
      sesiones = [];
      cargadas = false;
    } finally {
      boton.disabled = false;
      renderAgenda();
      if (document.getElementById('modal-dia').classList.contains('open')) openDayModal(selectedAgendaDay);
    }
  }

  window.FitNovaAgendaGo = { render, htmlDia };
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('go-agenda-zona').textContent = `Horario local: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    document.getElementById('go-agenda-actualizar').addEventListener('click', actualizar);
    initAgenda();
    actualizar();
  });
})();
