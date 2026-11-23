// Carga la ficha real del cliente (?id=uuid) desde Supabase.

function formatearFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES');
}

async function cargarFichaCliente() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    document.getElementById('cp-nombre').textContent = 'Cliente no encontrado';
    return;
  }

  const { data: cliente, error } = await supabaseClient
    .from('clientes')
    .select('nombre, apellidos, email, telefono, estado, ultima_actividad, fecha_alta')
    .eq('id', id)
    .maybeSingle();

  if (error || !cliente) {
    document.getElementById('cp-nombre').textContent = 'Cliente no encontrado';
    document.getElementById('cp-nombre-2').textContent = error ? error.message : 'No tienes acceso a este cliente';
    return;
  }

  const nombreCompleto = `${cliente.nombre} ${cliente.apellidos || ''}`.trim();
  document.getElementById('cp-nombre').textContent = nombreCompleto;
  document.getElementById('cp-nombre-2').textContent = nombreCompleto;
  document.getElementById('cp-iniciales').textContent = cliente.nombre.trim().charAt(0).toUpperCase();
  document.getElementById('cp-estado').textContent = cliente.estado;
  document.getElementById('cp-email').textContent = cliente.email;
  document.getElementById('cp-telefono').textContent = cliente.telefono || '—';
  document.getElementById('cp-actividad').textContent = `Última actividad: ${formatearFechaHora(cliente.ultima_actividad)}`;
  document.getElementById('cp-alta').textContent = formatearFechaHora(cliente.fecha_alta);

  const { data: objetivo } = await supabaseClient
    .from('clientes_objetivo')
    .select('objetivo_tipo, altura_cm, peso_objetivo_kg, notas_objetivo')
    .eq('cliente_id', id)
    .maybeSingle();

  if (objetivo) {
    const etiquetasObjetivo = {
      perder_peso: 'Perder peso',
      ponerme_en_forma: 'Ponerme en forma',
      ganar_musculo: 'Ganar músculo',
    };
    document.getElementById('cp-objetivo').textContent =
      objetivo.notas_objetivo || etiquetasObjetivo[objetivo.objetivo_tipo] || objetivo.objetivo_tipo;
    document.getElementById('cp-medidas').textContent =
      `${objetivo.altura_cm} cm · objetivo ${objetivo.peso_objetivo_kg ?? '—'} kg`;
  }
}

async function cargarSesionesFicha() {
  const clienteId = new URLSearchParams(location.search).get('id');
  const contenedor = document.getElementById('cp-sesiones');
  if (!clienteId) {
    contenedor.textContent = 'No se puede consultar la agenda sin identificar al cliente.';
    document.getElementById('cp-agendar').hidden = true;
    return;
  }
  document.getElementById('cp-agendar').href =
    `agenda.html?cliente=${encodeURIComponent(clienteId)}&open=modal-nueva-sesion`;
  try {
    const { data, error } = await supabaseClient.rpc('profesional_actual_id');
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No hay perfil profesional disponible.');
    const sesiones = await FitNovaSesiones.consultar(supabaseClient, { profesionalId: data, clienteId });
    contenedor.innerHTML = sesiones.length ? sesiones.map((sesion) => `
      <article class="mini-list-item"><div class="info">
        <strong>${FitNovaSesiones.escapar(sesion.titulo)} · ${FitNovaSesiones.estados[sesion.estado]}</strong>
        <span>${FitNovaSesiones.escapar(FitNovaSesiones.horario(sesion))}</span>
        <span>${FitNovaSesiones.escapar(sesion.lugar || 'Sin lugar indicado')}</span>
        <a href="agenda.html?cliente=${encodeURIComponent(clienteId)}">Gestionar en Agenda</a>
      </div></article>`).join('') : '<p>Este cliente no tiene sesiones agendadas.</p>';
  } catch (error) {
    contenedor.innerHTML = `<p style="color:var(--rojo);" role="alert">No se pudo cargar la agenda: ${FitNovaSesiones.escapar(error.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  cargarFichaCliente();
  cargarSesionesFicha();
});
