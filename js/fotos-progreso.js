// Fotos de progreso compartidas por FitNova Go y FitNova Manager
// (tabla clientes_fotos + bucket privado progreso-fotos).
window.FitNovaFotos = (() => {
  const BUCKET = 'progreso-fotos';
  const LADO_MAX = 1600;
  const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

  // Fotos del cliente (más recientes primero) con URL firmada temporal.
  async function consultar(client, clienteId) {
    const { data, error } = await client
      .from('clientes_fotos')
      .select('id, ruta, fecha, creado_en')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    if (!data?.length) return [];
    const { data: firmadas, error: errorFirma } = await client.storage
      .from(BUCKET)
      .createSignedUrls(data.map((f) => f.ruta), 3600);
    if (errorFirma) throw new Error(errorFirma.message);
    const urls = Object.fromEntries((firmadas || []).map((f) => [f.path, f.signedUrl]));
    return data.map((f) => ({ ...f, url: urls[f.ruta] || null }));
  }

  // Reduce la imagen a JPEG de como máximo 1600 px de lado.
  async function comprimir(archivo) {
    if (!TIPOS.includes(archivo.type)) throw new Error(`${archivo.name}: formato no admitido (usa JPG, PNG o WebP).`);
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(imagen.width * escala);
    canvas.height = Math.round(imagen.height * escala);
    canvas.getContext('2d').drawImage(imagen, 0, 0, canvas.width, canvas.height);
    imagen.close?.();
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`${archivo.name}: no se pudo procesar la imagen.`))),
      'image/jpeg',
      0.82,
    ));
  }

  async function subir(client, clienteId, archivo, fecha) {
    const blob = await comprimir(archivo);
    const ruta = `${clienteId}/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`${archivo.name}: ${error.message}`);
    const { error: errorFila } = await client.from('clientes_fotos').insert({ cliente_id: clienteId, ruta, fecha });
    if (errorFila) {
      await client.storage.from(BUCKET).remove([ruta]);
      throw new Error(`${archivo.name}: ${errorFila.message}`);
    }
  }

  async function eliminar(client, foto) {
    const { error } = await client.from('clientes_fotos').delete().eq('id', foto.id);
    if (error) throw new Error(error.message);
    await client.storage.from(BUCKET).remove([foto.ruta]);
  }

  return { consultar, subir, eliminar, comprimir };
})();
