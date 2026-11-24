const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('planes y propuestas: propiedad, asignaciones, copias y permisos', async () => {
  const db = new PGlite();
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid
      $$;
      create table public.profesionales (id uuid primary key, auth_user_id uuid);
      create table public.clientes (id uuid primary key, auth_user_id uuid, nombre text, apellidos text, email text, estado text);
      create table public.profesional_cliente (profesional_id uuid, cliente_id uuid, rol text);
      create function public.profesional_actual_id() returns uuid language sql stable security definer as $$
        select id from public.profesionales where auth_user_id = auth.uid()
      $$;
      create function public.es_profesional_salud_de(p_cliente uuid) returns boolean language sql stable security definer as $$
        select exists (select 1 from public.profesional_cliente where cliente_id = p_cliente
          and profesional_id = public.profesional_actual_id() and rol in ('entrenador','nutricionista'))
      $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as $$
        begin new.actualizado_en := now(); return new; end
      $$;
      insert into public.profesionales values ('${uid(11)}','${uid(1)}'),('${uid(12)}','${uid(2)}');
      insert into public.clientes values ('${uid(21)}','${uid(3)}','Cliente','Uno','uno@example.test','activo'),
        ('${uid(22)}','${uid(4)}','Cliente','Dos','dos@example.test','activo'),
        ('${uid(23)}','${uid(5)}','Cliente','Inactivo','tres@example.test','archivado');
      insert into public.profesional_cliente values ('${uid(11)}','${uid(21)}','entrenador'),
        ('${uid(11)}','${uid(23)}','entrenador'), ('${uid(12)}','${uid(22)}','nutricionista');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127140000_negocio_planes.sql'), 'utf8'));
    await como(1);
    const guardar = (id, nombre, tipo, precio) => db.query(
      'select public.negocio_guardar_plan($1,$2,$3,$4,$5) as id', [id, nombre, 'Descripción', tipo, precio]);
    await assert.rejects(guardar(null, 'Plan', 'mensual', 0), /importe válido/);
    await assert.rejects(guardar(null, 'Plan', 'extraño', 100), /modalidad válida/);
    const plan = (await guardar(null, ' Plan inicial ', 'mensual', 4900)).rows[0].id;
    assert.deepEqual((await db.query('select id from public.negocio_clientes_disponibles()')).rows.map((r) => r.id), [uid(21)]);
    await assert.rejects(db.query('select public.negocio_crear_propuesta($1,$2)', [plan, uid(22)]), /clientes activos/);
    await assert.rejects(db.query('select public.negocio_crear_propuesta($1,$2)', [plan, uid(23)]), /clientes activos/);
    const propuesta = (await db.query('select public.negocio_crear_propuesta($1,$2) as id', [plan, uid(21)])).rows[0].id;
    await assert.rejects(db.query('select public.negocio_crear_propuesta($1,$2)', [plan, uid(21)]), /Ya existe/);
    await guardar(plan, 'Plan actualizado', 'anual', 59000);
    let fila = (await db.query('select nombre,modalidad,precio_centimos,estado from public.negocio_propuestas where id=$1', [propuesta])).rows[0];
    assert.deepEqual(fila, { nombre: 'Plan inicial', modalidad: 'mensual', precio_centimos: 4900, estado: 'borrador' });
    await assert.rejects(db.query("update public.negocio_propuestas set precio_centimos=1 where id=$1", [propuesta]), /permission denied/);
    await como(2);
    assert.equal((await db.query('select id from public.negocio_planes')).rows.length, 0);
    assert.equal((await db.query('select id from public.negocio_propuestas')).rows.length, 0);
    await assert.rejects(guardar(plan, 'Otro', 'mensual', 100), /no encontrado/);
    await assert.rejects(db.query('select public.negocio_retirar_propuesta($1)', [propuesta]), /no encontrada/);
    await como(3);
    assert.equal((await db.query('select id from public.negocio_propuestas')).rows.length, 0);
    await assert.rejects(db.query('select public.negocio_crear_propuesta($1,$2)', [plan, uid(21)]), /clientes activos/);
    await como(1);
    await db.query('select public.negocio_archivar_plan($1)', [plan]);
    await assert.rejects(db.query('select public.negocio_crear_propuesta($1,$2)', [plan, uid(21)]), /no encontrado/);
    await db.query('select public.negocio_retirar_propuesta($1)', [propuesta]);
    fila = (await db.query('select estado,retirada_en from public.negocio_propuestas where id=$1', [propuesta])).rows[0];
    assert.equal(fila.estado, 'retirada');
    assert.ok(fila.retirada_en);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.negocio_planes'), /permission denied/);
    await assert.rejects(guardar(null, 'Plan', 'mensual', 100), /permission denied/);
    await db.exec('reset role');
    await db.query('delete from public.profesional_cliente where profesional_id=$1 and cliente_id=$2', [uid(11), uid(21)]);
    await como(1);
    assert.equal((await db.query('select id from public.negocio_propuestas')).rows.length, 0);
  } finally { await db.close(); }
});

test('importes se convierten exactamente a céntimos y rechazan valores inválidos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'fitnova-manager', 'js', 'negocio.js'), 'utf8');
  const context = { document: { addEventListener() {} }, Intl };
  vm.runInNewContext(source, context);
  for (const [input, expected] of [['49,90', 4990], ['0,01', 1], ['12.5', 1250], ['999999,99', 99999999]]) {
    assert.equal(context.negocioCentimos(input), expected);
  }
  for (const input of ['', '0', '-1', '1,234', '1000000', '1e2', '1.2.3']) {
    assert.equal(context.negocioCentimos(input), null);
  }
});
