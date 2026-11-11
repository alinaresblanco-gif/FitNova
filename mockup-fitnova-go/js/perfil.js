// Perfil de FitNova Go: datos reales del cliente desde Supabase
// (evolución del peso, métricas corporales, objetivo y profesionales).

let pfCliente = null;
let pfMetricas = []; // todas las filas de clientes_metricas, orden fecha ascendente
let pfObjetivo = null;

const METRICA_UNIDADES = {
  peso_kg: 'kg',
  grasa_corporal_pct: '%',
};

function unidadMetrica(col) {
  return METRICA_UNIDADES[col] || 'cm';
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function hoyIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// Serie (fecha asc) de valores no nulos para una columna de métrica.
function serieMetrica(col) {
  return pfMetricas
    .filter((m) => m[col] !== null && m[col] !== undefined)
    .map((m) => ({ id: m.id, fecha: m.fecha, valor: parseFloat(m[col]), origen: m.origen }));
}

// Convierte una serie de valores en puntos de polyline (viewBox 300x100).
function construirPolyline(valores) {
  if (valores.length < 2) return '';
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = (max - min) || 1;
  const pad = 10;
  const ancho = 300;
  const alto = 100;
  return valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * ancho;
    const y = pad + (1 - (v - min) / rango) * (alto - pad * 2);
    return `${Math.round(x)},${Math.round(y)}`;
  }).join(' ');
}

async function recargarMetricas() {
  const { data, error } = await supabaseClient
    .from('clientes_metricas')
    .select('*')
    .eq('cliente_id', pfCliente.id)
    .order('fecha', { ascending: true });
  pfMetricas = error ? [] : (data || []);
}

function renderEvolucionPeso() {
  const serie = serieMetrica('peso_kg');
  const linea = document.getElementById('pf-evolucion-linea');
  const punto = document.getElementById('pf-evolucion-punto');
  const vacio = document.getElementById('pf-evolucion-vacio');

  if (serie.length < 2) {
    linea.setAttribute('points', '');
    punto.style.display = 'none';
    vacio.style.display = 'block';
    document.getElementById('pf-evolucion-desde').textContent = '';
    document.getElementById('pf-evolucion-hasta').textContent = '';
    return;
  }

  vacio.style.display = 'none';
  const puntos = construirPolyline(serie.map((s) => s.valor));
  linea.setAttribute('points', puntos);
  const ultimo = puntos.split(' ').pop().split(',');
  punto.setAttribute('cx', ultimo[0]);
  punto.setAttribute('cy', ultimo[1]);
  punto.style.display = 'block';
  document.getElementById('pf-evolucion-desde').textContent = fechaCorta(serie[0].fecha);
  document.getElementById('pf-evolucion-hasta').textContent = fechaCorta(serie[serie.length - 1].fecha);
}

function renderObjetivoPeso() {
  const card = document.getElementById('metrica-objetivo-card');
  const col = document.getElementById('metrica-tipo').value;
  card.style.display = col === 'peso_kg' ? 'block' : 'none';
  if (col !== 'peso_kg') return;

  const serie = serieMetrica('peso_kg');
  const inicial = serie.length ? serie[0].valor : null;
  const actual = serie.length ? serie[serie.length - 1].valor : null;
  const objetivo = pfObjetivo?.peso_objetivo_kg ? parseFloat(pfObjetivo.peso_objetivo_kg) : null;

  const fmt = (v) => (v === null ? '—' : `${v.toLocaleString('es-ES')} kg`);
  document.getElementById('obj-peso-inicial').textContent = fmt(inicial);
  document.getElementById('obj-peso-actual').textContent = fmt(actual);
  document.getElementById('obj-peso-objetivo').textContent = fmt(objetivo);

  const progreso = document.getElementById('obj-progreso');
  if (inicial !== null && actual !== null && objetivo !== null && inicial !== objetivo) {
    let pct = Math.round(((inicial - actual) / (inicial - objetivo)) * 100);
    pct = Math.max(0, Math.min(100, pct));
    progreso.style.setProperty('--value', pct);
    progreso.querySelector('span').textContent = `${pct}%`;
  } else {
    progreso.style.setProperty('--value', 0);
    progreso.querySelector('span').textContent = '—';
  }
}

