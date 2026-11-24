document.addEventListener('DOMContentLoaded', async () => {
  const raiz = document.getElementById('tareas-raiz');
  if (!raiz) return;
  const C = window.FitNovaComunicacion, esc = C.escapar;
  const clienteFicha = document.body.dataset.view === 'clientes' ? new URLSearchParams(location.search).get('id') : null;
  let tareas = [], clientes = [], editando = null, profesional = null;
  raiz.innerHTML = `<div class="card-head"><p class="card-title">✅ Tareas <span class="count-pill" id="tareas-cuenta">—</span></p>
    <button class="btn-secondary" id="tareas-nueva" type="button" disabled>Nueva tarea</button></div>
    <p id="tareas-error" role="alert" style="color:var(--rojo)"></p><div id="tareas-lista">Cargando tareas...</div>
    <form id="tareas-form" hidden>
      <h3 id="tareas-form-titulo">Nueva tarea</h3>
      <label>Título<input name="titulo" maxlength="180" required style="display:block;width:100%;padding:8px;box-sizing:border-box"></label>
      <label>Descripción (opcional)<textarea name="descripcion" maxlength="2000" rows="2" style="display:block;width:100%;padding:8px;box-sizing:border-box"></textarea></label>
      <label>Fecha límite (opcional)<input name="fecha" type="date" style="display:block;padding:8px"></label>
      <label>Cliente (opcional)<select name="cliente" style="display:block;max-width:100%;padding:8px"></select></label>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" type="submit">Guardar</button>
      <button class="btn-outline" id="tareas-cancelar" type="button">Cancelar</button></div>
    </form>`;
  const el = (id) => document.getElementById(`tareas-${id}`);
  const form = el('form');
  const campo = (nombre) => form.elements.namedItem(nombre);

  function opciones(id) {
    const disponibles = clientes.map((c) => `<option value="${esc(c.id)}">${esc(`${c.nombre} ${c.apellidos || ''}`.trim())}</option>`).join('');
    const anterior = id && !clientes.some((c) => c.id === id) ? `<option value="${esc(id)}">Cliente anteriormente vinculado</option>` : '';
    campo('cliente').innerHTML = `<option value="">Sin cliente</option>${disponibles}${anterior}`;
    campo('cliente').value = id || '';
  }
  function editar(tarea) {
    editando = tarea || null;
    el('form-titulo').textContent = tarea ? 'Editar tarea' : 'Nueva tarea';
    campo('titulo').value = tarea?.titulo || '';
    campo('descripcion').value = tarea?.descripcion || '';
    campo('fecha').value = tarea?.fecha_limite || '';
    opciones(tarea?.cliente_id || clienteFicha);
    form.hidden = false; campo('titulo').focus();
  }
  function pintar() {
    el('cuenta').textContent = tareas.filter((t) => !t.completada).length;
    el('lista').innerHTML = tareas.length ? tareas.map((t) => {
      const cliente = clientes.find((c) => c.id === t.cliente_id);
      return `<article class="mini-list-item"><div class="info"><strong>${t.completada ? '✓ ' : ''}${esc(t.titulo)}</strong>
        ${t.descripcion ? `<span>${esc(t.descripcion)}</span>` : ''}
        <span>${t.fecha_limite ? `Fecha límite: ${esc(t.fecha_limite.split('-').reverse().join('/'))}` : 'Sin fecha límite'}
        ${t.cliente_id ? ` · ${esc(cliente ? `${cliente.nombre} ${cliente.apellidos || ''}`.trim() : 'Cliente anteriormente vinculado')}` : ''}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          <button type="button" class="btn-outline" data-accion="estado" data-id="${esc(t.id)}">${t.completada ? 'Reabrir' : 'Completar'}</button>
          <button type="button" class="btn-outline" data-accion="editar" data-id="${esc(t.id)}">Editar</button>
          <button type="button" class="btn-outline" data-accion="eliminar" data-id="${esc(t.id)}">Eliminar</button>
        </div></div></article>`;
    }).join('') : '<p>No tienes tareas en esta sección.</p>';
  }
  async function cargar() {
    let consulta = supabaseClient.from('tareas_profesional').select('*').eq('profesional_id', profesional)
      .order('completada', { ascending:true }).order('fecha_limite', { ascending:true, nullsFirst:false })
      .order('id', { ascending:true });
    if (clienteFicha) consulta = consulta.eq('cliente_id', clienteFicha);
    const resultado = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await consulta.range(offset, offset + 499);
      if (error) throw new Error(error.message);
      resultado.push(...data);
      if (data.length < 500) break;
    }
    tareas = resultado; pintar(); el('error').textContent = '';
  }
  async function guardar(t) {
    await C.rpc(supabaseClient, 'guardar_tarea', {
      p_id:t.id || null, p_titulo:t.titulo, p_descripcion:t.descripcion || null,
      p_fecha:t.fecha_limite || null, p_cliente:t.cliente_id || null, p_completada:t.completada,
    });
  }
  el('nueva').addEventListener('click', () => editar(null));
  el('cancelar').addEventListener('click', () => { form.hidden = true; editando = null; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true; el('error').textContent = '';
    try {
      await guardar({ id:editando?.id, titulo:campo('titulo').value.trim(), descripcion:campo('descripcion').value.trim(),
        fecha_limite:campo('fecha').value, cliente_id:campo('cliente').value, completada:editando?.completada || false });
      form.hidden = true; editando = null;
      await cargar();
    } catch (e) { el('error').textContent = `No se pudo guardar o actualizar la lista: ${e.message}`; }
    finally { boton.disabled = false; }
  });
  el('lista').addEventListener('click', async (event) => {
    const boton = event.target.closest('[data-accion]');
    const tarea = boton && tareas.find((t) => t.id === boton.dataset.id);
    if (!tarea) return;
    if (boton.dataset.accion === 'editar') { editar(tarea); return; }
    if (boton.dataset.accion === 'eliminar' && !confirm('¿Eliminar esta tarea?')) return;
    boton.disabled = true; el('error').textContent = '';
    try {
      if (boton.dataset.accion === 'eliminar') await C.rpc(supabaseClient, 'eliminar_tarea', { p_id:tarea.id });
      else await guardar({ ...tarea, completada:!tarea.completada });
      await cargar();
    } catch (e) { el('error').textContent = `No se pudo actualizar la tarea: ${e.message}`; boton.disabled = false; }
  });
  try {
    const session = await requireSession();
    if (!session) return;
    if (document.body.dataset.view === 'clientes' && !clienteFicha) throw new Error('No se ha identificado al cliente.');
    profesional = await C.rpc(supabaseClient, 'profesional_actual_id');
    if (!profesional) throw new Error('No hay un perfil profesional asociado.');
    const { data, error } = await supabaseClient.from('profesional_cliente')
      .select('clientes(id,nombre,apellidos)').eq('profesional_id', profesional);
    if (error) throw new Error(error.message);
    clientes = [...new Map(data.filter((r) => r.clientes).map((r) => [r.clientes.id,r.clientes])).values()];
    await cargar();
    el('nueva').disabled = false;
    if (new URLSearchParams(location.search).get('tarea') === 'nueva') editar(null);
  } catch (e) {
    el('lista').textContent = '';
    el('error').textContent = `No se pudieron cargar las tareas: ${e.message}`;
    el('nueva').disabled = true;
  }
});
