function escaparHTML(valor) {
  return String(valor || '').replace(/[&<>'"]/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[caracter]);
}

function nombreCompleto(cliente) {
  return `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() || cliente.email;
}

function formatoFechaDashboard(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function mostrarErrorDashboard(mensaje) {
  document.getElementById('dashboard-actividad').innerHTML =
    `<p style="color:var(--rojo);">No se pudo cargar el resumen: ${escaparHTML(mensaje)}</p>`;
}

let dashboardActividad = [];
let dashboardCargado = false;

function renderActividadDashboard() {
  if (!dashboardCargado) return;
  const consulta = document.getElementById('dashboard-buscar').value.trim().toLocaleLowerCase('es');
  const tipo = document.getElementById('dashboard-filtro').value;
  const ultimas = dashboardActividad.filter((item) =>
    (!tipo || item.tipo === tipo) && (!consulta || item.texto.toLocaleLowerCase('es').includes(consulta))).slice(0, 6);
  document.getElementById('dashboard-actividad-count').textContent = ultimas.length;
  document.getElementById('dashboard-actividad').innerHTML = ultimas.length
    ? ultimas.map((item) => `
      <div class="mini-list-item"><div class="info">
        <strong><a href="${item.href}">${escaparHTML(item.texto)}</a></strong>
        <span>${formatoFechaDashboard(item.fecha)}</span>
      </div></div>`).join('')
    : '<p>No hay actividad reciente con estos filtros.</p>';
}

async function cargarDashboard() {
  document.getElementById('dashboard-fecha').textContent =
    `Aquí tienes el resumen de tu negocio hoy, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`;

  try {
  const camposCliente = 'id, nombre, apellidos, email, estado, fecha_alta, fecha_activacion, ultima_actividad';
  const camposInvitacion = 'email_destino, fecha_envio, fecha_aceptacion, clientes(nombre, apellidos, email)';
  const resultados = await Promise.all([
    supabaseClient.rpc('manager_dashboard_contadores'),
    supabaseClient.from('clientes').select(camposCliente).order('fecha_alta', { ascending: false }).limit(5),
    supabaseClient.from('clientes').select(camposCliente).not('ultima_actividad', 'is', null).order('ultima_actividad', { ascending: false }).limit(6),
    supabaseClient.from('clientes').select(camposCliente).not('fecha_activacion', 'is', null).order('fecha_activacion', { ascending: false }).limit(6),
    supabaseClient.from('clientes').select(camposCliente).is('fecha_activacion', null).order('fecha_alta', { ascending: false }).limit(6),
    supabaseClient.from('invitaciones').select(camposInvitacion).not('fecha_envio', 'is', null).order('fecha_envio', { ascending: false }).limit(6),
    supabaseClient.from('invitaciones').select(camposInvitacion).not('fecha_aceptacion', 'is', null).order('fecha_aceptacion', { ascending: false }).limit(6),
  ]);
  const fallo = resultados.find((r) => r.error);
  if (fallo) throw fallo.error;
  const [cuentas, clientesResult, accesos, activaciones, altas, envios, aceptaciones] = resultados.map((r) => r.data);
  const contador = cuentas?.[0];
  if (!contador) throw new Error('No se pudieron obtener los contadores.');
  document.getElementById('dashboard-clientes-activos').textContent = contador.activos;
  document.getElementById('dashboard-invitaciones').textContent = contador.invitaciones;
  document.getElementById('dashboard-leads').textContent = contador.leads;

  const recientes = clientesResult || [];
  document.getElementById('dashboard-recientes-count').textContent = recientes.length;
  document.getElementById('dashboard-recientes').innerHTML = recientes.length
    ? recientes.map((cliente) => `
      <div class="mini-list-item">
        <div class="info">
          <strong><a href="cliente-perfil.html?id=${encodeURIComponent(cliente.id)}">${escaparHTML(nombreCompleto(cliente))}</a></strong>
          <span>${escaparHTML(cliente.estado)} · Alta ${formatoFechaDashboard(cliente.fecha_alta)}</span>
        </div>
      </div>`).join('')
    : '<div class="empty-state" style="padding:16px 4px;"><p>Todavía no tienes clientes.</p><a href="clientes.html" class="btn-primary">Añadir cliente</a></div>';

  const eventoCliente = (c, fecha, texto, tipo) => ({
    fecha: c[fecha], texto: texto(nombreCompleto(c)), tipo, href: `cliente-perfil.html?id=${encodeURIComponent(c.id)}`,
  });
  const nombreInvitacion = (i) => nombreCompleto(i.clientes || {}) || i.email_destino;
  dashboardActividad = [
    ...(accesos || []).map((c) => eventoCliente(c, 'ultima_actividad', (n) => `${n} ha iniciado actividad`, 'acceso')),
    ...(activaciones || []).map((c) => eventoCliente(c, 'fecha_activacion', (n) => `${n} ha completado el onboarding`, 'alta')),
    ...(altas || []).map((c) => eventoCliente(c, 'fecha_alta', (n) => `Alta de ${n}`, 'alta')),
    ...(envios || []).map((i) => ({ fecha: i.fecha_envio, tipo: 'invitacion', texto: `Invitación creada para ${nombreInvitacion(i)}`, href: 'clientes.html?tab=invitaciones' })),
    ...(aceptaciones || []).map((i) => ({ fecha: i.fecha_aceptacion, tipo: 'invitacion', texto: `${nombreInvitacion(i)} ha aceptado la invitación`, href: 'clientes.html' })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  dashboardCargado = true;
  renderActividadDashboard();
  } catch (error) {
    dashboardCargado = false;
    console.error('Error al cargar Dashboard:', error);
    mostrarErrorDashboard(error.message);
    document.getElementById('dashboard-recientes').textContent = 'No se pudieron cargar los clientes recientes.';
    document.getElementById('dashboard-actividad-count').textContent = '—';
    document.getElementById('dashboard-recientes-count').textContent = '—';
  }
}

async function cargarProximasSesionesDashboard() {
  const contenedor = document.getElementById('dashboard-eventos');
  try {
    const { data, error } = await supabaseClient.rpc('profesional_actual_id');
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No hay perfil profesional disponible.');
    const sesiones = await FitNovaSesiones.consultar(supabaseClient, {
      profesionalId: data, proximas: true, limite: 5,
    });
    document.getElementById('dashboard-eventos-count').textContent = sesiones.length;
    contenedor.innerHTML = sesiones.length ? sesiones.map((sesion) => `
      <div class="mini-list-item"><div class="info">
        <strong><a href="agenda.html?cliente=${sesion.cliente_id}">${FitNovaSesiones.escapar(sesion.titulo)}</a></strong>
        <span>${FitNovaSesiones.escapar(FitNovaSesiones.nombre(sesion.clientes))}</span>
        <span>${FitNovaSesiones.escapar(FitNovaSesiones.horario(sesion))}</span>
      </div></div>`).join('') : '<p>No hay próximas sesiones programadas.</p>';
  } catch (error) {
    contenedor.innerHTML = `<p style="color:var(--rojo);" role="alert">No se pudieron cargar las sesiones: ${FitNovaSesiones.escapar(error.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (session) {
    document.getElementById('dashboard-buscar').addEventListener('input', renderActividadDashboard);
    document.getElementById('dashboard-filtro').addEventListener('change', renderActividadDashboard);
    cargarDashboard();
    cargarProximasSesionesDashboard();
  }
});
