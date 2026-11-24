window.FitNovaComunicacion = (() => {
  const tipos = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const escapar = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[c]);

  async function rpc(client, nombre, parametros) {
    const { data, error } = await client.rpc(nombre, parametros);
    if (error) throw new Error(error.message);
    return data;
  }

  async function mensajes(client, id, antes) {
    let consulta = client.from('chat_mensajes').select('*').eq('conversacion_id', id)
      .order('id', { ascending: false }).limit(50);
    if (antes) consulta = consulta.lt('id', antes);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return data.reverse();
  }

  async function mensajesNuevos(client, id, despues) {
    const resultado = [];
    for (;;) {
      const { data, error } = await client.from('chat_mensajes').select('*').eq('conversacion_id', id)
        .gt('id', despues).order('id', { ascending: true }).limit(50);
      if (error) throw new Error(error.message);
      resultado.push(...data);
      if (data.length < 50) return resultado;
      despues = data[data.length - 1].id;
    }
  }

  function validarArchivo(archivo) {
    if (!archivo) return;
    if (!tipos[archivo.type]) throw new Error('Solo se admiten fotos JPG, PNG o WebP y archivos PDF.');
    if (!archivo.size || archivo.size > 5 * 1024 * 1024) throw new Error('El archivo debe ocupar entre 1 byte y 5 MB.');
    if (archivo.name.trim().length > 200 || !archivo.name.trim()) throw new Error('El nombre del archivo no es válido.');
  }

  function rutaArchivo(conversacion, usuario, archivo) {
    validarArchivo(archivo);
    return `${conversacion}/${usuario}/${crypto.randomUUID()}.${tipos[archivo.type]}`;
  }

  function contactoInicial(contactos, tipo, conversacion, cliente) {
    return contactos.find((c) => (conversacion && c.conversacion_id === conversacion)
      || (tipo === 'profesional' && cliente && c.cliente_id === cliente));
  }

  async function subir(client, ruta, archivo) {
    const bucket = client.storage.from('chat-adjuntos');
    const { error } = await bucket.upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (!error) return;
    // Una respuesta perdida puede ocultar una subida ya completada.
    const partes = ruta.split('/');
    const nombre = partes.pop();
    const comprobacion = await bucket.list(partes.join('/'), { search: nombre, limit: 100 });
    if (comprobacion.error) throw new Error(`No se pudo confirmar la subida: ${comprobacion.error.message}`);
    const objeto = comprobacion.data.find((o) => o.name === nombre);
    if (!objeto || Number(objeto.metadata?.size) !== archivo.size || objeto.metadata?.mimetype !== archivo.type) {
      throw new Error(error.message);
    }
  }

  async function eliminarArchivo(client, ruta) {
    const { error } = await client.storage.from('chat-adjuntos').remove([ruta]);
    if (error) throw new Error(error.message);
  }

  async function enlaceArchivo(client, ruta, nombre) {
    const { data, error } = await client.storage.from('chat-adjuntos').createSignedUrl(ruta, 60, { download: nombre });
    if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo obtener el archivo.');
    return data.signedUrl;
  }

  return { escapar, rpc, mensajes, mensajesNuevos, validarArchivo, rutaArchivo, contactoInicial, subir, eliminarArchivo, enlaceArchivo };
})();
