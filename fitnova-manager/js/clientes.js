// Lógica de la vista Clientes: listado real desde Supabase + alta de invitación.

function iniciales(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

async function cargarClientesActivos() {
  const tbody = document.getElementById('tabla-activos');
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nombre, apellidos, email, estado, ultima_actividad')
    .eq('estado', 'activo')
    .order('nombre', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--rojo);text-align:center;">${error.message}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gris-texto-suave);">Todavía no tienes clientes activos.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((c) => `
    <tr onclick="location.href='cliente-perfil.html?id=${c.id}'">
      <td><input type="checkbox" onclick="event.stopPropagation()" /></td>
      <td class="cell-user">
        <div class="avatar-sm">${iniciales(c.nombre)}</div>
        <div><strong>${c.nombre} ${c.apellidos || ''}</strong><span>${c.email}</span></div>
      </td>
      <td><span class="status-dot">Activo</span></td>
      <td>${formatearFecha(c.ultima_actividad)}</td>
      <td><a href="cliente-perfil.html?id=${c.id}" class="btn-ghost" onclick="event.stopPropagation()">Abrir →</a></td>
    </tr>
  `).join('');
}

async function cargarInvitaciones() {
  const cont = document.getElementById('lista-invitaciones');
  const { data, error } = await supabaseClient
    .from('invitaciones')
    .select('id, estado, email_destino, fecha_envio, fecha_expiracion, clientes(nombre, email)')
    .in('estado', ['pendiente', 'enviada'])
    .order('fecha_envio', { ascending: false });

  if (error) {
    cont.innerHTML = `<p style="color:var(--rojo);">${error.message}</p>`;
    return;
  }

  if (!data.length) {
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
      <thead><tr><th>Cliente</th><th>Enviada</th><th>Caduca</th><th>Estado</th></tr></thead>
      <tbody>
        ${data.map((inv) => `
          <tr>
            <td class="cell-user">
              <div class="avatar-sm">${iniciales(inv.clientes?.nombre)}</div>
              <div><strong>${inv.clientes?.nombre || inv.email_destino}</strong><span>${inv.clientes?.email || inv.email_destino}</span></div>
            </td>
            <td>${formatearFecha(inv.fecha_envio)}</td>
            <td>${formatearFecha(inv.fecha_expiracion)}</td>
            <td><span class="status-dot warn">Pendiente</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
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

  const { data, error } = await supabaseClient.rpc('crear_invitacion', {
    p_nombre: nombre, p_email: email,
  });

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  const fila = Array.isArray(data) ? data[0] : data;
  const enlace = new URL('../mockup-fitnova-go/invitacion.html', window.location.href);
  enlace.searchParams.set('token', fila.token);

  document.getElementById('nc-form').style.display = 'none';
  document.getElementById('nc-resultado').style.display = 'block';
  document.getElementById('nc-link').value = enlace.toString();

  cargarInvitaciones();
}

function copiarEnlaceInvitacion() {
  const input = document.getElementById('nc-link');
  input.select();
  navigator.clipboard.writeText(input.value);
}

function cerrarModalCliente() {
  closeModal('modal-nuevo-cliente');
  document.getElementById('nc-nombre').value = '';
  document.getElementById('nc-email').value = '';
  document.getElementById('nc-error').textContent = '';
  document.getElementById('nc-form').style.display = 'block';
  document.getElementById('nc-resultado').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  cargarClientesActivos();
  cargarInvitaciones();
});
