// Biblioteca de vídeos y destinatarios seleccionados por el profesional.
const VideosMgr = (() => {
  const E = window.FitNovaEntrenos;
  const campo = EntMgr.CAMPO;
  let actual;
  let alGuardar;

  async function listar() {
    const { data, error } = await supabaseClient.from('biblioteca_videos')
      .select('id,titulo,descripcion,categoria,duracion_min,video_url,publicado,creado_en,actualizado_en,video_destinatarios(cliente_id)')
      .eq('profesional_id', await EntMgr.profesionalId())
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  function instalar() {
    if (document.getElementById('modal-video-editor')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modal-video-editor"><div class="modal" style="max-width:680px;">
        <div class="modal-header"><h2 id="video-editor-titulo"></h2><button class="modal-close" type="button" onclick="closeModal('modal-video-editor')">✕</button></div>
        <form id="video-editor-form">
          <label>Título<input id="video-editor-nombre" maxlength="120" required style="${campo}"></label>
          <label>Descripción (opcional)<textarea id="video-editor-desc" maxlength="2000" rows="2" style="${campo}"></textarea></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <label style="flex:1">Actividad o categoría (opcional)<input id="video-editor-categoria" maxlength="100" placeholder="Ej. Movilidad" style="${campo}"></label>
            <label style="flex:1">Duración en minutos (opcional)<input id="video-editor-duracion" type="number" min="1" max="600" step="1" style="${campo}"></label>
          </div>
          <label>Enlace de YouTube o Vimeo<input id="video-editor-url" type="url" required maxlength="500" style="${campo}"></label>
          <button type="button" class="btn-outline" id="video-editor-preview-btn">Ver vista previa</button>
          <div id="video-editor-preview" style="margin-top:8px;"></div>
          <fieldset style="border:1px solid #D9D9D9;border-radius:10px;margin:12px 0;padding:10px;">
            <legend>Clientes destinatarios</legend>
            <p style="font-size:12px;color:#55606f;">Solo clientes activos asignados a ti como entrenador/a o nutricionista.</p>
            <div id="video-editor-clientes" style="max-height:180px;overflow:auto;"></div>
          </fieldset>
          <label><input type="checkbox" id="video-editor-publicado"> Publicar para los clientes seleccionados</label>
          <p style="font-size:12px;color:#55606f;">Sin publicar queda como borrador. Retirar o cambiar destinatarios les quita el acceso en FitNova, pero no revoca un enlace que ya hayan guardado.</p>
          <p id="video-editor-error" role="alert" style="color:var(--rojo)"></p>
          <button type="submit" class="btn-primary" id="video-editor-guardar">Guardar vídeo</button>
        </form></div></div>`);
    document.getElementById('video-editor-form').addEventListener('submit', guardar);
    document.getElementById('video-editor-url').addEventListener('input', () => { document.getElementById('video-editor-preview').innerHTML = ''; });
    document.getElementById('video-editor-preview-btn').addEventListener('click', () => {
      const url = document.getElementById('video-editor-url').value.trim();
      const caja = document.getElementById('video-editor-preview');
      caja.innerHTML = E.videoHtml(url, 'Vista previa del vídeo');
      if (!caja.innerHTML) document.getElementById('video-editor-error').textContent = 'Introduce un enlace válido de YouTube o Vimeo.';
      else document.getElementById('video-editor-error').textContent = '';
    });
  }

  async function abrir(video, onGuardado, clienteId = null) {
    instalar();
    actual = video;
    alGuardar = onGuardado;
    document.getElementById('video-editor-titulo').textContent = video ? 'Editar vídeo' : 'Nuevo vídeo';
    document.getElementById('video-editor-nombre').value = video?.titulo || '';
    document.getElementById('video-editor-desc').value = video?.descripcion || '';
    document.getElementById('video-editor-categoria').value = video?.categoria || '';
    document.getElementById('video-editor-duracion').value = video?.duracion_min || '';
    document.getElementById('video-editor-url').value = video?.video_url || '';
    document.getElementById('video-editor-publicado').checked = Boolean(video?.publicado);
    document.getElementById('video-editor-preview').innerHTML = '';
    document.getElementById('video-editor-error').textContent = '';
    document.getElementById('video-editor-clientes').textContent = 'Cargando clientes...';
    const boton = document.getElementById('video-editor-guardar');
    boton.disabled = true;
    openModal('modal-video-editor');
    try {
      const { data, error } = await supabaseClient.rpc('clientes_para_videos');
      if (error) throw new Error(error.message);
      const ids = new Set((video?.video_destinatarios || []).map((d) => d.cliente_id));
      if (clienteId && data.some((c) => c.id === clienteId)) ids.add(clienteId);
      document.getElementById('video-editor-clientes').innerHTML = data.length ? data.map((c) => `
        <label style="display:block;margin:6px 0;"><input type="checkbox" data-video-cliente value="${c.id}" ${ids.has(c.id) ? 'checked' : ''}>
        ${E.escapar(`${c.nombre} ${c.apellidos || ''}`.trim())}</label>`).join('') : '<p>No tienes clientes activos asignados.</p>';
      if (clienteId && !data.some((c) => c.id === clienteId)) {
        document.getElementById('video-editor-error').textContent = 'Este cliente no está disponible como destinatario. Comprueba que esté activo y asignado a ti.';
      } else if ([...ids].some((id) => !data.some((c) => c.id === id))) {
        document.getElementById('video-editor-error').textContent = 'Algunos destinatarios ya no están activos o asignados; se retirarán al guardar.';
      }
      boton.disabled = false;
    } catch (e) { document.getElementById('video-editor-error').textContent = `No se pudieron cargar los clientes: ${e.message}`; }
  }

  async function guardar(event) {
    event.preventDefault();
    const aviso = document.getElementById('video-editor-error');
    const boton = document.getElementById('video-editor-guardar');
    const url = document.getElementById('video-editor-url').value.trim();
    const clientes = [...document.querySelectorAll('[data-video-cliente]:checked')].map((c) => c.value);
    const publicado = document.getElementById('video-editor-publicado').checked;
    const duracion = document.getElementById('video-editor-duracion').value;
    if (!E.videoEmbed(url)) { aviso.textContent = 'Introduce un enlace válido de YouTube o Vimeo.'; return; }
    if (publicado && !clientes.length) { aviso.textContent = 'Selecciona al menos un cliente para publicar.'; return; }
    boton.disabled = true;
    aviso.textContent = '';
    try {
      const { error } = await supabaseClient.rpc('guardar_video', {
        p_id: actual?.id || null, p_titulo: document.getElementById('video-editor-nombre').value.trim(),
        p_descripcion: document.getElementById('video-editor-desc').value.trim(),
        p_categoria: document.getElementById('video-editor-categoria').value.trim(),
        p_duracion_min: duracion ? Number(duracion) : null, p_url: url, p_publicado: publicado, p_clientes: clientes,
      });
      if (error) throw new Error(error.message);
      closeModal('modal-video-editor');
      await alGuardar();
    } catch (e) { aviso.textContent = `No se pudo guardar el vídeo: ${e.message}`; }
    finally { boton.disabled = false; }
  }

  async function eliminar(id) {
    const { data, error } = await supabaseClient.from('biblioteca_videos').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data.length) throw new Error('No se encontró el vídeo propio.');
  }

  return { listar, abrir, eliminar };
})();
