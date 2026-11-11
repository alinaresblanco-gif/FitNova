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

async function cargarDashboard() {
  document.getElementById('dashboard-fecha').textContent =
    `Aquí tienes el resumen de tu negocio hoy, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`;

  const [clientesResult, invitacionesResult] = await Promise.all([
    supabaseClient
      .from('clientes')
      .select('id, nombre, apellidos, email, estado, fecha_alta, fecha_activacion, ultima_actividad')
      .order('fecha_alta', { ascending: false }),
    supabaseClient
      .from('invitaciones')
      .select('id, estado, email_destino, fecha_envio, fecha_aceptacion, clientes(nombre, apellidos, email)')
      .order('fecha_envio', { ascending: false })
      .limit(50),
  ]);

  if (clientesResult.error) {
    mostrarErrorDashboard(clientesResult.error.message);
    return;
  }
  if (invitacionesResult.error) {
    mostrarErrorDashboard(invitacionesResult.error.message);
    return;
  }

  const clientes = clientesResult.data || [];
  const invitaciones = invitacionesResult.data || [];
  const activos = clientes.filter((cliente) => cliente.estado === 'activo');
  const leads = clientes.filter((cliente) => cliente.estado === 'lead');
  const pendientes = invitaciones.filter((invitacion) =>
    ['pendiente', 'enviada'].includes(invitacion.estado));

  document.getElementById('dashboard-clientes-activos').textContent = activos.length;
  document.getElementById('dashboard-invitaciones').textContent = pendientes.length;
  document.getElementById('dashboard-leads').textContent = leads.length;

  const recientes = clientes.slice(0, 5);
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

  const actividad = [];
  clientes.forEach((cliente) => {
    const nombre = nombreCompleto(cliente);
    if (cliente.ultima_actividad) {
      actividad.push({
        fecha: cliente.ultima_actividad,
        texto: `${nombre} ha iniciado actividad`,
        href: `cliente-perfil.html?id=${encodeURIComponent(cliente.id)}`,
      });
    }
    if (cliente.fecha_activacion) {
      actividad.push({
        fecha: cliente.fecha_activacion,
        texto: `${nombre} ha completado el onboarding`,
        href: `cliente-perfil.html?id=${encodeURIComponent(cliente.id)}`,
      });
    } else if (cliente.fecha_alta) {
      actividad.push({
        fecha: cliente.fecha_alta,
        texto: `Alta de ${nombre}`,
        href: `cliente-perfil.html?id=${encodeURIComponent(cliente.id)}`,
      });
    }
  });
  invitaciones.forEach((invitacion) => {
    const cliente = invitacion.clientes || {};
    const nombre = nombreCompleto(cliente) || invitacion.email_destino;
    if (invitacion.fecha_envio) {
      actividad.push({
        fecha: invitacion.fecha_envio,
        texto: `Invitación enviada a ${nombre}`,
        href: 'clientes.html?tab=invitaciones',
      });
    }
    if (invitacion.fecha_aceptacion) {
      actividad.push({
        fecha: invitacion.fecha_aceptacion,
        texto: `${nombre} ha aceptado la invitación`,
        href: 'clientes.html',
      });
    }
  });

  actividad.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const ultimas = actividad.slice(0, 6);
  document.getElementById('dashboard-actividad-count').textContent = ultimas.length;
  document.getElementById('dashboard-actividad').innerHTML = ultimas.length
    ? ultimas.map((item) => `
      <div class="mini-list-item">
        <div class="info">
          <strong><a href="${item.href}">${escaparHTML(item.texto)}</a></strong>
          <span>${formatoFechaDashboard(item.fecha)}</span>
        </div>
      </div>`).join('')
    : '<div class="empty-state"><div class="empty-icon">📋</div><h3>Aún no hay actividad</h3><p>La actividad de tus clientes e invitaciones aparecerá aquí.</p><a href="clientes.html" class="btn-primary">Ver mis clientes</a></div>';
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (session) cargarDashboard();
});
