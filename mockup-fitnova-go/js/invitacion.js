// El cuestionario no se guarda en el navegador; si se interrumpe, se repite.
let invitacionToken = null;
let invitacionActual = null;
let modoCuentaExistente = false;
let datosOnboarding = null;

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

function emailCoincide(session) {
  return Boolean(session?.user?.email && invitacionActual?.email
    && session.user.email.trim().toLowerCase() === invitacionActual.email.trim().toLowerCase());
}

function mostrarSesionInvitacion(session) {
  const coincidente = emailCoincide(session);
  const conflicto = Boolean(session && !coincidente);
  document.getElementById('v1-credenciales').hidden = Boolean(session);
  document.getElementById('v1-cerrar-sesion').hidden = !session;
  document.getElementById('v1-continuar').disabled = conflicto;
  document.getElementById('v1-sesion').textContent = conflicto
    ? 'Hay otra cuenta de Go abierta. Cierra esa sesión para usar esta invitación.'
    : coincidente ? 'Ya has iniciado sesión con el email de la invitación. Completa de nuevo el cuestionario.' : '';
}

function cambiarModoCuenta() {
  modoCuentaExistente = !modoCuentaExistente;
  const campo = document.getElementById('v1-password');
  campo.value = '';
  campo.autocomplete = modoCuentaExistente ? 'current-password' : 'new-password';
  document.getElementById('v1-password-label').textContent = modoCuentaExistente ? 'Contraseña de tu cuenta' : 'Crea una contraseña';
  document.getElementById('v1-cambiar-modo').textContent = modoCuentaExistente ? 'Necesito crear una cuenta' : 'Ya tengo una cuenta';
  document.getElementById('v1-error').textContent = '';
}

async function cerrarSesionInvitacion() {
  if (!confirm('¿Cerrar la sesión actual de FitNova Go?')) return;
  const errorEl = document.getElementById('v1-error');
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;
    mostrarSesionInvitacion(null);
    modoCuentaExistente = true;
    document.getElementById('v1-password-label').textContent = 'Contraseña de tu cuenta';
    document.getElementById('v1-password').autocomplete = 'current-password';
    document.getElementById('v1-cambiar-modo').textContent = 'Necesito crear una cuenta';
    errorEl.textContent = '';
  } catch (error) {
    errorEl.textContent = `No se pudo cerrar la sesión: ${error.message}`;
  }
}

async function pasoCrearCuenta() {
  const errorEl = document.getElementById('v1-error');
  const boton = document.getElementById('v1-continuar');
  const apellidos = document.getElementById('v1-apellidos').value.trim();
  const password = document.getElementById('v1-password').value;
  errorEl.textContent = '';
  if (!apellidos) { errorEl.textContent = 'Escribe tus apellidos.'; return; }
  if (!document.getElementById('v1-terminos').checked) {
    errorEl.textContent = 'Debes aceptar los términos y la política de privacidad para continuar.';
    return;
  }

  boton.disabled = true;
  let bloquear = false;
  try {
    const actual = await supabaseClient.auth.getSession();
    if (actual.error) throw actual.error;
    let session = actual.data.session;
    if (session && !emailCoincide(session)) {
      bloquear = true;
      mostrarSesionInvitacion(session);
      errorEl.textContent = 'La sesión actual no corresponde al email de esta invitación.';
      return;
    }
    if (!session) {
      if (!password || (!modoCuentaExistente && password.length < 8)) {
        errorEl.textContent = modoCuentaExistente ? 'Escribe la contraseña de tu cuenta.' : 'La contraseña debe tener al menos 8 caracteres.';
        return;
      }
      const resultado = modoCuentaExistente
        ? await supabaseClient.auth.signInWithPassword({ email: invitacionActual.email, password })
        : await supabaseClient.auth.signUp({ email: invitacionActual.email, password });
      if (resultado.error) {
        errorEl.textContent = modoCuentaExistente
          ? resultado.error.message === 'Invalid login credentials'
            ? 'Contraseña incorrecta. Puedes solicitar su recuperación desde el acceso.'
            : `No se pudo iniciar sesión: ${resultado.error.message}`
          : `No se pudo crear la cuenta: ${resultado.error.message}. Si ya tienes una cuenta, selecciona «Ya tengo una cuenta».`;
        return;
      }
      session = resultado.data.session;
      if (!session) {
        errorEl.textContent = 'No hay una sesión activa. Si tu cuenta ya existe, selecciona «Ya tengo una cuenta»; si requiere confirmación, confirma el email antes de continuar.';
        return;
      }
      if (!emailCoincide(session)) throw new Error('La sesión no corresponde a la invitación.');
    }
    datosOnboarding = { apellidos };
    document.getElementById('v1-password').value = '';
    mostrarSesionInvitacion(session);
    irVentana(2);
  } catch (error) {
    console.error('Error al continuar el registro:', error);
    errorEl.textContent = `No se pudo continuar el registro: ${error.message}`;
  } finally {
    boton.disabled = bloquear;
  }
}

