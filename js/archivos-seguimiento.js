(function () {
  const bucket = 'seguimiento-archivos';
  const tipos = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    doc: 'application/msword', xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  async function montar(client, clienteId, userId, raiz, esCliente = false) {
    const clave = `fitnova-archivos-pendientes-${userId}`;
    const leerPendientes = () => {
      const datos = JSON.parse(localStorage.getItem(clave) || '[]');
      if (!Array.isArray(datos)) throw new Error('No se puede leer la lista de archivos pendientes.');
      return datos;
    };
    const guardarPendientes = (datos) => localStorage.setItem(clave, JSON.stringify(datos));
    const anotar = (ruta) => guardarPendientes([...new Set([...leerPendientes(), ruta])]);
    const olvidar = (ruta) => guardarPendientes(leerPendientes().filter((r) => r !== ruta));
    raiz.innerHTML = `<p>Comparte PDF, imágenes JPG, PNG o WebP y documentos Word o Excel de hasta 20 MB.</p>
      <form data-archivos-form><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" required />
        <button type="submit">Subir archivo</button></form>
      <p data-archivos-error role="alert"></p>
      <button type="button" data-archivos-recuperar hidden>Revisar archivos pendientes</button>
      <div data-archivos-lista><p>Cargando archivos...</p></div>`;
    const errorEl = raiz.querySelector('[data-archivos-error]');
    const listaEl = raiz.querySelector('[data-archivos-lista]');
    const recuperar = raiz.querySelector('[data-archivos-recuperar]');
    let archivos = [];

    function pintarPendientes() { recuperar.hidden = !leerPendientes().length; }
    async function cargar() {
      const { data, error } = await client.from('clientes_archivos')
        .select('id,ruta,nombre,tipo,autor_user_id,creado_en')
        .eq('cliente_id', clienteId).order('creado_en', { ascending: false });
      if (error) throw new Error(error.message);
      archivos = data;
      listaEl.innerHTML = archivos.length ? archivos.map((a) => `<div style="padding:10px 0;border-bottom:1px solid #ddd;">
        <strong>${esc(a.nombre)}</strong><br><small>${esc(new Date(a.creado_en).toLocaleString('es-ES'))}</small>
        <button type="button" data-archivo-abrir="${esc(a.id)}">Abrir / descargar</button>
        ${esCliente || a.autor_user_id === userId ? `<button type="button" data-archivo-borrar="${esc(a.id)}">Eliminar</button>` : ''}</div>`).join('')
        : '<p>No hay archivos compartidos.</p>';
      pintarPendientes();
    }
    try { await cargar(); } catch (error) { errorEl.textContent = `No se pudieron cargar los archivos: ${error.message}`; }

    raiz.querySelector('[data-archivos-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const file = form.querySelector('input').files[0];
      errorEl.textContent = '';
      const extension = file?.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      const tipo = tipos[extension];
      if (!file || !tipo || (file.type && file.type !== tipo && file.type !== 'application/octet-stream')
        || file.size < 1 || file.size > 20971520 || file.name.length > 200) {
        errorEl.textContent = 'Elige un archivo admitido de hasta 20 MB y con nombre de hasta 200 caracteres.';
        return;
      }
      const button = form.querySelector('button');
      button.disabled = true;
      let ruta;
      try {
        ruta = `${clienteId}/${userId}/${crypto.randomUUID()}`;
        anotar(ruta);
        const subida = await client.storage.from(bucket).upload(ruta, file, { contentType: tipo, upsert: false });
        if (subida.error) throw new Error(subida.error.message);
        const registro = await client.rpc('registrar_archivo_seguimiento', {
          p_cliente: clienteId, p_ruta: ruta, p_nombre: file.name, p_tipo: tipo,
        });
        if (registro.error) throw new Error(registro.error.message);
        olvidar(ruta);
        form.reset();
        await cargar();
      } catch (error) {
        errorEl.textContent = `No se completó la subida: ${error.message}. Revisa los archivos pendientes.`;
        try { pintarPendientes(); } catch (storageError) { errorEl.textContent += ` ${storageError.message}`; }
      } finally { button.disabled = false; }
    });

    recuperar.addEventListener('click', async () => {
      recuperar.disabled = true;
      errorEl.textContent = '';
      try {
        for (const ruta of leerPendientes()) {
          const { data, error } = await client.from('clientes_archivos').select('id').eq('ruta', ruta).maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) {
            const borrado = await client.storage.from(bucket).remove([ruta]);
            if (borrado.error) throw new Error(borrado.error.message);
            const fin = await client.rpc('finalizar_limpieza_archivo', { p_ruta: ruta });
            if (fin.error) throw new Error(fin.error.message);
          }
          olvidar(ruta);
        }
        await cargar();
      } catch (error) { errorEl.textContent = `No se pudieron revisar los archivos pendientes: ${error.message}`; }
      finally { recuperar.disabled = false; }
    });

    listaEl.addEventListener('click', async (event) => {
      const abrir = event.target.closest('[data-archivo-abrir]');
      const borrar = event.target.closest('[data-archivo-borrar]');
      if (!abrir && !borrar) return;
      const archivo = archivos.find((a) => a.id === (abrir || borrar).dataset[abrir ? 'archivoAbrir' : 'archivoBorrar']);
      if (!archivo) return;
      errorEl.textContent = '';
      event.target.disabled = true;
      try {
        if (abrir) {
          const resultado = await client.storage.from(bucket).createSignedUrl(archivo.ruta, 60, { download: archivo.nombre });
          if (resultado.error) throw new Error(resultado.error.message);
          const a = document.createElement('a');
          a.href = resultado.data.signedUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.click();
        } else if (confirm(`¿Eliminar ${archivo.nombre}?`)) {
          anotar(archivo.ruta);
          const resultado = await client.rpc('quitar_archivo_seguimiento', { p_id: archivo.id });
          if (resultado.error) throw new Error(`${resultado.error.message}. Revisa los archivos pendientes.`);
          const borrado = await client.storage.from(bucket).remove([resultado.data]);
          if (borrado.error) throw new Error(`${borrado.error.message}. Revisa los archivos pendientes.`);
          const fin = await client.rpc('finalizar_limpieza_archivo', { p_ruta: archivo.ruta });
          if (fin.error) throw new Error(`${fin.error.message}. Revisa los archivos pendientes.`);
          olvidar(archivo.ruta);
          await cargar();
        }
      } catch (error) {
        errorEl.textContent = `No se pudo completar la operación: ${error.message}`;
        try { pintarPendientes(); } catch (storageError) { errorEl.textContent += ` ${storageError.message}`; }
      } finally { event.target.disabled = false; }
    });
  }
  window.FitNovaArchivos = { montar };
})();
