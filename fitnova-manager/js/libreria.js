// FitNova Manager · Librería de entrenamientos y vídeos (Supabase).
const E = window.FitNovaEntrenos;
const lib = { workouts: [], ejercicios: [], programas: [], videos: [], cargado: false };

function libPestanaActiva() {
  const activa = document.querySelector('.tab-btn.active[data-tab-group="lib"]');
  return activa ? activa.dataset.tab : 'workouts';
}

function libNormalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function libVacio(icono, titulo, texto, boton, accion) {
  return `<div class="empty-state">
    <div class="empty-icon">${icono}</div>
    <h3>${titulo}</h3>
    <p>${texto}</p>
    ${boton ? `<button class="btn-primary" type="button" data-lib-accion="${accion}">${boton}</button>` : ''}
  </div>`;
}

function libPintarContadores() {
  document.getElementById('lib-count-workouts').textContent = lib.workouts.length;
  document.getElementById('lib-count-ejercicios').textContent = lib.ejercicios.length;
  document.getElementById('lib-count-programas').textContent = lib.programas.length;
  document.getElementById('lib-count-videos').textContent = lib.videos.length;
}

function libPintarVideos() {
  const caja = document.getElementById('lib-videos');
  if (!lib.videos.length) {
    caja.innerHTML = libVacio('🎬', 'Aún no tienes vídeos', 'Añade enlaces de YouTube o Vimeo y elige qué clientes pueden verlos.', 'Añadir vídeo', 'nuevo-video');
    return;
  }
  const q = libNormalizar(document.getElementById('lib-buscar').value);
  const lista = lib.videos.filter((v) => libNormalizar(`${v.titulo} ${v.descripcion || ''} ${v.categoria || ''}`).includes(q));
  if (!lista.length) { caja.innerHTML = '<p>Ningún vídeo coincide con la búsqueda.</p>'; return; }
  caja.innerHTML = `<table class="data-table"><thead><tr><th>Vídeo</th><th>Actividad</th><th>Estado</th><th>Clientes</th><th>Acciones</th></tr></thead>
    <tbody>${lista.map((v) => `<tr><td><strong>${E.escapar(v.titulo)}</strong>${v.duracion_min ? ` · ${v.duracion_min} min` : ''}</td>
      <td>${E.escapar(v.categoria || '—')}</td><td>${v.publicado ? 'Publicado' : 'Borrador'}</td><td>${v.video_destinatarios.length}</td>
      <td><button class="btn-outline" type="button" data-lib-accion="editar-video" data-id="${v.id}">Editar y destinatarios</button>
      <button class="btn-outline" type="button" data-lib-accion="borrar-video" data-id="${v.id}">Eliminar</button></td></tr>`).join('')}</tbody></table>`;
}

function libPintarProgramas() {
  const caja = document.getElementById('lib-programas');
  if (!lib.programas.length) {
    caja.innerHTML = libVacio('📋', 'Aún no tienes programas', 'Organiza tus workouts por semana y día.', 'Crear programa', 'nuevo-programa');
    return;
  }
  const q = libNormalizar(document.getElementById('lib-buscar').value);
  const lista = lib.programas.filter((p) => libNormalizar(`${p.nombre} ${p.descripcion || ''}`).includes(q));
  if (!lista.length) { caja.innerHTML = '<p>Ningún programa coincide con la búsqueda.</p>'; return; }
  caja.innerHTML = `<table class="data-table"><thead><tr><th>Programa</th><th>Duración</th><th>Entrenamientos</th><th>Acciones</th></tr></thead>
    <tbody>${lista.map((p) => {
    const semanas = Math.max(...p.programa_workouts.map((x) => x.semana));
    return `<tr><td><strong>${E.escapar(p.nombre)}</strong>${p.descripcion ? `<div>${E.escapar(p.descripcion)}</div>` : ''}</td>
    <td>${semanas} ${semanas === 1 ? 'semana' : 'semanas'}</td><td>${p.programa_workouts.length}</td>
    <td><button class="btn-primary" type="button" data-lib-accion="asignar-programa" data-id="${p.id}">Asignar</button>
    <button class="btn-outline" type="button" data-lib-accion="editar-programa" data-id="${p.id}">Editar</button>
    <button class="btn-outline" type="button" data-lib-accion="duplicar-programa" data-id="${p.id}">Duplicar</button>
    <button class="btn-outline" type="button" data-lib-accion="borrar-programa" data-id="${p.id}">Eliminar</button></td></tr>`;
  }).join('')}</tbody></table>`;
}

