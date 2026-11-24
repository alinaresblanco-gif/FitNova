(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  async function montar(client, clienteId, esCliente, raiz) {
    let enviados = [];
    let profesionalId = null;
    raiz.innerHTML = `${esCliente ? '' : `<div><label>Formulario
      <select data-form-plantilla><option value="">Cargando...</option></select></label>
      <button type="button" data-form-enviar>Enviar al cliente</button>
      <a href="libreria.html?tab=formularios">Crear o editar plantillas</a></div>`}
      <p data-form-error role="alert"></p><div data-form-lista><p>Cargando formularios...</p></div>`;
    const errorEl = raiz.querySelector('[data-form-error]');
    const listaEl = raiz.querySelector('[data-form-lista]');
    async function rpc(nombre, args) {
      const { data, error } = await client.rpc(nombre, args);
      if (error) throw new Error(error.message);
      return data;
    }
    async function cargar() {
      const { data, error } = await client.from('formularios_enviados')
        .select('id,cliente_id,profesional_id,titulo,preguntas,respuestas,enviado_en,respondido_en')
        .eq('cliente_id', clienteId).order('enviado_en', { ascending: false });
      if (error) throw new Error(error.message);
      enviados = data;
      listaEl.innerHTML = enviados.length ? enviados.map((f) => `<section style="border-top:1px solid #ddd;padding:12px 0;">
        <h3>${esc(f.titulo)}</h3><p>${f.respondido_en ? `Respondido el ${esc(new Date(f.respondido_en).toLocaleDateString('es-ES'))}` : 'Pendiente de respuesta'}</p>
        ${f.respondido_en ? `<dl>${f.preguntas.map((p, i) => `<dt><strong>${esc(p.texto)}</strong></dt><dd>${esc(f.respuestas[i])}</dd>`).join('')}</dl>`
          : esCliente ? `<form data-form-respuesta="${esc(f.id)}">${f.preguntas.map((p, i) =>
            `<label style="display:block;margin:10px 0;">${esc(p.texto)}<br>${p.tipo === 'opcion'
              ? `<select name="p${i}" required><option value="">Selecciona una opción</option>${p.opciones.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`
              : p.tipo === 'numero' ? `<input name="p${i}" type="number" step="any" required />`
                : `<textarea name="p${i}" maxlength="2000" required></textarea>`}</label>`).join('')}
            <button type="submit">Enviar respuesta</button></form>`
            : f.profesional_id === profesionalId ? `<button type="button" data-form-cancelar="${esc(f.id)}">Cancelar envío</button>` : ''}</section>`).join('')
        : '<p>No hay formularios de seguimiento.</p>';
    }
    try {
      if (!esCliente) {
        const [perfil, plantillas] = await Promise.all([
          client.rpc('profesional_actual_id'),
          client.from('formularios_plantillas').select('id,titulo').order('titulo'),
        ]);
        if (perfil.error) throw new Error(perfil.error.message);
        if (!perfil.data) throw new Error('No hay perfil profesional disponible.');
        profesionalId = perfil.data;
        const { data, error } = plantillas;
        if (error) throw new Error(error.message);
        raiz.querySelector('[data-form-plantilla]').innerHTML = '<option value="">Selecciona un formulario</option>'
          + data.map((f) => `<option value="${esc(f.id)}">${esc(f.titulo)}</option>`).join('');
      }
      await cargar();
    } catch (error) { errorEl.textContent = `No se pudieron cargar los formularios: ${error.message}`; }
    if (!esCliente) raiz.querySelector('[data-form-enviar]').addEventListener('click', async (event) => {
      const id = raiz.querySelector('[data-form-plantilla]').value;
      if (!id) { errorEl.textContent = 'Selecciona un formulario.'; return; }
      errorEl.textContent = '';
      event.target.disabled = true;
      try { await rpc('enviar_formulario', { p_plantilla: id, p_cliente: clienteId }); await cargar(); }
      catch (error) { errorEl.textContent = `No se pudo enviar: ${error.message}`; }
      finally { event.target.disabled = false; }
    });
    listaEl.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-form-respuesta]');
      if (!form) return;
      event.preventDefault();
      const fila = enviados.find((f) => f.id === form.dataset.formRespuesta);
      if (!fila) { errorEl.textContent = 'Formulario no encontrado. Recarga la página.'; return; }
      const boton = form.querySelector('button');
      boton.disabled = true;
      errorEl.textContent = '';
      try {
        const respuestas = fila.preguntas.map((p, i) => {
          const valor = form.elements[`p${i}`].value.trim();
          if (!valor) throw new Error('Responde todas las preguntas.');
          if (p.tipo === 'numero') {
            const numero = Number(valor);
            if (!Number.isFinite(numero)) throw new Error('Escribe un número válido.');
            return numero;
          }
          return valor;
        });
        await rpc('responder_formulario', { p_id: fila.id, p_respuestas: respuestas });
        await cargar();
      } catch (error) { errorEl.textContent = `No se pudo enviar la respuesta: ${error.message}`; }
      finally { boton.disabled = false; }
    });
    listaEl.addEventListener('click', async (event) => {
      const boton = event.target.closest('[data-form-cancelar]');
      if (!boton || !confirm('¿Cancelar este formulario pendiente?')) return;
      boton.disabled = true;
      errorEl.textContent = '';
      try { await rpc('cancelar_formulario', { p_id: boton.dataset.formCancelar }); await cargar(); }
      catch (error) { errorEl.textContent = `No se pudo cancelar: ${error.message}`; }
      finally { boton.disabled = false; }
    });
  }
  window.FitNovaFormularios = { montar };
})();
