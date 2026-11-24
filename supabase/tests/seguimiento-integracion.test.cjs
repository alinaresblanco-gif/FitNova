const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

test('Equipo, archivos y formularios con todas las migraciones y RLS reales', async () => {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create schema storage;
      create table auth.users (id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid
      $$;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon;
    `);
    const migrations = path.join(__dirname, '..', 'migrations');
    for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
    await db.exec(`
      insert into auth.users values ('${uid(1)}','dueno@example.com'),('${uid(2)}','colab@example.com'),
        ('${uid(3)}','cliente@example.com'),('${uid(4)}','ajeno@example.com');
      insert into public.profesionales (id,auth_user_id,nombre,email,rol) values
        ('${uid(11)}','${uid(1)}','Responsable','dueno@example.com','entrenador'),
        ('${uid(12)}','${uid(2)}','Colaborador','colab@example.com','entrenador'),
        ('${uid(14)}','${uid(4)}','Ajeno','ajeno@example.com','entrenador');
      insert into public.clientes (id,auth_user_id,nombre,email,estado) values
        ('${uid(21)}','${uid(3)}','Cliente','cliente@example.com','activo');
      insert into public.clientes_salud_parq (cliente_id,enfermedad_cardiaca_supervisada,
        dolor_pecho_actividad,dolor_pecho_reposo,perdida_consciencia_mareo,
        alteracion_osea_articular,medicacion_presion_arterial,otra_razon_medica)
        values ('${uid(21)}',false,false,false,false,false,false,false);
      insert into public.profesional_cliente (cliente_id,profesional_id,rol) values ('${uid(21)}','${uid(11)}','entrenador');
    `);
    await como(1);
    const inv = (await db.query("select * from public.equipo_invitar('colab@example.com','entrenador')")).rows[0];
    const invRecepcion = (await db.query("select * from public.equipo_invitar('ajeno@example.com','recepcion')")).rows[0];
    await como(4);
    await db.query('select public.equipo_aceptar_invitacion($1)', [invRecepcion.token]);
    await como(2);
    await db.query('select public.equipo_aceptar_invitacion($1)', [inv.token]);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 0);
    await como(1);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(21)]);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(14),uid(21)]);
    const listado = (await db.query('select * from public.equipo_listar()')).rows;
    assert.equal(listado.find((miembro) => miembro.profesional_id === uid(12)).clientes, 1);
    assert.equal((await db.query('select * from public.equipo_clientes($1)', [uid(12)])).rows[0].asignado, true);
    await como(2);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 1);
    const cita = (await db.query("select public.guardar_sesion($1,'Revisión','seguimiento',now()+interval '10 days',now()+interval '10 days 1 hour',null,null) as id", [uid(21)])).rows[0].id;
    const preguntas = [{ texto:'¿Cómo te encuentras?',tipo:'texto' }];
    const plantilla = (await db.query('select public.guardar_formulario(null,$1,$2::jsonb) as id', ['Seguimiento',JSON.stringify(preguntas)])).rows[0].id;
    const envio = (await db.query('select public.enviar_formulario($1,$2) as id', [plantilla,uid(21)])).rows[0].id;
    const ruta = `${uid(21)}/${uid(2)}/${uid(31)}`;
    await db.query("insert into storage.objects values ('seguimiento-archivos',$1,$2::jsonb)", [ruta,JSON.stringify({ mimetype:'application/pdf',size:120 })]);
    await db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),ruta,'informe.pdf','application/pdf']);
    await como(3);
    assert.equal((await db.query('select id from public.formularios_enviados where id=$1', [envio])).rows.length, 1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 1);
    await db.query('select public.responder_formulario($1,$2::jsonb)', [envio,JSON.stringify(['Bien'])]);
    await como(4);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 1);
    assert.equal((await db.query('select cliente_id from public.clientes_salud_parq')).rows.length, 0);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await como(1);
    await db.query('select public.equipo_retirar_miembro($1)', [uid(12)]);
    await como(2);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 0);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await como(3);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 1);
    assert.equal((await db.query('select estado from public.sesiones where id=$1', [cita])).rows[0].estado, 'cancelada');
  } finally { await db.close(); }
});