function libPintarWorkouts() {
  const caja = document.getElementById('lib-workouts');
  if (!lib.workouts.length) {
    caja.innerHTML = libVacio('💪', 'Todavía no has creado ningún workout',
      'Crea entrenamientos con ejercicios de tu catálogo y asígnalos a tus clientes.', 'Crear workout', 'nuevo-workout');
    return;
  }
  const q = libNormalizar(document.getElementById('lib-buscar').value);
  const lista = lib.workouts.filter((w) => !q || libNormalizar(`${w.nombre} ${w.descripcion || ''} ${w.ejercicios.map((it) => it.nombre).join(' ')}`).includes(q));
  if (!lista.length) {
    caja.innerHTML = '<p style="color:var(--gris-texto);">Ningún workout coincide con la búsqueda.</p>';
    return;
  }
  caja.innerHTML = `<table class="data-table">
    <thead><tr><th>Workout</th><th>Ejercicios</th><th>Actualizado</th><th style="text-align:right;">Acciones</th></tr></thead>
    <tbody>${lista.map((w) => `<tr>
      <td><strong>${E.escapar(w.nombre)}</strong>${w.descripcion ? `<div style="font-size:12px;color:var(--gris-texto);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${E.escapar(w.descripcion)}</div>` : ''}</td>
      <td style="font-size:13px;max-width:360px;">${w.ejercicios.length} · <span style="color:var(--gris-texto);">${E.escapar(w.ejercicios.slice(0, 4).map((it) => it.nombre).join(', '))}${w.ejercicios.length > 4 ? '…' : ''}</span></td>
      <td style="font-size:13px;white-space:nowrap;">${E.fechaLarga((w.actualizado_en || w.creado_en || '').slice(0, 10))}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-primary" type="button" data-lib-accion="asignar" data-id="${w.id}">Asignar</button>
        <button class="btn-outline" type="button" data-lib-accion="editar-workout" data-id="${w.id}">Editar</button>
        <button class="btn-outline" type="button" data-lib-accion="duplicar" data-id="${w.id}">Duplicar</button>
        <button class="btn-outline" type="button" data-lib-accion="borrar-workout" data-id="${w.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function libPintarEjercicios() {
  const caja = document.getElementById('lib-ejercicios');
  if (!lib.ejercicios.length) {
    caja.innerHTML = libVacio('🏋️', 'Tu catálogo de ejercicios está vacío',
      'Guarda cada ejercicio una vez (con su técnica y vídeo) y reutilízalo en todos tus workouts.', 'Crear ejercicio', 'nuevo-ejercicio');
    return;
  }
  const q = libNormalizar(document.getElementById('lib-buscar').value);
  const cat = document.getElementById('lib-filtro-categoria').value;
  const lista = lib.ejercicios.filter((e) => (!cat || e.categoria === cat)
    && (!q || libNormalizar(`${e.nombre} ${e.instrucciones || ''}`).includes(q)));
  if (!lista.length) {
    caja.innerHTML = '<p style="color:var(--gris-texto);">Ningún ejercicio coincide con la búsqueda.</p>';
    return;
  }
  caja.innerHTML = `<table class="data-table">
    <thead><tr><th>Ejercicio</th><th>Categoría</th><th>Vídeo</th><th style="text-align:right;">Acciones</th></tr></thead>
    <tbody>${lista.map((e) => `<tr>
      <td><strong>${E.escapar(e.nombre)}</strong>${e.instrucciones ? `<div style="font-size:12px;color:var(--gris-texto);max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${E.escapar(e.instrucciones)}</div>` : ''}</td>
      <td style="font-size:13px;">${e.categoria ? E.escapar(E.categoria(e.categoria).texto) : '—'}</td>
      <td style="font-size:13px;">${e.video_url ? `<a href="${E.escapar(e.video_url)}" target="_blank" rel="noopener noreferrer">▶ Ver</a>` : '—'}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-outline" type="button" data-lib-accion="editar-ejercicio" data-id="${e.id}">Editar</button>
        <button class="btn-outline" type="button" data-lib-accion="borrar-ejercicio" data-id="${e.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function libPintar() {
  libPintarContadores();
  libPintarWorkouts();
  libPintarEjercicios();
  libPintarProgramas();
  libPintarVideos();
  document.getElementById('lib-filtro-categoria').style.display = libPestanaActiva() === 'ejercicios' ? '' : 'none';
}

