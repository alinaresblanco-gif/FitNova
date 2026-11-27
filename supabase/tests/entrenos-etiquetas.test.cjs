const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const raiz = path.join(__dirname, '..', '..');
const contexto = vm.createContext({ window: {}, URL });
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'entrenos.js'), 'utf8'), contexto);
const E = contexto.window.FitNovaEntrenos;

test('Ejercicios admiten selecciones múltiples opcionales y conservan sus etiquetas al asignar', () => {
  const vacio = E.validarEjercicio({ nombre: 'Ejercicio' });
  assert.deepEqual(Array.from(vacio.fila.especialidades), []);
  assert.deepEqual(Array.from(vacio.fila.articulaciones), []);
  assert.deepEqual(Array.from(vacio.fila.musculos_principales), []);
  const r = E.validarEjercicio({
    nombre: 'Prueba', especialidades: ['cardio', 'equilibrio', 'activacion'],
    articulaciones: ['rodilla', 'muneca'], musculos_principales: ['biceps', 'cuadriceps', 'pecho', 'pectoral'],
    video_url: 'https://youtu.be/abcdefghijk',
  });
  assert.equal(r.fila.categoria, 'cardio');
  assert.match(E.etiquetasHtml(r.fila), /Equilibrio/);
  assert.match(E.etiquetasHtml(r.fila), /Activación/);
  assert.match(E.etiquetasHtml(r.fila), /Muñeca/);
  assert.match(E.etiquetasHtml(r.fila), /Bíceps/);
  assert.match(E.etiquetasHtml(r.fila), /Cuádriceps/);
  const item = E.itemDesdeCatalogo({ ...r.fila, id: '1' });
  const copia = E.validarWorkout({ nombre: 'Rutina', ejercicios: [item] }).fila.ejercicios[0];
  assert.deepEqual(Array.from(copia.especialidades), ['cardio', 'equilibrio', 'activacion']);
  assert.deepEqual(Array.from(copia.articulaciones), ['rodilla', 'muneca']);
  assert.deepEqual(Array.from(copia.musculos_principales), ['biceps', 'cuadriceps', 'pecho', 'pectoral']);
  const actualizado = E.refrescar([copia], [{ ...r.fila, id: '1', articulaciones: ['cadera'], musculos_principales: ['gluteo'] }])[0];
  assert.deepEqual(Array.from(actualizado.articulaciones), ['cadera']);
  assert.deepEqual(Array.from(actualizado.musculos_principales), ['gluteo']);
  assert.deepEqual(Array.from(copia.musculos_principales), ['biceps', 'cuadriceps', 'pecho', 'pectoral']);
  assert.deepEqual(Array.from(copia.articulaciones), ['rodilla', 'muneca']);
  assert.ok(E.validarEjercicio({ nombre: 'X', especialidades: ['cardio', 'cardio'] }).error);
  assert.ok(E.validarEjercicio({ nombre: 'X', articulaciones: ['invalida'] }).error);
  assert.ok(E.validarEjercicio({ nombre: 'X', musculos_principales: ['biceps', 'biceps'] }).error);
  assert.ok(E.validarEjercicio({ nombre: 'X', musculos_principales: ['invalido'] }).error);
  const todos = ['abdominales', 'abductores', 'aductores', 'antebrazo', 'biceps', 'cuello', 'cuadriceps', 'dorsal', 'espalda', 'gemelo', 'trapecio', 'gluteo', 'hombro', 'isquiotibiales', 'lumbar', 'oblicuos', 'pecho', 'pectoral', 'tibial', 'triceps'];
  assert.deepEqual(Array.from(E.MUSCULOS_PRINCIPALES, (x) => x.valor), todos);
  assert.equal(E.validarEjercicio({ nombre: 'X', musculos_principales: todos }).fila.musculos_principales.length, 20);
});