function validarVentana(numero) {
  if (numero === 2 && !valorActivo('v2-genero')) return 'Selecciona una opción.';
  if (numero === 3 && !valorActivo('v3-objetivo')) return 'Selecciona tu objetivo.';
  if (numero === 4) {
    const fecha = document.getElementById('v4-nacimiento').value;
    const hoy = new Date();
    const hoyLocal = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    if (!fecha || fecha > hoyLocal) return 'Indica una fecha de nacimiento válida, no futura.';
  }
  if (numero === 5 || numero === 6) {
    const campo = document.getElementById(numero === 5 ? 'v5-peso' : 'v6-altura');
    const valor = Number(campo.value);
    const limite = numero === 5 ? 9999.99 : 999.99;
    if (!campo.value || !Number.isFinite(valor) || valor < 0.01 || valor > limite || !/^\d+(\.\d{1,2})?$/.test(campo.value)) {
      return numero === 5 ? 'Indica un peso válido con hasta dos decimales.' : 'Indica una altura válida con hasta dos decimales.';
    }
  }
  const preguntas = { 7: [1, 2], 8: [3, 4, 5], 9: [6, 7] }[numero] || [];
  if (preguntas.some((n) => !['true', 'false'].includes(valorActivo(`parq-${n}`)))) {
    return 'Responde explícitamente a todas las preguntas antes de continuar.';
  }
  return '';
}

function avanzarVentana(numero) {
  const error = validarVentana(numero);
  document.getElementById(`v${numero}-error`).textContent = error;
  if (!error) irVentana(numero + 1);
}

async function finalizarOnboarding() {
  const errorEl = document.getElementById('v9-error');
  const boton = document.getElementById('v9-finalizar');
  errorEl.textContent = '';
  if (!datosOnboarding?.apellidos || !document.getElementById('v1-apellidos').value.trim()
      || !document.getElementById('v1-terminos').checked) {
    document.getElementById('v1-error').textContent = 'Comprueba tus apellidos y la aceptación antes de finalizar.';
    irVentana(1);
    return;
  }
  datosOnboarding.apellidos = document.getElementById('v1-apellidos').value.trim();
  for (let numero = 2; numero <= 9; numero++) {
    const error = validarVentana(numero);
    if (error) {
      document.getElementById(`v${numero}-error`).textContent = error;
      irVentana(numero);
      return;
    }
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
  boton.disabled = true;
  try {
    const actual = await supabaseClient.auth.getSession();
    if (actual.error) throw actual.error;
    if (!emailCoincide(actual.data.session)) {
      errorEl.textContent = 'La sesión ha caducado o corresponde a otra cuenta. Vuelve a abrir la invitación e inicia sesión de nuevo.';
      return;
    }
    const { error } = await supabaseClient.rpc('completar_onboarding', {
      p_token: invitacionToken, p_apellidos: datosOnboarding.apellidos,
      p_nombre_avatar: null, p_telefono: null,
      p_fecha_nacimiento: document.getElementById('v4-nacimiento').value,
      p_genero: valorActivo('v2-genero'), p_objetivo_tipo: valorActivo('v3-objetivo'),
      p_altura_cm: Number(document.getElementById('v6-altura').value),
      p_peso_inicial_kg: Number(document.getElementById('v5-peso').value),
      p_peso_objetivo_kg: null, p_notas_objetivo: null, p_notas_lesiones: null,
      p_parq: parq, p_version_terminos: 'v1', p_version_privacidad: 'v1',
    });
    if (error) throw error;
    datosOnboarding = null;
    ocultarTodasLasVentanas();
    document.getElementById('paso-completado').style.display = 'block';
    setTimeout(() => { window.location.href = 'index.html'; }, 1800);
  } catch (error) {
    console.error('Error al finalizar el registro:', error);
    errorEl.textContent = `No se pudo finalizar: ${error.message}. Si ya se completó, vuelve al acceso.`;
  } finally {
    boton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  invitacionToken = new URLSearchParams(location.search).get('token');
  try {
    if (!invitacionToken) throw new Error('Falta el enlace de invitación. Solicita uno a tu profesional.');
    const { data, error } = await supabaseClient.rpc('obtener_invitacion', { p_token: invitacionToken });
    if (error) throw error;
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila) throw new Error('La invitación no es válida o ha caducado.');
    invitacionActual = fila;
    document.getElementById('v1-nombre').value = fila.nombre;
    document.getElementById('v1-email').value = fila.email;
    const actual = await supabaseClient.auth.getSession();
    if (actual.error) throw actual.error;
    mostrarSesionInvitacion(actual.data.session);
    irVentana(1);
  } catch (error) {
    console.error('No se pudo comprobar la invitación:', error);
    ocultarTodasLasVentanas();
    document.getElementById('paso-invalido').style.display = 'block';
    document.getElementById('paso-invalido-mensaje').textContent =
      `No se pudo comprobar la invitación: ${error.message}. Revisa la conexión o solicita un enlace nuevo.`;
  }
});
