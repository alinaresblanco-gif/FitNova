// Carga la ficha real del cliente (?id=uuid) desde Supabase.

function formatearFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES');
}

async function cargarFichaCliente() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    document.getElementById('cp-nombre').textContent = 'Cliente no encontrado';
    return;
  }

  const { data: cliente, error } = await supabaseClient
    .from('clientes')
    .select('nombre, apellidos, email, telefono, estado, ultima_actividad, fecha_alta')
    .eq('id', id)
    .maybeSingle();

  if (error || !cliente) {
    document.getElementById('cp-nombre').textContent = 'Cliente no encontrado';
    document.getElementById('cp-nombre-2').textContent = error ? error.message : 'No tienes acceso a este cliente';
    return;
  }

  const nombreCompleto = `${cliente.nombre} ${cliente.apellidos || ''}`.trim();
  document.getElementById('cp-nombre').textContent = nombreCompleto;
  document.getElementById('cp-nombre-2').textContent = nombreCompleto;
  document.getElementById('cp-iniciales').textContent = cliente.nombre.trim().charAt(0).toUpperCase();
  document.getElementById('cp-estado').textContent = cliente.estado;
  document.getElementById('cp-email').textContent = cliente.email;
  document.getElementById('cp-telefono').textContent = cliente.telefono || '—';
  document.getElementById('cp-actividad').textContent = `Última actividad: ${formatearFechaHora(cliente.ultima_actividad)}`;
  document.getElementById('cp-alta').textContent = formatearFechaHora(cliente.fecha_alta);

  const { data: objetivo } = await supabaseClient
    .from('clientes_objetivo')
    .select('objetivo_tipo, altura_cm, peso_objetivo_kg, notas_objetivo')
    .eq('cliente_id', id)
    .maybeSingle();

  if (objetivo) {
    const etiquetasObjetivo = {
      perder_peso: 'Perder peso',
      ponerme_en_forma: 'Ponerme en forma',
      ganar_musculo: 'Ganar músculo',
    };
    document.getElementById('cp-objetivo').textContent =
      objetivo.notas_objetivo || etiquetasObjetivo[objetivo.objetivo_tipo] || objetivo.objetivo_tipo;
    document.getElementById('cp-medidas').textContent =
      `${objetivo.altura_cm} cm · objetivo ${objetivo.peso_objetivo_kg ?? '—'} kg`;
  }
}

async function cargarSesionesFicha() {
  const clienteId = new URLSearchParams(location.search).get('id');
  const contenedor = document.getElementById('cp-sesiones');
  if (!clienteId) {
    contenedor.textContent = 'No se puede consultar la agenda sin identificar al cliente.';
    document.getElementById('cp-agendar').hidden = true;
    return;
  }
  document.getElementById('cp-agendar').href =
    `agenda.html?cliente=${encodeURIComponent(clienteId)}&open=modal-nueva-sesion`;
  try {
    const { data, error } = await supabaseClient.rpc('profesional_actual_id');
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No hay perfil profesional disponible.');
    const sesiones = await FitNovaSesiones.consultar(supabaseClient, { profesionalId: data, clienteId });
    contenedor.innerHTML = sesiones.length ? sesiones.map((sesion) => `
      <article class="mini-list-item"><div class="info">
        <strong>${FitNovaSesiones.escapar(sesion.titulo)} · ${FitNovaSesiones.estados[sesion.estado]}</strong>
        <span>${FitNovaSesiones.escapar(FitNovaSesiones.horario(sesion))}</span>
        <span>${FitNovaSesiones.escapar(sesion.lugar || 'Sin lugar indicado')}</span>
        <a href="agenda.html?cliente=${encodeURIComponent(clienteId)}">Gestionar en Agenda</a>
      </div></article>`).join('') : '<p>Este cliente no tiene sesiones agendadas.</p>';
  } catch (error) {
    contenedor.innerHTML = `<p style="color:var(--rojo);" role="alert">No se pudo cargar la agenda: ${FitNovaSesiones.escapar(error.message)}</p>`;
  }
}

