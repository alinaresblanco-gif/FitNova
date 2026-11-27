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
  const r = E.validarEjercicio({
    nombre: 'Prueba', especialidades: ['cardio', 'equilibrio', 'activacion'],
    articulaciones: ['rodilla', 'muneca'], video_url: 'https://youtu.be/abcdefghijk',
  });
  assert.equal(r.fila.categoria, 'cardio');
  assert.match(E.etiquetasHtml(r.fila), /Equilibrio/);
  assert.match(E.etiquetasHtml(r.fila), /Activación/);
  assert.match(E.etiquetasHtml(r.fila), /Muñeca/);
  const item = E.itemDesdeCatalogo({ ...r.fila, id: '1' });
  const copia = E.validarWorkout({ nombre: 'Rutina', ejercicios: [item] }).fila.ejercicios[0];
  assert.deepEqual(Array.from(copia.especialidades), ['cardio', 'equilibrio', 'activacion']);
  assert.deepEqual(Array.from(copia.articulaciones), ['rodilla', 'muneca']);
  const actualizado = E.refrescar([copia], [{ ...r.fila, id: '1', articulaciones: ['cadera'] }])[0];
  assert.deepEqual(Array.from(actualizado.articulaciones), ['cadera']);
  assert.deepEqual(Array.from(copia.articulaciones), ['rodilla', 'muneca']);
  assert.ok(E.validarEjercicio({ nombre: 'X', especialidades: ['cardio', 'cardio'] }).error);
  assert.ok(E.validarEjercicio({ nombre: 'X', articulaciones: ['invalida'] }).error);
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
    const validar = async (items) => (await db.query('select public.entreno_ejercicios_validos($1::jsonb) as valido', [JSON.stringify(items)])).rows[0].valido;
    assert.equal(await validar([{ nombre: 'Antiguo' }]), true);
    assert.equal(await validar([{ nombre: 'Nuevo', especialidades: ['cardio', 'equilibrio'], articulaciones: ['rodilla', 'pie'] }]), true);
    assert.equal(await validar([{ nombre: 'Nuevo', especialidades: ['cardio', 'cardio'] }]), false);
    assert.equal(await validar([{ nombre: 'Nuevo', articulaciones: ['invalida'] }]), false);
  } finally { await db.close(); }
});
