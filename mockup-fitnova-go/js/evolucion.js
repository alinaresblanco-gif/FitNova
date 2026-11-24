// Evolución de FitNova Go: métricas, objetivo de peso y fotos reales desde Supabase.
const evo = { cliente: null, filas: [], objetivo: null, editando: null, visibles: 12, fotos: [] };
const M = window.FitNovaMetricas;
const F = window.FitNovaFotos;
const EVO_PAGINA = 12;

function evoMostrarError(texto) {
  document.getElementById('evolution-error').textContent = texto || '';
}

async function evoRecargar() {
  evo.filas = await M.consultar(supabaseClient, evo.cliente.id);
}

function evoFilasPeriodo() {
  return M.filtrarPeriodo(evo.filas, document.getElementById('evolution-period-select').value);
}

function evoRenderGrafica(col, serie) {
  const linea = document.querySelector('#evolution-chart polyline');
  const vacio = document.getElementById('evolution-chart-vacio');
  linea.setAttribute('points', M.polyline(serie.map((s) => s.valor)));
  document.getElementById('evolution-chart-desde').textContent = serie.length > 1 ? M.fechaCorta(serie[0].fecha) : '';
  document.getElementById('evolution-chart-hasta').textContent = serie.length > 1 ? M.fechaCorta(serie[serie.length - 1].fecha) : '';
  vacio.hidden = serie.length > 1;
  const periodo = document.getElementById('evolution-period-select').value !== '0';
  vacio.textContent = serie.length === 1
    ? `Tienes 1 registro (${M.formatear(serie[0].valor, col)}). Añade otro para ver la evolución.`
    : (periodo ? 'No hay registros de esta medida en el periodo elegido.' : 'Todavía no hay registros de esta medida. Pulsa + para añadir el primero.');
}

function evoRenderObjetivo() {
  const serie = M.serie(evo.filas, 'peso_kg');
  const inicial = serie.length ? serie[0].valor : null;
  const actual = serie.length ? serie[serie.length - 1].valor : null;
  const objetivo = evo.objetivo?.peso_objetivo_kg != null ? Number(evo.objetivo.peso_objetivo_kg) : null;
  document.getElementById('evo-peso-inicial').textContent = M.formatear(inicial, 'peso_kg');
  document.getElementById('evo-peso-actual').textContent = M.formatear(actual, 'peso_kg');
  document.getElementById('evo-peso-objetivo').textContent = M.formatear(objetivo, 'peso_kg');
  const pct = M.progresoPeso(inicial, actual, objetivo);
  const progreso = document.getElementById('evo-progreso');
  progreso.style.setProperty('--value', pct ?? 0);
  progreso.querySelector('span').textContent = pct === null ? '—' : `${pct}%`;
}

function evoRenderRegistros(col, serie) {
  const info = M.porColumna[col];
  document.getElementById('evolution-records-title').textContent = `Registros · ${info.etiqueta}`;
  const cont = document.getElementById('evolution-records');
  const mas = document.getElementById('evolution-records-more');
  const ordenados = serie.slice().reverse();
  const visibles = ordenados.slice(0, evo.visibles);
  mas.hidden = ordenados.length <= visibles.length;
  mas.textContent = `Ver más (${ordenados.length - visibles.length} restantes)`;
  if (!visibles.length) {
    cont.innerHTML = '<p class="evolution-empty">Sin registros en este periodo.</p>';
    return;
  }
  cont.innerHTML = visibles.map((r) => `
    <div class="list-item">
      <span>${M.escapar(M.fechaCorta(r.fecha))} · ${M.escapar(M.formatear(r.valor, col))}</span>
      ${r.origen === 'cliente'
        ? `<span class="evolution-record-actions">
            <button class="delete-icon" type="button" data-editar="${M.escapar(r.id)}" title="Editar registro">✎</button>
            <button class="delete-icon" type="button" data-borrar="${M.escapar(r.id)}" title="Eliminar registro">🗑</button>
          </span>`
        : '<span style="font-size:11px;color:#8a93a1;">profesional</span>'}
    </div>`).join('');
}

function evoRender() {
  const col = document.getElementById('evolution-metric-select').value;
  const serie = M.serie(evoFilasPeriodo(), col);
  evoRenderGrafica(col, serie);
  evoRenderRegistros(col, serie);
  evoRenderObjetivo();
}

function evoReiniciarYRender() {
  evo.visibles = EVO_PAGINA;
  evoRender();
}

