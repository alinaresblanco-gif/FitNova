// Evolución de FitNova Go: métricas y objetivo de peso reales desde Supabase.
const evo = { cliente: null, filas: [], objetivo: null };
const M = window.FitNovaMetricas;

function evoMostrarError(texto) {
  document.getElementById('evolution-error').textContent = texto || '';
}

async function evoRecargar() {
  evo.filas = await M.consultar(supabaseClient, evo.cliente.id);
}

function evoRenderGrafica(col, serie) {
  const linea = document.querySelector('#evolution-chart polyline');
  const vacio = document.getElementById('evolution-chart-vacio');
  linea.setAttribute('points', M.polyline(serie.map((s) => s.valor)));
  document.getElementById('evolution-chart-desde').textContent = serie.length > 1 ? M.fechaCorta(serie[0].fecha) : '';
  document.getElementById('evolution-chart-hasta').textContent = serie.length > 1 ? M.fechaCorta(serie[serie.length - 1].fecha) : '';
  vacio.hidden = serie.length > 1;
  vacio.textContent = serie.length === 1
    ? `Tienes 1 registro (${M.formatear(serie[0].valor, col)}). Añade otro para ver la evolución.`
    : 'Todavía no hay registros de esta medida. Pulsa + para añadir el primero.';
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
  document.getElementById('evolution-records-title').textContent = `Últimos registros · ${info.etiqueta}`;
  const cont = document.getElementById('evolution-records');
  const recientes = serie.slice().reverse().slice(0, 12);
  if (!recientes.length) {
    cont.innerHTML = '<p class="evolution-empty">Sin registros todavía.</p>';
    return;
  }
  cont.innerHTML = recientes.map((r) => `
    <div class="list-item">
      <span>${M.escapar(M.fechaCorta(r.fecha))} · ${M.escapar(M.formatear(r.valor, col))}</span>
      ${r.origen === 'cliente'
        ? `<button class="delete-icon" type="button" data-borrar="${M.escapar(r.id)}" title="Eliminar registro">🗑</button>`
        : '<span style="font-size:11px;color:#8a93a1;">profesional</span>'}
    </div>`).join('');
}

function evoRender() {
  const col = document.getElementById('evolution-metric-select').value;
  const serie = M.serie(evo.filas, col);
  evoRenderGrafica(col, serie);
  evoRenderRegistros(col, serie);
  evoRenderObjetivo();
}

async function evoEliminar(id) {
  const fila = evo.filas.find((f) => f.id === id);
  if (!fila) return;
  const medidas = M.medidasDeFila(fila);
  const aviso = medidas.length > 1
    ? `Este registro del ${M.fechaCorta(fila.fecha)} incluye ${medidas.length} medidas (${medidas.map((m) => m.etiqueta).join(', ')}). Se eliminarán todas. ¿Continuar?`
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

  let fila;
  try {
    const valores = Object.fromEntries(new FormData(form).entries());
    fila = M.filaDesdeValores(valores, { clienteId: evo.cliente.id, fecha: valores.date });
  } catch (e) {
    errorEl.textContent = e.message;
    return;
  }

  boton.disabled = true;
  const { error } = await supabaseClient.from('clientes_metricas').insert(fila);
  boton.disabled = false;
  if (error) {
    errorEl.textContent = `No se pudo guardar: ${error.message}`;
    return;
  }

  form.reset();
  document.getElementById('metric-date').value = M.hoyIso();
  closeModal('modal-registrar-metricas');
  const select = document.getElementById('evolution-metric-select');
  if (fila[select.value] === undefined) select.value = M.catalogo.find(({ col }) => fila[col] !== undefined).col;
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

document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('evolution-metric-select');
  select.innerHTML = M.opcionesHtml();
  select.addEventListener('change', evoRender);
  document.getElementById('metric-date').value = M.hoyIso();
  document.getElementById('metric-date').max = M.hoyIso();
  document.getElementById('evolution-records').addEventListener('click', (event) => {
    const boton = event.target.closest('[data-borrar]');
    if (boton) evoEliminar(boton.dataset.borrar);
  });

  evo.cliente = await cargarClienteActual();
  if (!evo.cliente) {
    evoMostrarError('No se ha podido cargar tu ficha de cliente.');
    return;
  }

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
