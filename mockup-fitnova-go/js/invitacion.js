// Onboarding de invitación: valida el token y completa el alta en una única llamada atómica.

let invitacionToken = null;
let invitacionActual = null;

function ocultarTodasLasVentanas() {
  document.querySelectorAll('[id^="ventana-"], #paso-cargando, #paso-invalido, #paso-completado')
    .forEach((el) => { el.style.display = 'none'; });
}

function irVentana(numero) {
  ocultarTodasLasVentanas();
  document.getElementById(`ventana-${numero}`).style.display = 'block';
}

function valorActivo(grupoId) {
  const activo = document.querySelector(`#${grupoId} .active`);
  return activo ? activo.dataset.value : null;
}

async function pasoCrearCuenta() {
  const errorEl = document.getElementById('v1-error');
  errorEl.textContent = '';

  const apellidos = document.getElementById('v1-apellidos').value.trim();
  const password = document.getElementById('v1-password').value;
  const aceptaTerminos = document.getElementById('v1-terminos').checked;

  if (!apellidos || !password) {
    errorEl.textContent = 'Rellena tus apellidos y una contraseña.';
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
    return;
  }
  if (!aceptaTerminos) {
    errorEl.textContent = 'Debes aceptar los términos y la política de privacidad para continuar.';
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email: invitacionActual.email,
    password,
  });

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  if (!data.session) {
    errorEl.textContent = '';
    ocultarTodasLasVentanas();
    document.getElementById('paso-invalido').style.display = 'block';
    document.getElementById('paso-invalido-mensaje').textContent =
      'Te hemos enviado un email para confirmar tu cuenta. Ábrelo y vuelve a entrar en este mismo enlace.';
    return;
  }

  window.datosOnboarding = { apellidos };
  irVentana(2);
}

async function finalizarOnboarding() {
  const errorEl = document.getElementById('v9-error');
  errorEl.textContent = '';

  const genero = valorActivo('v2-genero');
  const objetivoTipo = valorActivo('v3-objetivo');
  const fechaNacimiento = document.getElementById('v4-nacimiento').value;
  const peso = parseFloat(document.getElementById('v5-peso').value);
  const altura = parseFloat(document.getElementById('v6-altura').value);

  if (!fechaNacimiento || !peso || !altura) {
    errorEl.textContent = 'Revisa que hayas indicado fecha de nacimiento, peso y altura.';
    return;
  }

  const parq = {
    enfermedad_cardiaca_supervisada: valorActivo('parq-1') === 'true',
    dolor_pecho_actividad: valorActivo('parq-2') === 'true',
    dolor_pecho_reposo: valorActivo('parq-3') === 'true',
    perdida_consciencia_mareo: valorActivo('parq-4') === 'true',
    alteracion_osea_articular: valorActivo('parq-5') === 'true',
    medicacion_presion_arterial: valorActivo('parq-6') === 'true',
    otra_razon_medica: valorActivo('parq-7') === 'true',
  };

  const { error } = await supabaseClient.rpc('completar_onboarding', {
    p_token: invitacionToken,
    p_apellidos: window.datosOnboarding.apellidos,
    p_nombre_avatar: null,
    p_telefono: null,
    p_fecha_nacimiento: fechaNacimiento,
    p_genero: genero,
    p_objetivo_tipo: objetivoTipo,
    p_altura_cm: altura,
    p_peso_inicial_kg: peso,
    p_peso_objetivo_kg: null,
    p_notas_objetivo: null,
    p_notas_lesiones: null,
    p_parq: parq,
    p_version_terminos: 'v1',
    p_version_privacidad: 'v1',
  });

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  ocultarTodasLasVentanas();
  document.getElementById('paso-completado').style.display = 'block';
  setTimeout(() => { window.location.href = 'index.html'; }, 1800);
}

document.addEventListener('DOMContentLoaded', async () => {
  invitacionToken = new URLSearchParams(location.search).get('token');
  if (!invitacionToken) {
    ocultarTodasLasVentanas();
    document.getElementById('paso-invalido').style.display = 'block';
    return;
  }

  const { data, error } = await supabaseClient.rpc('obtener_invitacion', { p_token: invitacionToken });
  const fila = Array.isArray(data) ? data[0] : data;

  ocultarTodasLasVentanas();

  if (error || !fila) {
    document.getElementById('paso-invalido').style.display = 'block';
    if (error) document.getElementById('paso-invalido-mensaje').textContent = error.message;
    return;
  }

  invitacionActual = fila;
  document.getElementById('v1-nombre').value = fila.nombre;
  document.getElementById('v1-email').value = fila.email;
  document.getElementById('ventana-1').style.display = 'block';
});
