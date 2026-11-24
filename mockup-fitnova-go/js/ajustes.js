// Ajustes de FitNova Go: carga y guarda los datos reales del cliente.

let ajCliente = null;
let ajObjetivo = null;

function mostrarMensaje(id, texto, esError) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.style.color = esError ? '#E5484D' : '#1da976';
  if (!esError) setTimeout(() => { if (el.textContent === texto) el.textContent = ''; }, 4000);
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
  if (!ajCliente) {
    mostrarMensaje('perfil-msg', 'No se ha podido cargar tu perfil. Vuelve a abrir Ajustes.', true);
    return;
  }
  if (password && password.length < 8) {
    mostrarMensaje('perfil-msg', 'La nueva contraseña debe tener al menos 8 caracteres.', true);
    return;
  }

  let resultado;
  try {
    resultado = await supabaseClient
    .from('clientes')
    .update({
      nombre,
      apellidos: apellidos || null,
      nombre_avatar: avatar || null,
      fecha_nacimiento: nacimiento || null,
      telefono: telefono || null,
    })
      .eq('id', ajCliente.id).select('id').maybeSingle();
  } catch (error) {
    mostrarMensaje('perfil-msg', `No se pudieron confirmar los datos personales: ${error.message}.`, true);
    return;
  }
  const { data, error } = resultado;

  if (error || !data) {
    mostrarMensaje('perfil-msg', `No se pudieron confirmar los datos personales: ${error?.message || 'perfil no disponible'}.`, true);
    return;
  }

  _clienteActual = null;
  if (password) {
    let passError;
    try {
      ({ error: passError } = await supabaseClient.auth.updateUser({ password }));
    } catch (error) {
      passError = error;
    }
    if (passError) {
      mostrarMensaje('perfil-msg', `Los datos personales se guardaron, pero no se pudo confirmar el cambio de contraseña: ${passError.message}`, true);
      return;
    }
    document.getElementById('perfil-password').value = '';
  }

  mostrarMensaje('perfil-msg', 'Cambios guardados ✓', false);
}

async function guardarSobreMi() {
  const generoBtn = document.querySelector('#sobre-genero button.active');
  const genero = generoBtn ? generoBtn.dataset.value : null;
  const valorAltura = document.getElementById('sobre-altura').value;
  const altura = Number(valorAltura);
  const notasObjetivo = document.getElementById('sobre-objetivo').value.trim();
  const notasLesiones = document.getElementById('sobre-lesiones').value.trim();

  if (!ajCliente || !ajObjetivo) {
    mostrarMensaje('sobre-msg', 'No se ha podido cargar tu objetivo. Vuelve a abrir Ajustes antes de guardar.', true);
    return;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(valorAltura) || altura < 0.01 || altura > 999.99) {
    mostrarMensaje('sobre-msg', 'Indica una altura válida en centímetros, con hasta dos decimales.', true);
    return;
  }

  let resultadoCliente;
  try {
    resultadoCliente = await supabaseClient.from('clientes')
      .update({ genero }).eq('id', ajCliente.id).select('id').maybeSingle();
  } catch (error) {
    mostrarMensaje('sobre-msg', `No se pudo confirmar el género: ${error.message}.`, true);
    return;
  }
  const { data: cliente, error: errorCliente } = resultadoCliente;

  if (errorCliente || !cliente) {
    mostrarMensaje('sobre-msg', `No se pudo confirmar el género: ${errorCliente?.message || 'perfil no disponible'}.`, true);
    return;
  }
  _clienteActual = null;

  const cambios = {
    notas_objetivo: notasObjetivo || null,
    notas_lesiones: notasLesiones || null,
    altura_cm: altura,
  };
  let resultadoObjetivo;
  try {
    resultadoObjetivo = await supabaseClient.from('clientes_objetivo').update(cambios)
      .eq('cliente_id', ajCliente.id).select('cliente_id').maybeSingle();
  } catch (error) {
    mostrarMensaje('sobre-msg', `El género se guardó, pero no se pudo confirmar la altura ni las notas: ${error.message}.`, true);
    return;
  }
  const { data: objetivo, error: errorObjetivo } = resultadoObjetivo;
  if (errorObjetivo || !objetivo) {
    mostrarMensaje('sobre-msg', `El género se guardó, pero no se pudo confirmar la altura ni las notas: ${errorObjetivo?.message || 'objetivo no disponible'}.`, true);
    return;
  }
  Object.assign(ajObjetivo, cambios);

  mostrarMensaje('sobre-msg', 'Cambios guardados ✓', false);
}

async function cargarAjustes() {
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

  const { data: objetivo, error: errorObjetivo } = await supabaseClient
    .from('clientes_objetivo')
    .select('altura_cm, notas_objetivo, notas_lesiones')
    .eq('cliente_id', ajCliente.id)
    .maybeSingle();
  ajObjetivo = objetivo;
  if (errorObjetivo || !objetivo) {
    mostrarMensaje('sobre-msg', `No se pudo cargar tu objetivo: ${errorObjetivo?.message || 'no existe una ficha de objetivo'}.`, true);
  }

  if (objetivo) {
    document.getElementById('sobre-altura').value = objetivo.altura_cm ? parseFloat(objetivo.altura_cm) : '';
    document.getElementById('sobre-objetivo').value = objetivo.notas_objetivo || '';
    document.getElementById('sobre-lesiones').value = objetivo.notas_lesiones || '';
  }

  // Peso inicial (primer registro de peso en métricas, solo lectura)
  const { data: primerPeso, error: errorPeso } = await supabaseClient
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
  if (errorPeso && !errorObjetivo && objetivo) {
    mostrarMensaje('sobre-msg', `No se pudo cargar tu peso inicial: ${errorPeso.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarAjustes();
  } catch (error) {
    console.error('Error al cargar Ajustes:', error);
    mostrarMensaje('sobre-msg', `No se pudieron cargar los datos: ${error.message}. Vuelve a abrir Ajustes.`, true);
  }
});
