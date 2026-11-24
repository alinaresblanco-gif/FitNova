const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Formularios: plantilla, envío, respuesta y aislamiento', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid
      $$;
      create table public.profesionales (id uuid primary key, usuario uuid);
      create table public.clientes (id uuid primary key, usuario uuid, estado text);
      create table public.profesional_cliente (cliente_id uuid, profesional_id uuid, rol text);
      create table public.notificaciones (destinatario_tipo text,destinatario_id uuid,tipo text,titulo text,referencia_id text,cliente_id uuid);
      create function public.profesional_actual_id() returns uuid language sql stable security definer as $$
        select id from public.profesionales where usuario=auth.uid()
      $$;
      create function public.cliente_actual_id() returns uuid language sql stable security definer as $$
        select id from public.clientes where usuario=auth.uid()
      $$;
      create function public.es_profesional_salud_de(c uuid) returns boolean language sql stable security definer as $$
        select exists (select 1 from public.profesional_cliente where cliente_id=c
          and profesional_id=public.profesional_actual_id() and rol in ('entrenador','nutricionista'))
      $$;
      create function public.can_access_client_health(c uuid) returns boolean language sql stable security definer as $$
        select c=public.cliente_actual_id() or public.es_profesional_salud_de(c)
      $$;
      grant usage on schema public,auth to authenticated,anon;
      insert into public.profesionales values ('${uid(11)}','${uid(1)}'),('${uid(12)}','${uid(2)}');
      insert into public.clientes values ('${uid(21)}','${uid(3)}','activo'),('${uid(22)}','${uid(4)}','activo');
      insert into public.profesional_cliente values ('${uid(21)}','${uid(11)}','entrenador');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127120000_formularios_seguimiento.sql'), 'utf8'));
    const preguntas = [{ texto:'¿Cómo te encuentras?',tipo:'texto' }, { texto:'Esfuerzo',tipo:'numero' },
      { texto:'Ánimo',tipo:'opcion',opciones:['Bien','Regular'] }];
    await como(1);
    await assert.rejects(db.query('select public.guardar_formulario(null,$1,$2::jsonb)', ['Vacío','[]']), /no válidos/);
    const plantilla = (await db.query('select public.guardar_formulario(null,$1,$2::jsonb) as id', ['Seguimiento',JSON.stringify(preguntas)])).rows[0].id;
    await assert.rejects(db.query('select public.enviar_formulario($1,$2)', [plantilla,uid(22)]), /cliente activo asignado/);
    const enviado = (await db.query('select public.enviar_formulario($1,$2) as id', [plantilla,uid(21)])).rows[0].id;
    await db.query('select public.guardar_formulario($1,$2,$3::jsonb)', [plantilla,'Cambiado',JSON.stringify([{ texto:'Nueva',tipo:'texto' }])]);
    assert.equal((await db.query('select titulo from public.formularios_enviados where id=$1', [enviado])).rows[0].titulo, 'Seguimiento');
    await como(2);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 0);
    await assert.rejects(db.query('select public.cancelar_formulario($1)', [enviado]), /sin permiso/);
    await como(4);
    await assert.rejects(db.query('select public.responder_formulario($1,$2::jsonb)', [enviado,JSON.stringify(['Bien',3,'Bien'])]), /no encontrado/);
    await como(3);
    await assert.rejects(db.query('select public.responder_formulario($1,$2::jsonb)', [enviado,JSON.stringify(['Bien','tres','Bien'])]), /numérica/);
    await assert.rejects(db.query('select public.responder_formulario($1,$2::jsonb)', [enviado,JSON.stringify(['Bien',3,'Otro'])]), /Opción/);
    await db.query('select public.responder_formulario($1,$2::jsonb)', [enviado,JSON.stringify(['Bien',3,'Bien'])]);
    await assert.rejects(db.query('select public.responder_formulario($1,$2::jsonb)', [enviado,JSON.stringify(['Bien',3,'Bien'])]), /ya respondido/);
    await como(1);
    assert.deepEqual((await db.query('select respuestas from public.formularios_enviados where id=$1', [enviado])).rows[0].respuestas, ['Bien',3,'Bien']);
    await db.query('select public.eliminar_formulario($1)', [plantilla]);
    assert.equal((await db.query('select id from public.formularios_enviados where id=$1', [enviado])).rows.length, 1);
    await db.exec(`reset role; delete from public.profesional_cliente where profesional_id='${uid(11)}'`);
    await como(1);
    assert.equal((await db.query('select id from public.formularios_enviados where id=$1', [enviado])).rows.length, 0);
  } finally { await db.close(); }
});
