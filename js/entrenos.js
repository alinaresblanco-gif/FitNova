// Entrenamientos compartidos por FitNova Go y FitNova Manager: catálogo de
// ejercicios y plantillas del profesional (ejercicios, workouts), workouts
// asignados al cliente (clientes_workouts), lo que el cliente realiza
// (clientes_workout_registros) y comentarios del profesional.
window.FitNovaEntrenos = (() => {
  const CAMPOS_EJERCICIO = 'id, nombre, categoria, instrucciones, video_url, actualizado_en';
  const CAMPOS_WORKOUT = 'id, nombre, descripcion, ejercicios, actualizado_en';
  const CAMPOS_ASIGNADO = 'id, cliente_id, profesional_id, workout_origen_id, fecha, nombre, descripcion, ejercicios, programa_nombre, programa_semana, creado_en, actualizado_en';
  const CAMPOS_REGISTRO = 'id, workout_id, cliente_id, fecha, duracion_min, esfuerzo, comentario, resultados, creado_en, actualizado_en';
  const CAMPOS_COMENTARIO = 'id, workout_id, cliente_id, profesional_id, autor_nombre, autor_rol, texto, creado_en';
  const MAX_EJERCICIOS = 40;
  const MAX_SERIES = 20;

  const CATEGORIAS = [
    { valor: 'fuerza', texto: 'Fuerza' },
    { valor: 'cardio', texto: 'Cardio' },
    { valor: 'core', texto: 'Core' },
    { valor: 'movilidad', texto: 'Movilidad' },
    { valor: 'estiramiento', texto: 'Estiramiento' },
    { valor: 'otro', texto: 'Otro' },
  ];

  const ESTADOS = {
    realizado: { texto: 'Realizado', icono: '✅' },
    pendiente: { texto: 'Pendiente', icono: '🕒' },
    no_registrado: { texto: 'Sin registrar', icono: '⚠️' },
  };

  const ROLES = { entrenador: 'Entrenador/a', nutricionista: 'Nutricionista' };

  const VIDEO_RE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/|(player\.)?vimeo\.com\/)[A-Za-z0-9_./?=&%-]+$/;

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
    if (iso === sumarDias(hoy, 1)) return 'Mañana';
    return fechaLarga(iso);
  }

  function categoria(valor) {
    return CATEGORIAS.find((c) => c.valor === valor) || null;
  }

  function rol(valor) {
    return ROLES[valor] || 'Profesional';
  }

  function segundos(seg) {
    const n = Number(seg);
    if (!n) return '';
    const min = Math.floor(n / 60);
    const s = n % 60;
    if (!min) return `${s} s`;
    return s ? `${min} min ${s} s` : `${min} min`;
  }

  function numero(valor) {
    return Number(valor).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }

  // ---------------------------------------------------------------- vídeos
  function videoValido(url) {
    return !url || (String(url).length <= 500 && VIDEO_RE.test(url));
  }

  // URL para incrustar el vídeo (YouTube sin cookies o Vimeo), o null.
  function videoEmbed(url) {
    if (!url || !videoValido(url)) return null;
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www|m)\./, '');
    const partes = u.pathname.split('/').filter(Boolean);
    let id = null;
    if (host === 'youtu.be') id = partes[0];
    else if (host === 'youtube.com') {
      id = partes[0] === 'watch' ? u.searchParams.get('v') : partes[1];
    }
    if (id) {
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const numeros = partes.filter((p) => /^\d+$/.test(p));
      const vid = numeros[0];
      if (!vid) return null;
      const despues = partes[partes.indexOf(vid) + 1];
      const hash = u.searchParams.get('h') || (despues && /^[a-f0-9]{6,20}$/i.test(despues) ? despues : '');
      return `https://player.vimeo.com/video/${vid}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`;
    }
    return null;
  }

  function videoHtml(url, titulo) {
    const src = videoEmbed(url);
    if (!src) return '';
    return `<div class="entreno-video" style="position:relative;padding-top:56.25%;border-radius:10px;overflow:hidden;background:#000;">
      <iframe src="${escapar(src)}" title="${escapar(titulo || 'Vídeo del ejercicio')}" style="position:absolute;inset:0;width:100%;height:100%;border:0;"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>`;
  }

  // --------------------------------------------------------- validaciones
  function texto(valor) {
    return String(valor ?? '').trim();
  }

  function decimal(valor) {
    const t = texto(valor).replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function validarEjercicio({ nombre, categoria: cat, instrucciones, video_url: video }) {
    const fila = {
      nombre: texto(nombre),
      categoria: cat || null,
      instrucciones: texto(instrucciones) || null,
      video_url: texto(video) || null,
    };
    if (!fila.nombre) return { error: 'Escribe el nombre del ejercicio.' };
    if (fila.nombre.length > 120) return { error: 'El nombre no puede superar 120 caracteres.' };
    if (fila.categoria && !categoria(fila.categoria)) return { error: 'La categoría no es válida.' };
    if (fila.instrucciones && fila.instrucciones.length > 2000) return { error: 'Las instrucciones no pueden superar 2000 caracteres.' };
    if (!videoValido(fila.video_url) || (fila.video_url && !videoEmbed(fila.video_url))) {
      return { error: 'El vídeo debe ser un enlace de YouTube o Vimeo (por ejemplo, https://youtu.be/... o https://vimeo.com/...).' };
    }
    return { fila };
  }

  // Normaliza un ejercicio prescrito a partir de los valores del formulario.
  function validarItem(item, posicion) {
    const nombre = texto(item.nombre);
    const donde = `Ejercicio ${posicion + 1}${nombre ? ` (${nombre})` : ''}`;
    const limpio = {
      ejercicio_id: item.ejercicio_id || null,
      nombre,
      instrucciones: texto(item.instrucciones) || null,
      video_url: texto(item.video_url) || null,
      series: decimal(item.series),
      repeticiones: texto(item.repeticiones) || null,
      carga_kg: decimal(item.carga_kg),
      duracion_seg: decimal(item.duracion_seg),
      descanso_seg: decimal(item.descanso_seg),
      notas: texto(item.notas) || null,
    };
    if (!nombre) return { error: `${donde}: falta el nombre.` };
    if (nombre.length > 120) return { error: `${donde}: el nombre es demasiado largo.` };
    if (limpio.series !== null && !(Number.isInteger(limpio.series) && limpio.series >= 1 && limpio.series <= MAX_SERIES)) {
      return { error: `${donde}: las series deben ser un número entero entre 1 y ${MAX_SERIES}.` };
    }
    if (limpio.repeticiones && limpio.repeticiones.length > 20) return { error: `${donde}: las repeticiones admiten hasta 20 caracteres (ej. 10 u 8-12).` };
    if (limpio.carga_kg !== null && !(limpio.carga_kg >= 0 && limpio.carga_kg <= 1000)) return { error: `${donde}: la carga debe estar entre 0 y 1000 kg.` };
    if (limpio.duracion_seg !== null && !(Number.isInteger(limpio.duracion_seg) && limpio.duracion_seg >= 1 && limpio.duracion_seg <= 36000)) {
      return { error: `${donde}: el tiempo debe ser un número entero de segundos (1 a 36000).` };
    }
    if (limpio.descanso_seg !== null && !(Number.isInteger(limpio.descanso_seg) && limpio.descanso_seg >= 0 && limpio.descanso_seg <= 3600)) {
      return { error: `${donde}: el descanso debe ser un número entero de segundos (0 a 3600).` };
    }
    if (limpio.notas && limpio.notas.length > 500) return { error: `${donde}: las notas no pueden superar 500 caracteres.` };
    if (limpio.instrucciones && limpio.instrucciones.length > 2000) limpio.instrucciones = limpio.instrucciones.slice(0, 2000);
    if (!videoValido(limpio.video_url)) limpio.video_url = null;
    return { item: limpio };
  }

  function validarWorkout({ nombre, descripcion, ejercicios }) {
    const fila = { nombre: texto(nombre), descripcion: texto(descripcion) || null, ejercicios: [] };
    if (!fila.nombre) return { error: 'Escribe el nombre del workout.' };
    if (fila.nombre.length > 120) return { error: 'El nombre no puede superar 120 caracteres.' };
    if (fila.descripcion && fila.descripcion.length > 2000) return { error: 'La descripción no puede superar 2000 caracteres.' };
    if (!ejercicios || !ejercicios.length) return { error: 'Añade al menos un ejercicio.' };
    if (ejercicios.length > MAX_EJERCICIOS) return { error: `Un workout admite como máximo ${MAX_EJERCICIOS} ejercicios.` };
    for (let i = 0; i < ejercicios.length; i += 1) {
      const r = validarItem(ejercicios[i], i);
      if (r.error) return r;
      fila.ejercicios.push(r.item);
    }
    return { fila };
  }

  // Actualiza nombre, instrucciones y vídeo de cada ejercicio con los del catálogo actual.
  function refrescar(ejercicios, catalogo) {
    const porId = new Map((catalogo || []).map((e) => [e.id, e]));
    return ejercicios.map((item) => {
      const base = item.ejercicio_id && porId.get(item.ejercicio_id);
      return base ? { ...item, nombre: base.nombre, instrucciones: base.instrucciones || null, video_url: base.video_url || null } : item;
    });
  }

  function itemDesdeCatalogo(e) {
    return {
      ejercicio_id: e.id, nombre: e.nombre, instrucciones: e.instrucciones || null, video_url: e.video_url || null,
      series: null, repeticiones: null, carga_kg: null, duracion_seg: null, descanso_seg: null, notas: null,
    };
  }

  function textoPrescripcion(item) {
    const partes = [];
    if (item.series && item.repeticiones) partes.push(`${item.series} × ${item.repeticiones} reps`);
    else if (item.series) partes.push(`${item.series} ${item.series === 1 ? 'serie' : 'series'}`);
    else if (item.repeticiones) partes.push(`${item.repeticiones} reps`);
    if (item.carga_kg !== null && item.carga_kg !== undefined) partes.push(`${numero(item.carga_kg)} kg`);
    if (item.duracion_seg) partes.push(segundos(item.duracion_seg));
    if (item.descanso_seg) partes.push(`descanso ${segundos(item.descanso_seg)}`);
    return partes.join(' · ');
  }

  // Convierte los valores del formulario de registro en una fila o devuelve { error }.
  function validarRegistro({ fecha, duracion_min: duracion, esfuerzo, comentario, resultados }) {
    const fila = {
      fecha,
      duracion_min: decimal(duracion),
      esfuerzo: esfuerzo ? Number(esfuerzo) : null,
      comentario: texto(comentario) || null,
      resultados: [],
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { error: 'Elige el día en que lo hiciste.' };
    if (fecha < '2000-01-01' || fecha > sumarDias(hoyIso(), 1)) return { error: 'La fecha no puede ser futura.' };
    if (fila.duracion_min !== null && !(Number.isInteger(fila.duracion_min) && fila.duracion_min >= 1 && fila.duracion_min <= 600)) {
      return { error: 'La duración debe ser un número entero de minutos (1 a 600).' };
    }
    if (fila.esfuerzo !== null && !(Number.isInteger(fila.esfuerzo) && fila.esfuerzo >= 1 && fila.esfuerzo <= 10)) {
      return { error: 'El esfuerzo debe estar entre 1 y 10.' };
    }
    if (fila.comentario && fila.comentario.length > 1000) return { error: 'El comentario no puede superar 1000 caracteres.' };
    for (const r of resultados || []) {
      const series = [];
      for (const s of (r.series || []).slice(0, MAX_SERIES)) {
        const serie = { reps: decimal(s.reps), kg: decimal(s.kg), seg: decimal(s.seg) };
        if (serie.reps === null && serie.kg === null && serie.seg === null) continue;
        if (serie.reps !== null && !(serie.reps >= 0 && serie.reps <= 1000)) return { error: `${r.nombre}: las repeticiones no son válidas.` };
        if (serie.kg !== null && !(serie.kg >= 0 && serie.kg <= 1000)) return { error: `${r.nombre}: la carga debe estar entre 0 y 1000 kg.` };
        if (serie.seg !== null && !(serie.seg >= 0 && serie.seg <= 36000)) return { error: `${r.nombre}: el tiempo no es válido.` };
        series.push(serie);
      }
      fila.resultados.push({ indice: r.indice, nombre: String(r.nombre).slice(0, 120), hecho: Boolean(r.hecho), series });
    }
    return { fila };
  }

  // ------------------------------------------------------------- catálogo
  async function listarEjercicios(client) {
    const { data, error } = await client.from('ejercicios').select(CAMPOS_EJERCICIO).order('nombre');
    if (error) throw new Error(error.message);
    return data || [];
  }

  function mensajeDuplicado(error, texto) {
    return /duplicate key|unique/i.test(error.message) ? texto : error.message;
  }

  async function guardarEjercicio(client, profesionalId, id, fila) {
    const consulta = id
      ? client.from('ejercicios').update(fila).eq('id', id)
      : client.from('ejercicios').insert({ ...fila, profesional_id: profesionalId });
    const { data, error } = await consulta.select(CAMPOS_EJERCICIO).single();
    if (error) throw new Error(mensajeDuplicado(error, 'Ya tienes un ejercicio con ese nombre en tu catálogo.'));
    return data;
  }

  async function eliminarEjercicio(client, id) {
    const { error } = await client.from('ejercicios').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function listarWorkouts(client) {
    const { data, error } = await client.from('workouts').select(CAMPOS_WORKOUT).order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function guardarWorkout(client, profesionalId, id, fila) {
    const consulta = id
      ? client.from('workouts').update(fila).eq('id', id)
      : client.from('workouts').insert({ ...fila, profesional_id: profesionalId });
    const { data, error } = await consulta.select(CAMPOS_WORKOUT).single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function eliminarWorkout(client, id) {
    const { error } = await client.from('workouts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // -------------------------------------------------------- asignaciones
  async function asignar(client, { clienteId, profesionalId, fecha, workoutOrigenId = null, fila }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new Error('Elige el día del entrenamiento.');
    const { data, error } = await client.from('clientes_workouts').insert({
      cliente_id: clienteId, profesional_id: profesionalId, workout_origen_id: workoutOrigenId, fecha,
      nombre: fila.nombre, descripcion: fila.descripcion, ejercicios: fila.ejercicios,
    }).select(CAMPOS_ASIGNADO).single();
    if (error) {
      throw new Error(/row-level security/i.test(error.message)
        ? 'Solo el entrenador/a o el nutricionista asignados a este cliente pueden asignarle entrenamientos.'
        : error.message);
    }
    return data;
  }

  async function actualizarAsignacion(client, id, cambios) {
    const { data, error } = await client.from('clientes_workouts').update(cambios).eq('id', id).select(CAMPOS_ASIGNADO);
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('No se puede modificar: ya está realizado o no lo asignaste tú.');
    return data[0];
  }

  async function eliminarAsignacion(client, id) {
    const { data, error } = await client.from('clientes_workouts').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('No se puede eliminar: ya está realizado o no lo asignaste tú.');
  }

  // Une a cada workout asignado su registro (o null) y sus comentarios.
  async function completar(client, workouts) {
    if (!workouts.length) return [];
    const ids = workouts.map((w) => w.id);
    const [registros, comentarios] = await Promise.all([
      client.from('clientes_workout_registros').select(CAMPOS_REGISTRO).in('workout_id', ids),
      client.from('clientes_workout_comentarios').select(CAMPOS_COMENTARIO).in('workout_id', ids).order('creado_en'),
    ]);
    const error = registros.error || comentarios.error;
    if (error) throw new Error(error.message);
    return workouts.map((w) => ({
      ...w,
      registro: (registros.data || []).find((r) => r.workout_id === w.id) || null,
      comentarios: (comentarios.data || []).filter((c) => c.workout_id === w.id),
    }));
  }

  async function consultar(client, clienteId, desde, hasta) {
    let consulta = client.from('clientes_workouts').select(CAMPOS_ASIGNADO).eq('cliente_id', clienteId);
    if (desde) consulta = consulta.gte('fecha', desde);
    if (hasta) consulta = consulta.lte('fecha', hasta);
    const { data, error } = await consulta.order('fecha', { ascending: false }).order('creado_en').range(0, 499);
    if (error) throw new Error(error.message);
    return completar(client, data || []);
  }

  async function obtener(client, id) {
    const { data, error } = await client.from('clientes_workouts').select(CAMPOS_ASIGNADO).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (await completar(client, [data]))[0];
  }

  function estado(w, hoy = hoyIso()) {
    if (w.registro) return 'realizado';
    return w.fecha < hoy ? 'no_registrado' : 'pendiente';
  }

  async function guardarRegistro(client, clienteId, workoutId, registroId, fila) {
    const consulta = registroId
      ? client.from('clientes_workout_registros').update(fila).eq('id', registroId)
      : client.from('clientes_workout_registros').insert({ ...fila, workout_id: workoutId, cliente_id: clienteId });
    const { data, error } = await consulta.select(CAMPOS_REGISTRO).single();
    if (error) {
      throw new Error(/duplicate key|unique/i.test(error.message)
        ? 'Este entrenamiento ya estaba registrado. Recarga la página.'
        : error.message);
    }
    return data;
  }

  async function eliminarRegistro(client, id) {
    const { error } = await client.from('clientes_workout_registros').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function comentar(client, { workoutId, clienteId, profesionalId, texto: contenido }) {
    const limpio = texto(contenido);
    if (!limpio) throw new Error('Escribe el comentario.');
    if (limpio.length > 1000) throw new Error('El comentario no puede superar 1000 caracteres.');
    const { data, error } = await client.from('clientes_workout_comentarios')
      .insert({ workout_id: workoutId, cliente_id: clienteId, profesional_id: profesionalId, texto: limpio })
      .select(CAMPOS_COMENTARIO).single();
    if (error) {
      throw new Error(/row-level security/i.test(error.message)
        ? 'Solo pueden comentar el entrenador/a o el nutricionista asignados a este cliente.'
        : error.message);
    }
    return data;
  }

  async function borrarComentario(client, id) {
    const { error } = await client.from('clientes_workout_comentarios').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // Resumen corto de un registro: series hechas, duración y esfuerzo.
  function resumenRegistro(w) {
    const r = w.registro;
    if (!r) return '';
    const hechos = r.resultados.filter((x) => x.hecho).length;
    const series = r.resultados.reduce((s, x) => s + x.series.length, 0);
    const partes = [`${hechos}/${w.ejercicios.length} ejercicios`];
    if (series) partes.push(`${series} ${series === 1 ? 'serie' : 'series'}`);
    if (r.duracion_min) partes.push(`${r.duracion_min} min`);
    if (r.esfuerzo) partes.push(`esfuerzo ${r.esfuerzo}/10`);
    return partes.join(' · ');
  }

  function textoSerie(s) {
    const partes = [];
    if (s.reps !== null && s.reps !== undefined) partes.push(`${numero(s.reps)} reps`);
    if (s.kg !== null && s.kg !== undefined) partes.push(`${numero(s.kg)} kg`);
    if (s.seg) partes.push(segundos(s.seg));
    return partes.join(' × ') || '—';
  }

  return {
    CATEGORIAS, ESTADOS, MAX_EJERCICIOS, MAX_SERIES,
    escapar, hoyIso, sumarDias, fechaLarga, etiquetaDia, categoria, rol, segundos, numero,
    videoValido, videoEmbed, videoHtml,
    validarEjercicio, validarItem, validarWorkout, refrescar, itemDesdeCatalogo, textoPrescripcion, validarRegistro,
    listarEjercicios, guardarEjercicio, eliminarEjercicio, listarWorkouts, guardarWorkout, eliminarWorkout,
    asignar, actualizarAsignacion, eliminarAsignacion, consultar, obtener, estado,
    guardarRegistro, eliminarRegistro, comentar, borrarComentario, resumenRegistro, textoSerie,
  };
})();
