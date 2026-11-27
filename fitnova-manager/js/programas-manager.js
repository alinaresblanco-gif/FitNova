// Programas de la librería y asignación a clientes.
const ProgramasMgr = (() => {
  const E = window.FitNovaEntrenos;
  const campo = EntMgr.CAMPO;
  let editor;
  let asignacion;

  async function listar() {
    const { data, error } = await supabaseClient.from('programas')
      .select('id,nombre,descripcion,actualizado_en,programa_workouts(workout_id,semana,dia)')
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  function instalar() {
    if (document.getElementById('modal-programa-editor')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modal-programa-editor"><div class="modal" style="max-width:780px;">
        <div class="modal-header"><h2 id="programa-titulo"></h2><button class="modal-close" type="button" onclick="closeModal('modal-programa-editor')">✕</button></div>
        <form id="programa-form">
          <label>Nombre<input id="programa-nombre" maxlength="120" required style="${campo}"></label>
          <label>Descripción (opcional)<textarea id="programa-desc" maxlength="2000" rows="2" style="${campo}"></textarea></label>
          <p>El día 1 es la fecha de inicio elegida al asignar; el día 7 es seis días después. Puedes añadir varios workouts al mismo día.</p>
          <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Semana</th><th>Día</th><th>Workout</th><th></th></tr></thead><tbody id="programa-filas"></tbody></table></div>
          <button type="button" class="btn-outline" id="programa-anadir">+ Añadir workout</button>
          <p id="programa-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="programa-guardar">Guardar programa</button>
        </form></div></div>
      <div class="modal-overlay" id="modal-programa-asignar"><div class="modal">
        <div class="modal-header"><h2>Asignar programa</h2><button class="modal-close" type="button" onclick="closeModal('modal-programa-asignar')">✕</button></div>
        <form id="programa-asignar-form">
          <label id="programa-selector-campo">Programa<select id="programa-selector" style="${campo}"></select></label>
          <label id="programa-cliente-campo">Cliente<select id="programa-cliente" style="${campo}"></select></label>
          <label>Fecha de inicio (día 1, semana 1)<input type="date" id="programa-inicio" required style="${campo}"></label>
          <p id="programa-asignar-info"></p>
          <p>Se crean copias independientes. Cambiar o eliminar el programa después no modifica las asignaciones. Si vuelves a asignarlo se crearán nuevos entrenamientos.</p>
          <p id="programa-asignar-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="programa-asignar-boton">Asignar programa</button>
        </form></div></div>`);
    const filas = document.getElementById('programa-filas');
    filas.addEventListener('change', (event) => {
      const el = event.target.closest('[data-campo]');
      if (el) editor.items[Number(el.dataset.indice)][el.dataset.campo] = el.value;
    });
    filas.addEventListener('click', (event) => {
      const boton = event.target.closest('[data-quitar]');
      if (!boton) return;
      editor.items.splice(Number(boton.dataset.quitar), 1);
      pintarFilas();
    });
    document.getElementById('programa-anadir').addEventListener('click', () => {
      if (editor.items.length >= 200) {
        document.getElementById('programa-error').textContent = 'El programa admite hasta 200 entrenamientos.';
        return;
      }
      editor.items.push({ semana: 1, dia: 1, workout_id: '' });
      pintarFilas();
    });
    document.getElementById('programa-form').addEventListener('submit', guardar);
    document.getElementById('programa-asignar-form').addEventListener('submit', asignar);
    document.getElementById('programa-selector').addEventListener('change', mostrarInfo);
  }

  function pintarFilas() {
    document.getElementById('programa-filas').innerHTML = editor.items.map((it, i) => `<tr>
      <td><input aria-label="Semana" type="number" min="1" max="52" required data-campo="semana" data-indice="${i}" value="${E.escapar(it.semana)}" style="${campo}min-width:80px"></td>
      <td><input aria-label="Día" type="number" min="1" max="7" required data-campo="dia" data-indice="${i}" value="${E.escapar(it.dia)}" style="${campo}min-width:80px"></td>
      <td><select aria-label="Workout" required data-campo="workout_id" data-indice="${i}" style="${campo}min-width:220px">
        <option value="">Elige un workout...</option>${editor.workouts.map((w) => `<option value="${w.id}" ${w.id === it.workout_id ? 'selected' : ''}>${E.escapar(w.nombre)}</option>`).join('')}</select></td>
      <td><button type="button" class="btn-outline" data-quitar="${i}" aria-label="Quitar workout">✕</button></td></tr>`).join('');
  }

  async function abrirEditor(programa, onGuardado, duplicar = false) {
    instalar();
    editor = { programa: duplicar ? null : programa, onGuardado, items: programa ? programa.programa_workouts.map((x) => ({ ...x })).sort((a, b) => a.semana - b.semana || a.dia - b.dia) : [], workouts: [] };
    document.getElementById('programa-titulo').textContent = programa ? (duplicar ? 'Duplicar programa' : 'Editar programa') : 'Nuevo programa';
    document.getElementById('programa-nombre').value = programa ? (duplicar ? `${programa.nombre} (copia)`.slice(0, 120) : programa.nombre) : '';
    document.getElementById('programa-desc').value = programa?.descripcion || '';
    document.getElementById('programa-error').textContent = '';
    document.getElementById('programa-guardar').disabled = true;
    document.getElementById('programa-filas').innerHTML = '';
    openModal('modal-programa-editor');
    try {
      editor.workouts = await E.listarWorkouts(supabaseClient);
      pintarFilas();
      document.getElementById('programa-guardar').disabled = false;
      if (!editor.workouts.length) document.getElementById('programa-error').textContent = 'Primero crea un workout en la Librería.';
    } catch (e) {
      document.getElementById('programa-error').textContent = `No se pudieron cargar los workouts: ${e.message}`;
    }
  }

  async function guardar(event) {
    event.preventDefault();
    const aviso = document.getElementById('programa-error');
    const boton = document.getElementById('programa-guardar');
    if (!editor.items.length) { aviso.textContent = 'Añade al menos un workout.'; return; }
    const items = editor.items.map((x) => ({ workout_id: x.workout_id, semana: Number(x.semana), dia: Number(x.dia) }));
    if (items.some((x) => !x.workout_id || !Number.isInteger(x.semana) || x.semana < 1 || x.semana > 52 || !Number.isInteger(x.dia) || x.dia < 1 || x.dia > 7)) {
      aviso.textContent = 'Elige un workout, una semana entre 1 y 52 y un día entre 1 y 7 en cada fila.';
      return;
    }
    if (new Set(items.map((x) => `${x.semana}:${x.dia}:${x.workout_id}`)).size !== items.length) {
      aviso.textContent = 'No repitas el mismo workout en el mismo día y semana.';
      return;
    }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const { error } = await supabaseClient.rpc('guardar_programa', {
        p_id: editor.programa?.id || null, p_nombre: document.getElementById('programa-nombre').value.trim(),
        p_descripcion: document.getElementById('programa-desc').value.trim(), p_items: items,
      });
      if (error) throw new Error(error.message);
      closeModal('modal-programa-editor');
      await editor.onGuardado();
    } catch (e) {
      aviso.textContent = `No se pudo guardar el programa: ${e.message}`;
    } finally { boton.disabled = false; }
  }

  function mostrarInfo() {
    const programa = asignacion.programa || asignacion.programas.find((p) => p.id === document.getElementById('programa-selector').value);
    document.getElementById('programa-asignar-info').textContent = programa
      ? `${programa.nombre}: ${programa.programa_workouts.length} entrenamientos; hasta la semana ${Math.max(...programa.programa_workouts.map((x) => x.semana))}.`
      : 'Elige un programa.';
  }

  async function abrirAsignar(opciones) {
    instalar();
    asignacion = { ...opciones, programas: [] };
    const boton = document.getElementById('programa-asignar-boton');
    const aviso = document.getElementById('programa-asignar-error');
    aviso.textContent = '';
    boton.disabled = true;
    document.getElementById('programa-inicio').value = opciones.fecha || E.hoyIso();
    document.getElementById('programa-selector-campo').style.display = opciones.programa ? 'none' : 'block';
    document.getElementById('programa-cliente-campo').style.display = opciones.clienteId ? 'none' : 'block';
    document.getElementById('programa-asignar-info').textContent = 'Cargando...';
    openModal('modal-programa-asignar');
    try {
      if (!opciones.programa) {
        asignacion.programas = await listar();
        document.getElementById('programa-selector').innerHTML = `<option value="">Elige un programa...</option>${asignacion.programas.map((p) => `<option value="${p.id}">${E.escapar(p.nombre)}</option>`).join('')}`;
      }
      if (!opciones.clienteId) {
        const { data, error } = await supabaseClient.from('clientes').select('id,nombre,apellidos').eq('estado', 'activo').order('nombre');
        if (error) throw new Error(error.message);
        document.getElementById('programa-cliente').innerHTML = `<option value="">Elige un cliente...</option>${data.map((c) => `<option value="${c.id}">${E.escapar(`${c.nombre} ${c.apellidos || ''}`.trim())}</option>`).join('')}`;
      }
      mostrarInfo();
      boton.disabled = false;
    } catch (e) { aviso.textContent = `No se pudieron cargar los datos: ${e.message}`; }
  }

  async function asignar(event) {
    event.preventDefault();
    const aviso = document.getElementById('programa-asignar-error');
    const boton = document.getElementById('programa-asignar-boton');
    const programa = asignacion.programa || asignacion.programas.find((p) => p.id === document.getElementById('programa-selector').value);
    const cliente = asignacion.clienteId || document.getElementById('programa-cliente').value;
    const inicio = document.getElementById('programa-inicio').value;
    if (!programa || !cliente || !inicio) { aviso.textContent = 'Elige programa, cliente y fecha de inicio.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const { data, error } = await supabaseClient.rpc('asignar_programa', { p_programa: programa.id, p_cliente: cliente, p_inicio: inicio });
      if (error) throw new Error(error.message);
      closeModal('modal-programa-asignar');
      if (asignacion.onAsignado) await asignacion.onAsignado(data);
    } catch (e) { aviso.textContent = `No se pudo confirmar la asignación: ${e.message}. Comprueba la ficha del cliente antes de volver a intentarlo.`; }
    finally { boton.disabled = false; }
  }

  async function eliminar(id) {
    const { data, error } = await supabaseClient.from('programas').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data.length) throw new Error('No se encontró el programa propio.');
  }

  return { listar, abrirEditor, abrirAsignar, eliminar };
})();
