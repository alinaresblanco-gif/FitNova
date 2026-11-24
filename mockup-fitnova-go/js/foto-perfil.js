document.addEventListener('DOMContentLoaded', () => {
  const elegir = document.getElementById('foto-perfil-elegir');
  const archivo = document.getElementById('foto-perfil-archivo');
  const borrar = document.getElementById('foto-perfil-borrar');
  const mensaje = document.getElementById('foto-perfil-mensaje');

  function ocupado(valor) {
    elegir.disabled = valor;
    borrar.disabled = valor;
    archivo.disabled = valor;
  }

  elegir.addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const foto = archivo.files[0];
    if (!foto) return;
    ocupado(true);
    mensaje.textContent = 'Guardando foto...';
    let guardada = false;
    try {
      const cliente = await cargarClienteActual();
      if (!cliente) throw new Error('No se pudo cargar tu perfil.');
      const blob = await FitNovaFotos.comprimir(foto);
      if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen procesada supera los 5 MB.');
      const ruta = `${cliente.id}/perfil/avatar.jpg`;
      const { error: errorSubida } = await supabaseClient.storage.from('progreso-fotos')
        .upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '0', upsert: true });
      if (errorSubida) throw errorSubida;
      const { data, error } = await supabaseClient.from('clientes')
        .update({ foto_url: ruta }).eq('id', cliente.id).select('foto_url').maybeSingle();
      if (error || !data) {
        throw new Error(`La imagen se subió, pero no se pudo confirmar su enlace al perfil: ${error?.message || 'perfil no disponible'}. Repite la operación o elimina la foto.`);
      }
      cliente.foto_url = ruta;
      guardada = true;
      await mostrarFotoClienteGo(cliente);
      mensaje.textContent = 'Foto guardada.';
    } catch (error) {
      console.error('Error al guardar la foto de perfil:', error);
      mensaje.textContent = guardada
        ? `La foto se guardó, pero no se pudo mostrar: ${error.message}. Vuelve a abrir la página.`
        : `No se pudo completar la operación: ${error.message}`;
    } finally {
      archivo.value = '';
      ocupado(false);
    }
  });

  borrar.addEventListener('click', async () => {
    if (!confirm('¿Eliminar tu foto de perfil?')) return;
    ocupado(true);
    mensaje.textContent = 'Eliminando foto...';
    try {
      const cliente = await cargarClienteActual();
      if (!cliente) throw new Error('No se pudo cargar tu perfil.');
      const ruta = `${cliente.id}/perfil/avatar.jpg`;
      const { error: errorArchivo } = await supabaseClient.storage.from('progreso-fotos').remove([ruta]);
      if (errorArchivo) throw errorArchivo;
      const { data, error } = await supabaseClient.from('clientes')
        .update({ foto_url: null }).eq('id', cliente.id).select('foto_url').maybeSingle();
      if (error || !data) {
        throw new Error(`La imagen se eliminó, pero no se pudo actualizar el perfil: ${error?.message || 'perfil no disponible'}. Repite la eliminación.`);
      }
      cliente.foto_url = null;
      await mostrarFotoClienteGo(cliente);
      mensaje.textContent = 'Foto eliminada.';
    } catch (error) {
      console.error('Error al eliminar la foto de perfil:', error);
      mensaje.textContent = `No se pudo completar la operación: ${error.message}`;
    } finally {
      ocupado(false);
    }
  });
});
