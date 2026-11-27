// FitNova Go · entrenamientos asignados: página entrenamiento.html, tarjeta de Inicio y Agenda.
(() => {
  const E = window.FitNovaEntrenos;
  const st = { clienteId: null, filas: [], cargados: false, error: '', actual: null, registrando: false };
  const miniaturasVimeo = new Map();

  async function clienteId() {
    if (st.clienteId) return st.clienteId;
    if (!await requireSessionGo()) return null;
    const { data, error } = await supabaseClient.rpc('cliente_actual_id');
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No hay un cliente vinculado a esta cuenta.');
    st.clienteId = data;
    return data;
  }

  async function cargar(desde, hasta) {
    st.error = '';
    try {
      const id = await clienteId();
      if (!id) return;
      st.filas = await E.consultar(supabaseClient, id, desde, hasta);
      st.cargados = true;
    } catch (error) {
      st.error = `No se pudieron cargar tus entrenamientos: ${error.message}`;
      st.filas = [];
      st.cargados = false;
    }
  }

  function url(w) {
    return `entrenamiento.html?id=${encodeURIComponent(w.id)}`;
  }

  function item(w, hoy = E.hoyIso()) {
    const est = E.ESTADOS[E.estado(w, hoy)];
    return `<a class="activity-item ent-item" href="${url(w)}">
      <span><strong>${E.escapar(w.nombre)}</strong><span>${E.escapar(E.etiquetaDia(w.fecha, hoy))} · ${est.icono} ${est.texto}${w.registro ? ` · ${E.escapar(E.resumenRegistro(w))}` : ` · ${w.ejercicios.length} ${w.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}`}${w.comentarios.length ? ` · 💬 ${w.comentarios.length}` : ''}</span>${w.programa_nombre ? `<span>${E.escapar(w.programa_nombre)} · semana ${w.programa_semana}</span>` : ''}</span><span>›</span>
    </a>`;
  }

  // ---------------------------------------------------------------- Agenda
  function render() {
    document.querySelectorAll('[data-agenda-date]').forEach((boton) => {
      boton.querySelector('.ent-count')?.remove();
      const delDia = st.filas.filter((w) => w.fecha === boton.dataset.agendaDate);
      if (!delDia.length) return;
      const marca = document.createElement('small');
      marca.className = `ent-count${delDia.every((w) => w.registro) ? ' hecho' : ''}`;
      marca.textContent = `💪${delDia.length > 1 ? ` ${delDia.length}` : ''}`;
      boton.appendChild(marca);
    });
    const cont = document.getElementById('go-entrenos-agenda');
    if (!cont) return;
    if (st.error) { cont.innerHTML = `<p class="sesion-error" role="alert">${E.escapar(st.error)}</p>`; return; }
    if (!st.cargados) { cont.innerHTML = '<p>Cargando entrenamientos...</p>'; return; }
    const hoy = E.hoyIso();
    const proximos = st.filas.filter((w) => w.fecha >= hoy && !w.registro).sort((a, b) => a.fecha.localeCompare(b.fecha));
    cont.innerHTML = `${proximos.slice(0, 5).map((w) => item(w, hoy)).join('') || '<p class="agenda-empty">No tienes entrenamientos pendientes asignados.</p>'}
      <a class="btn-secondary nut-boton-enlace" href="entrenamiento.html">Ver todos mis entrenamientos</a>`;
  }

  function htmlDia(fecha) {
    const hoy = E.hoyIso();
    const delDia = st.filas.filter((w) => w.fecha === fecha);
    const cuerpo = st.error ? `<p class="sesion-error">${E.escapar(st.error)}</p>`
      : !st.cargados ? '<p>Cargando entrenamientos...</p>'
      : delDia.map((w) => item(w, hoy)).join('') || '<p>No hay entrenamientos asignados para este día.</p>';
    return `<h3>Entrenamientos</h3>${cuerpo}`;
  }

  async function iniciarAgenda() {
    const hoy = E.hoyIso();
    await cargar(E.sumarDias(hoy, -120), E.sumarDias(hoy, 180));
    render();
    const modal = document.getElementById('modal-dia');
    if (modal && modal.classList.contains('open') && typeof selectedAgendaDay !== 'undefined') openDayModal(selectedAgendaDay);
  }

  // ---------------------------------------------------------------- Inicio
  async function iniciarInicio() {
    const caja = document.getElementById('inicio-entreno');
    const hoy = E.hoyIso();
    await cargar(E.sumarDias(hoy, -7), E.sumarDias(hoy, 60));
    if (st.error) {
      caja.innerHTML = `<p class="sesion-error">${E.escapar(st.error)}</p>`;
      return;
    }
    const deHoy = st.filas.filter((w) => w.fecha === hoy);
    const proximo = st.filas.filter((w) => w.fecha > hoy && !w.registro).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    const sinRegistrar = st.filas.filter((w) => w.fecha < hoy && !w.registro).length;
    let html = '';
    if (deHoy.length) html = deHoy.map((w) => item(w, hoy)).join('');
    else if (proximo) html = `<p class="ent-inicio-texto">Hoy no tienes entrenamiento asignado. El próximo:</p>${item(proximo, hoy)}`;
    else if (!st.filas.length) html = '<p class="ent-inicio-texto">Tu profesional aún no te ha asignado entrenamientos. Cuando lo haga, aparecerán aquí y en tu Agenda.</p>';
    else html = '<p class="ent-inicio-texto">No tienes entrenamientos pendientes. ¡Buen trabajo!</p>';
    if (sinRegistrar) html += `<p class="ent-inicio-texto">⚠️ Tienes ${sinRegistrar} ${sinRegistrar === 1 ? 'entrenamiento' : 'entrenamientos'} de la última semana sin registrar.</p>`;
    caja.innerHTML = `${html}<a class="btn-secondary nut-boton-enlace" href="entrenamiento.html">Ver mis entrenamientos</a>`;
  }

  // ----------------------------------------------------- Página: listado
  async function pintarLista() {
    const cont = document.getElementById('ent-contenido');
    document.getElementById('ent-titulo').textContent = 'Mis entrenamientos';
    document.getElementById('ent-volver').hidden = true;
    const hoy = E.hoyIso();
    await cargar(E.sumarDias(hoy, -365), null);
    if (st.error) { cont.innerHTML = `<p class="sesion-error" role="alert">${E.escapar(st.error)}</p>`; return; }
    if (!st.filas.length) {
      cont.innerHTML = '<section class="card"><p class="agenda-empty">Tu profesional aún no te ha asignado entrenamientos. Cuando lo haga, los verás aquí con sus ejercicios, vídeos e indicaciones.</p></section>';
      return;
    }
    const deHoy = st.filas.filter((w) => w.fecha === hoy);
    const proximos = st.filas.filter((w) => w.fecha > hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const anteriores = st.filas.filter((w) => w.fecha < hoy);
    cont.innerHTML = `
      <section class="card"><p class="card-title">Hoy</p>${deHoy.map((w) => item(w, hoy)).join('') || '<p class="agenda-empty">Hoy no tienes entrenamiento asignado.</p>'}</section>
      <section class="card"><p class="card-title">Próximos (${proximos.length})</p>${proximos.map((w) => item(w, hoy)).join('') || '<p class="agenda-empty">No hay entrenamientos programados.</p>'}</section>
      <section class="card"><details><summary class="card-title">Anteriores (${anteriores.length})</summary>${anteriores.map((w) => item(w, hoy)).join('') || '<p class="agenda-empty">Aún no hay entrenamientos anteriores.</p>'}</details></section>`;
  }

  // ----------------------------------------------------- Página: detalle
  function videoEjercicioHtml(it, i) {
    if (!E.videoEmbed(it.video_url)) return '';
    return `<button class="ent-video-miniatura" id="ent-miniatura-${i}" type="button" data-video="${i}" aria-label="Reproducir vídeo de ${E.escapar(it.nombre)}" aria-controls="ent-video-${i}" aria-expanded="false">
      <img id="ent-miniatura-img-${i}" alt="" hidden><span class="ent-video-play" aria-hidden="true">▶</span><span class="ent-miniatura-estado" id="ent-miniatura-estado-${i}">Cargando miniatura…</span>
    </button><div class="ent-video" id="ent-video-${i}" hidden><div id="ent-reproductor-${i}"></div><button class="btn-secondary ent-video-cerrar" type="button" data-video="${i}">Cerrar vídeo</button></div>`;
  }

  function ejercicioHtml(it, i) {
    const pres = E.textoPrescripcion(it);
    return `<article class="ent-ejercicio">
      <div class="ent-ejercicio-cab"><span class="ent-num">${i + 1}</span><div><strong>${E.escapar(it.nombre)}</strong>${pres ? `<span>${E.escapar(pres)}</span>` : ''}</div></div>
      ${E.etiquetasHtml(it)}
      ${it.notas ? `<p class="ent-notas">📝 ${E.escapar(it.notas)}</p>` : ''}
      ${it.instrucciones ? `<details class="ent-instrucciones"><summary>Cómo se hace</summary><p>${E.escapar(it.instrucciones)}</p></details>` : ''}
      ${videoEjercicioHtml(it, i)}
    </article>`;
  }

  async function cargarMiniatura(it, i) {
    const embed = E.videoEmbed(it.video_url);
    if (!embed) return;
    const imagen = document.getElementById(`ent-miniatura-img-${i}`);
    const estado = document.getElementById(`ent-miniatura-estado-${i}`);
    const u = new URL(embed);
    try {
      let miniatura;
      if (u.hostname === 'www.youtube-nocookie.com') {
        miniatura = `https://i.ytimg.com/vi/${encodeURIComponent(u.pathname.split('/').pop())}/hqdefault.jpg`;
      } else {
        if (!miniaturasVimeo.has(it.video_url)) {
          const peticion = fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(it.video_url)}`, { referrerPolicy: 'no-referrer' })
            .then((respuesta) => {
              if (!respuesta.ok) throw new Error(`Vimeo respondió ${respuesta.status}`);
              return respuesta.json();
            }).then((datos) => {
              const url = new URL(datos.thumbnail_url);
              if (url.protocol !== 'https:' || !(url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com'))) throw new Error('Miniatura de Vimeo no válida');
              return url.href;
            });
          miniaturasVimeo.set(it.video_url, peticion);
        }
        miniatura = await miniaturasVimeo.get(it.video_url);
      }
      imagen.onload = () => { imagen.hidden = false; estado.hidden = true; };
      imagen.onerror = () => { imagen.hidden = true; estado.textContent = 'Miniatura no disponible'; };
      imagen.src = miniatura;
    } catch (error) {
      estado.textContent = 'Miniatura no disponible';
    }
  }

  function registroHtml(w) {
    const r = w.registro;
    if (!r) {
      return `<section class="card"><p class="card-title">¿Lo has hecho?</p>
        <p class="ent-inicio-texto">Apunta las series, repeticiones y cargas reales, el esfuerzo y cómo te has sentido. Tu profesional lo verá.</p>
        <button class="btn-primary" type="button" id="ent-registrar">✅ Registrar entrenamiento</button></section>`;
    }
    const filas = w.ejercicios.map((it, i) => {
      const res = r.resultados.find((x) => x.indice === i);
      return `<li><strong>${res && res.hecho ? '✅' : '⬜'} ${E.escapar(it.nombre)}</strong>${res && res.series.length ? `<span>${res.series.map((s, n) => `S${n + 1}: ${E.escapar(E.textoSerie(s))}`).join(' · ')}</span>` : ''}</li>`;
    }).join('');
    return `<section class="card"><p class="card-title">Tu registro</p>
      <p class="ent-inicio-texto">${E.escapar(E.fechaLarga(r.fecha))} · ${E.escapar(E.resumenRegistro(w))}</p>
      <ul class="ent-resultados">${filas}</ul>
      ${r.comentario ? `<p class="ent-notas">🗨️ ${E.escapar(r.comentario)}</p>` : ''}
      <div class="row">
        <button class="btn-secondary" type="button" id="ent-borrar-registro">Borrar registro</button>
        <button class="btn-primary" type="button" id="ent-registrar">Editar registro</button>
      </div></section>`;
  }

  function comentariosHtml(w) {
    if (!w.comentarios.length) return '';
    return `<section class="card"><p class="card-title">Comentarios de tu profesional</p>${w.comentarios.map((c) => `
      <div class="nut-comentario">
        <strong>${E.escapar(c.autor_nombre || 'Tu profesional')} · ${E.escapar(E.rol(c.autor_rol))}</strong>
        <p>${E.escapar(c.texto)}</p>
        <span>${E.escapar(new Date(c.creado_en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
      </div>`).join('')}</section>`;
  }

  function serieFila(i, n, s, conSeg, pistaReps = '') {
    return `<div class="ent-serie" data-serie>
      <span>S${n + 1}</span>
      <input inputmode="numeric" data-k="reps" value="${E.escapar(s.reps ?? '')}" placeholder="${E.escapar(pistaReps || 'reps')}" aria-label="Repeticiones serie ${n + 1}" />
      <input inputmode="decimal" data-k="kg" value="${E.escapar(s.kg ?? '')}" placeholder="kg" aria-label="Kilos serie ${n + 1}" />
      ${conSeg ? `<input inputmode="numeric" data-k="seg" value="${E.escapar(s.seg ?? '')}" placeholder="seg" aria-label="Segundos serie ${n + 1}" />` : ''}
      <button type="button" class="ent-serie-quitar" data-quitar-serie="${i}" title="Quitar serie">✕</button>
    </div>`;
  }

  function seriesIniciales(it, res) {
    if (res && res.series.length) return res.series;
    const reps = /^\d+$/.test(String(it.repeticiones || '')) ? Number(it.repeticiones) : null;
    const base = { reps, kg: it.carga_kg ?? null, seg: it.duracion_seg ?? null };
    return Array.from({ length: it.series || 1 }, () => ({ ...base }));
  }

  function formRegistroHtml(w) {
    const r = w.registro;
    const hoy = E.hoyIso();
    const fecha = r ? r.fecha : (w.fecha > hoy ? hoy : w.fecha);
    const ejercicios = w.ejercicios.map((it, i) => {
      const res = r ? r.resultados.find((x) => x.indice === i) : null;
      const conSeg = Boolean(it.duracion_seg) || Boolean(res && res.series.some((s) => s.seg));
      return `<article class="ent-ejercicio" data-ejercicio="${i}" data-seg="${conSeg ? '1' : ''}">
        <label class="ent-hecho"><input type="checkbox" data-hecho ${!r || (res && res.hecho) ? 'checked' : ''} /> <strong>${E.escapar(it.nombre)}</strong></label>
        ${videoEjercicioHtml(it, i)}
        ${E.textoPrescripcion(it) ? `<span class="ent-pres">Prescrito: ${E.escapar(E.textoPrescripcion(it))}</span>` : ''}
        <div data-series>${seriesIniciales(it, res).map((s, n) => serieFila(i, n, s, conSeg, it.repeticiones)).join('')}</div>
      </article>`;
    }).join('');
    const chips = Array.from({ length: 10 }, (_, n) => `<button type="button" data-value="${n + 1}" class="${r && r.esfuerzo === n + 1 ? 'active' : ''}">${n + 1}</button>`).join('');
    return `<form class="card" id="ent-form" novalidate>
      <p class="card-title">${r ? 'Editar registro' : 'Registrar entrenamiento'}</p>
      <p class="ent-inicio-texto">Completa las series disponibles con lo que hiciste de verdad. Deja vacío lo que no aplique.</p>
      ${ejercicios}
      <div class="field-row">
        <div><label for="ent-fecha">Día que lo hiciste</label><input type="date" id="ent-fecha" value="${fecha}" max="${E.sumarDias(hoy, 1)}" /></div>
        <div><label for="ent-duracion">Duración (min)</label><input id="ent-duracion" inputmode="numeric" value="${r && r.duracion_min ? r.duracion_min : ''}" placeholder="Ej. 45" /></div>
      </div>
      <label>Esfuerzo percibido (1 = muy suave · 10 = máximo)</label>
      <div class="chip-select ent-esfuerzo" id="ent-esfuerzo">${chips}</div>
      <label for="ent-comentario">¿Cómo te has sentido? (opcional)</label>
      <textarea id="ent-comentario" maxlength="1000" placeholder="Ej. La última serie de sentadilla me costó mucho.">${E.escapar(r && r.comentario ? r.comentario : '')}</textarea>
      <p class="sesion-error" id="ent-form-error" role="alert"></p>
      <div class="row">
        <button class="btn-secondary" type="button" id="ent-cancelar">Cancelar</button>
        <button class="btn-primary" type="submit" id="ent-guardar">Guardar</button>
      </div>
    </form>`;
  }

  function leerFormulario(w) {
    const resultados = [...document.querySelectorAll('#ent-form [data-ejercicio]')].map((art) => {
      const i = Number(art.dataset.ejercicio);
      return {
        indice: i,
        nombre: w.ejercicios[i].nombre,
        hecho: art.querySelector('[data-hecho]').checked,
        series: [...art.querySelectorAll('[data-serie]')].map((fila) => ({
          reps: fila.querySelector('[data-k="reps"]').value,
          kg: fila.querySelector('[data-k="kg"]').value,
          seg: fila.querySelector('[data-k="seg"]')?.value ?? '',
        })),
      };
    });
    const esfuerzo = document.querySelector('#ent-esfuerzo button.active');
    return {
      fecha: document.getElementById('ent-fecha').value,
      duracion_min: document.getElementById('ent-duracion').value,
      esfuerzo: esfuerzo ? esfuerzo.dataset.value : '',
      comentario: document.getElementById('ent-comentario').value,
      resultados,
    };
  }

  function renumerar(contenedor) {
    contenedor.querySelectorAll('[data-serie] > span').forEach((s, n) => { s.textContent = `S${n + 1}`; });
  }

  function pintarDetalle() {
    const w = st.actual;
    const cont = document.getElementById('ent-contenido');
    const hoy = E.hoyIso();
    const est = E.ESTADOS[E.estado(w, hoy)];
    document.getElementById('ent-titulo').textContent = w.nombre;
    cont.innerHTML = `
      <p class="ent-cabecera">${E.escapar(E.etiquetaDia(w.fecha, hoy))}${E.etiquetaDia(w.fecha, hoy) !== E.fechaLarga(w.fecha) ? ` · ${E.escapar(E.fechaLarga(w.fecha))}` : ''} · ${est.icono} ${est.texto}</p>
      ${w.programa_nombre ? `<p class="ent-cabecera">${E.escapar(w.programa_nombre)} · semana ${w.programa_semana}</p>` : ''}
      ${w.descripcion ? `<section class="card"><p class="ent-notas">${E.escapar(w.descripcion)}</p></section>` : ''}
      ${st.registrando ? formRegistroHtml(w) : `
        <section class="card"><p class="card-title">Ejercicios (${w.ejercicios.length})</p>${w.ejercicios.map(ejercicioHtml).join('')}</section>
        ${registroHtml(w)}`}
      ${comentariosHtml(w)}
      <p class="sesion-error" id="ent-error" role="alert"></p>`;
    w.ejercicios.forEach(cargarMiniatura);
  }

  async function recargarDetalle() {
    st.actual = await E.obtener(supabaseClient, st.actual.id);
    st.registrando = false;
    pintarDetalle();
  }

  async function guardar(event) {
    event.preventDefault();
    const w = st.actual;
    const aviso = document.getElementById('ent-form-error');
    const boton = document.getElementById('ent-guardar');
    const { fila, error } = E.validarRegistro(leerFormulario(w));
    if (error) { aviso.textContent = error; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      await E.guardarRegistro(supabaseClient, st.clienteId, w.id, w.registro ? w.registro.id : null, fila);
      await recargarDetalle();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      aviso.textContent = `No se pudo guardar: ${e.message}`;
      boton.disabled = false;
    }
  }

  function enlazarDetalle() {
    const cont = document.getElementById('ent-contenido');
    cont.addEventListener('click', async (event) => {
      const t = event.target;
      const video = t.closest('[data-video]');
      if (video) {
        const i = Number(video.dataset.video);
        const caja = document.getElementById(`ent-video-${i}`);
        const miniatura = document.getElementById(`ent-miniatura-${i}`);
        const reproductor = document.getElementById(`ent-reproductor-${i}`);
        caja.hidden = !caja.hidden;
        miniatura.hidden = !caja.hidden;
        miniatura.setAttribute('aria-expanded', String(!caja.hidden));
        reproductor.innerHTML = caja.hidden ? '' : E.videoHtml(st.actual.ejercicios[i].video_url, st.actual.ejercicios[i].nombre);
        (caja.hidden ? miniatura : caja.querySelector('.ent-video-cerrar')).focus();
        return;
      }
      if (t.closest('#ent-registrar')) { st.registrando = true; pintarDetalle(); return; }
      if (t.closest('#ent-cancelar')) { st.registrando = false; pintarDetalle(); return; }
      if (t.closest('#ent-borrar-registro')) {
        if (!confirm('¿Borrar tu registro de este entrenamiento? Volverá a aparecer como pendiente.')) return;
        try {
          await E.eliminarRegistro(supabaseClient, st.actual.registro.id);
          await recargarDetalle();
        } catch (e) {
          document.getElementById('ent-error').textContent = `No se pudo borrar: ${e.message}`;
        }
        return;
      }
      const chip = t.closest('#ent-esfuerzo button');
      if (chip) {
        const estaba = chip.classList.contains('active');
        chip.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        if (!estaba) chip.classList.add('active');
        return;
      }
      const quitar = t.closest('[data-quitar-serie]');
      if (quitar) {
        const series = quitar.closest('[data-series]');
        quitar.closest('[data-serie]').remove();
        renumerar(series);
      }
    });
    cont.addEventListener('submit', (event) => {
      if (event.target.id === 'ent-form') guardar(event);
    });
  }

  async function iniciarPagina() {
    const id = new URLSearchParams(window.location.search).get('id');
    const cont = document.getElementById('ent-contenido');
    if (!id) { await pintarLista(); return; }
    document.getElementById('ent-volver').hidden = false;
    enlazarDetalle();
    try {
      if (!await clienteId()) return;
      st.actual = await E.obtener(supabaseClient, id);
      if (!st.actual) {
        cont.innerHTML = '<section class="card"><p class="agenda-empty">Este entrenamiento ya no existe o no es tuyo.</p><a class="btn-secondary nut-boton-enlace" href="entrenamiento.html">Ver mis entrenamientos</a></section>';
        return;
      }
      st.registrando = new URLSearchParams(window.location.search).get('registrar') === '1' && !st.actual.registro;
      pintarDetalle();
    } catch (e) {
      cont.innerHTML = `<p class="sesion-error" role="alert">No se pudo cargar el entrenamiento: ${E.escapar(e.message)}</p>`;
    }
  }

  window.FitNovaEntrenosGo = { render, htmlDia };
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('ent-contenido')) iniciarPagina();
    else if (document.getElementById('inicio-entreno')) iniciarInicio();
    else if (document.getElementById('agenda-calendar')) iniciarAgenda();
  });
})();
