document.addEventListener('DOMContentLoaded', async () => {
  const C = window.FitNovaComunicacion;
  const esGo = document.body.dataset.auth === 'required';
  const tipo = esGo ? 'cliente' : 'profesional';
  const zona = document.querySelector(esGo ? '.header-actions' : '.topbar-actions');
  if (!zona) return;
  const chat = zona.querySelector('[title="Chat"]');
  if (!chat) return;
  let campana = zona.querySelector('[title="Notificaciones"]');
  if (!campana) {
    campana = document.createElement('button');
    campana.type = 'button'; campana.className = 'topbar-icon-btn'; campana.title = 'Notificaciones';
    campana.textContent = '🔔';
    chat.after(campana);
  }
  chat.removeAttribute('onclick');
  if (esGo) chat.addEventListener('click', () => { location.href = 'comunicacion.html'; });
  const badgeChat = chat.querySelector('.badge') || chat.appendChild(document.createElement('span'));
  badgeChat.className = 'badge'; badgeChat.hidden = true;
  const badgeAvisos = campana.querySelector('.badge') || campana.appendChild(document.createElement('span'));
  badgeAvisos.className = 'badge'; badgeAvisos.hidden = true;
  campana.removeAttribute('onclick');
  document.getElementById('modal-chat')?.remove();
  document.getElementById('modal-notificaciones')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="com-overlay" id="com-avisos-modal" hidden>
    <section class="com-avisos-panel" role="dialog" aria-modal="true" aria-labelledby="com-avisos-titulo">
      <header><h2 id="com-avisos-titulo">Notificaciones</h2><button id="com-avisos-cerrar" type="button" aria-label="Cerrar">✕</button></header>
      <p>Se muestran los 100 avisos más recientes.</p><p id="com-avisos-error" role="alert"></p>
      <button id="com-avisos-leer" type="button">Marcar los mostrados como leídos</button>
      <div id="com-avisos-lista"></div></section></div>`);
  const modal = document.getElementById('com-avisos-modal');
  const lista = document.getElementById('com-avisos-lista');
  const errorEl = document.getElementById('com-avisos-error');
  let destino = null, avisos = [], actualizando = false;

  function badge(el, cantidad) {
    el.textContent = cantidad > 99 ? '99+' : String(cantidad);
    el.hidden = !cantidad;
  }
  function destinoAviso(a) {
    if (a.tipo === 'chat' && a.referencia_id) return `${esGo ? 'comunicacion.html' : 'chat.html'}?conversacion=${encodeURIComponent(a.referencia_id)}`;
    if (esGo) return ({ agenda:'agenda.html', entrenamiento:'entrenamiento.html', nutricion:'nutricion.html', video:'videos.html', formulario:'seguimiento.html' })[a.tipo] || 'index.html';
    if (a.tipo === 'agenda') return 'agenda.html';
    if (a.cliente_id && ['entrenamiento', 'nutricion', 'formulario'].includes(a.tipo)) {
      return `cliente-perfil.html?id=${encodeURIComponent(a.cliente_id)}&tab=${a.tipo === 'formulario' ? 'formularios' : a.tipo}`;
    }
    return 'index.html';
  }
  function pintar() {
    lista.innerHTML = avisos.length ? avisos.map((a) => `<button class="com-aviso${a.leido_en ? '' : ' nuevo'}" type="button" data-aviso="${C.escapar(a.id)}">
      <strong>${C.escapar(a.titulo)}</strong><small>${C.escapar(new Date(a.creado_en).toLocaleString('es-ES'))}${a.leido_en ? '' : ' · Sin leer'}</small></button>`).join('')
      : '<p>No tienes notificaciones.</p>';
  }
  async function actualizar() {
    if (actualizando || !destino) return;
    actualizando = true;
    try {
      const [contactos, cuenta, resultado] = await Promise.all([
        C.rpc(supabaseClient, 'chat_contactos', { p_tipo: tipo }),
        supabaseClient.from('notificaciones').select('id', { count:'exact', head:true })
          .eq('destinatario_tipo', tipo).eq('destinatario_id', destino).is('leido_en', null),
        supabaseClient.from('notificaciones').select('id,tipo,titulo,referencia_id,cliente_id,creado_en,leido_en')
          .eq('destinatario_tipo', tipo).eq('destinatario_id', destino).order('id', { ascending:false }).limit(100),
      ]);
      if (cuenta.error) throw new Error(cuenta.error.message);
      if (resultado.error) throw new Error(resultado.error.message);
      badge(badgeChat, contactos.reduce((total, c) => total + Number(c.no_leidos), 0));
      badge(badgeAvisos, cuenta.count);
      chat.title = 'Chat'; campana.title = 'Notificaciones';
      avisos = resultado.data; pintar(); errorEl.textContent = '';
    } catch (e) {
      badgeChat.textContent = '!'; badgeChat.hidden = false;
      badgeAvisos.textContent = '!'; badgeAvisos.hidden = false;
      chat.title = 'No se pudo actualizar el chat'; campana.title = 'No se pudieron actualizar las notificaciones';
      errorEl.textContent = `No se pudieron cargar los avisos: ${e.message}`;
    } finally { actualizando = false; }
  }
  campana.addEventListener('click', () => { modal.hidden = false; actualizar(); });
  document.getElementById('com-avisos-cerrar').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById('com-avisos-leer').addEventListener('click', async () => {
    try {
      const ids = avisos.filter((a) => !a.leido_en).map((a) => a.id);
      if (ids.length) await C.rpc(supabaseClient, 'marcar_notificaciones', { p_tipo: tipo, p_ids: ids });
      await actualizar();
    } catch (e) { errorEl.textContent = `No se pudieron marcar los avisos: ${e.message}`; }
  });
  lista.addEventListener('click', async (event) => {
    const boton = event.target.closest('[data-aviso]');
    const aviso = boton && avisos.find((a) => String(a.id) === boton.dataset.aviso);
    if (!aviso) return;
    boton.disabled = true;
    try {
      if (!aviso.leido_en) await C.rpc(supabaseClient, 'marcar_notificaciones', { p_tipo: tipo, p_ids: [aviso.id] });
      location.href = destinoAviso(aviso);
    } catch (e) { errorEl.textContent = `No se pudo abrir el aviso: ${e.message}`; boton.disabled = false; }
  });
  try {
    const session = esGo ? await requireSessionGo() : await requireSession();
    if (!session) return;
    destino = await C.rpc(supabaseClient, esGo ? 'cliente_actual_id' : 'profesional_actual_id');
    if (!destino) throw new Error('No hay un perfil asociado a la sesión.');
    await actualizar();
  } catch (e) {
    badgeChat.textContent = '!'; badgeChat.hidden = false;
    badgeAvisos.textContent = '!'; badgeAvisos.hidden = false;
    errorEl.textContent = `No se pudieron cargar los avisos: ${e.message}`;
  }
  const timer = setInterval(() => { if (document.visibilityState === 'visible') actualizar(); }, 15000);
  window.addEventListener('pagehide', (event) => { if (!event.persisted) clearInterval(timer); });
});