const cpProg = { clienteId: null, profesionalId: null, filas: [], objetivo: null, editando: null };

function cpProgError(texto) {
  const el = document.getElementById('cp-progreso-error');
  el.textContent = texto || '';
  el.hidden = !texto;
}

function cpProgRenderGrafica() {
  const M = FitNovaMetricas;
  const col = document.getElementById('cp-prog-metrica').value;
  const serie = M.serie(M.filtrarPeriodo(cpProg.filas, document.getElementById('cp-prog-periodo').value), col);
  document.querySelector('#cp-prog-grafica polyline').setAttribute('points', M.polyline(serie.map((s) => s.valor)));
  document.getElementById('cp-prog-desde').textContent = serie.length > 1 ? `${M.fechaCorta(serie[0].fecha)} · ${M.formatear(serie[0].valor, col)}` : '';
  document.getElementById('cp-prog-hasta').textContent = serie.length > 1
    ? `${M.fechaCorta(serie[serie.length - 1].fecha)} · ${M.formatear(serie[serie.length - 1].valor, col)}` : '';
  const vacio = document.getElementById('cp-prog-grafica-vacio');
  vacio.hidden = serie.length > 1;
  vacio.textContent = serie.length === 1
    ? `Un único registro: ${M.formatear(serie[0].valor, col)} (${M.fechaCorta(serie[0].fecha)}).`
    : 'Sin registros de esta medida en el periodo elegido.';
}

function cpProgRender() {
  const M = FitNovaMetricas;
  const { filas } = cpProg;
  document.getElementById('cp-progreso-vacio').hidden = filas.length > 0;
  document.getElementById('cp-progreso-contenido').hidden = !filas.length;
  if (!filas.length) return;

  const pesos = M.serie(filas, 'peso_kg');
  const inicial = pesos.length ? pesos[0].valor : null;
  const actual = pesos.length ? pesos[pesos.length - 1].valor : null;
  const pesoObjetivo = cpProg.objetivo === null ? null : Number(cpProg.objetivo);
  const pct = M.progresoPeso(inicial, actual, pesoObjetivo);
  document.getElementById('cp-prog-inicial').textContent = M.formatear(inicial, 'peso_kg');
  document.getElementById('cp-prog-actual').textContent = actual === null ? '—'
    : `${M.formatear(actual, 'peso_kg')} (${M.fechaCorta(pesos[pesos.length - 1].fecha)})`;
  document.getElementById('cp-prog-objetivo').textContent = M.formatear(pesoObjetivo, 'peso_kg');
  document.getElementById('cp-prog-pct').textContent = pct === null ? '—' : `${pct}%`;
  cpProgRenderGrafica();

  const enPeriodo = M.filtrarPeriodo(filas, document.getElementById('cp-prog-periodo').value);
  const autor = (fila) => {
    if (fila.origen === 'cliente') return 'Cliente (Go)';
    return fila.registrado_por && fila.registrado_por === cpProg.profesionalId ? 'Profesional (tú)' : 'Profesional';
  };
  document.getElementById('cp-prog-historial').innerHTML = enPeriodo.length ? enPeriodo.slice().reverse().map((fila) => `
    <tr>
      <td>${M.escapar(M.fechaCorta(fila.fecha))}</td>
      <td>${M.escapar(autor(fila))}</td>
      <td>${M.medidasDeFila(fila).map((m) => `${M.escapar(m.etiqueta)}: <strong>${M.escapar(M.formatear(fila[m.col], m.col))}</strong>`).join(' · ')}</td>
      <td>${fila.origen === 'profesional' && fila.registrado_por === cpProg.profesionalId
        ? `<button class="btn-outline" type="button" data-editar="${M.escapar(fila.id)}">Editar</button>
           <button class="btn-outline" type="button" data-borrar="${M.escapar(fila.id)}">Eliminar</button>`
        : '<span style="color:#8a93a1;font-size:12px;">Solo lectura</span>'}</td>
    </tr>`).join('') : '<tr><td colspan="4">No hay mediciones en el periodo elegido.</td></tr>';
}

