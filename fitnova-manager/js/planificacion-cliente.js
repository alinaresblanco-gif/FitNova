(() => {
  const S = window.FitNovaSesiones;
  const clienteId = new URLSearchParams(location.search).get('id');
  const $ = (id) => document.getElementById(id);
  const esc = S.escapar;
  const tipos = {
    cita: ['Cita', '#285baf', '#e6efff', 'agenda'],
    workout: ['Entrenamiento', '#793dba', '#f0e9fa', 'entrenamiento'],
    realizado: ['Realizado', '#08794e', '#e1f6ec', 'entrenamiento'],
    nutricion: ['Plan nutricional', '#bc6414', '#fff0df', 'nutricion'],
    actividad: ['Actividad', '#00839a', '#def5f8', 'resumen'],
    comida: ['Comida y agua', '#bb4c55', '#ffeced', 'nutricion'],
    progreso: ['Medidas', '#a65383', '#faeaf3', 'progreso'],
    formulario: ['Formulario', '#776118', '#fcf2ce', 'formularios'],
    video: ['Vídeo', '#c64330', '#ffebe7', 'planificacion'],
  };
  const estado = { fecha: S.fechaLocal(new Date()), eventos: [], videosSinFecha: [], carga: 0 };
  const fechaMes = (fecha) => new Date(`${fecha.slice(0, 7)}-01T12:00:00`);
  const etiqueta = (fecha, opciones) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', opciones);
  const color = (tipo) => `--color:${tipos[tipo][1]};--fondo:${tipos[tipo][2]}`;
  const elEvento = (tipo, fecha, titulo, detalle = '') => ({ tipo, fecha, titulo, detalle });

  async function paginas(crearConsulta) {
    const filas = [];
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await crearConsulta().range(inicio, inicio + 499);
      if (error) throw new Error(error.message);
      filas.push(...data);
      if (data.length < 500) return filas;
    }
  }

  async function cargar() {
    const carga = ++estado.carga;
    const mes = fechaMes(estado.fecha);
    const siguiente = new Date(mes.getFullYear(), mes.getMonth() + 1, 1, 12);
    const desde = S.fechaLocal(mes), hasta = S.fechaLocal(siguiente);
    const inicioUTC = new Date(`${desde}T00:00:00`).toISOString();
    const finUTC = new Date(`${hasta}T00:00:00`).toISOString();
    const tabla = (nombre, campos, columna, inicio, fin, orden = columna) => () => supabaseClient
      .from(nombre).select(campos).eq('cliente_id', clienteId)
      .gte(columna, inicio).lt(columna, fin).order(orden).order('id');
    const tareas = [
      ['Citas', () => paginas(() => supabaseClient.from('sesiones').select('id,titulo,inicio,fin,estado')
        .eq('cliente_id', clienteId).lt('inicio', finUTC).gt('fin', inicioUTC).order('inicio').order('id'))],
      ['Entrenamientos', () => paginas(tabla('clientes_workouts', 'id,fecha,nombre,programa_nombre', 'fecha', desde, hasta))],
      ['Registros de entrenamiento', () => paginas(tabla('clientes_workout_registros', 'id,fecha,duracion_min,esfuerzo,clientes_workouts(nombre)', 'fecha', desde, hasta))],
      ['Planes nutricionales', () => paginas(() => supabaseClient.from('clientes_planes_nutricionales')
        .select('id,nombre,inicio,fin').eq('cliente_id', clienteId).lt('inicio', hasta).gte('fin', desde).order('inicio').order('id'))],
      ['Actividades', () => paginas(tabla('clientes_actividades', 'id,nombre,fecha,duracion_min,distancia_km', 'fecha', desde, hasta))],
      ['Comidas', () => paginas(tabla('clientes_comidas', 'id,fecha,comida,alimentos', 'fecha', desde, hasta))],
      ['Agua', () => paginas(() => supabaseClient.from('clientes_agua').select('fecha,vasos').eq('cliente_id', clienteId).gte('fecha', desde).lt('fecha', hasta).order('fecha'))],
      ['Medidas', () => paginas(tabla('clientes_metricas', 'id,fecha,origen', 'fecha', inicioUTC, finUTC))],
      ['Formularios enviados', () => paginas(tabla('formularios_enviados', 'id,titulo,enviado_en', 'enviado_en', inicioUTC, finUTC))],
      ['Respuestas', () => paginas(tabla('formularios_enviados', 'id,titulo,respondido_en', 'respondido_en', inicioUTC, finUTC))],
      ['Vídeos', () => paginas(() => supabaseClient.from('video_destinatarios')
        .select('video_id,publicado_en,biblioteca_videos!inner(titulo,publicado)')
        .eq('cliente_id', clienteId).eq('biblioteca_videos.publicado', true).order('video_id'))],
    ];
    $('plan-cal-estado').textContent = 'Cargando calendario...';
    $('plan-cal-eventos').innerHTML = '';
    $('plan-cal-cuadricula').innerHTML = '';
    $('plan-cal-videos-sin-fecha').innerHTML = '';
    $('plan-cal-error').textContent = '';
    const resultados = await Promise.allSettled(tareas.map(([, fn]) => fn()));
    if (carga !== estado.carga) return;
    const eventos = [], errores = [], videosSinFecha = [];
    resultados.forEach((resultado, i) => {
      if (resultado.status === 'rejected') {
        errores.push(`${tareas[i][0]}: ${resultado.reason.message}`);
        return;
      }
      resultado.value.forEach((f) => {
        if (i === 0) {
          for (let d = new Date(`${desde}T12:00:00`); d < siguiente; d.setDate(d.getDate() + 1)) {
            const dia = S.fechaLocal(d);
            if (S.enDia(f, dia)) eventos.push(elEvento('cita', dia, f.titulo, `${S.horario(f)} · ${S.estados[f.estado]}`));
          }
        } else if (i === 1) eventos.push(elEvento('workout', f.fecha, f.nombre, f.programa_nombre ? `Programa: ${f.programa_nombre}` : 'Asignado'));
        else if (i === 2) eventos.push(elEvento('realizado', f.fecha, f.clientes_workouts?.nombre || 'Entrenamiento realizado', [f.duracion_min ? `${f.duracion_min} min` : '', f.esfuerzo ? `Esfuerzo ${f.esfuerzo}/10` : ''].filter(Boolean).join(' · ')));
        else if (i === 3) {
          for (let d = new Date(`${desde}T12:00:00`); d < siguiente; d.setDate(d.getDate() + 1)) {
            const dia = S.fechaLocal(d);
            if (dia >= f.inicio && dia <= f.fin) eventos.push(elEvento('nutricion', dia, f.nombre, `Vigente del ${f.inicio} al ${f.fin}`));
          }
        } else if (i === 4) eventos.push(elEvento('actividad', f.fecha, f.nombre, [f.duracion_min ? `${f.duracion_min} min` : '', f.distancia_km ? `${f.distancia_km} km` : ''].filter(Boolean).join(' · ')));
        else if (i === 5) eventos.push(elEvento('comida', f.fecha, `Comida: ${f.comida.replace('_', ' ')}`, f.alimentos));
        else if (i === 6 && f.vasos > 0) eventos.push(elEvento('comida', f.fecha, 'Agua', `${f.vasos} vasos`));
        else if (i === 7) eventos.push(elEvento('progreso', S.fechaLocal(f.fecha), 'Medidas registradas', f.origen === 'cliente' ? 'Cliente' : 'Profesional'));
        else if (i === 8) eventos.push(elEvento('formulario', S.fechaLocal(f.enviado_en), f.titulo, 'Formulario enviado'));
        else if (i === 9) eventos.push(elEvento('formulario', S.fechaLocal(f.respondido_en), f.titulo, 'Formulario respondido'));
        else if (i === 10 && f.biblioteca_videos) {
          if (!f.publicado_en) videosSinFecha.push(f.biblioteca_videos.titulo);
          else {
            const dia = S.fechaLocal(f.publicado_en);
            if (dia >= desde && dia < hasta) eventos.push(elEvento('video', dia, f.biblioteca_videos.titulo, 'Publicado para este cliente'));
          }
        }
      });
    });
    estado.eventos = eventos;
    estado.videosSinFecha = videosSinFecha;
    $('plan-cal-error').textContent = errores.length ? `Algunos datos no se han podido cargar:\n${errores.join('\n')}` : '';
    render();
  }

  function render() {
    const mes = fechaMes(estado.fecha);
    $('plan-cal-mes').textContent = mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    $('plan-cal-dia').textContent = etiqueta(estado.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dias = (new Date(mes.getFullYear(), mes.getMonth() + 1, 0)).getDate();
    const vacios = (mes.getDay() + 6) % 7;
    const celdas = Array.from({ length: vacios }, () => '<span></span>');
    for (let dia = 1; dia <= dias; dia++) {
      const fecha = S.fechaLocal(new Date(mes.getFullYear(), mes.getMonth(), dia, 12));
      const eventos = estado.eventos.filter((e) => e.fecha === fecha);
      celdas.push(`<button type="button" class="planificacion-dia-celda${fecha === estado.fecha ? ' seleccionado' : ''}${fecha === S.fechaLocal(new Date()) ? ' hoy' : ''}" data-plan-fecha="${fecha}" aria-pressed="${fecha === estado.fecha}" aria-label="${esc(etiqueta(fecha, { weekday: 'long', day: 'numeric', month: 'long' }))}: ${eventos.length} eventos"><span class="planificacion-numero">${dia}</span>${eventos.slice(0, 3).map((e) => `<span class="planificacion-marca" style="${color(e.tipo)}">${esc(e.titulo)}</span>`).join('')}${eventos.length > 3 ? `<small>+${eventos.length - 3}</small>` : ''}</button>`);
    }
    $('plan-cal-cuadricula').innerHTML = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia) => `<strong>${dia}</strong>`).join('') + celdas.join('');
    const eventos = estado.eventos.filter((e) => e.fecha === estado.fecha);
    const incompleto = Boolean($('plan-cal-error').textContent);
    $('plan-cal-estado').textContent = eventos.length ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} en este día${incompleto ? ' (consulta incompleta)' : ''}` : incompleto ? 'No se puede confirmar si hay más eventos: revisa el aviso.' : 'No hay eventos visibles guardados para este día.';
    $('plan-cal-eventos').innerHTML = eventos.map((e) => `<article class="planificacion-evento" style="${color(e.tipo)}"><span class="planificacion-evento-tipo">${tipos[e.tipo][0]}</span><p><strong>${esc(e.titulo)}</strong>${e.detalle ? `<br>${esc(e.detalle)}` : ''}</p>${e.tipo !== 'video' ? `<button type="button" data-plan-ir="${tipos[e.tipo][3]}">Ver en ${esc(tipos[e.tipo][0])} →</button>` : '<a href="libreria.html?tab=videos">Gestionar vídeos →</a>'}</article>`).join('');
    $('plan-cal-videos-sin-fecha').innerHTML = estado.videosSinFecha.length
      ? `<details class="planificacion-sin-fecha"><summary>Vídeos publicados sin fecha conocida (${estado.videosSinFecha.length})</summary><ul>${estado.videosSinFecha.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></details>` : '';
  }

  function cambiarMes(cantidad) {
    const mes = fechaMes(estado.fecha);
    estado.fecha = S.fechaLocal(new Date(mes.getFullYear(), mes.getMonth() + cantidad, 1, 12));
    cargar();
  }

  async function accion(tipo) {
    if (tipo === 'cita') {
      location.href = `agenda.html?cliente=${encodeURIComponent(clienteId)}&open=modal-nueva-sesion&fecha=${estado.fecha}`;
    } else if (tipo === 'workout' || tipo === 'cardio') {
      await EntMgr.abrirAsignar({ clienteId, fecha: estado.fecha, cardio: tipo === 'cardio', onAsignado: () => { cpEntRecargar(); cargar(); } });
    } else if (tipo === 'crear') {
      cpEntEditor(null, estado.fecha, cargar);
    } else if (tipo === 'programa') {
      await ProgramasMgr.abrirAsignar({ clienteId, fecha: estado.fecha, onAsignado: async () => { await cpEntRecargar(); await cargar(); } });
    } else if (tipo === 'nutricion') {
      await NutPlanesMgr.abrirAsignar({ clienteId, fecha: estado.fecha, onAsignado: cargar });
    } else if (tipo === 'video') {
      await VideosMgr.abrir(null, cargar, clienteId);
    } else if (tipo === 'formulario' || tipo === 'archivo') {
      switchTab('cliente-perfil', tipo === 'formulario' ? 'formularios' : 'archivos');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!await requireSession()) return;
    if (!clienteId) { $('plan-cal-error').textContent = 'Falta identificar al cliente.'; return; }
    $('plan-cal-leyenda').innerHTML = Object.entries(tipos).map(([tipo, valores]) => `<span style="${color(tipo)}">${valores[0]}</span>`).join('');
    $('plan-cal-anterior').addEventListener('click', () => cambiarMes(-1));
    $('plan-cal-siguiente').addEventListener('click', () => cambiarMes(1));
    $('plan-cal-hoy').addEventListener('click', () => { estado.fecha = S.fechaLocal(new Date()); cargar(); });
    $('plan-cal-actualizar').addEventListener('click', cargar);
    document.querySelector('[data-tab-group="cliente-perfil"][data-tab="planificacion"]').addEventListener('click', cargar);
    $('planificacion-cliente').addEventListener('click', (event) => {
      const fecha = event.target.closest('[data-plan-fecha]');
      const ir = event.target.closest('[data-plan-ir]');
      const boton = event.target.closest('[data-plan-accion]');
      if (fecha) { estado.fecha = fecha.dataset.planFecha; render(); }
      if (ir) switchTab('cliente-perfil', ir.dataset.planIr);
      if (boton) accion(boton.dataset.planAccion).catch((e) => { $('plan-cal-error').textContent = `No se pudo abrir la acción: ${e.message}`; });
    });
    await cargar();
  });
})();
