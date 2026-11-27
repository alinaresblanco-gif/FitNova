const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'Europe/Madrid';

function preparar({ fallo } = {}) {
  const RealDate = Date;
  class FechaFija extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-03-15T12:00:00+01:00'])); }
    static now() { return new RealDate('2026-03-15T12:00:00+01:00').getTime(); }
  }
  const elementos = new Map();
  function elemento(id) {
    if (!elementos.has(id)) elementos.set(id, {
      textContent: '', innerHTML: '', listeners: {},
      addEventListener(tipo, fn) { this.listeners[tipo] = fn; },
    });
    return elementos.get(id);
  }
  let iniciar, asignacion;
  const datos = {
    sesiones: [{ id: 's1', cliente_id: 'c', titulo: 'Cita nocturna', inicio: '2026-03-14T22:30:00Z', fin: '2026-03-15T00:30:00Z', estado: 'programada' }],
    clientes_workouts: [{ id: 'w1', cliente_id: 'c', fecha: '2026-03-14', nombre: 'Rutina' }],
    clientes_workout_registros: [{ id: 'r1', cliente_id: 'c', fecha: '2026-03-15', clientes_workouts: { nombre: 'Rutina' } }],
    clientes_planes_nutricionales: [{ id: 'p1', cliente_id: 'c', inicio: '2026-02-25', fin: '2026-03-02', nombre: 'Plan' }],
    clientes_actividades: [{ id: 'a1', cliente_id: 'c', fecha: '2026-03-15', nombre: 'Paseo', duracion_min: 30 }],
    clientes_comidas: [], clientes_agua: [],
    clientes_metricas: [{ id: 'm1', cliente_id: 'c', fecha: '2026-03-14T23:30:00Z', origen: 'cliente' }],
    formularios_enviados: [{ id: 'f1', cliente_id: 'c', titulo: 'Seguimiento', enviado_en: '2026-03-14T23:30:00Z', respondido_en: '2026-03-15T12:00:00Z' }],
    video_destinatarios: [{ video_id: 'v1', cliente_id: 'c', publicado_en: null, biblioteca_videos: { titulo: 'Vídeo antiguo', publicado: true } }],
  };
  const consultas = [];
  const client = {
    from(nombre) {
      const filtros = [];
      const query = {
        select() { return this; },
        eq(c, v) { filtros.push((f) => c.split('.').reduce((x, k) => x?.[k], f) === v); return this; },
        gte(c, v) { filtros.push((f) => f[c] != null && f[c] >= v); return this; },
        lt(c, v) { filtros.push((f) => f[c] != null && f[c] < v); return this; },
        gt(c, v) { filtros.push((f) => f[c] != null && f[c] > v); return this; },
        order() { return this; },
        async range(desde, hasta) {
          consultas.push(nombre);
          if (nombre === fallo) return { error: { message: 'Error de prueba' } };
          return { data: datos[nombre].filter((f) => filtros.every((fn) => fn(f))).slice(desde, hasta + 1), error: null };
        },
      };
      return query;
    },
  };
  const document = {
    getElementById: elemento,
    querySelector: () => elemento('tab'),
    addEventListener(tipo, fn) { if (tipo === 'DOMContentLoaded') iniciar = fn; },
  };
  const contexto = vm.createContext({
    window: {}, document, Date: FechaFija, URLSearchParams, Intl, Promise,
    location: { search: '?id=c', href: '' }, supabaseClient: client,
    requireSession: async () => ({}), switchTab() {},
    EntMgr: { abrirAsignar: async (op) => { asignacion = op; } },
    ProgramasMgr: {}, NutPlanesMgr: {}, VideosMgr: {},
  });
  const raiz = path.join(__dirname, '..', '..');
  for (const archivo of ['js/sesiones.js', 'fitnova-manager/js/planificacion-cliente.js']) {
    vm.runInContext(fs.readFileSync(path.join(raiz, ...archivo.split('/')), 'utf8'), contexto);
  }
  return { iniciar: () => iniciar(), elemento, consultas, getAsignacion: () => asignacion };
}

