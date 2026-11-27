// FitNova Manager · ventanas compartidas de entrenamientos (Librería y ficha de cliente):
// alta/edición de ejercicios del catálogo, editor de workouts y asignación a clientes.
const EntMgr = (() => {
  const E = window.FitNovaEntrenos;
  const CAMPO = 'width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid #D9D9D9;font:inherit;';
  const CELDA = 'width:100%;box-sizing:border-box;padding:7px 6px;border-radius:8px;border:1px solid #D9D9D9;font:inherit;font-size:13px;';
  const estado = {
    profesionalId: null, catalogo: [], catalogoCargado: false,
    editor: null, ejercicio: null, asignar: null,
  };

  async function profesionalId() {
    if (estado.profesionalId) return estado.profesionalId;
    const { data, error } = await supabaseClient.rpc('profesional_actual_id');
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No hay un perfil profesional ligado a esta cuenta.');
    estado.profesionalId = data;
    return data;
  }

  async function catalogo(forzar = false) {
    if (!estado.catalogoCargado || forzar) {
      estado.catalogo = await E.listarEjercicios(supabaseClient);
      estado.catalogoCargado = true;
    }
    return estado.catalogo;
  }

  function insertarModales() {
    if (document.getElementById('modal-ent-editor')) return;
    const cats = E.CATEGORIAS.map((c) => `<option value="${c.valor}">${c.texto}</option>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
  <style>#modal-ent-editor [hidden], #modal-ent-asignar [hidden] { display: none !important; }</style>
  <div class="modal-overlay" id="modal-ent-editor">
    <div class="modal" style="max-width:1040px;">
      <div class="modal-header">
        <h2 id="ent-editor-titulo">Nuevo workout</h2>
        <button class="modal-close" type="button" onclick="closeModal('modal-ent-editor')">✕</button>
      </div>
      <form id="ent-editor-form" novalidate>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <label style="flex:2;min-width:240px;font-size:13px;font-weight:600;">Nombre
            <input id="ent-editor-nombre" maxlength="120" required placeholder="Ej. Fuerza tren superior" style="${CAMPO}margin-top:4px;" />
          </label>
          <label id="ent-editor-fecha-campo" style="flex:1;min-width:160px;font-size:13px;font-weight:600;" hidden>Día del entrenamiento
            <input type="date" id="ent-editor-fecha" style="${CAMPO}margin-top:4px;" />
          </label>
        </div>
        <label style="display:block;margin-top:10px;font-size:13px;font-weight:600;">Descripción e indicaciones generales (opcional)
          <textarea id="ent-editor-desc" maxlength="2000" rows="2" placeholder="Ej. Calienta 10 minutos antes de empezar." style="${CAMPO}margin-top:4px;"></textarea>
        </label>
        <h3 style="margin:16px 0 6px;font-size:15px;">Ejercicios</h3>
        <p style="font-size:12px;color:#55606f;margin:0 0 8px;">Rellena solo lo que necesites. Repeticiones admite rangos (8-12). Tiempo y descanso en segundos.</p>
        <div style="overflow-x:auto;">
          <table class="data-table" style="min-width:900px;">
            <thead><tr><th>#</th><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Carga (kg)</th><th>Tiempo (s)</th><th>Descanso (s)</th><th>Notas para el cliente</th><th></th></tr></thead>
            <tbody id="ent-editor-filas"></tbody>
          </table>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;">
          <select id="ent-editor-catalogo" style="${CAMPO}width:auto;min-width:260px;"></select>
          <button class="btn-outline" type="button" id="ent-editor-anadir">Añadir</button>
          <button class="btn-outline" type="button" id="ent-editor-nuevo-ej">+ Nuevo ejercicio al catálogo</button>
        </div>
        <p id="ent-editor-error" role="alert" style="color:var(--rojo);margin:10px 0 0;"></p>
        <button class="btn-primary" type="submit" id="ent-editor-guardar" style="margin-top:12px;">Guardar</button>
      </form>
    </div>
  </div>
  <div class="modal-overlay" id="modal-ent-ejercicio">
    <div class="modal">
      <div class="modal-header">
        <h2 id="ent-ej-titulo">Nuevo ejercicio</h2>
        <button class="modal-close" type="button" onclick="closeModal('modal-ent-ejercicio')">✕</button>
      </div>
      <form id="ent-ej-form" novalidate>
        <label style="display:block;font-size:13px;font-weight:600;">Nombre
          <input id="ent-ej-nombre" maxlength="120" placeholder="Ej. Sentadilla goblet" style="${CAMPO}margin:4px 0 10px;" />
        </label>
        <label style="display:block;font-size:13px;font-weight:600;">Categoría (opcional)
          <select id="ent-ej-categoria" style="${CAMPO}margin:4px 0 10px;"><option value="">Sin categoría</option>${cats}</select>
        </label>
        <label style="display:block;font-size:13px;font-weight:600;">Instrucciones / técnica (opcional)
          <textarea id="ent-ej-instrucciones" maxlength="2000" rows="4" placeholder="Cómo se hace, puntos clave, errores comunes..." style="${CAMPO}margin:4px 0 10px;"></textarea>
        </label>
        <label style="display:block;font-size:13px;font-weight:600;">Vídeo de YouTube o Vimeo (opcional)
          <input id="ent-ej-video" maxlength="500" placeholder="https://youtu.be/... o https://vimeo.com/..." style="${CAMPO}margin:4px 0 4px;" />
        </label>
        <p style="font-size:12px;color:#55606f;margin:0 0 6px;">En YouTube puedes subirlo como «Oculto»: solo lo verá quien tenga el enlace.</p>
        <div id="ent-ej-preview" style="margin:8px 0;"></div>
        <p id="ent-ej-error" role="alert" style="color:var(--rojo);margin:6px 0 0;"></p>
        <button class="btn-primary" type="submit" id="ent-ej-guardar" style="margin-top:10px;width:100%;justify-content:center;">Guardar ejercicio</button>
      </form>
    </div>
  </div>
  <div class="modal-overlay" id="modal-ent-asignar">
    <div class="modal">
      <div class="modal-header">
        <h2 id="ent-asig-titulo">Asignar workout</h2>
        <button class="modal-close" type="button" onclick="closeModal('modal-ent-asignar')">✕</button>
      </div>
      <form id="ent-asig-form" novalidate>
        <p id="ent-asig-info" style="font-size:13px;color:#55606f;margin:0 0 10px;"></p>
        <label id="ent-asig-cliente-campo" style="display:block;font-size:13px;font-weight:600;">Cliente
          <select id="ent-asig-cliente" style="${CAMPO}margin:4px 0 10px;"></select>
        </label>
        <label id="ent-asig-workout-campo" style="display:block;font-size:13px;font-weight:600;">Workout de tu librería
          <select id="ent-asig-workout" style="${CAMPO}margin:4px 0 10px;"></select>
        </label>
        <label style="display:block;font-size:13px;font-weight:600;">Día del entrenamiento
          <input type="date" id="ent-asig-fecha" style="${CAMPO}margin:4px 0 10px;" />
        </label>
        <label style="display:block;font-size:13px;font-weight:600;">Repetir cada semana durante
          <select id="ent-asig-semanas" style="${CAMPO}margin:4px 0 4px;">
            <option value="1">Solo ese día</option><option value="2">2 semanas</option><option value="4">4 semanas</option>
            <option value="6">6 semanas</option><option value="8">8 semanas</option><option value="12">12 semanas</option>
          </select>
        </label>
        <p style="font-size:12px;color:#55606f;margin:0 0 6px;">Se crea una copia para el cliente. Si luego cambias la plantilla, lo ya asignado no cambia; puedes ajustarlo solo para él desde su ficha.</p>
        <p id="ent-asig-error" role="alert" style="color:var(--rojo);margin:6px 0 0;"></p>
        <button class="btn-primary" type="submit" id="ent-asig-guardar" style="margin-top:10px;width:100%;justify-content:center;">Asignar</button>
      </form>
    </div>
  </div>`);

    document.getElementById('ent-editor-form').addEventListener('submit', guardarEditor);
    document.getElementById('ent-editor-anadir').addEventListener('click', anadirDesdeCatalogo);
    document.getElementById('ent-editor-nuevo-ej').addEventListener('click', () => abrirEjercicio(null, (ej) => {
      estado.editor.items.push(E.itemDesdeCatalogo(ej));
      pintarFilas();
      pintarSelectCatalogo();
    }));
    const filas = document.getElementById('ent-editor-filas');
    filas.addEventListener('input', (event) => {
      const campo = event.target.closest('[data-campo]');
      if (!campo) return;
      estado.editor.items[Number(campo.dataset.fila)][campo.dataset.campo] = campo.value;
    });
    filas.addEventListener('click', (event) => {
      const boton = event.target.closest('[data-accion]');
      if (!boton) return;
      const i = Number(boton.dataset.fila);
      const items = estado.editor.items;
      if (boton.dataset.accion === 'quitar') items.splice(i, 1);
      if (boton.dataset.accion === 'subir' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      if (boton.dataset.accion === 'bajar' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      pintarFilas();
    });
    document.getElementById('ent-ej-form').addEventListener('submit', guardarEjercicioForm);
    document.getElementById('ent-ej-video').addEventListener('input', (event) => {
      document.getElementById('ent-ej-preview').innerHTML = E.videoHtml(event.target.value.trim(), 'Vista previa');
    });
    document.getElementById('ent-asig-form').addEventListener('submit', guardarAsignar);
  }

  // ----------------------------------------------------------- ejercicios
  function abrirEjercicio(ej, onGuardado) {
    insertarModales();
    estado.ejercicio = { id: ej ? ej.id : null, onGuardado };
    document.getElementById('ent-ej-titulo').textContent = ej ? 'Editar ejercicio' : 'Nuevo ejercicio';
    document.getElementById('ent-ej-nombre').value = ej ? ej.nombre : '';
    document.getElementById('ent-ej-categoria').value = ej ? (ej.categoria || '') : '';
    document.getElementById('ent-ej-instrucciones').value = ej ? (ej.instrucciones || '') : '';
    document.getElementById('ent-ej-video').value = ej ? (ej.video_url || '') : '';
    document.getElementById('ent-ej-preview').innerHTML = ej ? E.videoHtml(ej.video_url, ej.nombre) : '';
    document.getElementById('ent-ej-error').textContent = '';
    openModal('modal-ent-ejercicio');
    document.getElementById('ent-ej-nombre').focus();
  }

  async function guardarEjercicioForm(event) {
    event.preventDefault();
    const aviso = document.getElementById('ent-ej-error');
    const boton = document.getElementById('ent-ej-guardar');
    const { fila, error } = E.validarEjercicio({
      nombre: document.getElementById('ent-ej-nombre').value,
      categoria: document.getElementById('ent-ej-categoria').value,
      instrucciones: document.getElementById('ent-ej-instrucciones').value,
      video_url: document.getElementById('ent-ej-video').value,
    });
    if (error) { aviso.textContent = error; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const guardado = await E.guardarEjercicio(supabaseClient, await profesionalId(), estado.ejercicio.id, fila);
      const i = estado.catalogo.findIndex((e) => e.id === guardado.id);
      if (i >= 0) estado.catalogo[i] = guardado; else estado.catalogo.push(guardado);
      estado.catalogo.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      closeModal('modal-ent-ejercicio');
      if (estado.ejercicio.onGuardado) estado.ejercicio.onGuardado(guardado);
    } catch (e) {
      aviso.textContent = `No se pudo guardar: ${e.message}`;
    } finally {
      boton.disabled = false;
    }
  }

  // --------------------------------------------------------------- editor
  function pintarSelectCatalogo() {
    const select = document.getElementById('ent-editor-catalogo');
    select.innerHTML = estado.catalogo.length
      ? `<option value="">Elige un ejercicio de tu catálogo...</option>${estado.catalogo.map((e) => (
        `<option value="${e.id}">${E.escapar(e.nombre)}${e.categoria ? ` · ${E.escapar(E.categoria(e.categoria).texto)}` : ''}${e.video_url ? ' ▶' : ''}</option>`)).join('')}`
      : '<option value="">Tu catálogo está vacío: crea un ejercicio nuevo</option>';
  }

  function celda(i, campo, valor, extra = '') {
    return `<input data-fila="${i}" data-campo="${campo}" value="${E.escapar(valor ?? '')}" style="${CELDA}" ${extra} />`;
  }

  function pintarFilas() {
    const items = estado.editor.items;
    const cuerpo = document.getElementById('ent-editor-filas');
    if (!items.length) {
      cuerpo.innerHTML = '<tr><td colspan="9" style="color:#55606f;font-size:13px;">Añade ejercicios desde tu catálogo.</td></tr>';
      return;
    }
    cuerpo.innerHTML = items.map((it, i) => `<tr>
      <td style="width:28px;">${i + 1}</td>
      <td style="min-width:170px;"><strong style="font-size:13px;">${E.escapar(it.nombre)}</strong>${it.video_url ? ' <span title="Tiene vídeo">▶</span>' : ''}</td>
      <td style="width:70px;">${celda(i, 'series', it.series, 'inputmode="numeric" placeholder="3"')}</td>
      <td style="width:80px;">${celda(i, 'repeticiones', it.repeticiones, 'maxlength="20" placeholder="10"')}</td>
      <td style="width:80px;">${celda(i, 'carga_kg', it.carga_kg, 'inputmode="decimal" placeholder="—"')}</td>
      <td style="width:80px;">${celda(i, 'duracion_seg', it.duracion_seg, 'inputmode="numeric" placeholder="—"')}</td>
      <td style="width:80px;">${celda(i, 'descanso_seg', it.descanso_seg, 'inputmode="numeric" placeholder="60"')}</td>
      <td style="min-width:160px;">${celda(i, 'notas', it.notas, 'maxlength="500" placeholder="Opcional"')}</td>
      <td style="white-space:nowrap;">
        <button class="btn-outline" type="button" data-accion="subir" data-fila="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-outline" type="button" data-accion="bajar" data-fila="${i}" title="Bajar" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-outline" type="button" data-accion="quitar" data-fila="${i}" title="Quitar">✕</button>
      </td>
    </tr>`).join('');
  }

  function anadirDesdeCatalogo() {
    const id = document.getElementById('ent-editor-catalogo').value;
    const ej = estado.catalogo.find((e) => e.id === id);
    if (!ej) return;
    if (estado.editor.items.length >= E.MAX_EJERCICIOS) {
      document.getElementById('ent-editor-error').textContent = `Máximo ${E.MAX_EJERCICIOS} ejercicios por workout.`;
      return;
    }
    estado.editor.items.push(E.itemDesdeCatalogo(ej));
    document.getElementById('ent-editor-catalogo').value = '';
    pintarFilas();
  }

  // opciones: { titulo, datos: {nombre, descripcion, ejercicios}, fecha (si se pide día), textoBoton, onGuardar(fila, fecha) }
  async function abrirEditor(opciones) {
    insertarModales();
    const datos = opciones.datos || {};
    estado.editor = { ...opciones, items: (datos.ejercicios || []).map((it) => ({ ...it })) };
    document.getElementById('ent-editor-titulo').textContent = opciones.titulo;
    document.getElementById('ent-editor-nombre').value = datos.nombre || '';
    document.getElementById('ent-editor-desc').value = datos.descripcion || '';
    document.getElementById('ent-editor-fecha-campo').hidden = !opciones.fecha;
    document.getElementById('ent-editor-fecha').value = opciones.fecha || '';
    document.getElementById('ent-editor-guardar').textContent = opciones.textoBoton || 'Guardar';
    document.getElementById('ent-editor-error').textContent = '';
    pintarFilas();
    openModal('modal-ent-editor');
    try {
      await catalogo();
    } catch (e) {
      document.getElementById('ent-editor-error').textContent = `No se pudo cargar tu catálogo de ejercicios: ${e.message}`;
    }
    pintarSelectCatalogo();
  }

  async function guardarEditor(event) {
    event.preventDefault();
    const aviso = document.getElementById('ent-editor-error');
    const boton = document.getElementById('ent-editor-guardar');
    const { fila, error } = E.validarWorkout({
      nombre: document.getElementById('ent-editor-nombre').value,
      descripcion: document.getElementById('ent-editor-desc').value,
      ejercicios: estado.editor.items,
    });
    if (error) { aviso.textContent = error; return; }
    const fecha = estado.editor.fecha ? document.getElementById('ent-editor-fecha').value : null;
    if (estado.editor.fecha && !fecha) { aviso.textContent = 'Elige el día del entrenamiento.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      await estado.editor.onGuardar(fila, fecha);
      closeModal('modal-ent-editor');
    } catch (e) {
      aviso.textContent = `No se pudo guardar: ${e.message}`;
    } finally {
      boton.disabled = false;
    }
  }

  // -------------------------------------------------------------- asignar
  // opciones: { workout (plantilla fija) | clienteId (cliente fijo), onAsignado(asignados) }
  async function abrirAsignar(opciones) {
    insertarModales();
    estado.asignar = opciones;
    const aviso = document.getElementById('ent-asig-error');
    const selCliente = document.getElementById('ent-asig-cliente');
    const selWorkout = document.getElementById('ent-asig-workout');
    aviso.textContent = '';
    document.getElementById('ent-asig-fecha').value = opciones.fecha || E.hoyIso();
    document.getElementById('ent-asig-semanas').value = '1';
    document.getElementById('ent-asig-cliente-campo').hidden = Boolean(opciones.clienteId);
    document.getElementById('ent-asig-workout-campo').hidden = Boolean(opciones.workout);
    document.getElementById('ent-asig-info').textContent = opciones.workout
      ? `Workout: ${opciones.workout.nombre} (${opciones.workout.ejercicios.length} ejercicios)`
      : 'Elige uno de tus workouts y el día en que debe hacerlo.';
    document.getElementById('ent-asig-guardar').disabled = true;
    openModal('modal-ent-asignar');
    try {
      if (!opciones.clienteId) {
        selCliente.innerHTML = '<option value="">Cargando clientes...</option>';
        const { data, error } = await supabaseClient.from('clientes').select('id, nombre, apellidos')
          .eq('estado', 'activo').order('nombre');
        if (error) throw new Error(error.message);
        selCliente.innerHTML = (data || []).length
          ? `<option value="">Elige un cliente...</option>${data.map((c) => `<option value="${c.id}">${E.escapar(`${c.nombre} ${c.apellidos || ''}`.trim())}</option>`).join('')}`
          : '<option value="">No tienes clientes activos</option>';
      }
      if (!opciones.workout) {
        selWorkout.innerHTML = '<option value="">Cargando workouts...</option>';
        estado.asignar.plantillas = await E.listarWorkouts(supabaseClient);
        selWorkout.innerHTML = estado.asignar.plantillas.length
          ? `<option value="">Elige un workout...</option>${estado.asignar.plantillas.map((w) => `<option value="${w.id}">${E.escapar(w.nombre)} (${w.ejercicios.length} ejercicios)</option>`).join('')}`
          : '<option value="">Aún no tienes workouts: créalos en Librería → Workouts</option>';
      }
      await catalogo();
      document.getElementById('ent-asig-guardar').disabled = false;
    } catch (e) {
      aviso.textContent = `No se pudieron cargar los datos: ${e.message}`;
    }
  }

  async function guardarAsignar(event) {
    event.preventDefault();
    const aviso = document.getElementById('ent-asig-error');
    const boton = document.getElementById('ent-asig-guardar');
    const op = estado.asignar;
    const clienteId = op.clienteId || document.getElementById('ent-asig-cliente').value;
    const workout = op.workout || (op.plantillas || []).find((w) => w.id === document.getElementById('ent-asig-workout').value);
    const fecha = document.getElementById('ent-asig-fecha').value;
    const semanas = Number(document.getElementById('ent-asig-semanas').value);
    if (!clienteId) { aviso.textContent = 'Elige un cliente.'; return; }
    if (!workout) { aviso.textContent = 'Elige un workout.'; return; }
    if (!fecha) { aviso.textContent = 'Elige el día del entrenamiento.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    const asignados = [];
    try {
      const proId = await profesionalId();
      const fila = { nombre: workout.nombre, descripcion: workout.descripcion, ejercicios: E.refrescar(workout.ejercicios, estado.catalogo) };
      for (let s = 0; s < semanas; s += 1) {
        asignados.push(await E.asignar(supabaseClient, {
          clienteId, profesionalId: proId, fecha: E.sumarDias(fecha, s * 7), workoutOrigenId: workout.id, fila,
        }));
      }
      closeModal('modal-ent-asignar');
      if (op.onAsignado) op.onAsignado(asignados);
    } catch (e) {
      aviso.textContent = asignados.length
        ? `Se asignaron ${asignados.length} de ${semanas}; el resto falló: ${e.message}`
        : `No se pudo asignar: ${e.message}`;
      if (asignados.length && op.onAsignado) op.onAsignado(asignados);
    } finally {
      boton.disabled = false;
    }
  }

  return { CAMPO, profesionalId, catalogo, abrirEjercicio, abrirEditor, abrirAsignar, estado };
})();