async function evoEliminar(id) {
  const fila = evo.filas.find((f) => f.id === id);
  if (!fila) return;
  const medidas = M.medidasDeFila(fila);
  const aviso = medidas.length > 1
    ? `Este registro del ${M.fechaCorta(fila.fecha)} incluye ${medidas.length} medidas (${medidas.map((m) => m.etiqueta).join(', ')}). Se eliminarán todas. Si solo quieres corregir una, usa ✎ Editar. ¿Continuar?`
    : `¿Eliminar el registro del ${M.fechaCorta(fila.fecha)}?`;
  if (!confirm(aviso)) return;
  evoMostrarError('');
  const { error } = await supabaseClient.from('clientes_metricas').delete().eq('id', id);
  if (error) {
    evoMostrarError(`No se pudo eliminar: ${error.message}`);
    return;
  }
  try {
    await evoRecargar();
  } catch (e) {
    evoMostrarError(`No se pudieron recargar tus registros: ${e.message}`);
  }
  evoRender();
}

function evoRellenarFormulario(valores) {
  const form = document.getElementById('metrics-form');
  form.reset();
  Object.entries(valores).forEach(([nombre, valor]) => {
    if (form.elements[nombre]) form.elements[nombre].value = valor;
  });
  document.getElementById('metrics-error').textContent = '';
}

function evoAbrirRegistro() {
  evo.editando = null;
  evoRellenarFormulario({ date: M.hoyIso() });
  document.getElementById('metrics-modal-title').textContent = 'Registrar métricas';
  document.getElementById('metrics-save').textContent = 'Guardar métricas';
  openModal('modal-registrar-metricas');
}

function evoAbrirEdicion(id) {
  const fila = evo.filas.find((f) => f.id === id);
  if (!fila) return;
  evo.editando = fila.id;
  evoRellenarFormulario(M.valoresDeFila(fila));
  document.getElementById('metrics-modal-title').textContent = 'Editar registro';
  document.getElementById('metrics-save').textContent = 'Guardar cambios';
  openModal('modal-registrar-metricas');
}

async function guardarMetricasEvolucion(event) {
  event.preventDefault();
  const form = event.target;
  const errorEl = document.getElementById('metrics-error');
  const boton = document.getElementById('metrics-save');
  errorEl.textContent = '';
  if (!evo.cliente) {
    errorEl.textContent = 'No se ha podido identificar tu cuenta. Vuelve a iniciar sesión.';
    return;
  }

  let datos;
  try {
    const valores = Object.fromEntries(new FormData(form).entries());
    datos = evo.editando
      ? M.cambiosDesdeValores(valores, valores.date)
      : M.filaDesdeValores(valores, { clienteId: evo.cliente.id, fecha: valores.date });
  } catch (e) {
    errorEl.textContent = e.message;
    return;
  }

  boton.disabled = true;
  const consulta = evo.editando
    ? supabaseClient.from('clientes_metricas').update(datos).eq('id', evo.editando).select('id')
    : supabaseClient.from('clientes_metricas').insert(datos).select('id');
  const { data, error } = await consulta;
  boton.disabled = false;
  if (error || !data?.length) {
    errorEl.textContent = `No se pudo guardar: ${error ? error.message : 'el registro ya no existe o no puedes modificarlo.'}`;
    return;
  }

  evo.editando = null;
  closeModal('modal-registrar-metricas');
  const select = document.getElementById('evolution-metric-select');
  if (datos[select.value] == null) select.value = M.catalogo.find(({ col }) => datos[col] != null).col;
  try {
    await evoRecargar();
  } catch (e) {
    evoMostrarError(`Guardado, pero no se pudieron recargar tus registros: ${e.message}`);
  }
  evoRender();
}

async function guardarObjetivoEvolucion() {
  const errorEl = document.getElementById('objetivo-error');
  errorEl.textContent = '';
  const valor = Number(String(document.getElementById('objetivo-peso').value).replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0 || valor >= 1000) {
    errorEl.textContent = 'Indica un peso objetivo válido.';
    return;
  }
  const { data, error } = await supabaseClient
    .from('clientes_objetivo')
    .update({ peso_objetivo_kg: valor })
    .eq('cliente_id', evo.cliente.id)
    .select('peso_objetivo_kg');
  if (error || !data?.length) {
    errorEl.textContent = error ? error.message : 'Completa primero el cuestionario inicial para poder fijar un objetivo.';
    return;
  }
  evo.objetivo = { ...(evo.objetivo || {}), peso_objetivo_kg: data[0].peso_objetivo_kg };
  closeModal('modal-objetivo');
  evoRenderObjetivo();
}

// ---------- Fotos de progreso ----------
function evoErrorFotos(texto) {
  document.getElementById('evolution-photo-error').textContent = texto || '';
}

