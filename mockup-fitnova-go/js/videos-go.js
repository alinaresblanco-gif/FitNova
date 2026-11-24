// Biblioteca de vídeos publicados para el cliente y sus favoritos.
(() => {
  const E = window.FitNovaEntrenos;
  const st = { videos: [], favoritos: new Set(), clienteId: null, biblioteca: 'all', filtro: 'name', ocupado: false };
  const miniaturas = new Map();
  const lista = document.getElementById('video-list');
  const aviso = document.getElementById('video-error');

  function normalizar(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function fecha(video) {
    return new Date(video.creado_en).toLocaleDateString('es-ES');
  }

  async function cargarMiniaturaVimeo(v) {
    if (miniaturas.has(v.video_url)) return;
    miniaturas.set(v.video_url, null);
    try {
      const respuesta = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(v.video_url)}`, { referrerPolicy: 'no-referrer' });
      if (!respuesta.ok) throw new Error(`Vimeo respondió ${respuesta.status}`);
      const datos = await respuesta.json();
      const url = new URL(datos.thumbnail_url);
      if (url.protocol !== 'https:' || !(url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com'))) {
        throw new Error('Miniatura no válida');
      }
      miniaturas.set(v.video_url, url.href);
    } catch (e) {
      miniaturas.set(v.video_url, false);
    }
    const resultado = miniaturas.get(v.video_url);
    st.videos.filter((video) => video.video_url === v.video_url).forEach((video) => {
      const boton = lista.querySelector(`[data-video-ver="${video.id}"]`);
      const estado = lista.querySelector(`[data-miniatura-estado="${video.id}"]`);
      if (boton && resultado) boton.style.backgroundImage = `linear-gradient(#0003,#0003), url("${resultado}")`;
      if (estado) estado.textContent = resultado ? '' : 'Miniatura de Vimeo no disponible.';
    });
  }

  function pintar() {
    const consulta = normalizar(document.getElementById('video-search').value.trim());
    const encontrados = st.videos.filter((v) => {
      const campo = { name: v.titulo, date: fecha(v), activity: v.categoria }[st.filtro];
      return (st.biblioteca === 'all' || st.favoritos.has(v.id)) && normalizar(campo).includes(consulta);
    });
    lista.innerHTML = encontrados.length ? encontrados.map((v) => {
      const favorito = st.favoritos.has(v.id);
      const embed = E.videoEmbed(v.video_url);
      const youtube = embed && new URL(embed).hostname === 'www.youtube-nocookie.com';
      const miniatura = youtube ? `https://i.ytimg.com/vi/${encodeURIComponent(new URL(embed).pathname.split('/').pop())}/hqdefault.jpg` : miniaturas.get(v.video_url);
      return `<article class="video-card">
        <button type="button" class="video-thumb ${youtube ? 'navy' : 'blue'}" data-video-ver="${v.id}" aria-label="Reproducir ${E.escapar(v.titulo)}"
          ${miniatura ? `style="background-image:linear-gradient(#0003,#0003),url('${E.escapar(miniatura)}');"` : ''}>
          <span>▶</span>${v.duracion_min ? `<small>${v.duracion_min} min</small>` : ''}</button>
        <div class="video-card-body"><div><h2>${E.escapar(v.titulo)}</h2><p>${E.escapar(v.categoria || 'Sin categoría')} · ${E.escapar(fecha(v))}</p>
        ${v.descripcion ? `<p style="white-space:pre-line;overflow-wrap:anywhere;">${E.escapar(v.descripcion)}</p>` : ''}
        ${!youtube ? `<p data-miniatura-estado="${v.id}">${miniatura === false ? 'Miniatura de Vimeo no disponible.' : ''}</p>` : ''}</div>
        <button type="button" class="video-favorite${favorito ? ' active' : ''}" data-video-favorito="${v.id}" aria-pressed="${favorito}" aria-label="${favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}: ${E.escapar(v.titulo)}">${favorito ? '★' : '☆'}</button></div>
        <div data-video-reproductor="${v.id}"></div></article>`;
    }).join('') : `<p class="agenda-empty">${st.videos.length ? 'No hemos encontrado vídeos con esos criterios.' : 'Tu profesional aún no ha publicado vídeos para ti.'}</p>`;
    encontrados.filter((v) => {
      const embed = E.videoEmbed(v.video_url);
      return embed && new URL(embed).hostname === 'player.vimeo.com';
    }).forEach(cargarMiniaturaVimeo);
  }

  async function cargar() {
    aviso.textContent = '';
    lista.innerHTML = '<p>Cargando vídeos...</p>';
    try {
      if (!await requireSessionGo()) return;
      const cliente = await supabaseClient.rpc('cliente_actual_id');
      if (cliente.error) throw new Error(cliente.error.message);
      if (!cliente.data) throw new Error('No hay un cliente vinculado a esta cuenta.');
      st.clienteId = cliente.data;
      const [videos, favoritos] = await Promise.all([
        supabaseClient.rpc('listar_videos_cliente').order('creado_en', { ascending: false }),
        supabaseClient.from('video_favoritos').select('video_id').eq('cliente_id', st.clienteId),
      ]);
      if (videos.error || favoritos.error) throw new Error((videos.error || favoritos.error).message);
      st.videos = videos.data;
      st.favoritos = new Set(favoritos.data.map((f) => f.video_id));
      pintar();
    } catch (e) {
      st.videos = [];
      st.favoritos.clear();
      lista.innerHTML = '';
      aviso.textContent = `No se pudieron cargar los vídeos: ${e.message}`;
    }
  }

  async function favorito(id) {
    if (st.ocupado) return;
    st.ocupado = true;
    aviso.textContent = '';
    try {
      const quitar = st.favoritos.has(id);
      const consulta = quitar
        ? supabaseClient.from('video_favoritos').delete().eq('video_id', id).eq('cliente_id', st.clienteId)
        : supabaseClient.from('video_favoritos').insert({ video_id: id, cliente_id: st.clienteId });
      const { error } = await consulta;
      if (error) throw new Error(error.message);
      if (quitar) st.favoritos.delete(id); else st.favoritos.add(id);
      pintar();
    } catch (e) { aviso.textContent = `No se pudo actualizar el favorito: ${e.message}. Actualiza la página para comprobar si sigue disponible.`; }
    finally { st.ocupado = false; }
  }

  async function reproducir(id) {
    aviso.textContent = '';
    try {
      const { data, error } = await supabaseClient.rpc('listar_videos_cliente')
        .eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        await cargar();
        aviso.textContent = 'Este vídeo ya no está disponible.';
        return;
      }
      const caja = lista.querySelector(`[data-video-reproductor="${id}"]`);
      if (!caja) return;
      const html = E.videoHtml(data.video_url, data.titulo);
      if (!html) throw new Error('El enlace de este vídeo no es válido.');
      caja.innerHTML = html;
    } catch (e) { aviso.textContent = `No se pudo abrir el vídeo: ${e.message}`; }
  }

  document.querySelectorAll('.video-tab').forEach((tab) => tab.addEventListener('click', () => {
    st.biblioteca = tab.dataset.library;
    document.querySelectorAll('.video-tab').forEach((item) => {
      item.classList.toggle('active', item === tab);
      item.setAttribute('aria-selected', String(item === tab));
    });
    pintar();
  }));
  document.getElementById('video-search').addEventListener('input', pintar);
  document.querySelectorAll('.video-filter-option').forEach((option) => option.addEventListener('click', () => {
    st.filtro = option.dataset.filter;
    document.querySelectorAll('.video-filter-option').forEach((item) => item.classList.toggle('active', item === option));
    document.getElementById('video-filter-summary').textContent = `Buscando por ${{ name: 'nombre', date: 'fecha', activity: 'actividad' }[st.filtro]}`;
    closeModal('modal-filtros-video');
    pintar();
  }));
  document.querySelector('.video-filter-button').addEventListener('click', () => openModal('modal-filtros-video'));
  lista.addEventListener('click', (event) => {
    const ver = event.target.closest('[data-video-ver]');
    const estrella = event.target.closest('[data-video-favorito]');
    if (ver) reproducir(ver.dataset.videoVer);
    if (estrella) favorito(estrella.dataset.videoFavorito);
  });
  cargar();
})();
