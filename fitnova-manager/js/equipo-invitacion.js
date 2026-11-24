document.addEventListener('DOMContentLoaded', async () => {
  const clave = 'fitnova-equipo-invitacion';
  const tokenUrl = location.hash.slice(1);
  if (tokenUrl) {
    sessionStorage.setItem(clave, tokenUrl);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const token = sessionStorage.getItem(clave);
  const estado = document.getElementById('invitacion-estado');
  if (!token) { estado.textContent = 'Falta el enlace de invitación. Solicita uno nuevo al responsable.'; return; }
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { estado.textContent = `No se pudo comprobar la sesión: ${error.message}`; return; }
  if (!data.session) {
    estado.textContent = 'Inicia sesión o crea tu cuenta para continuar.';
    document.getElementById('invitacion-login').hidden = false;
    return;
  }
  estado.textContent = `Sesión iniciada como ${data.session.user.email}.`;
  const aceptar = document.getElementById('invitacion-aceptar');
  aceptar.hidden = false;
  const salir = document.getElementById('invitacion-salir');
  salir.hidden = false;
  salir.addEventListener('click', async () => {
    const resultado = await supabaseClient.auth.signOut({ scope: 'local' });
    if (resultado.error) { estado.textContent = `No se pudo cerrar sesión: ${resultado.error.message}`; return; }
    location.href = 'login.html?equipo=1';
  });
  aceptar.addEventListener('click', async () => {
    aceptar.disabled = true;
    const resultado = await supabaseClient.rpc('equipo_aceptar_invitacion', { p_token: token });
    if (resultado.error) {
      estado.textContent = `No se pudo aceptar: ${resultado.error.message}`;
      aceptar.disabled = false;
      return;
    }
    sessionStorage.removeItem(clave);
    estado.textContent = 'Te has unido al equipo. El responsable podrá asignarte clientes.';
    aceptar.hidden = true;
    salir.hidden = true;
    document.getElementById('invitacion-inicio').hidden = false;
  });
});
