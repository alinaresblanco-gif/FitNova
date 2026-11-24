document.addEventListener('DOMContentLoaded', async () => {
  const mensajePerfil = document.getElementById('cuenta-perfil-mensaje');
  const mensajeClave = document.getElementById('cuenta-clave-mensaje');
  const mensajeFoto = document.getElementById('cuenta-foto-mensaje');
  const archivo = document.getElementById('cuenta-archivo');
  const elegir = document.getElementById('cuenta-elegir-foto');
  const borrar = document.getElementById('cuenta-borrar-foto');
  let profesional;

  async function pintarFoto() {
    const imagen = document.getElementById('cuenta-foto');
    const inicial = document.getElementById('cuenta-inicial');
    inicial.textContent = profesional.nombre.trim().charAt(0).toUpperCase();
    if (!profesional.foto_perfil) {
      imagen.hidden = true;
      inicial.hidden = false;
      return;
    }
    const { data, error } = await supabaseClient.storage.from('profesionales-fotos')
      .createSignedUrl(`${profesional.id}/perfil.jpg`, 3600);
    if (error || !data?.signedUrl) throw error || new Error('No se pudo obtener la imagen.');
    imagen.onerror = () => {
      imagen.hidden = true;
      inicial.hidden = false;
      mensajeFoto.textContent = 'No se pudo mostrar la foto. Revisa la conexión o vuelve a subirla.';
    };
    imagen.onload = () => { imagen.hidden = false; inicial.hidden = true; };
    imagen.src = `${data.signedUrl}&v=${Date.now()}`;
  }

  async function actualizar(cambios) {
    const { data, error } = await supabaseClient.from('profesionales').update(cambios)
      .eq('id', profesional.id).select('id').maybeSingle();
    if (error || !data) throw error || new Error('Perfil no disponible.');
    Object.assign(profesional, cambios);
  }

  function bloquearFoto(ocupado) {
    elegir.disabled = ocupado;
    borrar.disabled = ocupado;
    archivo.disabled = ocupado;
  }

  document.getElementById('cuenta-salir').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión en Manager?')) cerrarSesionManager();
  });
  document.getElementById('cuenta-perfil-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = event.submitter;
    const nombre = document.getElementById('cuenta-nombre').value.trim();
    const apellidos = document.getElementById('cuenta-apellidos').value.trim();
    if (!profesional || !nombre || nombre.length > 100 || apellidos.length > 150) {
      mensajePerfil.textContent = 'Comprueba que el perfil esté cargado y el nombre sea válido.';
      return;
    }
    boton.disabled = true;
    try {
      await actualizar({ nombre, apellidos: apellidos || null });
      document.getElementById('cuenta-inicial').textContent = nombre.charAt(0).toUpperCase();
      mensajePerfil.textContent = 'Perfil guardado.';
    } catch (error) {
      mensajePerfil.textContent = `No se pudo confirmar el cambio de perfil: ${error.message}`;
    } finally { boton.disabled = false; }
  });
  document.getElementById('cuenta-clave-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const clave = document.getElementById('cuenta-clave');
    const confirmar = document.getElementById('cuenta-clave-confirmar');
    if (clave.value.length < 8 || clave.value !== confirmar.value) {
      mensajeClave.textContent = 'La contraseña debe tener al menos 8 caracteres y coincidir en ambos campos.';
      return;
    }
    event.submitter.disabled = true;
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: clave.value });
      if (error) throw error;
      clave.value = '';
      confirmar.value = '';
      mensajeClave.textContent = 'Contraseña actualizada.';
    } catch (error) {
      mensajeClave.textContent = `No se pudo confirmar el cambio de contraseña: ${error.message}`;
    } finally { event.submitter.disabled = false; }
  });
  elegir.addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    if (!archivo.files[0]) return;
    bloquearFoto(true);
    let guardada = false;
    try {
      if (!profesional) throw new Error('No se pudo cargar el perfil.');
      const blob = await FitNovaFotos.comprimir(archivo.files[0]);
      if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen procesada supera los 5 MB.');
      const { error } = await supabaseClient.storage.from('profesionales-fotos')
        .upload(`${profesional.id}/perfil.jpg`, blob, { contentType: 'image/jpeg', cacheControl: '0', upsert: true });
      if (error) throw error;
      try { await actualizar({ foto_perfil: true }); }
      catch (error) { throw new Error(`La imagen se subió, pero no se pudo confirmar su enlace al perfil: ${error.message}. Repite la operación o elimina la foto.`); }
      guardada = true;
      await pintarFoto();
      mensajeFoto.textContent = 'Foto guardada.';
    } catch (error) {
      mensajeFoto.textContent = guardada
        ? `La foto se guardó, pero no se pudo mostrar: ${error.message}`
        : `No se pudo completar la operación: ${error.message}`;
    } finally { archivo.value = ''; bloquearFoto(false); }
  });
  borrar.addEventListener('click', async () => {
    if (!confirm('¿Eliminar tu foto de perfil?')) return;
    bloquearFoto(true);
    try {
      if (!profesional) throw new Error('No se pudo cargar el perfil.');
      const { error } = await supabaseClient.storage.from('profesionales-fotos').remove([`${profesional.id}/perfil.jpg`]);
      if (error) throw error;
      try { await actualizar({ foto_perfil: false }); }
      catch (error) { throw new Error(`La imagen se eliminó, pero no se pudo actualizar el perfil: ${error.message}. Repite la eliminación.`); }
      await pintarFoto();
      mensajeFoto.textContent = 'Foto eliminada.';
    } catch (error) {
      mensajeFoto.textContent = `No se pudo completar la operación: ${error.message}`;
    } finally { bloquearFoto(false); }
  });

  try {
    const session = await requireSession();
    if (!session) return;
    const { data, error } = await supabaseClient.from('profesionales')
      .select('id,nombre,apellidos,email,rol,foto_perfil').eq('auth_user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!data) { location.href = 'login.html'; return; }
    profesional = data;
    document.getElementById('cuenta-nombre').value = data.nombre;
    document.getElementById('cuenta-apellidos').value = data.apellidos || '';
    document.getElementById('cuenta-email').value = data.email;
    document.getElementById('cuenta-rol').value = data.rol;
    await pintarFoto();
  } catch (error) {
    mensajePerfil.textContent = `No se pudo cargar la cuenta: ${error.message}`;
  }
});
