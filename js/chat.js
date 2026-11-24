window.FitNovaChat = (() => {
  const C = window.FitNovaComunicacion;
  const esc = C.escapar;

  async function iniciar(client, tipo, userId, raiz) {
    let contactos = [], activo = null, filas = [], pendiente = null;
    let version = 0, ocupado = false, cargando = false, hayMas = false;
    raiz.innerHTML = `<div class="com-chat">
      <aside><label>Buscar contacto<input id="com-buscar" type="search"></label>
        <p id="com-contactos-error" role="alert"></p><div id="com-contactos">Cargando contactos...</div></aside>
      <section><h2 id="com-titulo">Elige una conversación</h2><p id="com-error" role="alert"></p>
        <div id="com-recuperar" hidden><p>Hay archivos de envíos interrumpidos en este navegador. Cierra las demás pestañas de chat antes de revisarlos.</p>
          <button id="com-limpiar" type="button">Revisar archivos pendientes</button><p id="com-recuperar-estado" role="status"></p></div>
        <button id="com-anteriores" type="button" hidden>Ver mensajes anteriores</button>
        <div id="com-mensajes" aria-live="polite"></div>
        <p id="com-cerrado" hidden>Esta relación ha terminado. El historial está disponible en solo lectura.</p>
        <form id="com-form" hidden>
          <label>Mensaje<textarea id="com-texto" maxlength="4000" rows="3"></textarea></label>
          <label>Foto o PDF, hasta 5 MB<input id="com-archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
          <div class="com-acciones"><button id="com-enviar" type="submit">Enviar</button>
            <button id="com-descartar" type="button" hidden>Descartar envío pendiente</button></div>
          <p id="com-estado" role="status"></p>
        </form></section></div>`;
    const el = (id) => raiz.querySelector(`#com-${id}`);
    const prefijo = `fitnova-chat-pendiente-${userId}-`;

    function pendientesGuardados() {
      return Object.keys(localStorage).filter((clave) => clave.startsWith(prefijo));
    }

    function mostrarRecuperacion() {
      el('recuperar').hidden = pendientesGuardados().length === 0;
    }

    function pintarContactos() {
      const buscar = el('buscar').value.trim().toLocaleLowerCase('es');
      const filtrados = contactos.filter((c) => (c.nombre || '').toLocaleLowerCase('es').includes(buscar));
      el('contactos').innerHTML = filtrados.length ? filtrados.map((c) => `<button type="button" class="com-contacto"
        data-cliente="${esc(c.cliente_id)}" data-profesional="${esc(c.profesional_id)}">
        <strong>${esc(c.nombre)}</strong><span>${esc((c.ultimo_texto || (c.activo ? 'Iniciar conversación' : 'Historial')).slice(0, 100))}</span>
        ${Number(c.no_leidos) ? `<b>${Number(c.no_leidos)} sin leer</b>` : ''}${c.activo ? '' : '<small>Solo lectura</small>'}</button>`).join('')
        : '<p>No hay contactos disponibles.</p>';
    }

    function formulario() {
      el('form').hidden = !activo || (!activo.activo && !pendiente);
      el('cerrado').hidden = !activo || activo.activo;
      el('texto').disabled = Boolean(pendiente);
      el('archivo').disabled = Boolean(pendiente);
      el('descartar').hidden = !pendiente;
      el('descartar').disabled = ocupado;
      el('enviar').disabled = ocupado;
      el('enviar').textContent = pendiente ? 'Reintentar envío' : 'Enviar';
    }

    function pintarMensajes(abajo) {
      const panel = el('mensajes');
      panel.innerHTML = filas.length ? filas.map((m) => `<article class="com-burbuja${m.emisor_tipo === tipo ? ' propio' : ''}">
        ${m.texto ? `<p>${esc(m.texto)}</p>` : ''}
        ${m.archivo_ruta ? `<button type="button" data-archivo="${esc(m.id)}">📎 ${esc(m.archivo_nombre)}</button>` : ''}
        <small>${esc(new Date(m.creado_en).toLocaleString('es-ES'))}</small></article>`).join('') : '<p>Aún no hay mensajes.</p>';
      el('anteriores').hidden = !hayMas;
      if (abajo) panel.scrollTop = panel.scrollHeight;
    }

    async function cargarContactos() {
      const datos = await C.rpc(client, 'chat_contactos', { p_tipo: tipo });
      contactos = datos;
      if (activo) {
        const nuevo = datos.find((c) => c.cliente_id === activo.cliente_id && c.profesional_id === activo.profesional_id);
        activo.activo = Boolean(nuevo?.activo);
        formulario();
      }
      el('contactos-error').textContent = '';
      pintarContactos();
    }

    async function actualizarMensajes(forzar = false) {
      if (!activo?.id) return;
      const turno = version, id = activo.id, panel = el('mensajes');
      const abajo = forzar || panel.scrollHeight - panel.scrollTop - panel.clientHeight < 60;
      const nuevos = filas.length ? await C.mensajesNuevos(client, id, filas[filas.length - 1].id) : await C.mensajes(client, id);
      if (turno !== version) return;
      const mapa = new Map(filas.map((m) => [String(m.id), m]));
      nuevos.forEach((m) => mapa.set(String(m.id), m));
      if (!filas.length) hayMas = nuevos.length === 50;
      filas = [...mapa.values()].sort((a, b) => Number(a.id) - Number(b.id));
      pintarMensajes(abajo);
      if (abajo && document.visibilityState === 'visible' && filas.length) {
        await C.rpc(client, 'chat_marcar_leido', { p_conversacion: id, p_tipo: tipo, p_hasta: filas[filas.length - 1].id });
      }
    }

    async function seleccionar(contacto) {
      if (pendiente) { el('estado').textContent = 'Resuelve el envío pendiente antes de cambiar de conversación.'; return; }
      const turno = ++version;
      activo = { ...contacto, id: null };
      filas = []; hayMas = false;
      el('titulo').textContent = contacto.nombre;
      el('error').textContent = '';
      el('mensajes').textContent = 'Cargando conversación...';
      formulario();
      try {
        const id = await C.rpc(client, 'chat_abrir', {
          p_cliente: contacto.cliente_id, p_profesional: contacto.profesional_id, p_tipo: tipo,
        });
        if (turno !== version) return;
        activo.id = id;
        await actualizarMensajes(true);
        await cargarContactos();
      } catch (e) { if (turno === version) el('error').textContent = `No se pudo abrir la conversación: ${e.message}`; }
    }

    el('buscar').addEventListener('input', pintarContactos);
    el('contactos').addEventListener('click', (event) => {
      const boton = event.target.closest('[data-cliente]');
      if (!boton) return;
      const c = contactos.find((x) => x.cliente_id === boton.dataset.cliente && x.profesional_id === boton.dataset.profesional);
      if (c) seleccionar(c);
    });
    el('anteriores').addEventListener('click', async () => {
      if (!activo?.id || !filas.length || cargando) return;
      const turno = version, panel = el('mensajes'), altura = panel.scrollHeight;
      cargando = true;
      try {
        const anteriores = await C.mensajes(client, activo.id, filas[0].id);
        if (turno !== version) return;
        filas = [...anteriores, ...filas];
        hayMas = anteriores.length === 50;
        pintarMensajes(false);
        panel.scrollTop += panel.scrollHeight - altura;
      } catch (e) { el('error').textContent = `No se pudo cargar el historial: ${e.message}`; }
      finally { cargando = false; }
    });
    el('mensajes').addEventListener('click', async (event) => {
      const boton = event.target.closest('[data-archivo]');
      const mensaje = boton && filas.find((m) => String(m.id) === boton.dataset.archivo);
      if (!mensaje) return;
      boton.disabled = true;
      try {
        const url = await C.enlaceArchivo(client, mensaje.archivo_ruta, mensaje.archivo_nombre);
        const enlace = document.createElement('a');
        enlace.href = url; enlace.target = '_blank'; enlace.rel = 'noopener noreferrer'; enlace.click();
      } catch (e) { el('error').textContent = `No se pudo descargar el archivo: ${e.message}`; }
      finally { boton.disabled = false; }
    });
    el('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (ocupado || !activo?.id) return;
      if (!pendiente) {
        const archivo = el('archivo').files[0] || null, texto = el('texto').value.trim();
        try { C.validarArchivo(archivo); } catch (e) { el('estado').textContent = e.message; return; }
        if (!texto && !archivo) { el('estado').textContent = 'Escribe un mensaje o adjunta un archivo.'; return; }
        const nuevo = { conversacion: activo.id, envio: crypto.randomUUID(), texto, archivo,
          ruta: archivo ? C.rutaArchivo(activo.id, userId, archivo) : null, subido: false };
        if (archivo) {
          try { localStorage.setItem(prefijo + nuevo.envio, JSON.stringify({ conversacion:nuevo.conversacion, envio:nuevo.envio, ruta:nuevo.ruta })); }
          catch (e) { el('estado').textContent = `No se puede guardar el estado del archivo pendiente: ${e.message}`; return; }
        }
        pendiente = nuevo;
      }
      ocupado = true; formulario(); el('estado').textContent = 'Enviando...';
      try {
        if (pendiente.archivo && !pendiente.subido) {
          await C.subir(client, pendiente.ruta, pendiente.archivo);
          pendiente.subido = true;
        }
        await C.rpc(client, 'chat_enviar', {
          p_conversacion: pendiente.conversacion, p_tipo: tipo, p_envio: pendiente.envio,
          p_texto: pendiente.texto || null, p_ruta: pendiente.ruta,
          p_nombre: pendiente.archivo?.name || null, p_mime: pendiente.archivo?.type || null,
        });
      } catch (e) {
        el('estado').textContent = `No se pudo confirmar el envío: ${e.message}. Puedes reintentarlo sin duplicarlo.`;
        ocupado = false; formulario(); return;
      }
      let falloLimpieza = '';
      try { if (pendiente.ruta) localStorage.removeItem(prefijo + pendiente.envio); }
      catch (e) { falloLimpieza = ` No se pudo actualizar el estado local del archivo: ${e.message}`; }
      pendiente = null; el('texto').value = ''; el('archivo').value = '';
      el('estado').textContent = `Enviado.${falloLimpieza}`; ocupado = false; formulario();
      try { await actualizarMensajes(true); await cargarContactos(); }
      catch (e) { el('error').textContent = `Mensaje enviado, pero no se pudo actualizar el chat: ${e.message}`; }
    });
    el('descartar').addEventListener('click', async () => {
      if (!pendiente || ocupado) return;
      ocupado = true; formulario();
      const comprobar = async () => {
        const { data, error } = await client.from('chat_mensajes').select('id').eq('conversacion_id', pendiente.conversacion)
          .eq('emisor_tipo', tipo).eq('envio_id', pendiente.envio).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      };
      try {
        let enviado = await comprobar();
        if (!enviado && pendiente.ruta) {
          await C.eliminarArchivo(client, pendiente.ruta);
          enviado = await comprobar();
        }
        if (pendiente.ruta) localStorage.removeItem(prefijo + pendiente.envio);
        pendiente = null; el('texto').value = ''; el('archivo').value = '';
        el('estado').textContent = enviado ? 'El mensaje ya se había enviado.' : 'Envío pendiente descartado.';
        await actualizarMensajes(true);
      } catch (e) { el('estado').textContent = `No se pudo comprobar o descartar el envío: ${e.message}`; }
      finally { ocupado = false; formulario(); }
    });
    el('limpiar').addEventListener('click', async () => {
      if (pendiente || ocupado) { el('recuperar-estado').textContent = 'Resuelve primero el envío actual.'; return; }
      if (!confirm('Cierra las demás pestañas de chat antes de continuar. ¿Revisar y eliminar los archivos que no llegaron a enviarse?')) return;
      el('limpiar').disabled = true;
      try {
        for (const clave of pendientesGuardados()) {
          const guardado = JSON.parse(localStorage.getItem(clave));
          if (!guardado || clave !== prefijo + guardado.envio || typeof guardado.ruta !== 'string'
            || !guardado.ruta.startsWith(`${guardado.conversacion}/${userId}/`)) throw new Error('Hay un registro pendiente no válido.');
          const comprobar = async () => {
            const { data, error } = await client.from('chat_mensajes').select('id').eq('conversacion_id', guardado.conversacion)
              .eq('emisor_tipo', tipo).eq('envio_id', guardado.envio).maybeSingle();
            if (error) throw new Error(error.message);
            return data;
          };
          if (!await comprobar()) {
            await C.eliminarArchivo(client, guardado.ruta);
            await comprobar();
          }
          localStorage.removeItem(clave);
        }
        mostrarRecuperacion();
        el('recuperar-estado').textContent = 'Archivos pendientes revisados.';
      } catch (e) { el('recuperar-estado').textContent = `No se pudieron revisar los archivos pendientes: ${e.message}`; }
      finally { el('limpiar').disabled = false; }
    });
    window.addEventListener('beforeunload', (event) => {
      if (pendiente) { event.preventDefault(); event.returnValue = ''; }
    });

    try {
      mostrarRecuperacion();
      await cargarContactos();
      const params = new URLSearchParams(location.search);
      const conversacion = params.get('conversacion'), cliente = params.get('cliente');
      const inicial = C.contactoInicial(contactos, tipo, conversacion, cliente);
      if (inicial) await seleccionar(inicial);
    } catch (e) { el('contactos-error').textContent = `No se pudieron cargar los contactos: ${e.message}`; }
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible' || cargando || ocupado) return;
      cargando = true;
      try { await actualizarMensajes(); await cargarContactos(); el('error').textContent = ''; }
      catch (e) { el('error').textContent = `No se pudo actualizar el chat: ${e.message}`; }
      finally { cargando = false; }
    }, 10000);
    window.addEventListener('pagehide', (event) => { if (!event.persisted) clearInterval(timer); });
  }
  return { iniciar };
})();
