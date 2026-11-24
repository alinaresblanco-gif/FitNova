const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Programas: permisos, fechas, copias y operaciones atómicas', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.prof', '${uid(n)}', false)`);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.profesionales (id uuid primary key);
      create table public.clientes (id uuid primary key);
      create table public.workouts (id uuid primary key, profesional_id uuid not null, nombre text, descripcion text, ejercicios jsonb);
      create table public.clientes_workouts (
        id uuid primary key default gen_random_uuid(), cliente_id uuid, profesional_id uuid,
        workout_origen_id uuid, fecha date, nombre text, descripcion text, ejercicios jsonb
      );
      create function public.profesional_actual_id() returns uuid language sql stable as
        $$ select nullif(current_setting('test.prof', true), '')::uuid $$;
      create function public.es_profesional_salud_de(id uuid) returns boolean language sql stable as
        $$ select public.profesional_actual_id() = '${uid(1)}' and id = '${uid(3)}' $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as
        $$ begin new.actualizado_en = now(); return new; end $$;
      insert into public.profesionales values ('${uid(1)}'),('${uid(2)}');
      insert into public.clientes values ('${uid(3)}');
      insert into public.workouts values ('${uid(4)}','${uid(1)}','Fuerza',null,'[{"nombre":"Sentadilla"}]');
      grant usage on schema public to authenticated, anon;
      grant select on public.workouts, public.clientes_workouts to authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126110000_programas.sql'), 'utf8'));
    await como(1);
    const items = [{ workout_id: uid(4), semana: 1, dia: 1 }, { workout_id: uid(4), semana: 2, dia: 3 }];
    const guardar = (id, name, rows) => db.query('select public.guardar_programa($1,$2,$3,$4) as id', [id, name, null, JSON.stringify(rows)]);
    const id = (await guardar(null, 'Programa', items)).rows[0].id;
    assert.equal((await db.query('select * from public.programa_workouts')).rows.length, 2);
    await assert.rejects(guardar(id, 'Incompleto', [items[0], items[0]]), /duplicate key/);
    assert.equal((await db.query('select nombre from public.programas where id=$1', [id])).rows[0].nombre, 'Programa');
    assert.equal((await db.query('select * from public.programa_workouts')).rows.length, 2);
    await como(2);
    assert.equal((await db.query('select * from public.programas')).rows.length, 0);
    assert.equal((await db.query('select * from public.programa_workouts')).rows.length, 0);
    await assert.rejects(guardar(id, 'Ajeno', items), /programa propio/);
    await assert.rejects(db.query('select public.asignar_programa($1,$2,$3)', [id, uid(3), '2030-01-01']), /profesional asignado/);
    await assert.rejects(db.query('insert into public.programa_workouts(programa_id,workout_id,semana,dia) values ($1,$2,1,1)', [id, uid(4)]), /permission denied/);
    await como(1);
    const asignados = await db.query('select public.asignar_programa($1,$2,$3) as cantidad', [id, uid(3), '2030-01-01']);
    assert.equal(asignados.rows[0].cantidad, 2);
    const entrenamientos = await db.query('select fecha::text, programa_nombre, programa_semana from public.clientes_workouts order by fecha');
    assert.deepEqual(entrenamientos.rows.map((w) => [w.fecha, w.programa_nombre, w.programa_semana]),
      [['2030-01-01', 'Programa', 1], ['2030-01-10', 'Programa', 2]]);
    await guardar(id, 'Modificado', [items[0]]);
    assert.equal((await db.query("select count(*)::int as n from public.clientes_workouts where programa_nombre='Programa'")).rows[0].n, 2);
    await db.query('delete from public.programas where id=$1', [id]);
    assert.equal((await db.query('select count(*)::int as n from public.clientes_workouts')).rows[0].n, 2);
  } finally { await db.close(); }
});
