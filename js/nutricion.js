// Diario alimentario del cliente, compartido por FitNova Go y FitNova Manager
// (tablas clientes_comidas, clientes_agua y clientes_nutricion_comentarios;
// fotos de las comidas en el bucket privado progreso-fotos, carpeta <cliente>/comidas/).
window.FitNovaNutricion = (() => {
  const BUCKET = 'progreso-fotos';
  const CAMPOS = 'id, cliente_id, fecha, comida, alimentos, sensacion, foto_ruta, creado_en';
  const CAMPOS_COMENTARIO = 'id, cliente_id, fecha, profesional_id, autor_nombre, autor_rol, texto, creado_en';
  const MAX_VASOS = 40;

  const COMIDAS = [
    { valor: 'desayuno', texto: 'Desayuno', icono: '☕' },
    { valor: 'media_manana', texto: 'Media mañana', icono: '🍎' },
    { valor: 'comida', texto: 'Comida', icono: '🍽️' },
    { valor: 'merienda', texto: 'Merienda', icono: '🥪' },
    { valor: 'cena', texto: 'Cena', icono: '🌙' },
    { valor: 'snack', texto: 'Snack', icono: '🥜' },
    { valor: 'otro', texto: 'Otro', icono: '🍴' },
  ];

  const SENSACIONES = [
    { valor: 'muy_bien', texto: 'Muy bien', icono: '😄' },
    { valor: 'bien', texto: 'Bien', icono: '🙂' },
    { valor: 'regular', texto: 'Regular', icono: '😐' },
    { valor: 'mal', texto: 'Mal', icono: '🙁' },
  ];

  const ROLES = { entrenador: 'Entrenador/a', nutricionista: 'Nutricionista' };

  function escapar(valor) {
    return String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  }

  function fechaLocal(fecha) {
    const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }

  function hoyIso() {
    return fechaLocal(new Date());
  }

  function sumarDias(iso, dias) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return fechaLocal(d);
  }

  function fechaLarga(iso) {
    const texto = new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function etiquetaDia(iso, hoy = hoyIso()) {
    if (iso === hoy) return 'Hoy';
    if (iso === sumarDias(hoy, -1)) return 'Ayer';
    return fechaLarga(iso);
  }

  function comida(valor) {
    return COMIDAS.find((c) => c.valor === valor) || COMIDAS[COMIDAS.length - 1];
  }

  function sensacion(valor) {
    return SENSACIONES.find((s) => s.valor === valor) || null;
  }

  function rol(valor) {
    return ROLES[valor] || 'Profesional';
  }

  function horaCorta(fechaHora) {
    return new Date(fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function ordenComida(valor) {
    const i = COMIDAS.findIndex((c) => c.valor === valor);
    return i < 0 ? COMIDAS.length : i;
  }

  // Convierte los valores del formulario a una fila o devuelve { error }.
  function validar({ fecha, comida: tipo, alimentos, sensacion: sens }) {
    const fila = {
      fecha,
      comida: tipo,
      alimentos: String(alimentos ?? '').trim(),
      sensacion: sens || null,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { error: 'Elige la fecha de la comida.' };
    if (fecha < '2000-01-01' || fecha > sumarDias(hoyIso(), 1)) return { error: 'La fecha no es válida (no puede ser futura).' };
    if (!COMIDAS.some((c) => c.valor === tipo)) return { error: 'Elige el tipo de comida.' };
    if (!fila.alimentos) return { error: 'Escribe qué has comido.' };
    if (fila.alimentos.length > 1000) return { error: 'La descripción no puede superar 1000 caracteres.' };
    if (fila.sensacion && !SENSACIONES.some((s) => s.valor === fila.sensacion)) return { error: 'La sensación no es válida.' };
    return { fila };
  }

  function ordenarComidas(filas) {
    return [...filas].sort((a, b) => (b.fecha.localeCompare(a.fecha))
      || (ordenComida(a.comida) - ordenComida(b.comida))
      || String(a.creado_en).localeCompare(String(b.creado_en)));
  }

  // Comidas, agua y comentarios del cliente entre dos fechas (incluidas).
  async function consultar(client, clienteId, desde, hasta) {
    const [comidas, agua, comentarios] = await Promise.all([
      client.from('clientes_comidas').select(CAMPOS).eq('cliente_id', clienteId)
        .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).range(0, 999),
      client.from('clientes_agua').select('fecha, vasos').eq('cliente_id', clienteId)
        .gte('fecha', desde).lte('fecha', hasta),
      client.from('clientes_nutricion_comentarios').select(CAMPOS_COMENTARIO).eq('cliente_id', clienteId)
        .gte('fecha', desde).lte('fecha', hasta).order('creado_en', { ascending: true }),
    ]);
    const error = comidas.error || agua.error || comentarios.error;
    if (error) throw new Error(error.message);
    const vasos = {};
    (agua.data || []).forEach((a) => { vasos[a.fecha] = a.vasos; });
    return { comidas: ordenarComidas(comidas.data || []), agua: vasos, comentarios: comentarios.data || [] };
  }

  // Agrupa por día (más reciente primero) solo los días que tienen algo registrado.
  function porDia({ comidas, agua, comentarios }) {
    const dias = new Set([...comidas.map((c) => c.fecha), ...comentarios.map((c) => c.fecha)]);
    Object.entries(agua).forEach(([fecha, vasos]) => { if (vasos > 0) dias.add(fecha); });
    return [...dias].sort((a, b) => b.localeCompare(a)).map((fecha) => ({
      fecha,
      comidas: comidas.filter((c) => c.fecha === fecha),
      vasos: agua[fecha] || 0,
      comentarios: comentarios.filter((c) => c.fecha === fecha),
    }));
  }

  async function urlFoto(client, ruta) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(ruta, 3600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async function subirFoto(client, clienteId, archivo) {
    const blob = await window.FitNovaFotos.comprimir(archivo);
    const ruta = `${clienteId}/comidas/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
    return ruta;
  }

  async function borrarFoto(client, ruta) {
    if (ruta) await client.storage.from(BUCKET).remove([ruta]);
  }

  // Crea o actualiza una comida; opciones: archivo (foto nueva), quitarFoto y fotoAnterior.
  async function guardar(client, clienteId, id, fila, { archivo = null, quitarFoto = false, fotoAnterior = null } = {}) {
    const nuevaRuta = archivo ? await subirFoto(client, clienteId, archivo) : null;
    const datos = { ...fila };
    if (nuevaRuta) datos.foto_ruta = nuevaRuta;
    else if (quitarFoto) datos.foto_ruta = null;
    const consulta = id
      ? client.from('clientes_comidas').update(datos).eq('id', id)
      : client.from('clientes_comidas').insert({ ...datos, cliente_id: clienteId });
    const { data, error } = await consulta.select(CAMPOS).single();
    if (error) {
      await borrarFoto(client, nuevaRuta);
      throw new Error(error.message);
    }
    if (fotoAnterior && (nuevaRuta || quitarFoto)) await borrarFoto(client, fotoAnterior);
    return data;
  }

  async function eliminar(client, registro) {
    const { error } = await client.from('clientes_comidas').delete().eq('id', registro.id);
    if (error) throw new Error(error.message);
    await borrarFoto(client, registro.foto_ruta);
  }

  async function guardarAgua(client, fecha, vasos) {
    const n = Math.max(0, Math.min(MAX_VASOS, Math.round(Number(vasos) || 0)));
    const { error } = await client.rpc('guardar_agua', { p_fecha: fecha, p_vasos: n });
    if (error) throw new Error(error.message);
    return n;
  }

  async function comentar(client, clienteId, profesionalId, fecha, texto) {
    const limpio = String(texto ?? '').trim();
    if (!limpio) throw new Error('Escribe el comentario.');
    if (limpio.length > 1000) throw new Error('El comentario no puede superar 1000 caracteres.');
    const { data, error } = await client.from('clientes_nutricion_comentarios')
      .insert({ cliente_id: clienteId, profesional_id: profesionalId, fecha, texto: limpio })
      .select(CAMPOS_COMENTARIO).single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function borrarComentario(client, id) {
    const { error } = await client.from('clientes_nutricion_comentarios').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  function resumenDia(comidasDia, vasos) {
    const partes = [`${comidasDia.length} ${comidasDia.length === 1 ? 'comida' : 'comidas'}`];
    partes.push(`${vasos} ${vasos === 1 ? 'vaso' : 'vasos'} de agua`);
    return partes.join(' · ');
  }

  return {
    COMIDAS, SENSACIONES, MAX_VASOS, escapar, hoyIso, sumarDias, fechaLarga, etiquetaDia, comida, sensacion, rol, horaCorta,
    validar, consultar, porDia, urlFoto, guardar, eliminar, guardarAgua, comentar, borrarComentario, resumenDia,
  };
})();