async function cpProgRecargar() {
  cpProg.filas = await FitNovaMetricas.consultar(supabaseClient, cpProg.clienteId);
}

function cpProgAbrirFormulario(fila = null) {
  const M = FitNovaMetricas;
  const form = document.getElementById('cp-metricas-form');
  form.reset();
  cpProg.editando = fila ? fila.id : null;
  const valores = fila ? M.valoresDeFila(fila) : { date: M.hoyIso() };
  Object.entries(valores).forEach(([nombre, valor]) => {
    if (form.elements[nombre]) form.elements[nombre].value = valor;
  });
  document.getElementById('cp-metricas-titulo').textContent = fila ? 'Editar medidas' : 'Registrar medidas';
  document.getElementById('cp-metricas-guardar').textContent = fila ? 'Guardar cambios' : 'Guardar medidas';
  document.getElementById('cp-metricas-error').textContent = '';
  openModal('modal-cp-metricas');
}

async function cpProgGuardar(event) {
  event.preventDefault();
  const M = FitNovaMetricas;
  const errorEl = document.getElementById('cp-metricas-error');
  const boton = document.getElementById('cp-metricas-guardar');
  errorEl.textContent = '';
  if (!cpProg.profesionalId) {
    errorEl.textContent = 'No hay un perfil profesional disponible para registrar medidas.';
    return;
  }
  let datos;
  try {
    const valores = Object.fromEntries(new FormData(event.target).entries());
    datos = cpProg.editando
      ? M.cambiosDesdeValores(valores, valores.date)
      : M.filaDesdeValores(valores, {
        clienteId: cpProg.clienteId, fecha: valores.date, origen: 'profesional', registradoPor: cpProg.profesionalId,
      });
  } catch (error) {
    errorEl.textContent = error.message;
    return;
  }
  boton.disabled = true;
  const consulta = cpProg.editando
    ? supabaseClient.from('clientes_metricas').update(datos).eq('id', cpProg.editando).select('id')
    : supabaseClient.from('clientes_metricas').insert(datos).select('id');
  const { data, error } = await consulta;
  boton.disabled = false;
  if (error || !data?.length) {
    errorEl.textContent = error
      ? `No se pudo guardar: ${error.message}. Solo pueden registrar medidas el entrenador o el nutricionista asignados.`
      : 'No se pudo guardar: la medición ya no existe o no puedes modificarla.';
    return;
  }
  closeModal('modal-cp-metricas');
  cpProgError('');
  try {
    await cpProgRecargar();
  } catch (e) {
    cpProgError(`Guardado, pero no se pudo recargar el progreso: ${e.message}`);
  }
  cpProgRender();
}

async function cpProgEliminar(id) {
  const M = FitNovaMetricas;
  const fila = cpProg.filas.find((f) => f.id === id);
  if (!fila || !confirm(`¿Eliminar la medición del ${M.fechaCorta(fila.fecha)} (${M.medidasDeFila(fila).map((m) => m.etiqueta).join(', ')})?`)) return;
  cpProgError('');
  const { error } = await supabaseClient.from('clientes_metricas').delete().eq('id', id);
  if (error) {
    cpProgError(`No se pudo eliminar: ${error.message}`);
    return;
  }
  try {
    await cpProgRecargar();
  } catch (e) {
    cpProgError(`No se pudo recargar el progreso: ${e.message}`);
  }
  cpProgRender();
}

