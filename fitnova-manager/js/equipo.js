const equipoEstado = { miembros: [], invitaciones: [], miembro: null };
const equipoEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

async function equipoRpc(nombre, args = {}) {
  const { data, error } = await supabaseClient.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

function equipoPintar() {
  const q = document.getElementById('equipo-buscar').value.trim().toLocaleLowerCase('es');
  const lista = equipoEstado.miembros.filter((m) => `${m.nombre} ${m.email}`.toLocaleLowerCase('es').includes(q));
  document.getElementById('equipo-lista').innerHTML = lista.length ? lista.map((m) => `<tr>
    <td><strong>${equipoEsc(m.nombre)}</strong><br>${equipoEsc(m.email)}</td>
    <td>${equipoEsc(m.rol)}</td><td>${Number(m.clientes)}</td><td>Activo</td><td>—</td>
    <td><button class="btn-outline" data-equipo-clientes="${equipoEsc(m.profesional_id)}">Clientes</button>
    <button class="btn-ghost" data-equipo-baja="${equipoEsc(m.profesional_id)}">Retirar</button></td></tr>`).join('')
    : '<tr><td colspan="6">No hay colaboradores que mostrar.</td></tr>';
  document.getElementById('equipo-invitaciones').innerHTML = equipoEstado.invitaciones.length
    ? equipoEstado.invitaciones.map((i) => `<div class="mini-list-item"><div class="info"><strong>${equipoEsc(i.email)}</strong>
      <span>${equipoEsc(i.rol)} · ${new Date(i.expira_en) <= new Date() ? 'Caducada' : `Caduca ${equipoEsc(new Date(i.expira_en).toLocaleDateString('es-ES'))}`}</span></div>
      <button class="btn-ghost" data-equipo-renovar="${equipoEsc(i.id)}">Nuevo enlace</button>
      <button class="btn-ghost" data-equipo-cancelar="${equipoEsc(i.id)}">Cancelar</button></div>`).join('')
    : '<p>No hay invitaciones pendientes.</p>';
}

async function equipoCargar() {
  const errorEl = document.getElementById('equipo-lista-error');
  errorEl.textContent = '';
  try {
    const [miembros, resultado] = await Promise.all([
      equipoRpc('equipo_listar'),
      supabaseClient.from('equipo_invitaciones').select('id,email,rol,estado,expira_en').eq('estado', 'pendiente').order('creado_en', { ascending: false }),
    ]);
    if (resultado.error) throw new Error(resultado.error.message);
    equipoEstado.miembros = miembros;
    equipoEstado.invitaciones = resultado.data;
    equipoPintar();
    await equipoCargarCompaneros();
  } catch (error) {
    errorEl.textContent = `No se pudo cargar el equipo: ${error.message}`;
  }
}

async function equipoCargarCompaneros() {
  const cont = document.getElementById('equipo-companeros');
  try {
    const companeros = await equipoRpc('equipo_companeros');
    cont.innerHTML = companeros.length ? companeros.map((p) => `
      <div class="mini-list-item">
        <div class="avatar-sm" data-companero="${equipoEsc(p.id)}">${equipoEsc(p.nombre.trim().charAt(0).toUpperCase())}</div>
        <div class="info"><strong>${equipoEsc(p.nombre)}</strong></div>
      </div>`).join('') : '<p>No hay otros profesionales en tus equipos.</p>';
    const avisarFoto = () => {
      if (cont.querySelector('[data-foto-error]')) return;
      const aviso = document.createElement('p');
      aviso.dataset.fotoError = '';
      aviso.setAttribute('role', 'status');
      aviso.textContent = 'No se pudieron cargar algunas fotos. Vuelve a abrir Equipo.';
      cont.appendChild(aviso);
    };
    let fallo = false;
    await Promise.all(companeros.filter((p) => p.foto_perfil).map(async (p) => {
      try {
        const { data, error } = await supabaseClient.storage.from('profesionales-fotos')
          .createSignedUrl(`${p.id}/perfil.jpg`, 3600);
        if (error || !data?.signedUrl) throw error || new Error('No se pudo obtener la foto.');
        cont.querySelectorAll('[data-companero]').forEach((avatar) => {
          if (avatar.dataset.companero !== p.id) return;
          const img = document.createElement('img');
          img.alt = `Foto de ${p.nombre}`;
          img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
          img.onload = () => { avatar.textContent = ''; avatar.appendChild(img); };
          img.onerror = avisarFoto;
          img.src = data.signedUrl;
        });
      } catch (error) {
        console.error('Error al cargar foto de equipo:', error);
        fallo = true;
      }
    }));
    if (fallo) avisarFoto();
  } catch (error) {
    cont.textContent = `No se pudieron cargar tus equipos: ${error.message}`;
  }
}

async function equipoInvitar(email, rol) {
  const boton = document.getElementById('equipo-invitar');
  if (boton.disabled) return;
  boton.disabled = true;
  const errorEl = document.getElementById('equipo-error');
  errorEl.textContent = '';
  document.getElementById('equipo-enlace').hidden = true;
  try {
    const [inv] = await equipoRpc('equipo_invitar', { p_email: email, p_rol: rol });
    const url = new URL('equipo-invitacion.html', location.href);
    url.hash = inv.token;
    document.getElementById('equipo-enlace-texto').value = url.href;
    document.getElementById('equipo-enlace').hidden = false;
    enviarCorreoInvitacion('equipo', inv, document.getElementById('equipo-correo-estado'),
      document.getElementById('equipo-correo-reintentar'));
    await equipoCargar();
  } catch (error) {
    errorEl.textContent = `No se pudo crear la invitación: ${error.message}`;
  } finally { boton.disabled = false; }
}

async function equipoClientes(id) {
  const miembro = equipoEstado.miembros.find((m) => m.profesional_id === id);
  if (!miembro) return;
  equipoEstado.miembro = id;
  document.getElementById('equipo-clientes-titulo').textContent = `Clientes · ${miembro.nombre}`;
  const caja = document.getElementById('equipo-clientes-lista');
  const errorEl = document.getElementById('equipo-clientes-error');
  caja.textContent = 'Cargando clientes...';
  errorEl.textContent = '';
  openModal('modal-equipo-clientes');
  try {
    const clientes = await equipoRpc('equipo_clientes', { p_miembro: id });
    caja.innerHTML = clientes.length ? clientes.map((c) => `<label style="display:block;margin:10px 0;">
      <input type="checkbox" data-equipo-cliente="${equipoEsc(c.cliente_id)}" ${c.asignado ? 'checked' : ''} />
      ${equipoEsc(c.nombre)}</label>`).join('') : '<p>No tienes clientes propios para asignar.</p>';
  } catch (error) {
    caja.textContent = '';
    errorEl.textContent = `No se pudieron cargar los clientes: ${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireSession()) return;
  await equipoCargar();
  document.getElementById('equipo-buscar').addEventListener('input', equipoPintar);
  document.getElementById('equipo-abrir-invitar').addEventListener('click', () => {
    document.getElementById('inv-email').value = '';
    document.getElementById('equipo-enlace').hidden = true;
    document.getElementById('equipo-error').textContent = '';
    document.getElementById('equipo-correo-estado').correoSolicitud = null;
    document.getElementById('equipo-correo-estado').textContent = '';
    document.getElementById('equipo-correo-reintentar').hidden = true;
  });
  document.getElementById('equipo-invitar').addEventListener('click', () =>
    equipoInvitar(document.getElementById('inv-email').value, document.getElementById('inv-rol').value));
  document.getElementById('equipo-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.getElementById('equipo-enlace-texto').value); }
    catch (error) { document.getElementById('equipo-error').textContent = `No se pudo copiar. Selecciona y copia el enlace: ${error.message}`; }
  });
  document.addEventListener('click', async (event) => {
    const el = event.target.closest('button');
    if (!el) return;
    const { equipoClientes: clientes, equipoBaja: baja, equipoCancelar: cancelar, equipoRenovar: renovar } = el.dataset;
    try {
      if (clientes) await equipoClientes(clientes);
      if (baja && confirm('¿Retirar al colaborador? Se conservarán los accesos independientes. Si pierde todo acceso a un cliente, sus citas futuras programadas con él se cancelarán.')) {
        await equipoRpc('equipo_retirar_miembro', { p_miembro: baja });
        await equipoCargar();
      }
      if (cancelar && confirm('¿Cancelar esta invitación?')) {
        await equipoRpc('equipo_cancelar_invitacion', { p_invitacion: cancelar });
        await equipoCargar();
      }
      if (renovar) {
        const inv = equipoEstado.invitaciones.find((i) => i.id === renovar);
        if (!inv) throw new Error('Invitación no encontrada.');
        document.getElementById('inv-email').value = inv.email;
        document.getElementById('inv-rol').value = inv.rol;
        openModal('modal-invitar');
        await equipoInvitar(inv.email, inv.rol);
      }
    } catch (error) { document.getElementById('equipo-lista-error').textContent = error.message; }
  });
  document.getElementById('equipo-clientes-lista').addEventListener('change', async (event) => {
    const input = event.target.closest('[data-equipo-cliente]');
    if (!input) return;
    if (!input.checked && !confirm('¿Retirar esta asignación? Si el colaborador pierde todo acceso al cliente, sus citas futuras programadas con él se cancelarán.')) {
      input.checked = true;
      return;
    }
    input.disabled = true;
    const errorEl = document.getElementById('equipo-clientes-error');
    errorEl.textContent = '';
    try {
      await equipoRpc(input.checked ? 'equipo_asignar_cliente' : 'equipo_retirar_cliente',
        { p_miembro: equipoEstado.miembro, p_cliente: input.dataset.equipoCliente });
      await equipoCargar();
    } catch (error) {
      input.checked = !input.checked;
      errorEl.textContent = `No se pudo cambiar la asignación: ${error.message}`;
    } finally { input.disabled = false; }
  });
});