async function libCargar() {
  const aviso = document.getElementById('lib-error');
  aviso.textContent = '';
  try {
    const [workouts, ejercicios, programas, videos] = await Promise.all([E.listarWorkouts(supabaseClient), EntMgr.catalogo(true), ProgramasMgr.listar(), VideosMgr.listar()]);
    lib.workouts = workouts;
    lib.ejercicios = ejercicios;
    lib.programas = programas;
    lib.videos = videos;
    lib.cargado = true;
    libPintar();
  } catch (e) {
    aviso.textContent = `No se pudo cargar la librería: ${e.message}`;
    document.getElementById('lib-workouts').innerHTML = '';
    document.getElementById('lib-ejercicios').innerHTML = '';
    document.getElementById('lib-programas').innerHTML = '';
    document.getElementById('lib-videos').innerHTML = '';
  }
}

function libEditorWorkout(workout, duplicar = false) {
  const editar = workout && !duplicar;
  EntMgr.abrirEditor({
    titulo: editar ? 'Editar workout' : (duplicar ? 'Duplicar workout' : 'Nuevo workout'),
    datos: workout ? {
      nombre: duplicar ? `${workout.nombre} (copia)`.slice(0, 120) : workout.nombre,
      descripcion: workout.descripcion,
      ejercicios: workout.ejercicios,
    } : null,
    textoBoton: editar ? 'Guardar cambios' : 'Crear workout',
    onGuardar: async (fila) => {
      await E.guardarWorkout(supabaseClient, await EntMgr.profesionalId(), editar ? workout.id : null, fila);
      await libCargar();
    },
  });
}

function libEditorEjercicio(ejercicio) {
  EntMgr.abrirEjercicio(ejercicio, () => {
    lib.ejercicios = EntMgr.estado.catalogo;
    libPintar();
  });
}

