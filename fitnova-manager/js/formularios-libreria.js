const FormulariosMgr = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  let formularios = [];
  let editando = null;
  const preguntasEl = () => document.getElementById('form-editor-preguntas');
  async function rpc(nombre, args) {
    const { data, error } = await supabaseClient.rpc(nombre, args);
    if (error) throw new Error(error.message);
    return data;
  }
  function pintar() {
    const q = document.getElementById('lib-buscar').value.trim().toLocaleLowerCase('es');
    const lista = formularios.filter((f) => f.titulo.toLocaleLowerCase('es').includes(q));
    document.getElementById('lib-count-formularios').textContent = formularios.length;
    document.getElementById('lib-formularios').innerHTML = lista.length
      ? `<table class="data-table"><thead><tr><th>Formulario</th><th>Preguntas</th><th>Acciones</th></tr></thead><tbody>${lista.map((f) =>
        `<tr><td>${esc(f.titulo)}</td><td>${f.preguntas.length}</td><td>
        <button type="button" class="btn-outline" data-form-editar="${esc(f.id)}">Editar</button>
        <button type="button" class="btn-outline" data-form-borrar="${esc(f.id)}">Eliminar</button>
        </td></tr>`).join('')}</tbody></table><p>Para enviarlo, abre la ficha del cliente y selecciona Formularios.</p>`
      : '<p>No hay formularios que mostrar. Crea uno para enviarlo a tus clientes.</p>';
  }
  async function cargar() {
    const { data, error } = await supabaseClient.from('formularios_plantillas').select('id,titulo,preguntas').order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    formularios = data;
    pintar();
  }
  function agregarPregunta(p = {}) {
    if (preguntasEl().children.length >= 20) throw new Error('El máximo es de 20 preguntas.');
    const div = document.createElement('fieldset');
    div.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #ddd;';
    div.innerHTML = `<label>Pregunta <input data-pregunta-texto required maxlength="300" style="width:100%;" value="${esc(p.texto || '')}" /></label>
      <label>Tipo <select data-pregunta-tipo><option value="texto">Texto</option><option value="numero">Número</option><option value="opcion">Opción única</option></select></label>
      <label data-opciones-label>Opciones, una por línea <textarea data-pregunta-opciones rows="3" style="width:100%;">${esc((p.opciones || []).join('\n'))}</textarea></label>
      <button type="button" data-pregunta-quitar class="btn-outline">Quitar pregunta</button>`;
    const tipo = div.querySelector('[data-pregunta-tipo]');
    tipo.value = p.tipo || 'texto';
    const cambio = () => { div.querySelector('[data-opciones-label]').style.display = tipo.value === 'opcion' ? '' : 'none'; };
    tipo.addEventListener('change', cambio);
    div.querySelector('[data-pregunta-quitar]').addEventListener('click', () => div.remove());
    cambio();
    preguntasEl().appendChild(div);
  }
  function abrir(f = null) {
    editando = f;
    const form = document.getElementById('form-editor');
    form.reset();
    form.elements.titulo.value = f?.titulo || '';
    document.getElementById('form-editor-titulo').textContent = f ? 'Editar formulario' : 'Crear formulario';
    document.getElementById('form-editor-error').textContent = '';
    preguntasEl().replaceChildren();
    (f?.preguntas || [{}]).forEach(agregarPregunta);
    openModal('modal-formulario');
  }
  function preguntas() {
    return [...preguntasEl().children].map((row) => {
      const texto = row.querySelector('[data-pregunta-texto]').value.trim();
      const tipo = row.querySelector('[data-pregunta-tipo]').value;
      const dato = { texto, tipo };
      if (tipo === 'opcion') dato.opciones = row.querySelector('[data-pregunta-opciones]').value.split('\n').map((x) => x.trim()).filter(Boolean);
      return dato;
    });
  }
  async function iniciar() {
    const errorEl = document.getElementById('form-editor-error');
    document.getElementById('form-anadir-pregunta').addEventListener('click', () => {
      try { agregarPregunta(); } catch (error) { errorEl.textContent = error.message; }
    });
    document.getElementById('form-editor').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('[type=submit]');
      button.disabled = true;
      errorEl.textContent = '';
      try {
        await rpc('guardar_formulario', { p_id: editando?.id || null, p_titulo: event.currentTarget.elements.titulo.value, p_preguntas: preguntas() });
        await cargar();
        closeModal('modal-formulario');
      } catch (error) { errorEl.textContent = `No se pudo guardar: ${error.message}`; }
      finally { button.disabled = false; }
    });
    document.getElementById('lib-formularios').addEventListener('click', async (event) => {
      const editar = event.target.closest('[data-form-editar]');
      const borrar = event.target.closest('[data-form-borrar]');
      if (editar) abrir(formularios.find((f) => f.id === editar.dataset.formEditar));
      if (borrar && confirm('¿Eliminar la plantilla? Los formularios enviados y sus respuestas se conservarán.')) {
        try { await rpc('eliminar_formulario', { p_id: borrar.dataset.formBorrar }); await cargar(); }
        catch (error) { document.getElementById('lib-error').textContent = `No se pudo eliminar: ${error.message}`; }
      }
    });
    document.getElementById('lib-buscar').addEventListener('input', pintar);
    try { await cargar(); }
    catch (error) { document.getElementById('lib-formularios').textContent = `No se pudieron cargar los formularios: ${error.message}`; }
  }
  return { abrir, iniciar };
})();