async function cargarFotosFicha() {
  const cont = document.getElementById('cp-fotos');
  const M = FitNovaMetricas;
  try {
    const fotos = await FitNovaFotos.consultar(supabaseClient, cpProg.clienteId);
    cont.innerHTML = fotos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">${fotos.map((foto) => `
      <figure style="margin:0;">
        ${foto.url
          ? `<a href="${M.escapar(foto.url)}" target="_blank" rel="noopener"><img src="${M.escapar(foto.url)}" alt="Foto de progreso del ${M.escapar(M.fechaCorta(foto.fecha))}" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;" /></a>`
          : '<p>Imagen no disponible</p>'}
        <figcaption style="font-size:12px;color:#55606f;text-align:center;margin-top:4px;">${M.escapar(M.fechaCorta(foto.fecha))}</figcaption>
      </figure>`).join('')}</div>`
      : '<p style="color:#55606f;">El cliente todavía no ha subido fotos de progreso desde FitNova Go.</p>';
  } catch (error) {
    cont.innerHTML = `<p style="color:var(--rojo);" role="alert">No se pudieron cargar las fotos: ${M.escapar(error.message)}</p>`;
  }
}

async function cargarProgresoFicha() {
  const M = FitNovaMetricas;
  cpProg.clienteId = new URLSearchParams(location.search).get('id');
  const estado = document.getElementById('cp-progreso-estado');
  if (!cpProg.clienteId) {
    estado.textContent = 'No se puede consultar el progreso sin identificar al cliente.';
    document.getElementById('cp-prog-nueva').hidden = true;
    return;
  }

  const select = document.getElementById('cp-prog-metrica');
  select.innerHTML = M.opcionesHtml();
  select.addEventListener('change', cpProgRenderGrafica);
  const periodo = document.getElementById('cp-prog-periodo');
  periodo.innerHTML = M.periodosHtml();
  periodo.addEventListener('change', cpProgRender);
  document.getElementById('cp-metricas-campos').innerHTML = M.catalogo.map((m) => `
    <label style="font-size:13px;">${M.escapar(m.etiqueta)} (${M.escapar(m.unidad)})
      <input type="number" name="${m.col}" step="0.01" min="0.01" inputmode="decimal" style="width:100%;padding:8px;margin-top:4px;border-radius:10px;border:1px solid #D9D9D9;" />
    </label>`).join('');
  document.getElementById('cp-metricas-fecha').max = M.hoyIso();
  document.getElementById('cp-metricas-form').addEventListener('submit', cpProgGuardar);
  document.getElementById('cp-prog-nueva').addEventListener('click', () => cpProgAbrirFormulario());
  document.getElementById('cp-prog-historial').addEventListener('click', (event) => {
    const editar = event.target.closest('[data-editar]');
    if (editar) cpProgAbrirFormulario(cpProg.filas.find((f) => f.id === editar.dataset.editar));
    const borrar = event.target.closest('[data-borrar]');
    if (borrar) cpProgEliminar(borrar.dataset.borrar);
  });

  cargarFotosFicha();
  try {
    const [, respuestaObjetivo, respuestaProfesional] = await Promise.all([
      cpProgRecargar(),
      supabaseClient.from('clientes_objetivo').select('peso_objetivo_kg').eq('cliente_id', cpProg.clienteId).maybeSingle(),
      supabaseClient.rpc('profesional_actual_id'),
    ]);
    cpProg.objetivo = respuestaObjetivo.data?.peso_objetivo_kg ?? null;
    cpProg.profesionalId = respuestaProfesional.data || null;
  } catch (error) {
    estado.innerHTML = `<span style="color:var(--rojo);" role="alert">No se pudo cargar el progreso: ${M.escapar(error.message)}</span>`;
    return;
  }
  estado.hidden = true;
  cpProgRender();
}

const cpAct = { filas: [], mostradas: 20 };

