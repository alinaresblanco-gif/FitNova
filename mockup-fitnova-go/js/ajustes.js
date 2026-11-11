// Ajustes de FitNova Go: carga y guarda los datos reales del cliente.

let ajCliente = null;
let ajObjetivo = null;

function mostrarMensaje(id, texto, esError) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.style.color = esError ? '#E5484D' : '#1da976';
  if (!esError) setTimeout(() => { el.textContent = ''; }, 4000);
}

function marcarChipGenero(valor) {
  document.querySelectorAll('#sobre-genero button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === (valor || 'no_especificado'));
  });
}

async function guardarMiPerfil() {
  const nombre = document.getElementById('perfil-nombre').value.trim();
  const apellidos = document.getElementById('perfil-apellidos').value.trim();
  const avatar = document.getElementById('perfil-avatar').value.trim();
  const nacimiento = document.getElementById('perfil-nacimiento').value;
  const telefono = document.getElementById('perfil-telefono').value.trim();
  const password = document.getElementById('perfil-password').value;

  if (!nombre) {
    mostrarMensaje('perfil-msg', 'El nombre no puede quedar vacío.', true);
    return;
  }

  const { error } = await supabaseClient
    .from('clientes')
    .update({
      nombre,
      apellidos: apellidos || null,
      nombre_avatar: avatar || null,
      fecha_nacimiento: nacimiento || null,
      telefono: telefono || null,
    })
    .eq('id', ajCliente.id);

  if (error) {
    mostrarMensaje('perfil-msg', error.message, true);
    return;
  }

  if (password) {
    if (password.length < 8) {
      mostrarMensaje('perfil-msg', 'La nueva contraseña debe tener al menos 8 caracteres.', true);
      return;
    }
    const { error: passError } = await supabaseClient.auth.updateUser({ password });
    if (passError) {
      mostrarMensaje('perfil-msg', passError.message, true);
      return;
    }
    document.getElementById('perfil-password').value = '';
  }

  _clienteActual = null; // invalida la caché para recargar los datos nuevos
  mostrarMensaje('perfil-msg', 'Cambios guardados ✓', false);
}

async function guardarSobreMi() {
  const generoBtn = document.querySelector('#sobre-genero button.active');
  const genero = generoBtn ? generoBtn.dataset.value : null;
  const altura = parseFloat(document.getElementById('sobre-altura').value);
  const notasObjetivo = document.getElementById('sobre-objetivo').value.trim();
  const notasLesiones = document.getElementById('sobre-lesiones').value.trim();

  const { error: errorCliente } = await supabaseClient
    .from('clientes')
    .update({ genero })
    .eq('id', ajCliente.id);

  if (errorCliente) {
    mostrarMensaje('sobre-msg', errorCliente.message, true);
    return;
  }

  if (ajObjetivo) {
    const cambios = {
      notas_objetivo: notasObjetivo || null,
      notas_lesiones: notasLesiones || null,
    };
    if (altura && altura > 0) cambios.altura_cm = altura;

    const { error: errorObjetivo } = await supabaseClient
      .from('clientes_objetivo')
      .update(cambios)
      .eq('cliente_id', ajCliente.id);

    if (errorObjetivo) {
      mostrarMensaje('sobre-msg', errorObjetivo.message, true);
      return;
    }
  }

  mostrarMensaje('sobre-msg', 'Cambios guardados ✓', false);
}

document.addEventListener('DOMContentLoaded', async () => {
  ajCliente = await cargarClienteActual();
  if (!ajCliente) return;

  // Mi perfil
  document.getElementById('perfil-nombre').value = ajCliente.nombre || '';
  document.getElementById('perfil-apellidos').value = ajCliente.apellidos || '';
  document.getElementById('perfil-avatar').value = ajCliente.nombre_avatar || '';
  document.getElementById('perfil-nacimiento').value = ajCliente.fecha_nacimiento || '';
  document.getElementById('perfil-telefono').value = ajCliente.telefono || '';
  document.getElementById('perfil-email').value = ajCliente.email || '';

  // Sobre mí
  marcarChipGenero(ajCliente.genero);

  const { data: objetivo } = await supabaseClient
    .from('clientes_objetivo')
    .select('altura_cm, notas_objetivo, notas_lesiones')
    .eq('cliente_id', ajCliente.id)
    .maybeSingle();
  ajObjetivo = objetivo;

  if (objetivo) {
    document.getElementById('sobre-altura').value = objetivo.altura_cm ? parseFloat(objetivo.altura_cm) : '';
    document.getElementById('sobre-objetivo').value = objetivo.notas_objetivo || '';
    document.getElementById('sobre-lesiones').value = objetivo.notas_lesiones || '';
  }

  // Peso inicial (primer registro de peso en métricas, solo lectura)
  const { data: primerPeso } = await supabaseClient
    .from('clientes_metricas')
    .select('peso_kg')
    .eq('cliente_id', ajCliente.id)
    .not('peso_kg', 'is', null)
    .order('fecha', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primerPeso?.peso_kg) {
    document.getElementById('sobre-peso').value = parseFloat(primerPeso.peso_kg);
  }
});
