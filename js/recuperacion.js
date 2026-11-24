(function () {
  const fragmento = new URLSearchParams(window.location.hash.slice(1));
  const enlaceRecuperacion = fragmento.get('type') === 'recovery'
    && Boolean(fragmento.get('access_token'))
    && Boolean(fragmento.get('refresh_token'))
    && !fragmento.has('error');

  async function solicitar(cliente, elementos) {
    const { email, error, info, boton } = elementos;
    error.textContent = '';
    info.textContent = '';
    if (!email.value.trim() || !email.validity.valid) {
      error.textContent = 'Escribe un email válido para recuperar tu contraseña.';
      return;
    }

    boton.disabled = true;
    try {
      const redirectTo = new URL('recuperar.html', window.location.href).href;
      const resultado = await cliente.auth.resetPasswordForEmail(email.value.trim(), { redirectTo });
      if (resultado.error) {
        console.error('Error al solicitar recuperación:', resultado.error);
        error.textContent = 'No se pudo solicitar la recuperación. Inténtalo de nuevo más tarde.';
        return;
      }
      info.textContent = 'Si existe una cuenta con ese email y el servicio de correo está disponible, recibirás instrucciones para recuperar tu contraseña.';
    } catch (causa) {
      console.error('Error de conexión al solicitar recuperación:', causa);
      error.textContent = 'No se pudo conectar para solicitar la recuperación. Comprueba tu conexión e inténtalo de nuevo.';
    } finally {
      boton.disabled = false;
    }
  }

  async function iniciar(cliente) {
    const estado = document.getElementById('recuperacion-estado');
    const formulario = document.getElementById('recuperacion-formulario');
    const boton = document.getElementById('recuperacion-guardar');
    const clave = document.getElementById('recuperacion-clave');
    const confirmacion = document.getElementById('recuperacion-confirmacion');
    const acceso = document.getElementById('recuperacion-acceso');

    if (document.body.dataset.app === 'manager' && sessionStorage.getItem('fitnova-equipo-invitacion')) {
      acceso.href = 'login.html?equipo=1';
    }

    try {
      const { data, error } = await cliente.auth.getSession();
      if (error) console.error('Error al comprobar el enlace de recuperación:', error);
      if (!enlaceRecuperacion || error || !data.session) {
        estado.textContent = 'El enlace no es válido, ya se ha utilizado o ha caducado. Solicita uno nuevo desde el acceso.';
        return;
      }
      estado.textContent = 'Escribe y confirma tu nueva contraseña.';
      formulario.hidden = false;
    } catch (causa) {
      console.error('Error al comprobar el enlace de recuperación:', causa);
      estado.textContent = 'No se pudo comprobar el enlace. Comprueba tu conexión y solicita uno nuevo si es necesario.';
      return;
    } finally {
      history.replaceState(history.state, '', window.location.pathname + window.location.search);
    }

    formulario.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (clave.value.length < 8) {
        estado.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        return;
      }
      if (clave.value !== confirmacion.value) {
        estado.textContent = 'Las contraseñas no coinciden.';
        return;
      }
      boton.disabled = true;
      try {
        const { error } = await cliente.auth.updateUser({ password: clave.value });
        if (error) {
          console.error('Error al cambiar la contraseña:', error);
          estado.textContent = 'No se pudo cambiar la contraseña. El enlace puede haber caducado o la contraseña no cumple los requisitos. Solicita otro enlace e inténtalo de nuevo.';
          return;
        }
        clave.value = '';
        confirmacion.value = '';
        formulario.hidden = true;
        estado.textContent = 'Contraseña actualizada. Ya puedes volver al acceso.';
      } catch (causa) {
        console.error('Error de conexión al cambiar la contraseña:', causa);
        estado.textContent = 'No se pudo conectar para cambiar la contraseña. Comprueba tu conexión e inténtalo de nuevo.';
      } finally {
        boton.disabled = false;
      }
    });
  }

  window.FitNovaRecuperacion = { solicitar, iniciar };
})();
