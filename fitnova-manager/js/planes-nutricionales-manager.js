// Recetario, plantillas de alimentación y asignaciones.
const NutPlanesMgr = (() => {
  const N = window.FitNovaNutricion;
  const P = window.FitNovaPlanesNutricionales;
  const esc = N.escapar;
  const campo = EntMgr.CAMPO;
  let recetaEditor;
  let planEditor;
  let asignacion;

  async function listarRecetas() {
    const { data, error } = await supabaseClient.from('recetas').select('*').order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  async function listarPlanes() {
    const { data, error } = await supabaseClient.from('planes_nutricionales').select('*').order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  function instalar() {
    if (document.getElementById('modal-receta-editor')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modal-receta-editor"><div class="modal" style="max-width:720px;">
        <div class="modal-header"><h2>Receta</h2><button class="modal-close" type="button" onclick="closeModal('modal-receta-editor')">✕</button></div>
        <form id="receta-form">
          <label>Título<input id="receta-titulo" required maxlength="120" style="${campo}"></label>
          <label>Descripción (opcional)<textarea id="receta-descripcion" maxlength="2000" rows="2" style="${campo}"></textarea></label>
          <label>Ingredientes<textarea id="receta-ingredientes" required maxlength="5000" rows="4" style="${campo}"></textarea></label>
          <label>Preparación<textarea id="receta-preparacion" required maxlength="5000" rows="4" style="${campo}"></textarea></label>
          <label>Kcal (opcional)<input id="receta-kcal" type="number" min="1" max="10000" step="1" style="${campo}"></label>
          <label>Raciones (opcional)<input id="receta-raciones" type="number" min="1" max="100" step="1" style="${campo}"></label>
          <label>Foto (opcional)<input id="receta-foto" type="file" accept="image/jpeg,image/png,image/webp" style="${campo}"></label>
          <label><input id="receta-quitar-foto" type="checkbox"> Quitar la foto actual</label>
          <p id="receta-foto-info"></p><img id="receta-foto-preview" alt="Foto de la receta" style="max-width:100%;max-height:180px;" hidden>
          <p id="receta-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="receta-guardar">Guardar receta</button>
        </form></div></div>
      <div class="modal-overlay" id="modal-plan-editor"><div class="modal" style="max-width:900px;">
        <div class="modal-header"><h2>Plan nutricional semanal</h2><button class="modal-close" type="button" onclick="closeModal('modal-plan-editor')">✕</button></div>
        <form id="plan-form">
          <label>Nombre<input id="plan-nombre" required maxlength="120" style="${campo}"></label>
          <label>Descripción (opcional)<textarea id="plan-descripcion" maxlength="2000" rows="2" style="${campo}"></textarea></label>
          <p>La semana se repite entre las fechas elegidas al asignar. El día corresponde al día real de la semana.</p>
          <label>Día<select id="plan-dia" style="${campo}">${P.DIAS.map((d, i) => `<option value="${i + 1}">${d}</option>`).join('')}</select></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <label>Objetivo kcal/día (opcional)<input id="plan-kcal" type="number" min="1" max="10000" step="1" style="${campo}"></label>
            <label>Objetivo agua en ml/día (opcional)<input id="plan-agua" type="number" min="1" max="20000" step="1" style="${campo}"></label>
          </div>
          <div id="plan-comidas"></div><button type="button" class="btn-outline" id="plan-anadir">+ Añadir comida</button>
          <p id="plan-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="plan-guardar">Guardar plan</button>
        </form></div></div>
      <div class="modal-overlay" id="modal-plan-asignar"><div class="modal">
        <div class="modal-header"><h2>Asignar plan nutricional</h2><button class="modal-close" type="button" onclick="closeModal('modal-plan-asignar')">✕</button></div>
        <form id="plan-asignar-form">
          <label id="plan-selector-campo">Plan<select id="plan-selector" style="${campo}"></select></label>
          <label id="plan-cliente-campo">Cliente<select id="plan-cliente" style="${campo}"></select></label>
          <label>Desde<input id="plan-inicio" type="date" required style="${campo}"></label>
          <label>Hasta (inclusive)<input id="plan-fin" type="date" required style="${campo}"></label>
          <p>La semana se repite durante este periodo. Los planes no pueden solaparse y las recetas quedan copiadas.</p>
          <p id="plan-asignar-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="plan-asignar-boton">Asignar plan</button>
        </form></div></div>`);
    document.getElementById('receta-form').addEventListener('submit', guardarReceta);
    document.getElementById('plan-form').addEventListener('submit', guardarPlan);
    document.getElementById('plan-asignar-form').addEventListener('submit', asignar);
    document.getElementById('plan-dia').addEventListener('change', pintarDia);
    for (const [id, key] of [['plan-kcal', 'kcal'], ['plan-agua', 'agua_ml']]) {
      document.getElementById(id).addEventListener('input', (e) => {
        planEditor.dias[Number(document.getElementById('plan-dia').value) - 1][key] = e.target.value;
      });
    }
    document.getElementById('plan-anadir').addEventListener('click', () => {
      const comidas = diaActual().comidas;
      if (comidas.length >= 30) { document.getElementById('plan-error').textContent = 'El día admite hasta 30 comidas.'; return; }
      comidas.push({ tipo: 'comida', texto: '', receta_id: '' });
      pintarDia();
    });
    document.getElementById('plan-comidas').addEventListener('input', actualizarComida);
    document.getElementById('plan-comidas').addEventListener('change', actualizarComida);
    document.getElementById('plan-comidas').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-plan-quitar]');
      if (!boton) return;
      diaActual().comidas.splice(Number(boton.dataset.planQuitar), 1);
      pintarDia();
    });
  }

  function diaActual() {
    return planEditor.dias[Number(document.getElementById('plan-dia').value) - 1];
  }

  function actualizarComida(event) {
    const el = event.target.closest('[data-plan-campo]');
    if (el) diaActual().comidas[Number(el.dataset.indice)][el.dataset.planCampo] = el.value;
  }

  function pintarDia() {
    const dia = diaActual();
    document.getElementById('plan-kcal').value = dia.kcal || '';
    document.getElementById('plan-agua').value = dia.agua_ml || '';
    document.getElementById('plan-comidas').innerHTML = dia.comidas.map((c, i) => `
      <fieldset style="border:1px solid #ddd;border-radius:10px;padding:10px;margin:10px 0;">
        <legend>Comida ${i + 1}</legend>
        <label>Tipo<select data-plan-campo="tipo" data-indice="${i}" style="${campo}">${N.COMIDAS.map((t) => `<option value="${t.valor}" ${t.valor === c.tipo ? 'selected' : ''}>${esc(t.texto)}</option>`).join('')}</select></label>
        <label>Indicaciones<textarea data-plan-campo="texto" data-indice="${i}" maxlength="2000" rows="2" style="${campo}">${esc(c.texto)}</textarea></label>
        <label>Receta (opcional)<select data-plan-campo="receta_id" data-indice="${i}" style="${campo}"><option value="">Sin receta</option>
          ${planEditor.recetas.map((r) => `<option value="${r.id}" ${r.id === c.receta_id ? 'selected' : ''}>${esc(r.titulo)}</option>`).join('')}
          ${c.receta_id && !planEditor.recetas.some((r) => r.id === c.receta_id) ? `<option value="${esc(c.receta_id)}" selected>Receta eliminada: elige otra</option>` : ''}
        </select></label>
        <button type="button" class="btn-outline" data-plan-quitar="${i}">Quitar comida</button>
      </fieldset>`).join('') || '<p>Sin comidas para este día.</p>';
  }

  function abrirReceta(receta, onGuardado) {
    instalar();
    recetaEditor = { receta, onGuardado };
    for (const key of ['titulo', 'descripcion', 'ingredientes', 'preparacion', 'kcal', 'raciones']) {
      document.getElementById(`receta-${key}`).value = receta?.[key] || '';
    }
    document.getElementById('receta-foto').value = '';
    document.getElementById('receta-quitar-foto').checked = false;
    document.getElementById('receta-quitar-foto').disabled = !receta?.foto_ruta;
    document.getElementById('receta-foto-info').textContent = receta?.foto_ruta ? 'La receta tiene una foto guardada.' : 'Sin foto guardada.';
    const preview = document.getElementById('receta-foto-preview');
    preview.hidden = true;
    preview.removeAttribute('src');
    document.getElementById('receta-error').textContent = '';
    openModal('modal-receta-editor');
    if (receta?.foto_ruta) {
      supabaseClient.storage.from('recetas-fotos').createSignedUrl(receta.foto_ruta, 3600).then(({ data, error }) => {
        if (recetaEditor.receta?.id !== receta.id) return;
        if (error || !data?.signedUrl) {
          document.getElementById('receta-foto-info').textContent = `No se pudo cargar la foto: ${error?.message || 'sin dirección disponible'}.`;
          return;
        }
        preview.onerror = () => { preview.hidden = true; document.getElementById('receta-foto-info').textContent = 'No se pudo cargar la foto de la receta.'; };
        preview.src = data.signedUrl;
        preview.hidden = false;
      }).catch((e) => { document.getElementById('receta-foto-info').textContent = `No se pudo cargar la foto: ${e.message}`; });
    }
  }

  async function limpiarFoto(ruta) {
    if (!ruta) return;
    const permiso = await supabaseClient.rpc('puede_borrar_foto_receta', { p_ruta: ruta });
    if (permiso.error) throw new Error(permiso.error.message);
    if (!permiso.data) return;
    const { data, error } = await supabaseClient.storage.from('recetas-fotos').remove([ruta]);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('No se pudo retirar el archivo.');
  }

  async function guardarReceta(event) {
    event.preventDefault();
    const boton = document.getElementById('receta-guardar');
    const aviso = document.getElementById('receta-error');
    const receta = recetaEditor.receta;
    const archivo = document.getElementById('receta-foto').files[0];
    const anterior = receta?.foto_ruta || null;
    let nueva = null;
    let guardado = false;
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const profesionalId = await EntMgr.profesionalId();
      if (archivo) {
        const blob = await FitNovaFotos.comprimir(archivo);
        nueva = `${profesionalId}/${crypto.randomUUID()}.jpg`;
        const subida = await supabaseClient.storage.from('recetas-fotos').upload(nueva, blob, { contentType: 'image/jpeg', upsert: false });
        if (subida.error) throw new Error(subida.error.message);
      }
      const fila = { profesional_id: profesionalId };
      for (const key of ['titulo', 'descripcion', 'ingredientes', 'preparacion']) fila[key] = document.getElementById(`receta-${key}`).value.trim() || null;
      for (const key of ['kcal', 'raciones']) fila[key] = document.getElementById(`receta-${key}`).value ? Number(document.getElementById(`receta-${key}`).value) : null;
      fila.foto_ruta = nueva || (document.getElementById('receta-quitar-foto').checked ? null : anterior);
      const consulta = receta
        ? supabaseClient.from('recetas').update({ titulo: fila.titulo, descripcion: fila.descripcion, ingredientes: fila.ingredientes, preparacion: fila.preparacion, kcal: fila.kcal, raciones: fila.raciones, foto_ruta: fila.foto_ruta }).eq('id', receta.id)
        : supabaseClient.from('recetas').insert(fila);
      const { data, error } = await consulta.select('id');
      if (error) throw new Error(error.message);
      if (!data.length) throw new Error('No se pudo encontrar la receta propia.');
      guardado = true;
      closeModal('modal-receta-editor');
      await recetaEditor.onGuardado();
      if (anterior && anterior !== fila.foto_ruta) {
        try { await limpiarFoto(anterior); }
        catch (e) { window.alert(`La receta se guardó, pero no se pudo limpiar la foto anterior: ${e.message}`); }
      }
    } catch (e) {
      if (nueva && !guardado) {
        const limpieza = await supabaseClient.storage.from('recetas-fotos').remove([nueva]);
        if (limpieza.error) aviso.textContent = `No se guardó la receta y no se pudo retirar la foto subida: ${limpieza.error.message}. `;
      }
      aviso.textContent += `${guardado ? 'La receta se guardó, pero no se pudo actualizar la lista' : 'No se pudo guardar la receta'}: ${e.message}`;
    } finally { boton.disabled = false; }
  }

  async function abrirPlan(plan, onGuardado) {
    instalar();
    planEditor = {
      plan, onGuardado, recetas: [],
      dias: plan ? structuredClone(plan.dias).sort((a, b) => a.dia - b.dia)
        : P.DIAS.map((_, i) => ({ dia: i + 1, kcal: null, agua_ml: null, comidas: [] })),
    };
    document.getElementById('plan-nombre').value = plan?.nombre || '';
    document.getElementById('plan-descripcion').value = plan?.descripcion || '';
    document.getElementById('plan-dia').value = '1';
    document.getElementById('plan-error').textContent = '';
    document.getElementById('plan-guardar').disabled = true;
    openModal('modal-plan-editor');
    try {
      planEditor.recetas = await listarRecetas();
      pintarDia();
      document.getElementById('plan-guardar').disabled = false;
    } catch (e) { document.getElementById('plan-error').textContent = `No se pudieron cargar las recetas: ${e.message}`; }
  }

  async function guardarPlan(event) {
    event.preventDefault();
    const aviso = document.getElementById('plan-error');
    const boton = document.getElementById('plan-guardar');
    const dias = planEditor.dias.map((d) => ({
      dia: Number(d.dia), kcal: d.kcal ? Number(d.kcal) : null, agua_ml: d.agua_ml ? Number(d.agua_ml) : null,
      comidas: d.comidas.map((c) => ({ tipo: c.tipo, texto: c.texto.trim(), receta_id: c.receta_id || null })),
    }));
    if (!dias.some((d) => d.comidas.length)) { aviso.textContent = 'Añade al menos una comida al plan.'; return; }
    if (dias.some((d) => d.comidas.some((c) => !c.texto && !c.receta_id))) { aviso.textContent = 'Cada comida necesita indicaciones o una receta.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const { error } = await supabaseClient.rpc('guardar_plan_nutricional', {
        p_id: planEditor.plan?.id || null, p_nombre: document.getElementById('plan-nombre').value.trim(),
        p_descripcion: document.getElementById('plan-descripcion').value.trim(), p_dias: dias,
      });
      if (error) throw new Error(error.message);
      closeModal('modal-plan-editor');
      await planEditor.onGuardado();
    } catch (e) { aviso.textContent = `No se pudo guardar el plan: ${e.message}`; }
    finally { boton.disabled = false; }
  }

  async function abrirAsignar(opciones) {
    instalar();
    asignacion = { ...opciones, planes: [] };
    document.getElementById('plan-selector-campo').style.display = opciones.plan ? 'none' : 'block';
    document.getElementById('plan-cliente-campo').style.display = opciones.clienteId ? 'none' : 'block';
    document.getElementById('plan-inicio').value = opciones.fecha || N.hoyIso();
    document.getElementById('plan-fin').value = N.sumarDias(opciones.fecha || N.hoyIso(), 6);
    if (!opciones.plan) document.getElementById('plan-selector').innerHTML = '<option value="">Cargando planes...</option>';
    if (!opciones.clienteId) document.getElementById('plan-cliente').innerHTML = '<option value="">Cargando clientes...</option>';
    const aviso = document.getElementById('plan-asignar-error');
    const boton = document.getElementById('plan-asignar-boton');
    aviso.textContent = '';
    boton.disabled = true;
    openModal('modal-plan-asignar');
    try {
      if (!opciones.plan) {
        asignacion.planes = await listarPlanes();
        document.getElementById('plan-selector').innerHTML = `<option value="">Elige un plan...</option>${asignacion.planes.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}`;
      }
      if (!opciones.clienteId) {
        const { data, error } = await supabaseClient.rpc('clientes_para_videos');
        if (error) throw new Error(error.message);
        document.getElementById('plan-cliente').innerHTML = `<option value="">Elige un cliente...</option>${data.map((c) => `<option value="${c.id}">${esc(`${c.nombre} ${c.apellidos || ''}`.trim())}</option>`).join('')}`;
      }
      boton.disabled = false;
    } catch (e) { aviso.textContent = `No se pudieron cargar los datos: ${e.message}`; }
  }

  async function asignar(event) {
    event.preventDefault();
    const aviso = document.getElementById('plan-asignar-error');
    const boton = document.getElementById('plan-asignar-boton');
    const plan = asignacion.plan || asignacion.planes.find((p) => p.id === document.getElementById('plan-selector').value);
    const cliente = asignacion.clienteId || document.getElementById('plan-cliente').value;
    const inicio = document.getElementById('plan-inicio').value;
    const fin = document.getElementById('plan-fin').value;
    if (!plan || !cliente || !inicio || !fin || fin < inicio) { aviso.textContent = 'Elige plan, cliente y un periodo válido.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const { error } = await supabaseClient.rpc('asignar_plan_nutricional', { p_plan: plan.id, p_cliente: cliente, p_inicio: inicio, p_fin: fin });
      if (error) throw new Error(error.message);
      closeModal('modal-plan-asignar');
      if (asignacion.onAsignado) await asignacion.onAsignado();
    } catch (e) { aviso.textContent = `No se pudo asignar el plan: ${e.message}. Comprueba la ficha antes de reintentar.`; }
    finally { boton.disabled = false; }
  }

  async function eliminar(tabla, id) {
    if (!['recetas', 'planes_nutricionales'].includes(tabla)) throw new Error('Tipo de contenido no válido.');
    const { data, error } = await supabaseClient.from(tabla).delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data.length) throw new Error('No se encontró el contenido propio.');
  }

  return { listarRecetas, listarPlanes, abrirReceta, abrirPlan, abrirAsignar, eliminar, limpiarFoto };
})();
