// Actividades personales del cliente, compartidas por FitNova Go y FitNova Manager
// (tabla clientes_actividades; foto de la ruta en el bucket privado progreso-fotos).
window.FitNovaActividades = (() => {
  const BUCKET = 'progreso-fotos';
  const CAMPOS = 'id, cliente_id, nombre, fecha, duracion_min, distancia_km, comentario, foto_ruta, origen, inicio, calorias_kcal, creado_en';
  const METROS_POR_PASO = 0.63;
  const KCAL_POR_KM = 60;
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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

  function fechaCorta(iso) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Acepta «45», «0:45», «01:30» o «1h 30»; devuelve minutos, null si está vacío o NaN si no es válido.
  function duracionAMinutos(texto) {
    const t = String(texto ?? '').trim().toLowerCase();
    if (!t) return null;
    let m = t.match(/^(\d{1,2}):([0-5]\d)$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = t.match(/^(\d{1,2})\s*h(?:\s*(\d{1,2})\s*(?:m|min)?)?$/);
    if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
    m = t.match(/^(\d{1,4})\s*(?:m|min)?$/);
    if (m) return Number(m[1]);
    return NaN;
  }

  function minutosATexto(min) {
    if (!min) return '';
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }

  function formatearDuracion(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  }

  function formatearKm(km) {
    return `${Number(km).toLocaleString('es-ES', { maximumFractionDigits: 2 })} km`;
  }

  function estimaciones(km) {
    const n = Number(km) || 0;
    return { pasos: Math.round((n * 1000) / METROS_POR_PASO), calorias: Math.round(n * KCAL_POR_KM) };
  }

  function detalle(act) {
    return [act.duracion_min ? formatearDuracion(act.duracion_min) : '', act.distancia_km ? formatearKm(act.distancia_km) : '']
      .filter(Boolean).join(' · ');
  }

  // Convierte los valores del formulario a una fila o devuelve { error }.
  function validar({ nombre, fecha, duracion, distancia, comentario }) {
    const fila = {
      nombre: String(nombre ?? '').trim(),
      fecha,
      duracion_min: duracionAMinutos(duracion),
      distancia_km: distancia === '' || distancia == null ? null : Number(String(distancia).replace(',', '.')),
      comentario: String(comentario ?? '').trim() || null,
    };
    if (!fila.nombre) return { error: 'Escribe el nombre de la actividad.' };
    if (fila.nombre.length > 120) return { error: 'El nombre no puede superar 120 caracteres.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { error: 'Elige la fecha de la actividad.' };
    if (fecha < '2000-01-01' || fecha > sumarDias(hoyIso(), 365)) return { error: 'La fecha no es válida (como mucho, un año desde hoy).' };
    if (Number.isNaN(fila.duracion_min) || (fila.duracion_min !== null && (fila.duracion_min < 1 || fila.duracion_min > 1440))) {
      return { error: 'La duración no es válida. Usa horas:minutos (por ejemplo, 00:45) o minutos, hasta 24 h.' };
    }
    if (fila.distancia_km !== null && !(fila.distancia_km > 0 && fila.distancia_km <= 1000)) {
      return { error: 'La distancia debe ser mayor que 0 y como máximo 1000 km.' };
    }
    if (fila.distancia_km !== null) fila.distancia_km = Math.round(fila.distancia_km * 100) / 100;
    if (fila.comentario && fila.comentario.length > 1000) return { error: 'El comentario no puede superar 1000 caracteres.' };
    return { fila };
  }

  async function consultar(client, clienteId) {
    const { data, error } = await client
      .from('clientes_actividades')
      .select(CAMPOS)
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false })
      .range(0, 999);
    if (error) throw new Error(error.message);
    return (data || []).map((a) => ({ ...a, distancia_km: a.distancia_km == null ? null : Number(a.distancia_km) }));
  }

  async function urlFoto(client, ruta) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(ruta, 3600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async function subirFoto(client, clienteId, archivo) {
    const blob = await window.FitNovaFotos.comprimir(archivo);
    const ruta = `${clienteId}/actividades/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
    return ruta;
  }

  async function borrarFoto(client, ruta) {
    if (ruta) await client.storage.from(BUCKET).remove([ruta]);
  }

  // Crea o actualiza; opciones: archivo (foto nueva), quitarFoto, fotoAnterior e
  // importacion ({ inicio, calorias_kcal }, solo al crear una actividad importada).
  async function guardar(client, clienteId, id, fila, { archivo = null, quitarFoto = false, fotoAnterior = null, importacion = null } = {}) {
    const nuevaRuta = archivo ? await subirFoto(client, clienteId, archivo) : null;
    const datos = { ...fila };
    if (nuevaRuta) datos.foto_ruta = nuevaRuta;
    else if (quitarFoto) datos.foto_ruta = null;
    if (!id && importacion) {
      datos.origen = 'archivo';
      datos.inicio = importacion.inicio || null;
      datos.calorias_kcal = importacion.calorias_kcal || null;
    }
    const consulta = id
      ? client.from('clientes_actividades').update(datos).eq('id', id)
      : client.from('clientes_actividades').insert({ ...datos, cliente_id: clienteId });
    const { data, error } = await consulta.select(CAMPOS).single();
    if (error) {
      await borrarFoto(client, nuevaRuta);
      if (error.code === '23505' && datos.inicio) throw new Error('Esta actividad ya está importada (misma hora de inicio).');
      throw new Error(error.message);
    }
    if (fotoAnterior && (nuevaRuta || quitarFoto)) await borrarFoto(client, fotoAnterior);
    return data;
  }

  async function eliminar(client, actividad) {
    const { error } = await client.from('clientes_actividades').delete().eq('id', actividad.id);
    if (error) throw new Error(error.message);
    await borrarFoto(client, actividad.foto_ruta);
  }

  // Resumen de lunes a domingo de la semana de «hoy»; no cuenta actividades futuras.
  function semana(filas, hoy = hoyIso()) {
    const d = new Date(`${hoy}T12:00:00`);
    const lunes = sumarDias(hoy, -((d.getDay() || 7) - 1));
    const dias = DIAS.map((etiqueta, i) => {
      const iso = sumarDias(lunes, i);
      const delDia = iso > hoy ? [] : filas.filter((a) => a.fecha === iso);
      return {
        iso,
        etiqueta,
        futuro: iso > hoy,
        cuenta: delDia.length,
        minutos: delDia.reduce((s, a) => s + (a.duracion_min || 0), 0),
        km: delDia.reduce((s, a) => s + (a.distancia_km || 0), 0),
      };
    });
    return {
      desde: lunes,
      hasta: sumarDias(lunes, 6),
      dias,
      cuenta: dias.reduce((s, x) => s + x.cuenta, 0),
      minutos: dias.reduce((s, x) => s + x.minutos, 0),
      km: Math.round(dias.reduce((s, x) => s + x.km, 0) * 100) / 100,
    };
  }

  function textoSemana(resumen) {
    if (!resumen.cuenta) return 'Aún no hay actividades esta semana.';
    const partes = [`${resumen.cuenta} ${resumen.cuenta === 1 ? 'actividad' : 'actividades'}`];
    if (resumen.minutos) partes.push(formatearDuracion(resumen.minutos));
    if (resumen.km) partes.push(formatearKm(resumen.km));
    return partes.join(' · ');
  }

  // Barras de la semana: altura según minutos; un día con actividad sin duración tiene altura mínima.
  function barrasHtml(resumen) {
    const max = Math.max(60, ...resumen.dias.map((x) => x.minutos));
    return resumen.dias.map((x) => {
      const alto = x.cuenta ? Math.max(12, Math.round((x.minutos / max) * 100)) : 4;
      const titulo = x.cuenta ? `${x.cuenta} actividad(es)${x.minutos ? ` · ${formatearDuracion(x.minutos)}` : ''}` : 'Sin actividad';
      return `<div class="bar-col" title="${escapar(fechaCorta(x.iso))}: ${escapar(titulo)}"><div class="bar${x.cuenta ? ' filled' : ''}" style="height:${alto}%"></div><span class="bar-label">${x.etiqueta}</span></div>`;
    }).join('');
  }

  return {
    escapar, hoyIso, fechaLocal, sumarDias, fechaCorta, duracionAMinutos, minutosATexto, formatearDuracion,
    formatearKm, estimaciones, detalle, validar, consultar, urlFoto, guardar, eliminar, semana, textoSemana, barrasHtml,
  };
})();
