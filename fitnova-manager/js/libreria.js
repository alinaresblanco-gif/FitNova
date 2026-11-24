// FitNova Manager · Librería de entrenamientos y vídeos (Supabase).
const E = window.FitNovaEntrenos;
const lib = { workouts: [], ejercicios: [], programas: [], videos: [], recetas: [], planes: [], cargado: false };

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
  document.getElementById('lib-count-recetas').textContent = lib.recetas.length;
  document.getElementById('lib-count-planes').textContent = lib.planes.length;
}

function libPintarNutricion() {
  const q = libNormalizar(document.getElementById('lib-buscar').value);
  const recetas = lib.recetas.filter((r) => libNormalizar(`${r.titulo} ${r.descripcion || ''} ${r.ingredientes}`).includes(q));
  const planes = lib.planes.filter((p) => libNormalizar(`${p.nombre} ${p.descripcion || ''}`).includes(q));
  document.getElementById('lib-recetas').innerHTML = !lib.recetas.length
    ? libVacio('🍳', 'Tu recetario está vacío', 'Crea recetas para incorporarlas a tus planes.', 'Añadir receta', 'nueva-receta')
    : recetas.length ? `<table class="data-table"><thead><tr><th>Receta</th><th>Datos</th><th>Acciones</th></tr></thead><tbody>${recetas.map((r) => `<tr><td><strong>${E.escapar(r.titulo)}</strong></td><td>${r.kcal ? `${r.kcal} kcal` : ''} ${r.raciones ? `· ${r.raciones} raciones` : ''}</td><td><button class="btn-outline" data-lib-accion="editar-receta" data-id="${r.id}">Editar</button> <button class="btn-outline" data-lib-accion="borrar-receta" data-id="${r.id}">Eliminar</button></td></tr>`).join('')}</tbody></table>` : '<p>Ninguna receta coincide con la búsqueda.</p>';
  document.getElementById('lib-planes').innerHTML = !lib.planes.length
    ? libVacio('🥗', 'No hay planes nutricionales', 'Organiza las comidas de cada día y asígnalas a tus clientes.', 'Crear plan', 'nuevo-plan')
    : planes.length ? `<table class="data-table"><thead><tr><th>Plan</th><th>Acciones</th></tr></thead><tbody>${planes.map((p) => `<tr><td><strong>${E.escapar(p.nombre)}</strong>${p.descripcion ? `<div>${E.escapar(p.descripcion)}</div>` : ''}</td><td><button class="btn-primary" data-lib-accion="asignar-plan" data-id="${p.id}">Asignar</button> <button class="btn-outline" data-lib-accion="editar-plan" data-id="${p.id}">Editar</button> <button class="btn-outline" data-lib-accion="borrar-plan" data-id="${p.id}">Eliminar</button></td></tr>`).join('')}</tbody></table>` : '<p>Ningún plan coincide con la búsqueda.</p>';
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
  libPintarNutricion();
  document.getElementById('lib-filtro-categoria').style.display = libPestanaActiva() === 'ejercicios' ? '' : 'none';
}

async function libCargar() {
  const aviso = document.getElementById('lib-error');
  aviso.textContent = '';
  try {
    const [workouts, ejercicios, programas, videos, recetas, planes] = await Promise.all([E.listarWorkouts(supabaseClient), EntMgr.catalogo(true), ProgramasMgr.listar(), VideosMgr.listar(), NutPlanesMgr.listarRecetas(), NutPlanesMgr.listarPlanes()]);
    lib.workouts = workouts;
    lib.ejercicios = ejercicios;
    lib.programas = programas;
    lib.videos = videos;
    lib.recetas = recetas;
    lib.planes = planes;
    lib.cargado = true;
    libPintar();
  } catch (e) {
    aviso.textContent = `No se pudo cargar la librería: ${e.message}`;
    document.getElementById('lib-workouts').innerHTML = '';
    document.getElementById('lib-ejercicios').innerHTML = '';
    document.getElementById('lib-programas').innerHTML = '';
    document.getElementById('lib-videos').innerHTML = '';
    document.getElementById('lib-recetas').innerHTML = '';
    document.getElementById('lib-planes').innerHTML = '';
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
  const receta = lib.recetas.find((r) => r.id === id);
  const plan = lib.planes.find((p) => p.id === id);
  aviso.textContent = '';
  try {
    if (accion === 'nuevo-workout') libEditorWorkout(null);
    if (accion === 'nuevo-ejercicio') libEditorEjercicio(null);
    if (accion === 'nuevo-programa') ProgramasMgr.abrirEditor(null, libCargar);
    if (accion === 'nuevo-video') VideosMgr.abrir(null, libCargar);
    if (accion === 'nueva-receta') NutPlanesMgr.abrirReceta(null, libCargar);
    if (accion === 'editar-receta' && receta) NutPlanesMgr.abrirReceta(receta, libCargar);
    if (accion === 'nuevo-plan') await NutPlanesMgr.abrirPlan(null, libCargar);
    if (accion === 'editar-plan' && plan) await NutPlanesMgr.abrirPlan(plan, libCargar);
    if (accion === 'asignar-plan' && plan) {
      await NutPlanesMgr.abrirAsignar({ plan, onAsignado: () => { aviso.textContent = `Plan «${plan.nombre}» asignado.`; } });
      return;
    }
    if (accion === 'borrar-receta' && receta) {
      if (lib.planes.some((p) => p.dias.some((d) => d.comidas.some((c) => c.receta_id === receta.id)))) {
        aviso.textContent = 'Esta receta está incluida en una plantilla. Quítala de los planes antes de eliminarla.';
        return;
      }
      if (!window.confirm(`¿Eliminar «${receta.titulo}»? Las copias ya asignadas no cambian.`)) return;
      await NutPlanesMgr.eliminar('recetas', receta.id);
      await libCargar();
      try { await NutPlanesMgr.limpiarFoto(receta.foto_ruta); }
      catch (e) { aviso.textContent = `La receta se eliminó, pero no se pudo limpiar su foto: ${e.message}`; }
    }
    if (accion === 'borrar-plan' && plan) {
      if (!window.confirm(`¿Eliminar «${plan.nombre}»? Los planes ya asignados no cambian.`)) return;
      await NutPlanesMgr.eliminar('planes_nutricionales', plan.id);
      await libCargar();
    }
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
  document.getElementById('lib-buscar').addEventListener('input', () => { libPintarWorkouts(); libPintarEjercicios(); libPintarProgramas(); libPintarVideos(); libPintarNutricion(); });
  document.querySelectorAll('.tab-btn[data-tab-group="lib"]').forEach((btn) => btn.addEventListener('click', () => {
    filtro.style.display = btn.dataset.tab === 'ejercicios' ? '' : 'none';
  }));
  document.getElementById('lib-crear').addEventListener('click', () => {
    const pestana = libPestanaActiva();
    if (pestana === 'workouts') libAccion('nuevo-workout');
    else if (pestana === 'ejercicios') libAccion('nuevo-ejercicio');
    else if (pestana === 'programas') libAccion('nuevo-programa');
    else if (pestana === 'videos') libAccion('nuevo-video');
    else if (pestana === 'recetas') libAccion('nueva-receta');
    else if (pestana === 'nutricion') libAccion('nuevo-plan');
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
