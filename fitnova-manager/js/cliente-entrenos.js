// FitNova Manager · ficha de cliente → pestaña Entrenamiento.
const cpEnt = { clienteId: null, profesionalId: null, dias: 30, filas: [], abiertos: new Set() };

function cpEntAviso(texto, error = false) {
  const aviso = document.getElementById('cp-ent-aviso');
  aviso.style.color = error ? 'var(--rojo)' : 'var(--verde, #1a7f4b)';
  aviso.textContent = texto;
}

function cpEntResultado(w, i) {
  return w.registro ? w.registro.resultados.find((r) => r.indice === i) || null : null;
}

function cpEntDetalleHtml(w) {
  const E = FitNovaEntrenos;
  const r = w.registro;
  const propio = w.profesional_id === cpEnt.profesionalId;
  const filas = w.ejercicios.map((it, i) => {
    const res = cpEntResultado(w, i);
    const hecho = r ? (res && res.hecho ? '✅' : '—') : '';
    return `<tr>
      <td style="width:24px;">${i + 1}</td>
      <td><strong style="font-size:13px;">${E.escapar(it.nombre)}</strong>${it.video_url ? ` <a href="${E.escapar(it.video_url)}" target="_blank" rel="noopener noreferrer" title="Ver vídeo">▶</a>` : ''}
        ${it.notas ? `<div style="font-size:12px;color:#55606f;">${E.escapar(it.notas)}</div>` : ''}</td>
      <td style="font-size:13px;">${E.escapar(E.textoPrescripcion(it)) || '—'}</td>
      ${r ? `<td style="font-size:13px;">${hecho} ${res && res.series.length ? res.series.map((s, n) => `S${n + 1}: ${E.escapar(E.textoSerie(s))}`).join('<br>') : ''}</td>` : ''}
    </tr>`;
  }).join('');
  const comentarios = w.comentarios.map((c) => `
    <div style="background:#FFF6EF;border-left:3px solid var(--naranja);border-radius:8px;padding:8px 10px;margin-top:8px;display:flex;gap:10px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <strong style="font-size:13px;">💬 ${E.escapar(c.autor_nombre || 'Profesional')} · ${E.escapar(E.rol(c.autor_rol))}</strong>
        <small style="color:#8a93a1;margin-left:6px;">${E.escapar(formatearFechaHora(c.creado_en))}</small>
        <p style="margin:4px 0 0;font-size:13px;white-space:pre-line;overflow-wrap:anywhere;">${E.escapar(c.texto)}</p>
      </div>
      ${c.profesional_id === cpEnt.profesionalId ? `<button class="btn-outline" type="button" data-ent-accion="borrar-comentario" data-id="${c.id}">Borrar</button>` : ''}
    </div>`).join('');
  return `<div style="margin-top:10px;">
    ${w.descripcion ? `<p style="font-size:13px;margin:0 0 8px;white-space:pre-line;">${E.escapar(w.descripcion)}</p>` : ''}
    <table class="data-table">
      <thead><tr><th>#</th><th>Ejercicio</th><th>Prescrito</th>${r ? '<th>Realizado</th>' : ''}</tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${r ? `<div style="background:#F4F8FF;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:13px;">
      <strong>Registro del cliente</strong> · ${E.escapar(E.fechaLarga(r.fecha))}${r.duracion_min ? ` · ${r.duracion_min} min` : ''}${r.esfuerzo ? ` · esfuerzo ${r.esfuerzo}/10` : ''}
      ${r.comentario ? `<p style="margin:4px 0 0;white-space:pre-line;overflow-wrap:anywhere;">🗨️ «${E.escapar(r.comentario)}»</p>` : ''}
    </div>` : ''}
    ${comentarios}
    <form data-ent-comentar="${w.id}" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;flex-wrap:wrap;">
      <textarea maxlength="1000" rows="2" required placeholder="Comentario para el cliente sobre este entrenamiento (lo verá en FitNova Go)" style="flex:1;min-width:240px;box-sizing:border-box;padding:8px;border-radius:10px;border:1px solid #D9D9D9;font:inherit;"></textarea>
      <button class="btn-primary" type="submit">Comentar</button>
    </form>
    ${propio && !r ? `<div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn-outline" type="button" data-ent-accion="editar" data-id="${w.id}">Editar para este cliente</button>
      <button class="btn-outline" type="button" data-ent-accion="eliminar" data-id="${w.id}">Eliminar</button>
    </div>` : ''}
    ${!propio ? '<p style="font-size:12px;color:#55606f;margin:8px 0 0;">Lo asignó otro profesional: solo él/ella puede editarlo o eliminarlo.</p>' : ''}
    ${propio && r ? '<p style="font-size:12px;color:#55606f;margin:8px 0 0;">Ya está registrado por el cliente, así que no se puede modificar.</p>' : ''}
  </div>`;
}