test('Calendario muestra fechas reales, planes que cruzan meses y acciones con el día elegido', async () => {
  const app = preparar();
  await app.iniciar();
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Cita nocturna/);
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Entrenamiento realizado|Rutina/);
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Medidas registradas/);
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Formulario enviado/);
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Formulario respondido/);
  assert.match(app.elemento('plan-cal-videos-sin-fecha').innerHTML, /Vídeo antiguo/);
  assert.match(app.elemento('plan-cal-cuadricula').innerHTML, /Plan/);
  const clic = app.elemento('planificacion-cliente').listeners.click;
  clic({ target: { closest: (s) => s === '[data-plan-fecha]' ? { dataset: { planFecha: '2026-03-14' } } : null } });
  assert.match(app.elemento('plan-cal-eventos').innerHTML, /Asignado/);
  assert.doesNotMatch(app.elemento('plan-cal-eventos').innerHTML, /Medidas registradas/);
  clic({ target: { closest: (s) => s === '[data-plan-accion]' ? { dataset: { planAccion: 'workout' } } : null } });
  await new Promise(setImmediate);
  assert.equal(app.getAsignacion().fecha, '2026-03-14');
  assert.equal(app.getAsignacion().clienteId, 'c');
  assert.equal(app.getAsignacion().cardio, false);
  clic({ target: { closest: (s) => s === '[data-plan-accion]' ? { dataset: { planAccion: 'cardio' } } : null } });
  await new Promise(setImmediate);
  assert.equal(app.getAsignacion().fecha, '2026-03-14');
  assert.equal(app.getAsignacion().clienteId, 'c');
  assert.equal(app.getAsignacion().cardio, true);
  app.elemento('plan-cal-siguiente').listeners.click();
  await new Promise(setImmediate);
  assert.match(app.elemento('plan-cal-mes').textContent, /abril/);
  assert.doesNotMatch(app.elemento('plan-cal-cuadricula').innerHTML, /Cita nocturna/);
});

test('La asignación de cardio explica la librería y la de workout conserva su diálogo', async () => {
  const elementos = new Map();
  const elemento = (id) => {
    if (!elementos.has(id)) elementos.set(id, { textContent: '', innerHTML: '', value: '', hidden: false, disabled: false });
    return elementos.get(id);
  };
  const contexto = vm.createContext({
    window: { FitNovaEntrenos: {
      hoyIso: () => '2026-03-15',
      listarWorkouts: async () => [{ id: 'w1', nombre: 'Carrera', ejercicios: [] }],
      listarEjercicios: async () => [],
      escapar: (texto) => texto,
    } },
    document: { getElementById: elemento },
    supabaseClient: {}, openModal() {},
  });
  const archivo = path.join(__dirname, '..', '..', 'fitnova-manager', 'js', 'entrenos-manager.js');
  vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto);
  const manager = vm.runInContext('EntMgr', contexto);
  await manager.abrirAsignar({ clienteId: 'c', fecha: '2026-03-14', cardio: true });
  assert.equal(elemento('ent-asig-titulo').textContent, 'Asignar cardio');
  assert.match(elemento('ent-asig-info').textContent, /Se muestran todos tus workouts/);
  assert.match(elemento('ent-asig-workout').innerHTML, /Carrera/);
  assert.equal(elemento('ent-asig-fecha').value, '2026-03-14');
  await manager.abrirAsignar({ clienteId: 'c', fecha: '2026-03-15' });
  assert.equal(elemento('ent-asig-titulo').textContent, 'Asignar workout');
  assert.doesNotMatch(elemento('ent-asig-info').textContent, /cardio/);
});

test('Calendario advierte cuando una fuente falla en lugar de afirmar que está vacía', async () => {
  const app = preparar({ fallo: 'clientes_comidas' });
  await app.iniciar();
  assert.match(app.elemento('plan-cal-error').textContent, /Comidas: Error de prueba/);
  assert.match(app.elemento('plan-cal-estado').textContent, /consulta incompleta/);
  const clic = app.elemento('planificacion-cliente').listeners.click;
  clic({ target: { closest: (s) => s === '[data-plan-fecha]' ? { dataset: { planFecha: '2026-03-18' } } : null } });
  assert.match(app.elemento('plan-cal-estado').textContent, /No se puede confirmar/);
});