async function libAccion(accion, id) {
  const aviso = document.getElementById('lib-error');
  const workout = lib.workouts.find((w) => w.id === id);
  const ejercicio = lib.ejercicios.find((e) => e.id === id);
  const programa = lib.programas.find((p) => p.id === id);
  const video = lib.videos.find((v) => v.id === id);
  aviso.textContent = '';
  try {
    if (accion === 'nuevo-workout') libEditorWorkout(null);
    if (accion === 'nuevo-ejercicio') libEditorEjercicio(null);
    if (accion === 'nuevo-programa') ProgramasMgr.abrirEditor(null, libCargar);
    if (accion === 'nuevo-video') VideosMgr.abrir(null, libCargar);
    if (accion === 'editar-video' && video) VideosMgr.abrir(video, libCargar);
    if (accion === 'borrar-video' && video) {
      if (!window.confirm(`¿Eliminar «${video.titulo}»? Los clientes dejarán de verlo en FitNova Go.`)) return;
      await VideosMgr.eliminar(video.id);
      await libCargar();
    }
    if (accion === 'editar-programa' && programa) ProgramasMgr.abrirEditor(programa, libCargar);
    if (accion === 'duplicar-programa' && programa) ProgramasMgr.abrirEditor(programa, libCargar, true);
    if (accion === 'asignar-programa' && programa) {
      ProgramasMgr.abrirAsignar({ programa, onAsignado: (cantidad) => {
        aviso.style.color = 'var(--verde, #1a7f4b)';
        aviso.textContent = `✅ Programa «${programa.nombre}» asignado: ${cantidad} entrenamientos.`;
      } });
      return;
    }
    if (accion === 'borrar-programa' && programa) {
      if (!window.confirm(`¿Eliminar «${programa.nombre}» de tu librería? Los entrenamientos ya asignados no se borran.`)) return;
      await ProgramasMgr.eliminar(programa.id);
      await libCargar();
    }
    if (accion === 'editar-workout' && workout) libEditorWorkout(workout);
    if (accion === 'duplicar' && workout) libEditorWorkout(workout, true);
    if (accion === 'editar-ejercicio' && ejercicio) libEditorEjercicio(ejercicio);
    if (accion === 'asignar' && workout) {
      EntMgr.abrirAsignar({
        workout,
        onAsignado: (asignados) => {
          aviso.style.color = 'var(--verde, #1a7f4b)';
          aviso.textContent = `✅ «${workout.nombre}» asignado (${asignados.length} ${asignados.length === 1 ? 'día' : 'días'}). Lo verás en la ficha del cliente → Entrenamiento.`;
        },
      });
      return;
    }
    if (accion === 'borrar-workout' && workout) {
      if (lib.programas.some((p) => p.programa_workouts.some((it) => it.workout_id === workout.id))) {
        aviso.textContent = 'Este workout está incluido en un programa. Quítalo del programa antes de eliminarlo.';
        return;
      }
      if (!window.confirm(`¿Eliminar el workout «${workout.nombre}» de tu librería?\n\nLo que ya asignaste a tus clientes no se borra.`)) return;
      await E.eliminarWorkout(supabaseClient, workout.id);
      await libCargar();
    }
    if (accion === 'borrar-ejercicio' && ejercicio) {
      if (!window.confirm(`¿Eliminar «${ejercicio.nombre}» del catálogo?\n\nLos workouts que ya lo incluyen lo conservan tal cual.`)) return;
      await E.eliminarEjercicio(supabaseClient, ejercicio.id);
      await libCargar();
    }
    aviso.style.color = '';
  } catch (e) {
    aviso.style.color = '';
    aviso.textContent = `No se pudo completar la acción: ${e.message}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;

  const filtro = document.getElementById('lib-filtro-categoria');
  filtro.insertAdjacentHTML('beforeend', E.CATEGORIAS.map((c) => `<option value="${c.valor}">${c.texto}</option>`).join(''));
  filtro.addEventListener('change', libPintarEjercicios);
  document.getElementById('lib-buscar').addEventListener('input', () => { libPintarWorkouts(); libPintarEjercicios(); libPintarProgramas(); libPintarVideos(); });
  document.querySelectorAll('.tab-btn[data-tab-group="lib"]').forEach((btn) => btn.addEventListener('click', () => {
    filtro.style.display = btn.dataset.tab === 'ejercicios' ? '' : 'none';
  }));
  document.getElementById('lib-crear').addEventListener('click', () => {
    const pestana = libPestanaActiva();
    if (pestana === 'workouts') libAccion('nuevo-workout');
    else if (pestana === 'ejercicios') libAccion('nuevo-ejercicio');
    else if (pestana === 'programas') libAccion('nuevo-programa');
    else if (pestana === 'videos') libAccion('nuevo-video');
    else openModal('modal-crear-item');
  });
  document.querySelector('.page-body').addEventListener('click', (event) => {
    const boton = event.target.closest('[data-lib-accion]');
    if (boton) libAccion(boton.dataset.libAccion, boton.dataset.id);
  });

  try {
    await EntMgr.profesionalId();
  } catch (e) {
    document.getElementById('lib-error').textContent = e.message;
    return;
  }
  await libCargar();
});
