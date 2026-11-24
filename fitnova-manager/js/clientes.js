// Lógica de la vista Clientes: listado real desde Supabase + alta de invitación.

function iniciales(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

// Codifica un valor para incrustarlo en un atributo onclick (escapa también apóstrofes).
function codificarParam(valor) {
  return encodeURIComponent(valor).replace(/'/g, '%27');
}

let clientesCartera = [];
let etiquetasDisponibles = [];
let filtroBusqueda = '';
let filtroEtiqueta = '';
let clientesCargados = false;
let invitacionOcupada = false;

function escaparHTML(valor) {
  return String(valor || '').replace(/[&<>'"]/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[caracter]);
}

function nombreCliente(cliente) {
  return `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() || cliente.email;
}

function obtenerEstadoNombre(estado) {
  return { activo: 'Activo', invitacion_enviada: 'Invitación enviada', lead: 'Lead', archivado: 'Archivado' }[estado] || estado;
}

function clientePasaFiltros(cliente) {
  const consulta = filtroBusqueda.toLocaleLowerCase('es');
  const coincideTexto = !consulta
    || nombreCliente(cliente).toLocaleLowerCase('es').includes(consulta)
    || (cliente.email || '').toLocaleLowerCase('es').includes(consulta);
  const coincideEtiqueta = !filtroEtiqueta
    || cliente.etiquetas.some((etiqueta) => etiqueta.id === filtroEtiqueta);
  return coincideTexto && coincideEtiqueta;
}

function htmlEtiquetasCliente(cliente) {
  if (!etiquetasDisponibles.length) return '<span style="color:var(--gris-texto-suave);">—</span>';
  return `<div class="cliente-etiquetas">${etiquetasDisponibles.map((etiqueta) => {
    const asignada = cliente.etiquetas.some((actual) => actual.id === etiqueta.id);
    return `<button type="button" class="cliente-etiqueta${asignada ? ' asignada' : ''}"
      onclick="alternarEtiqueta('${cliente.id}', '${etiqueta.id}', ${asignada})"
      title="${asignada ? 'Quitar etiqueta' : 'Asignar etiqueta'}">${escaparHTML(etiqueta.nombre)}</button>`;
  }).join('')}</div>`;
}

function htmlFilaCliente(cliente) {
  return `<tr>
    <td class="cell-user">
      <div class="avatar-sm">${escaparHTML(iniciales(nombreCliente(cliente)))}</div>
      <div><strong>${escaparHTML(nombreCliente(cliente))}</strong><span>${escaparHTML(cliente.email)}</span></div>
    </td>
    <td><span class="status-dot ${cliente.estado === 'archivado' ? 'off' : ''}">${escaparHTML(obtenerEstadoNombre(cliente.estado))}</span></td>
    <td>${formatearFecha(cliente.ultima_actividad)}</td>
    <td>${htmlEtiquetasCliente(cliente)}</td>
    <td><a href="cliente-perfil.html?id=${encodeURIComponent(cliente.id)}" class="btn-ghost">Abrir →</a></td>
  </tr>`;
}

function renderClientes() {
  if (!clientesCargados) return;
  const estados = [
    { key: 'activo', id: 'tabla-activos', count: 'count-activos' },
    { key: 'archivado', id: 'tabla-archivados', count: 'count-archivados' },
    { key: 'lead', id: 'tabla-leads', count: 'count-leads' },
  ];

  estados.forEach(({ key, id, count }) => {
    const filas = clientesCartera.filter((cliente) => cliente.estado === key && clientePasaFiltros(cliente));
    const tbody = document.getElementById(id);
    document.getElementById(count).textContent = clientesCartera.filter((cliente) => cliente.estado === key).length;
    tbody.innerHTML = filas.length
      ? filas.map((cliente) => htmlFilaCliente(cliente)).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--gris-texto-suave);">${filtroBusqueda || filtroEtiqueta ? 'No hay resultados con estos filtros.' : `No tienes ${key === 'activo' ? 'clientes activos' : key === 'lead' ? 'leads' : 'clientes archivados'}.`}</td></tr>`;
  });
}

async function cargarClientes() {
  try {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nombre, apellidos, email, estado, ultima_actividad')
    .order('nombre', { ascending: true });
  if (error) {
    throw error;
  }

  const { data: relaciones, error: errorRelaciones } = await supabaseClient
    .from('cliente_etiqueta')
    .select('cliente_id, etiquetas(id, nombre)');
  if (errorRelaciones) {
    throw errorRelaciones;
  }

  const porCliente = new Map();
  (relaciones || []).forEach((relacion) => {
    if (!porCliente.has(relacion.cliente_id)) porCliente.set(relacion.cliente_id, []);
    if (relacion.etiquetas) porCliente.get(relacion.cliente_id).push(relacion.etiquetas);
  });
  clientesCartera = (data || []).map((cliente) => ({
    ...cliente,
    etiquetas: porCliente.get(cliente.id) || [],
  }));
  clientesCargados = true;
  renderClientes();
  return true;
  } catch (error) {
    clientesCargados = false;
    ['tabla-activos', 'tabla-archivados', 'tabla-leads'].forEach((id) => {
      document.getElementById(id).innerHTML =
        `<tr><td colspan="5" style="color:var(--rojo);text-align:center;">No se pudo cargar la cartera: ${escaparHTML(error.message)}</td></tr>`;
    });
    return false;
  }
}

async function cargarEtiquetas() {
  const { data, error } = await supabaseClient
    .from('etiquetas')
    .select('id, nombre, profesional_id')
    .order('nombre', { ascending: true });
  if (error) {
    document.getElementById('etiqueta-error').textContent = error.message;
    return;
  }

  etiquetasDisponibles = (data || []).filter((etiqueta) => etiqueta.profesional_id);
  const selector = document.getElementById('filtro-etiqueta');
  selector.innerHTML = '<option value="">Todas las etiquetas</option>'
    + etiquetasDisponibles.map((etiqueta) =>
      `<option value="${etiqueta.id}">${escaparHTML(etiqueta.nombre)}</option>`).join('');
}

async function crearEtiqueta() {
  const input = document.getElementById('nueva-etiqueta');
  const errorEl = document.getElementById('etiqueta-error');
  const nombre = input.value.trim();
  errorEl.textContent = '';
  if (!nombre) {
    errorEl.textContent = 'Escribe el nombre de la etiqueta.';
    return;
  }

  const { error } = await supabaseClient.rpc('crear_etiqueta', { p_nombre: nombre });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  input.value = '';
  await cargarEtiquetas();
  renderClientes();
}

async function alternarEtiqueta(clienteId, etiquetaId, asignada) {
  const consulta = supabaseClient.from('cliente_etiqueta');
  const resultado = asignada
    ? await consulta.delete().eq('cliente_id', clienteId).eq('etiqueta_id', etiquetaId)
    : await consulta.insert({ cliente_id: clienteId, etiqueta_id: etiquetaId });
  if (resultado.error) {
    alert(`No se pudo actualizar la etiqueta: ${resultado.error.message}`);
    return;
  }
  await cargarClientes();
}

async function cargarInvitaciones() {
  const cont = document.getElementById('lista-invitaciones');
  try {
  const { data, error } = await supabaseClient
    .from('invitaciones')
    .select('id, estado, email_destino, fecha_envio, fecha_expiracion, clientes(nombre, email)')
    .in('estado', ['pendiente', 'enviada', 'expirada'])
    .order('fecha_envio', { ascending: false });

  if (error) {
    throw error;
  }

  const invitaciones = data || [];
  document.getElementById('count-invitaciones').textContent = invitaciones.length;
  if (!invitaciones.length) {
    cont.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✉️</div>
        <h3>No hay invitaciones pendientes</h3>
        <p>Cuando invites a un nuevo cliente, aparecerá aquí hasta que acepte el acceso.</p>
        <button class="btn-primary" onclick="openModal('modal-nuevo-cliente')">Invitar cliente</button>
      </div>`;
    return;
  }

  cont.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Cliente</th><th>Enviada</th><th>Caduca</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${invitaciones.map((inv) => {
          const nombre = inv.clientes?.nombre || inv.email_destino;
          const email = inv.clientes?.email || inv.email_destino;
          const caducada = inv.estado === 'expirada' || new Date(inv.fecha_expiracion) <= new Date();
          return `
          <tr>
            <td class="cell-user">
              <div class="avatar-sm">${iniciales(inv.clientes?.nombre)}</div>
              <div><strong>${escaparHTML(nombre)}</strong><span>${escaparHTML(email)}</span></div>
            </td>
            <td>${formatearFecha(inv.fecha_envio)}</td>
            <td>${formatearFecha(inv.fecha_expiracion)}</td>
            <td><span class="status-dot ${caducada ? 'off' : 'warn'}">${caducada ? 'Caducada' : 'Pendiente'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn-ghost" onclick="reenviarInvitacion('${codificarParam(nombre)}', '${codificarParam(email)}')" title="Genera un enlace nuevo e invalida el anterior">🔁 Reenviar</button>
              <button class="btn-ghost" style="color:var(--rojo);" onclick="cancelarInvitacion('${inv.id}')" title="Cancelar esta invitación">✕ Cancelar</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  } catch (error) {
    document.getElementById('count-invitaciones').textContent = '—';
    cont.innerHTML = `<p role="alert" style="color:var(--rojo);">No se pudieron cargar las invitaciones: ${escaparHTML(error.message)}</p>`;
  }
}

function mostrarEnlaceInvitacion(fila) {
  if (!fila?.token) throw new Error('No se recibió el enlace. Comprueba la invitación antes de intentarlo de nuevo.');
  const enlace = new URL('invitacion.html', FITNOVA_GO_URL);
  enlace.searchParams.set('token', fila.token);

  document.getElementById('nc-form').style.display = 'none';
  document.getElementById('nc-resultado').style.display = 'block';
  document.getElementById('nc-link').value = enlace.toString();
  document.getElementById('nc-copia-estado').textContent = '';
  openModal('modal-nuevo-cliente');
  enviarCorreoInvitacion('cliente', fila, document.getElementById('nc-correo-estado'),
    document.getElementById('nc-correo-reintentar'));
}

async function enviarInvitacion() {
  const nombre = document.getElementById('nc-nombre').value.trim();
  const email = document.getElementById('nc-email').value.trim();
  const errorEl = document.getElementById('nc-error');
  errorEl.textContent = '';

  if (!nombre || !email) {
    errorEl.textContent = 'Rellena el nombre y el email.';
    return;
  }
  if (invitacionOcupada) return;
  invitacionOcupada = true;
  try {
    const { data, error } = await supabaseClient.rpc('crear_invitacion', {
      p_nombre: nombre, p_email: email,
    });
    if (error) throw error;
    mostrarEnlaceInvitacion(Array.isArray(data) ? data[0] : data);
    await Promise.all([cargarInvitaciones(), cargarClientes()]);
  } catch (error) {
    errorEl.textContent = `No se pudo confirmar la invitación: ${error.message}`;
  } finally {
    invitacionOcupada = false;
  }
}

// Reenviar: crea una invitación nueva (la anterior queda cancelada automáticamente).
async function reenviarInvitacion(nombreCodificado, emailCodificado) {
  const nombre = decodeURIComponent(nombreCodificado);
  const email = decodeURIComponent(emailCodificado);

  if (invitacionOcupada) return;
  invitacionOcupada = true;
  try {
    const { data, error } = await supabaseClient.rpc('crear_invitacion', {
      p_nombre: nombre, p_email: email,
    });
    if (error) throw error;
    mostrarEnlaceInvitacion(Array.isArray(data) ? data[0] : data);
    await Promise.all([cargarInvitaciones(), cargarClientes()]);
  } catch (error) {
    alert(`No se pudo reenviar la invitación: ${error.message}`);
  } finally {
    invitacionOcupada = false;
  }
}

async function cancelarInvitacion(invitacionId) {
  if (invitacionOcupada) return;
  if (!confirm('¿Cancelar esta invitación? El enlace dejará de funcionar.')) return;
  invitacionOcupada = true;
  try {
    const { error } = await supabaseClient.rpc('cancelar_invitacion', {
      p_invitacion_id: invitacionId,
    });
    if (error) throw error;
    await Promise.all([cargarInvitaciones(), cargarClientes()]);
  } catch (error) {
    alert(`No se pudo cancelar: ${error.message}`);
  } finally {
    invitacionOcupada = false;
  }
}

async function copiarEnlaceInvitacion() {
  const input = document.getElementById('nc-link');
  input.select();
  const estado = document.getElementById('nc-copia-estado');
  try {
    await navigator.clipboard.writeText(input.value);
    estado.textContent = 'Enlace copiado.';
  } catch (error) {
    estado.textContent = `No se pudo copiar. Selecciona y copia el enlace manualmente: ${error.message}`;
  }
}

function cerrarModalCliente() {
  closeModal('modal-nuevo-cliente');
  document.getElementById('nc-correo-estado').correoSolicitud = null;
  document.getElementById('nc-correo-reintentar').hidden = true;
  document.getElementById('nc-nombre').value = '';
  document.getElementById('nc-email').value = '';
  document.getElementById('nc-error').textContent = '';
  document.getElementById('nc-copia-estado').textContent = '';
  document.getElementById('nc-form').style.display = 'block';
  document.getElementById('nc-resultado').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  // Marca como caducadas las invitaciones vencidas antes de listarlas.
  const { error } = await supabaseClient.rpc('expirar_invitaciones_vencidas');
  if (error) alert(`No se pudieron actualizar las invitaciones caducadas: ${error.message}`);
  document.getElementById('buscar-cliente').addEventListener('input', (event) => {
    filtroBusqueda = event.target.value.trim();
    renderClientes();
  });
  document.getElementById('filtro-etiqueta').addEventListener('change', (event) => {
    filtroEtiqueta = event.target.value;
    renderClientes();
  });
  const resultados = await Promise.all([cargarEtiquetas(), cargarClientes(), cargarInvitaciones()]);
  if (resultados[1]) renderClientes();
});