function cpEntTarjeta(w, hoy) {
  const E = FitNovaEntrenos;
  const est = E.ESTADOS[E.estado(w, hoy)];
  const abierto = cpEnt.abiertos.has(w.id);
  return `<section style="border:1px solid #E6E8EC;border-radius:12px;padding:12px;margin-bottom:10px;">
    <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
      <div style="min-width:0;">
        <strong style="color:var(--azul);">${E.escapar(E.etiquetaDia(w.fecha, hoy))}</strong>
        <span style="margin-left:8px;">${E.escapar(w.nombre)}</span>
        ${w.programa_nombre ? `<small style="color:#55606f;margin-left:8px;">${E.escapar(w.programa_nombre)} · semana ${w.programa_semana}</small>` : ''}
        <small style="color:#55606f;margin-left:8px;">${est.icono} ${est.texto} · ${w.registro ? E.escapar(E.resumenRegistro(w)) : `${w.ejercicios.length} ${w.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}`}${w.comentarios.length ? ` · 💬 ${w.comentarios.length}` : ''}</small>
      </div>
      <button class="btn-outline" type="button" data-ent-accion="toggle" data-id="${w.id}">${abierto ? 'Ocultar' : 'Ver detalle'}</button>
    </div>
    ${abierto ? cpEntDetalleHtml(w) : ''}
  </section>`;
}

function cpEntRender() {
  const E = FitNovaEntrenos;
  const hoy = E.hoyIso();
  const proximos = cpEnt.filas.filter((w) => w.fecha >= hoy && !w.registro).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const anteriores = cpEnt.filas.filter((w) => !proximos.includes(w));
  const periodo = anteriores.filter((w) => w.fecha <= hoy);
  const hechos = periodo.filter((w) => w.registro);
  const esfuerzos = hechos.map((w) => w.registro.esfuerzo).filter(Boolean);
  document.getElementById('cp-ent-proximo').textContent = proximos.length
    ? `${E.etiquetaDia(proximos[0].fecha, hoy)} · ${proximos[0].nombre}` : 'Ninguno programado';
  document.getElementById('cp-ent-realizados').textContent = periodo.length ? `${hechos.length} de ${periodo.length}` : 'Sin entrenamientos';
  document.getElementById('cp-ent-esfuerzo').textContent = esfuerzos.length
    ? `${E.numero(Math.round((esfuerzos.reduce((s, n) => s + n, 0) / esfuerzos.length) * 10) / 10)} / 10` : '—';
  const cont = document.getElementById('cp-ent-lista');
  if (!cpEnt.filas.length) {
    cont.innerHTML = `<div class="empty-state">
      <div class="empty-icon">💪</div>
      <h3>Sin workouts asignados todavía</h3>
      <p>Asigna un workout de tu librería o crea uno solo para este cliente.</p>
    </div>`;
    return;
  }
  cont.innerHTML = `
    <h4 style="margin:6px 0 8px;">Próximos (${proximos.length})</h4>
    ${proximos.map((w) => cpEntTarjeta(w, hoy)).join('') || '<p style="font-size:13px;color:#55606f;">No hay entrenamientos pendientes.</p>'}
    <h4 style="margin:16px 0 8px;">Anteriores y realizados (${anteriores.length})</h4>
    ${anteriores.map((w) => cpEntTarjeta(w, hoy)).join('') || '<p style="font-size:13px;color:#55606f;">Nada en este periodo.</p>'}`;
}

async function cpEntRecargar() {
  const E = FitNovaEntrenos;
  try {
    cpEnt.filas = await E.consultar(supabaseClient, cpEnt.clienteId, E.sumarDias(E.hoyIso(), -cpEnt.dias), null);
    cpEntRender();
  } catch (error) {
    ['cp-ent-proximo', 'cp-ent-realizados', 'cp-ent-esfuerzo'].forEach((id) => { document.getElementById(id).textContent = '—'; });
    document.getElementById('cp-ent-lista').innerHTML = `<p style="color:var(--rojo);" role="alert">No se pudieron cargar los entrenamientos: ${E.escapar(error.message)}</p>`;
  }
}