test('Migración conserva categorías antiguas y valida las etiquetas en ejercicios y copias', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create table public.ejercicios (id int primary key, categoria varchar(20));
      insert into public.ejercicios values (1,'cardio'), (2,null);
      create function public.entreno_txt_ok(jsonb, integer) returns boolean language sql immutable as $$ select true $$;
      create function public.entreno_num_ok(jsonb, numeric, numeric) returns boolean language sql immutable as $$ select true $$;
      create function public.video_url_valida(text) returns boolean language sql immutable as $$ select true $$;
    `);
    await db.exec(fs.readFileSync(path.join(raiz, 'supabase', 'migrations', '20261127192000_especialidades_articulaciones.sql'), 'utf8'));
    assert.deepEqual((await db.query('select especialidades from public.ejercicios where id=1')).rows[0].especialidades, ['cardio']);
    assert.deepEqual((await db.query('select especialidades from public.ejercicios where id=2')).rows[0].especialidades, []);
    await db.exec("insert into public.ejercicios (id,categoria) values (3,'fuerza')");
    assert.deepEqual((await db.query('select especialidades from public.ejercicios where id=3')).rows[0].especialidades, ['fuerza']);
    await db.exec("update public.ejercicios set especialidades=array['cardio','equilibrio'], articulaciones=array['rodilla','pie'] where id=1");
    await db.exec("update public.ejercicios set categoria='fuerza' where id=1");
    assert.deepEqual((await db.query('select especialidades from public.ejercicios where id=1')).rows[0].especialidades, ['equilibrio', 'fuerza']);
    await assert.rejects(db.exec("update public.ejercicios set especialidades=array['cardio','cardio'] where id=1"), /check constraint/);
    await assert.rejects(db.exec("update public.ejercicios set articulaciones=array['invalida'] where id=1"), /check constraint/);
    await db.exec(fs.readFileSync(path.join(raiz, 'supabase', 'migrations', '20261127193000_musculos_ejercicios.sql'), 'utf8'));
    assert.deepEqual((await db.query('select musculos_principales from public.ejercicios where id=1')).rows[0].musculos_principales, []);
    await db.exec("update public.ejercicios set musculos_principales=array['biceps','gluteo','pecho','pectoral'] where id=1");
    await assert.rejects(db.exec("update public.ejercicios set musculos_principales=array['biceps','biceps'] where id=1"), /check constraint/);
    await assert.rejects(db.exec("update public.ejercicios set musculos_principales=array['invalido'] where id=1"), /check constraint/);
    const validar = async (items) => (await db.query('select public.entreno_ejercicios_validos($1::jsonb) as valido', [JSON.stringify(items)])).rows[0].valido;
    assert.equal(await validar([{ nombre: 'Antiguo' }]), true);
    assert.equal(await validar([{ nombre: 'Nuevo', especialidades: ['cardio', 'equilibrio'], articulaciones: ['rodilla', 'pie'] }]), true);
    assert.equal(await validar([{ nombre: 'Nuevo', especialidades: ['cardio', 'cardio'] }]), false);
    assert.equal(await validar([{ nombre: 'Nuevo', articulaciones: ['invalida'] }]), false);
    assert.equal(await validar([{ nombre: 'Nuevo', musculos_principales: ['biceps', 'gluteo'] }]), true);
    assert.equal(await validar([{ nombre: 'Nuevo', musculos_principales: ['biceps', 'biceps'] }]), false);
    assert.equal(await validar([{ nombre: 'Nuevo', musculos_principales: ['invalido'] }]), false);
  } finally { await db.close(); }
});

test('Go permite registrar y editar las series disponibles sin añadir nuevas', async () => {
  const elementos = new Map();
  const elemento = (id) => {
    if (!elementos.has(id)) elementos.set(id, {
      innerHTML: '', textContent: '', hidden: false, listeners: {},
      addEventListener(tipo, fn) { this.listeners[tipo] = fn; },
    });
    return elementos.get(id);
  };
  let iniciar;
  const document = {
    getElementById: elemento,
    addEventListener(tipo, fn) { if (tipo === 'DOMContentLoaded') iniciar = fn; },
  };
  const contextoGo = vm.createContext({
    window: { location: { search: '?id=w' } }, document, URLSearchParams, Date, Number, String, Error,
    requireSessionGo: async () => true,
    supabaseClient: { rpc: async () => ({ data: 'c', error: null }) },
  });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'entrenos.js'), 'utf8'), contextoGo);
  const ejercicio = { nombre: 'Ejercicio', series: 2, repeticiones: '10' };
  const workout = { id: 'w', nombre: 'Rutina', fecha: '2026-11-27', ejercicios: [ejercicio], registro: null, comentarios: [] };
  contextoGo.window.FitNovaEntrenos.obtener = async () => workout;
  vm.runInContext(fs.readFileSync(path.join(raiz, 'mockup-fitnova-go', 'js', 'entrenos-go.js'), 'utf8'), contextoGo);
  iniciar();
  await new Promise(setImmediate);
  const click = elemento('ent-contenido').listeners.click;
  const registrar = { target: { closest: (selector) => selector === '#ent-registrar' ? {} : null } };
  await click(registrar);
  let html = elemento('ent-contenido').innerHTML;
  assert.equal((html.match(/data-serie>/g) || []).length, 2);
  assert.doesNotMatch(html, /Añadir serie|data-anadir-serie/);
  assert.match(html, /data-quitar-serie/);

  workout.registro = { fecha: '2026-11-27', resultados: [{ indice: 0, hecho: true, series: [
    { reps: 8, kg: 5 }, { reps: 9, kg: 6 }, { reps: 10, kg: 7 },
  ] }] };
  await click(registrar);
  html = elemento('ent-contenido').innerHTML;
  assert.equal((html.match(/data-serie>/g) || []).length, 3);
  assert.match(html, /value="7"/);
  assert.doesNotMatch(html, /Añadir serie|data-anadir-serie/);
});