function cpActRender() {
  const A = FitNovaActividades;
  const hoy = A.hoyIso();
  document.getElementById('cp-act-semana').textContent = A.textoSemana(A.semana(cpAct.filas, hoy));
  const desde = A.sumarDias(hoy, -29);
  const ultimas = cpAct.filas.filter((a) => a.fecha >= desde && a.fecha <= hoy);
  document.getElementById('cp-act-30').textContent = ultimas.length
    ? A.textoSemana({
      cuenta: ultimas.length,
      minutos: ultimas.reduce((s, a) => s + (a.duracion_min || 0), 0),
      km: Math.round(ultimas.reduce((s, a) => s + (a.distancia_km || 0), 0) * 100) / 100,
    })
    : 'Sin actividades en los últimos 30 días.';
  const cont = document.getElementById('cp-act-lista');
  if (!cpAct.filas.length) {
    cont.innerHTML = '<p style="color:#55606f;">El cliente todavía no ha registrado actividades desde FitNova Go.</p>';
    return;
  }
  const visibles = cpAct.filas.slice(0, cpAct.mostradas);
  cont.innerHTML = `<table class="data-table">
      <thead><tr><th>Fecha</th><th>Actividad</th><th>Duración</th><th>Distancia</th><th>Comentario</th><th>Foto</th></tr></thead>
      <tbody>${visibles.map((a) => {
        const est = a.distancia_km ? A.estimaciones(a.distancia_km) : null;
        return `<tr>
          <td>${A.escapar(A.fechaCorta(a.fecha))}${a.fecha > hoy ? ' <small>(planificada)</small>' : ''}</td>
          <td>${A.escapar(a.nombre)}</td>
          <td>${a.duracion_min ? A.escapar(A.formatearDuracion(a.duracion_min)) : '—'}</td>
          <td>${a.distancia_km ? `${A.escapar(A.formatearKm(a.distancia_km))}<br><small style="color:#8a93a1;">≈ ${est.pasos.toLocaleString('es-ES')} pasos · ${est.calorias.toLocaleString('es-ES')} kcal</small>` : '—'}</td>
          <td>${a.comentario ? A.escapar(a.comentario) : '—'}</td>
          <td>${a.foto_ruta ? `<button class="btn-outline" type="button" data-foto="${A.escapar(a.foto_ruta)}">Ver foto</button>` : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${cpAct.filas.length > cpAct.mostradas ? `<button class="btn-secondary" type="button" id="cp-act-mas" style="margin-top:10px;">Ver más (${cpAct.filas.length - cpAct.mostradas} restantes)</button>` : ''}`;
}

async function cargarActividadesFicha() {
  const clienteId = new URLSearchParams(location.search).get('id');
  const cont = document.getElementById('cp-act-lista');
  if (!clienteId) {
    cont.textContent = 'No se pueden consultar las actividades sin identificar al cliente.';
    return;
  }
  cont.addEventListener('click', async (event) => {
    if (event.target.closest('#cp-act-mas')) {
      cpAct.mostradas += 20;
      cpActRender();
      return;
    }
    const boton = event.target.closest('[data-foto]');
    if (!boton) return;
    boton.disabled = true;
    boton.textContent = 'Cargando...';
    try {
      const url = FitNovaActividades.escapar(await FitNovaActividades.urlFoto(supabaseClient, boton.dataset.foto));
      boton.parentElement.innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Abrir a tamaño completo"><img src="${url}" alt="Foto de la ruta" style="width:96px;height:72px;object-fit:cover;border-radius:8px;display:block;" /></a>`;
    } catch (error) {
      boton.disabled = false;
      boton.textContent = 'Ver foto';
      alert(`No se pudo cargar la foto: ${error.message}`);
    }
  });
  try {
    cpAct.filas = await FitNovaActividades.consultar(supabaseClient, clienteId);
    cpActRender();
  } catch (error) {
    const texto = `No se pudieron cargar las actividades: ${FitNovaActividades.escapar(error.message)}`;
    document.getElementById('cp-act-semana').textContent = '—';
    document.getElementById('cp-act-30').textContent = '—';
    cont.innerHTML = `<p style="color:var(--rojo);" role="alert">${texto}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  cargarFichaCliente();
  cargarSesionesFicha();
  cargarProgresoFicha();
  cargarActividadesFicha();
});