function renderMetrica() {
  const col = document.getElementById('metrica-tipo').value;
  const serie = serieMetrica(col);
  const unidad = unidadMetrica(col);

  // Gráfica
  const linea = document.getElementById('metrica-linea');
  const vacio = document.getElementById('metrica-vacio');
  linea.setAttribute('points', construirPolyline(serie.map((s) => s.valor)));
  vacio.style.display = serie.length ? 'none' : 'block';

  // Objetivo (solo peso)
  renderObjetivoPeso();

  // Últimos registros (más recientes primero, máx. 12)
  const cont = document.getElementById('metrica-registros');
  const recientes = serie.slice().reverse().slice(0, 12);
  if (!recientes.length) {
    cont.innerHTML = '<p style="font-size:13px;color:#55606f;margin:0;">Todavía no hay registros. Añade el primero arriba.</p>';
    return;
  }
  cont.innerHTML = recientes.map((r) => `
    <div class="list-item">
      <span>${fechaCorta(r.fecha)} · ${r.valor.toLocaleString('es-ES')} ${unidad}</span>
      ${r.origen === 'cliente'
        ? `<button class="delete-icon" onclick="eliminarMetrica('${r.id}')" title="Eliminar registro">🗑</button>`
        : '<span style="font-size:11px;color:#8a93a1;">profesional</span>'}
    </div>
  `).join('');
}

async function guardarMetrica() {
  const errorEl = document.getElementById('metrica-error');
  errorEl.textContent = '';

  const col = document.getElementById('metrica-tipo').value;
  const fecha = document.getElementById('metrica-fecha').value;
  const valor = parseFloat(document.getElementById('metrica-valor').value);

  if (!fecha || !valor || valor <= 0) {
    errorEl.textContent = 'Indica una fecha y un valor mayor que cero.';
    return;
  }

  const fila = { cliente_id: pfCliente.id, fecha, origen: 'cliente' };
  fila[col] = valor;

  const { error } = await supabaseClient.from('clientes_metricas').insert(fila);
  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  document.getElementById('metrica-valor').value = '';
  await recargarMetricas();
  renderMetrica();
  renderEvolucionPeso();
}

async function eliminarMetrica(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await supabaseClient.from('clientes_metricas').delete().eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  await recargarMetricas();
  renderMetrica();
  renderEvolucionPeso();
}

async function guardarObjetivo() {
  const errorEl = document.getElementById('objetivo-error');
  errorEl.textContent = '';
  const valor = parseFloat(document.getElementById('objetivo-peso').value);
  if (!valor || valor <= 0) {
    errorEl.textContent = 'Indica un peso objetivo válido.';
    return;
  }

  const { error } = await supabaseClient
    .from('clientes_objetivo')
    .update({ peso_objetivo_kg: valor })
    .eq('cliente_id', pfCliente.id);

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  pfObjetivo = { ...(pfObjetivo || {}), peso_objetivo_kg: valor };
  closeModal('modal-objetivo');
  renderObjetivoPeso();
}

async function cargarProfesionales() {
  const cont = document.getElementById('pf-profesionales');
  const etiquetasRol = { entrenador: 'Entrenador personal', nutricionista: 'Nutricionista', recepcion: 'Recepción' };

  const { data, error } = await supabaseClient
    .from('profesional_cliente')
    .select('rol, profesionales(nombre, apellidos)')
    .eq('cliente_id', pfCliente.id);

  if (error || !data || !data.length) {
    cont.innerHTML = '<p style="font-size:13px;color:#55606f;margin:0;">Todavía no tienes profesionales asignados.</p>';
    return;
  }

  cont.innerHTML = data.map((p) => `
    <div class="professional-item">
      <div class="avatar" style="display:flex;align-items:center;justify-content:center;background:#0A1A2F;color:#fff;font-weight:700;">
        ${(p.profesionales?.nombre || '?').trim().charAt(0).toUpperCase()}
      </div>
      <div class="info">
        <strong>${p.profesionales ? `${p.profesionales.nombre} ${p.profesionales.apellidos || ''}`.trim() : '—'}</strong>
        <span>${etiquetasRol[p.rol] || p.rol}</span>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  pfCliente = await cargarClienteActual();
  if (!pfCliente) return;

  document.getElementById('pf-nombre').textContent =
    `${pfCliente.nombre} ${pfCliente.apellidos || ''}`.trim();
  document.getElementById('metrica-fecha').value = hoyIso();

  const { data: objetivo } = await supabaseClient
    .from('clientes_objetivo')
    .select('objetivo_tipo, altura_cm, peso_objetivo_kg, notas_objetivo, notas_lesiones')
    .eq('cliente_id', pfCliente.id)
    .maybeSingle();
  pfObjetivo = objetivo;
  if (objetivo?.peso_objetivo_kg) {
    document.getElementById('objetivo-peso').value = parseFloat(objetivo.peso_objetivo_kg);
  }

  await recargarMetricas();
  renderEvolucionPeso();
  renderMetrica();
  cargarProfesionales();
});