function evoRenderFotos() {
  const grid = document.getElementById('evolution-photo-grid');
  if (!evo.fotos.length) {
    grid.innerHTML = '<p class="evolution-empty">Añade fotos para seguir visualmente tu evolución.</p>';
    return;
  }
  grid.innerHTML = evo.fotos.map((foto) => `
    <figure>
      ${foto.url
        ? `<a href="${M.escapar(foto.url)}" target="_blank" rel="noopener"><img src="${M.escapar(foto.url)}" alt="Foto de progreso del ${M.escapar(M.fechaCorta(foto.fecha))}" loading="lazy" /></a>`
        : '<p class="evolution-empty">Imagen no disponible</p>'}
      <button class="delete-icon" type="button" data-borrar-foto="${M.escapar(foto.id)}" title="Eliminar foto">🗑</button>
      <figcaption>${M.escapar(M.fechaCorta(foto.fecha))}</figcaption>
    </figure>`).join('');
}

async function evoCargarFotos() {
  try {
    evo.fotos = await F.consultar(supabaseClient, evo.cliente.id);
    evoRenderFotos();
  } catch (e) {
    document.getElementById('evolution-photo-grid').innerHTML = '';
    evoErrorFotos(`No se pudieron cargar tus fotos: ${e.message}`);
  }
}

async function evoSubirFotos(archivos) {
  const fechaInput = document.getElementById('evolution-photo-date');
  const boton = document.getElementById('evolution-photo-add');
  let fecha;
  try {
    fecha = M.fechaParaGuardar(fechaInput.value).slice(0, 10);
  } catch (e) {
    evoErrorFotos(e.message);
    return;
  }
  evoErrorFotos('');
  boton.disabled = true;
  boton.textContent = 'Subiendo...';
  const errores = [];
  for (const archivo of archivos) {
    try {
      await F.subir(supabaseClient, evo.cliente.id, archivo, fecha);
    } catch (e) {
      errores.push(e.message);
    }
  }
  boton.disabled = false;
  boton.textContent = '+ Añadir fotos';
  await evoCargarFotos();
  if (errores.length) evoErrorFotos(`No se pudieron subir algunas fotos. ${errores.join(' ')}`);
}

async function evoEliminarFoto(id) {
  const foto = evo.fotos.find((f) => f.id === id);
  if (!foto || !confirm(`¿Eliminar la foto del ${M.fechaCorta(foto.fecha)}?`)) return;
  evoErrorFotos('');
  try {
    await F.eliminar(supabaseClient, foto);
  } catch (e) {
    evoErrorFotos(`No se pudo eliminar: ${e.message}`);
    return;
  }
  await evoCargarFotos();
}

document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('evolution-metric-select');
  select.innerHTML = M.opcionesHtml();
  select.addEventListener('change', evoReiniciarYRender);
  const periodo = document.getElementById('evolution-period-select');
  periodo.innerHTML = M.periodosHtml();
  periodo.addEventListener('change', evoReiniciarYRender);
  document.getElementById('evolution-records-more').addEventListener('click', () => {
    evo.visibles += EVO_PAGINA;
    evoRender();
  });
  ['metric-date', 'evolution-photo-date'].forEach((id) => {
    document.getElementById(id).value = M.hoyIso();
    document.getElementById(id).max = M.hoyIso();
  });
  document.getElementById('evolution-records').addEventListener('click', (event) => {
    const borrar = event.target.closest('[data-borrar]');
    if (borrar) evoEliminar(borrar.dataset.borrar);
    const editar = event.target.closest('[data-editar]');
    if (editar) evoAbrirEdicion(editar.dataset.editar);
  });
  document.getElementById('evolution-photo-grid').addEventListener('click', (event) => {
    const boton = event.target.closest('[data-borrar-foto]');
    if (boton) evoEliminarFoto(boton.dataset.borrarFoto);
  });
  const fotoInput = document.getElementById('evolution-photo-input');
  fotoInput.addEventListener('change', () => {
    const archivos = Array.from(fotoInput.files);
    fotoInput.value = '';
    if (archivos.length && evo.cliente) evoSubirFotos(archivos);
  });

  evo.cliente = await cargarClienteActual();
  if (!evo.cliente) {
    evoMostrarError('No se ha podido cargar tu ficha de cliente.');
    evoErrorFotos('No se ha podido cargar tu ficha de cliente.');
    return;
  }

  evoCargarFotos();
  try {
    const [, objetivo] = await Promise.all([
      evoRecargar(),
      supabaseClient.from('clientes_objetivo').select('peso_objetivo_kg').eq('cliente_id', evo.cliente.id).maybeSingle(),
    ]);
    evo.objetivo = objetivo.data;
    if (evo.objetivo?.peso_objetivo_kg != null) {
      document.getElementById('objetivo-peso').value = Number(evo.objetivo.peso_objetivo_kg);
    }
  } catch (e) {
    evoMostrarError(`No se pudieron cargar tus registros: ${e.message}`);
  }
  evoRender();
});
