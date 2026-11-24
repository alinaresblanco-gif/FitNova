// Métricas corporales compartidas por FitNova Go y FitNova Manager (tabla clientes_metricas).
window.FitNovaMetricas = (() => {
  const catalogo = [
    { col: 'peso_kg', etiqueta: 'Peso corporal', unidad: 'kg' },
    { col: 'grasa_corporal_pct', etiqueta: 'Grasa corporal', unidad: '%' },
    { col: 'pecho_cm', etiqueta: 'Pecho', unidad: 'cm' },
    { col: 'cuello_cm', etiqueta: 'Cuello', unidad: 'cm' },
    { col: 'hombros_cm', etiqueta: 'Hombros', unidad: 'cm' },
    { col: 'biceps_izq_cm', etiqueta: 'Bíceps izq.', unidad: 'cm' },
    { col: 'biceps_der_cm', etiqueta: 'Bíceps der.', unidad: 'cm' },
    { col: 'antebrazo_izq_cm', etiqueta: 'Antebrazo izq.', unidad: 'cm' },
    { col: 'antebrazo_der_cm', etiqueta: 'Antebrazo der.', unidad: 'cm' },
    { col: 'cintura_cm', etiqueta: 'Cintura', unidad: 'cm' },
    { col: 'cadera_cm', etiqueta: 'Cadera', unidad: 'cm' },
    { col: 'muslo_izq_cm', etiqueta: 'Muslo izq.', unidad: 'cm' },
    { col: 'muslo_der_cm', etiqueta: 'Muslo der.', unidad: 'cm' },
    { col: 'gemelo_izq_cm', etiqueta: 'Gemelo izq.', unidad: 'cm' },
    { col: 'gemelo_der_cm', etiqueta: 'Gemelo der.', unidad: 'cm' },
  ];
  const porColumna = Object.fromEntries(catalogo.map((m) => [m.col, m]));

  const escapar = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[caracter]);

  function opcionesHtml() {
    return catalogo.map((m) => `<option value="${m.col}">${m.etiqueta} (${m.unidad})</option>`).join('');
  }

  function formatear(valor, col) {
    if (valor === null || valor === undefined || valor === '') return '—';
    return `${Number(valor).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${porColumna[col]?.unidad || ''}`.trim();
  }

  function fechaCorta(iso) {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function hoyIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // Mediodía UTC: el día elegido se muestra igual en cualquier zona horaria habitual.
  function fechaParaGuardar(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new Error('Indica una fecha válida.');
    const iso = `${fecha}T12:00:00Z`;
    if (Number.isNaN(new Date(iso).getTime()) || new Date(iso).toISOString().slice(0, 10) !== fecha) {
      throw new Error('Indica una fecha válida.');
    }
    if (fecha > hoyIso()) throw new Error('La fecha no puede ser futura.');
    return iso;
  }

  // Convierte {columna: texto} en una fila válida para clientes_metricas.
  function filaDesdeValores(valores, { clienteId, fecha, origen = 'cliente', registradoPor = null }) {
    const fila = { cliente_id: clienteId, fecha: fechaParaGuardar(fecha), origen };
    if (registradoPor) fila.registrado_por = registradoPor;
    let medidas = 0;
    catalogo.forEach(({ col, etiqueta }) => {
      const texto = String(valores[col] ?? '').trim().replace(',', '.');
      if (!texto) return;
      const valor = Number(texto);
      if (!Number.isFinite(valor) || valor <= 0) throw new Error(`${etiqueta}: indica un valor mayor que cero.`);
      if (col === 'grasa_corporal_pct' && valor > 100) throw new Error('Grasa corporal: el porcentaje no puede superar 100.');
      if (valor >= 10000) throw new Error(`${etiqueta}: el valor es demasiado alto.`);
      fila[col] = Math.round(valor * 100) / 100;
      medidas += 1;
    });
    if (!medidas) throw new Error('Rellena al menos una medida.');
    return fila;
  }

  // Cambios para editar una medición: las medidas vaciadas pasan a null.
  function cambiosDesdeValores(valores, fecha) {
    const fila = filaDesdeValores(valores, { clienteId: null, fecha });
    const cambios = { fecha: fila.fecha };
    catalogo.forEach(({ col }) => { cambios[col] = fila[col] ?? null; });
    return cambios;
  }

  // Valores de una fila como texto para rellenar un formulario.
  function valoresDeFila(fila) {
    const valores = { date: String(fila.fecha).slice(0, 10) };
    catalogo.forEach(({ col }) => { valores[col] = fila[col] == null ? '' : String(Number(fila[col])); });
    return valores;
  }

  const periodos = [
    { meses: 0, etiqueta: 'Todo el historial' },
    { meses: 1, etiqueta: 'Último mes' },
    { meses: 3, etiqueta: 'Últimos 3 meses' },
    { meses: 6, etiqueta: 'Últimos 6 meses' },
    { meses: 12, etiqueta: 'Último año' },
  ];

  function periodosHtml() {
    return periodos.map((p) => `<option value="${p.meses}">${p.etiqueta}</option>`).join('');
  }

  function filtrarPeriodo(filas, meses, hoy = new Date()) {
    const n = Number(meses) || 0;
    if (!n) return filas;
    const desde = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - n, hoy.getDate()));
    return filas.filter((fila) => new Date(fila.fecha) >= desde);
  }

  async function consultar(client, clienteId) {
    const { data, error } = await client
      .from('clientes_metricas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: true })
      .order('creado_en', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  function serie(filas, col) {
    return filas
      .filter((fila) => fila[col] !== null && fila[col] !== undefined)
      .map((fila) => ({ id: fila.id, fecha: fila.fecha, valor: Number(fila[col]), origen: fila.origen }));
  }

  function medidasDeFila(fila) {
    return catalogo.filter(({ col }) => fila[col] !== null && fila[col] !== undefined);
  }

  // Puntos de polyline para un viewBox 300x100.
  function polyline(valores) {
    if (valores.length < 2) return '';
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const rango = (max - min) || 1;
    return valores.map((valor, i) => {
      const x = (i / (valores.length - 1)) * 300;
      const y = 10 + (1 - (valor - min) / rango) * 80;
      return `${Math.round(x)},${Math.round(y)}`;
    }).join(' ');
  }

  // Porcentaje recorrido desde el peso inicial hacia el objetivo (0-100) o null.
  function progresoPeso(inicial, actual, objetivo) {
    if ([inicial, actual, objetivo].some((v) => v === null || v === undefined || Number.isNaN(v)) || inicial === objetivo) return null;
    const pct = Math.round(((inicial - actual) / (inicial - objetivo)) * 100);
    return Math.max(0, Math.min(100, pct));
  }

  return {
    catalogo, porColumna, escapar, opcionesHtml, formatear, fechaCorta, hoyIso, fechaParaGuardar,
    filaDesdeValores, cambiosDesdeValores, valoresDeFila, periodosHtml, filtrarPeriodo,
    consultar, serie, medidasDeFila, polyline, progresoPeso,
  };
})();