function cpEntEditor(w, fechaInicial = null, alGuardar = null) {
  const E = FitNovaEntrenos;
  EntMgr.abrirEditor({
    titulo: w ? 'Editar entrenamiento del cliente' : 'Nuevo entrenamiento solo para este cliente',
    datos: w ? { nombre: w.nombre, descripcion: w.descripcion, ejercicios: w.ejercicios } : null,
    fecha: w ? w.fecha : fechaInicial || E.hoyIso(),
    textoBoton: w ? 'Guardar cambios' : 'Asignar al cliente',
    onGuardar: async (fila, fecha) => {
      if (w) {
        await E.actualizarAsignacion(supabaseClient, w.id, { ...fila, fecha });
        cpEntAviso('✅ Cambios guardados. El cliente ya los ve en FitNova Go.');
      } else {
        const nuevo = await E.asignar(supabaseClient, { clienteId: cpEnt.clienteId, profesionalId: cpEnt.profesionalId, fecha, fila });
        cpEnt.abiertos.add(nuevo.id);
        cpEntAviso('✅ Entrenamiento asignado. El cliente ya lo ve en FitNova Go.');
      }
      await cpEntRecargar();
      if (alGuardar) await alGuardar();
    },
  });
}

async function cpEntAccion(boton) {
  const E = FitNovaEntrenos;
  const id = boton.dataset.id;
  const w = cpEnt.filas.find((x) => x.id === id);
  const accion = boton.dataset.entAccion;
  if (accion === 'toggle') {
    if (cpEnt.abiertos.has(id)) cpEnt.abiertos.delete(id); else cpEnt.abiertos.add(id);
    cpEntRender();
    return;
  }
  if (accion === 'editar' && w) { cpEntEditor(w); return; }
  boton.disabled = true;
  try {
    if (accion === 'eliminar' && w) {
      if (!confirm(`¿Eliminar «${w.nombre}» (${E.fechaLarga(w.fecha)}) de este cliente?`)) { boton.disabled = false; return; }
      await E.eliminarAsignacion(supabaseClient, w.id);
      cpEntAviso('Entrenamiento eliminado.');
    }
    if (accion === 'borrar-comentario') {
      if (!confirm('¿Borrar tu comentario? El cliente dejará de verlo.')) { boton.disabled = false; return; }
      await E.borrarComentario(supabaseClient, id);
      cpEntAviso('Comentario borrado.');
    }
    await cpEntRecargar();
  } catch (error) {
    boton.disabled = false;
    cpEntAviso(`No se pudo completar la acción: ${error.message}`, true);
  }
}

async function cpEntComentar(form) {
  const E = FitNovaEntrenos;
  const boton = form.querySelector('button');
  const campo = form.querySelector('textarea');
  boton.disabled = true;
  try {
    await E.comentar(supabaseClient, {
      workoutId: form.dataset.entComentar, clienteId: cpEnt.clienteId, profesionalId: cpEnt.profesionalId, texto: campo.value,
    });
    cpEntAviso('✅ Comentario publicado. El cliente lo verá en el entrenamiento.');
    await cpEntRecargar();
  } catch (error) {
    boton.disabled = false;
    cpEntAviso(`No se pudo publicar el comentario: ${error.message}`, true);
  }
}

async function cargarEntrenamientoFicha() {
  cpEnt.clienteId = new URLSearchParams(location.search).get('id');
  const cont = document.getElementById('cp-ent-lista');
  if (!cpEnt.clienteId) {
    cont.textContent = 'No se pueden consultar los entrenamientos sin identificar al cliente.';
    return;
  }
  document.getElementById('cp-ent-periodo').addEventListener('change', (event) => {
    cpEnt.dias = Number(event.target.value);
    cpEntRecargar();
  });
  document.getElementById('cp-ent-asignar').addEventListener('click', () => EntMgr.abrirAsignar({
    clienteId: cpEnt.clienteId,
    onAsignado: (asignados) => {
      asignados.forEach((a) => cpEnt.abiertos.add(a.id));
      cpEntAviso(`✅ Asignado (${asignados.length} ${asignados.length === 1 ? 'día' : 'días'}). El cliente ya lo ve en FitNova Go.`);
      cpEntRecargar();
    },
  }));
  document.getElementById('cp-ent-crear').addEventListener('click', () => cpEntEditor(null));
  document.getElementById('cp-ent-asignar-programa').addEventListener('click', () => ProgramasMgr.abrirAsignar({
    clienteId: cpEnt.clienteId,
    onAsignado: (cantidad) => {
      cpEntAviso(`✅ Programa asignado: ${cantidad} entrenamientos. El cliente ya los ve en FitNova Go.`);
      cpEntRecargar();
    },
  }));
  cont.addEventListener('click', (event) => {
    const boton = event.target.closest('[data-ent-accion]');
    if (boton) cpEntAccion(boton);
  });
  cont.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-ent-comentar]');
    if (!form) return;
    event.preventDefault();
    cpEntComentar(form);
  });
  try {
    cpEnt.profesionalId = await EntMgr.profesionalId();
  } catch (error) {
    cpEntAviso(error.message, true);
  }
  await cpEntRecargar();
}
