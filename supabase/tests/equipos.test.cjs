const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

test('Invitaciones de equipo: aislamiento, aceptación, renovación y caducidad', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create extension pgcrypto with schema extensions;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid
      $$;
      create table public.profesionales (id uuid primary key, auth_user_id uuid, email text, nombre text, apellidos text);
      create table public.clientes (id uuid primary key default gen_random_uuid(), nombre text,
        apellidos text, email text, estado text, actualizado_en timestamptz);
      create table public.profesional_cliente (id uuid primary key default gen_random_uuid(),
        cliente_id uuid references public.clientes, profesional_id uuid references public.profesionales,
        rol text, unique (cliente_id, profesional_id, rol));
      create table public.invitaciones (id uuid primary key default gen_random_uuid(), cliente_id uuid,
        profesional_id uuid, token_hash text, email_destino text, estado text,
        fecha_envio timestamptz, fecha_expiracion timestamptz);
      create table public.sesiones (id uuid primary key default gen_random_uuid(), cliente_id uuid,
        profesional_id uuid, inicio timestamptz, estado text);
      create function public.profesional_actual_id() returns uuid language sql stable security definer as $$
        select id from public.profesionales where auth_user_id = auth.uid()
      $$;
      grant usage on schema public, auth to authenticated, anon;
      insert into auth.users values ('${uid(1)}','dueno@example.com'), ('${uid(2)}','colaborador@example.com'),
        ('${uid(3)}','ajeno@example.com');
      insert into public.profesionales values ('${uid(11)}','${uid(1)}','dueno@example.com','Uno',null),
        ('${uid(12)}','${uid(2)}','colaborador@example.com','Dos',null),
        ('${uid(13)}','${uid(3)}','ajeno@example.com','Tres',null);
      insert into public.clientes (id,nombre,email,estado) values
        ('${uid(21)}','Cliente propio','cliente@example.com','invitacion_enviada'),
        ('${uid(22)}','Cliente ajeno','ajeno-cliente@example.com','activo');
      insert into public.profesional_cliente (cliente_id,profesional_id,rol) values
        ('${uid(21)}','${uid(11)}','entrenador'), ('${uid(22)}','${uid(13)}','entrenador');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127100000_equipos_base.sql'), 'utf8'));
    await como(1);
    await assert.rejects(db.query("select * from public.equipo_invitar('dueno@example.com','entrenador')"), /ti mismo/);
    await assert.rejects(db.query("select * from public.equipo_invitar('x@example.com','administrador')"), /Rol no válido/);
    const primera = (await db.query("select * from public.equipo_invitar(' COLABORADOR@example.com ','entrenador')")).rows[0];
    const segunda = (await db.query("select * from public.equipo_invitar('colaborador@example.com','nutricionista')")).rows[0];
    assert.notEqual(primera.token, segunda.token);
    await assert.rejects(db.query('select token_hash from public.equipo_invitaciones'), /permission denied/);
    await assert.rejects(db.query("insert into public.equipo_miembros (equipo_id,profesional_id,rol) values ($1,$2,'entrenador')", [uid(99), uid(13)]), /permission denied/);
    await como(3);
    assert.equal((await db.query('select id from public.equipo_invitaciones')).rows.length, 0);
    assert.equal((await db.query('select id from public.equipos')).rows.length, 0);
    await assert.rejects(db.query('select public.equipo_aceptar_invitacion($1)', [segunda.token]), /otro correo/);
    await assert.rejects(db.query('select public.equipo_cancelar_invitacion($1)', [segunda.invitacion_id]), /sin permiso/);
    await como(2);
    await assert.rejects(db.query('select public.equipo_aceptar_invitacion($1)', [primera.token]), /no válida/);
    const equipo = (await db.query('select public.equipo_aceptar_invitacion($1) as id', [segunda.token])).rows[0].id;
    assert.equal((await db.query('select rol from public.equipo_miembros where equipo_id=$1', [equipo])).rows[0].rol, 'nutricionista');
    await assert.rejects(db.query('select public.equipo_aceptar_invitacion($1)', [segunda.token]), /no válida/);
    await como(1);
    await assert.rejects(db.query("select * from public.equipo_invitar('colaborador@example.com','entrenador')"), /ya pertenece/);
    await assert.rejects(db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(22)]), /clientes propios/);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(21)]);
    assert.equal((await db.query('select * from public.equipo_clientes($1)', [uid(12)])).rows[0].asignado, true);
    await db.exec('reset role');
    let relacion = (await db.query('select asignacion_independiente from public.profesional_cliente where cliente_id=$1 and profesional_id=$2', [uid(21),uid(12)])).rows[0];
    assert.equal(relacion.asignacion_independiente, false);
    await db.query("insert into public.sesiones (id,cliente_id,profesional_id,inicio,estado) values ($1,$2,$3,now()+interval '1 day','programada'),($4,$2,$3,now()-interval '1 day','programada')", [uid(41),uid(21),uid(12),uid(42)]);
    await como(1);
    await db.query('select public.equipo_retirar_cliente($1,$2)', [uid(12),uid(21)]);
    await db.exec('reset role');
    assert.equal((await db.query('select id from public.profesional_cliente where cliente_id=$1 and profesional_id=$2', [uid(21),uid(12)])).rows.length, 0);
    assert.equal((await db.query('select estado from public.sesiones where id=$1', [uid(41)])).rows[0].estado, 'cancelada');
    assert.equal((await db.query('select estado from public.sesiones where id=$1', [uid(42)])).rows[0].estado, 'programada');
    await db.query("insert into public.profesional_cliente(cliente_id,profesional_id,rol) values ($1,$2,'nutricionista')", [uid(21),uid(12)]);
    await db.query("insert into public.sesiones (id,cliente_id,profesional_id,inicio,estado) values ($1,$2,$3,now()+interval '2 days','programada')", [uid(43),uid(21),uid(12)]);
    await como(1);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(21)]);
    await db.query('select public.equipo_retirar_miembro($1)', [uid(12)]);
    await db.exec('reset role');
    relacion = (await db.query('select asignacion_independiente from public.profesional_cliente where cliente_id=$1 and profesional_id=$2', [uid(21),uid(12)])).rows[0];
    assert.equal(relacion.asignacion_independiente, true);
    assert.equal((await db.query('select estado from public.sesiones where id=$1', [uid(43)])).rows[0].estado, 'programada');
    await como(1);
    const cuarta = (await db.query("select * from public.equipo_invitar('colaborador@example.com','entrenador')")).rows[0];
    await como(2);
    await db.query('select public.equipo_aceptar_invitacion($1)', [cuarta.token]);
    await como(1);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(21)]);
    await como(2);
    await db.query("select * from public.crear_invitacion('Cliente propio','cliente@example.com')");
    await como(1);
    await db.query('select public.equipo_retirar_miembro($1)', [uid(12)]);
    await db.exec('reset role');
    relacion = (await db.query("select asignacion_independiente from public.profesional_cliente where cliente_id=$1 and profesional_id=$2 and rol='entrenador'", [uid(21),uid(12)])).rows[0];
    assert.equal(relacion.asignacion_independiente, true);
    await como(1);
    const tercera = (await db.query("select * from public.equipo_invitar('ajeno@example.com','recepcion')")).rows[0];
    await db.exec('reset role');
    await db.query("update public.equipo_invitaciones set creado_en=now()-interval '9 days', expira_en=now()-interval '1 day' where id=$1", [tercera.invitacion_id]);
    await como(3);
    await assert.rejects(db.query('select public.equipo_aceptar_invitacion($1)', [tercera.token]), /caducada/);
    await como(1);
    await db.query('select public.equipo_cancelar_invitacion($1)', [tercera.invitacion_id]);
    await assert.rejects(db.query('select public.equipo_cancelar_invitacion($1)', [tercera.invitacion_id]), /no encontrada/);
  } finally { await db.close(); }
});
