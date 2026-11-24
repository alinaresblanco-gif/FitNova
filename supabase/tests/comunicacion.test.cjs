const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

test('Chat y tareas: aislamiento, lectura y permisos tras desvinculación', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false);`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      create table public.profesionales (id uuid primary key,auth_user_id uuid,nombre text,apellidos text);
      create table public.clientes (id uuid primary key,auth_user_id uuid,nombre text,apellidos text,estado text);
      create table public.profesional_cliente (cliente_id uuid,profesional_id uuid,rol text);
      create table public.sesiones (id uuid primary key,cliente_id uuid,profesional_id uuid,titulo text,tipo text,inicio timestamptz,fin timestamptz,lugar text,estado text);
      create table public.clientes_workouts (id uuid primary key,cliente_id uuid,profesional_id uuid,fecha date,nombre text,descripcion text,ejercicios jsonb);
      create table public.clientes_workout_registros (id uuid primary key,workout_id uuid,cliente_id uuid);
      create table public.clientes_workout_comentarios (id uuid primary key,workout_id uuid,cliente_id uuid);
      create table public.clientes_planes_nutricionales (id uuid primary key,cliente_id uuid,fin date);
      create table public.clientes_nutricion_comentarios (id uuid primary key,cliente_id uuid,fecha date);
      create table public.biblioteca_videos (id uuid primary key,publicado boolean,titulo text,descripcion text,categoria text,duracion_min int,video_url text);
      create table public.video_destinatarios (video_id uuid,cliente_id uuid);
      create function public.profesional_actual_id() returns uuid language sql stable security definer as
        $$ select id from public.profesionales where auth_user_id=auth.uid() $$;
      create function public.cliente_actual_id() returns uuid language sql stable security definer as
        $$ select id from public.clientes where auth_user_id=auth.uid() $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as
        $$ begin new.actualizado_en=now(); return new; end $$;
      insert into auth.users values ('${uid(1)}'),('${uid(2)}'),('${uid(3)}'),('${uid(4)}');
      insert into public.profesionales values ('${uid(11)}','${uid(1)}','Pro','Uno'),('${uid(12)}','${uid(2)}','Pro','Ajeno');
      insert into public.clientes values ('${uid(13)}','${uid(3)}','Cliente','Uno','activo'),('${uid(14)}','${uid(4)}','Cliente','Otro','activo');
      insert into public.profesional_cliente values ('${uid(13)}','${uid(11)}','entrenador');
      grant usage on schema public,auth,storage to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126140000_comunicacion_base.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126141000_notificaciones_eventos.sql'), 'utf8'));
    await como(1);
    assert.equal((await db.query("select * from public.chat_contactos('profesional')")).rows.length, 1);
    await assert.rejects(db.query('select public.chat_abrir($1,$2,null)', [uid(13),uid(11)]), /acceso/);
    const conv = (await db.query("select public.chat_abrir($1,$2,'profesional') as id", [uid(13),uid(11)])).rows[0].id;
    let nonce = 100;
    const send = (tipo, texto, ruta = null, nombre = null, mime = null, envio = uid(nonce++)) =>
      db.query('select public.chat_enviar($1,$2,$3,$4,$5,$6,$7) as id', [conv,tipo,envio,texto,ruta,nombre,mime]);
    const primero = (await send('profesional','Hola')).rows[0].id;
    assert.equal((await send('profesional','Hola',null,null,null,uid(100))).rows[0].id, primero);
    await assert.rejects(send('profesional','Distinto',null,null,null,uid(100)), /otro mensaje/);
    await assert.rejects(send('cliente','Suplantación'), /permiso/);
    const ruta = `${conv}/${uid(1)}/${uid(99)}.pdf`;
    await db.query("insert into storage.objects values ('chat-adjuntos',$1,$2::jsonb)", [ruta, JSON.stringify({mimetype:'application/pdf',size:128})]);
    assert.equal((await db.query('select * from storage.objects where name=$1', [ruta])).rows.length, 1);
    const temporal = `${conv}/${uid(1)}/${uid(98)}.pdf`;
    await db.query("insert into storage.objects values ('chat-adjuntos',$1,$2::jsonb)", [temporal, JSON.stringify({mimetype:'application/pdf',size:128})]);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [temporal])).rows.length, 1);
    await assert.rejects(send('profesional',null,ruta,'ejemplo.pdf','image/png'), /archivo no es válido/);
    const adjunto = (await send('profesional',null,ruta,'ejemplo.pdf','application/pdf')).rows[0].id;
    assert.ok(adjunto > primero);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [ruta])).rows.length, 0);
    const tarea = (await db.query('select public.guardar_tarea(null,$1,$2,$3,$4,false) as id', ['Llamar',null,null,uid(13)])).rows[0].id;
    assert.equal((await db.query("select * from public.notificaciones where tipo='tarea'")).rows.length, 1);
    await assert.rejects(db.query('select public.guardar_tarea(null,$1,$2,$3,$4,false)', ['Ajena',null,null,uid(14)]), /clientes asignados/);
    await db.query('select public.guardar_tarea($1,$2,$3,$4,$5,true)', [tarea,'Llamar','Hecho','2026-01-03',uid(13)]);
    assert.equal((await db.query('select completada from public.tareas_profesional where id=$1', [tarea])).rows[0].completada, true);
    await como(2);
    assert.equal((await db.query('select * from public.chat_mensajes')).rows.length, 0);
    assert.equal((await db.query('select * from public.tareas_profesional')).rows.length, 0);
    assert.equal((await db.query('select * from public.notificaciones')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects where name=$1', [ruta])).rows.length, 0);
    await assert.rejects(db.query('select public.eliminar_tarea($1)', [tarea]), /tarea propia/);
    await assert.rejects(db.query('select public.guardar_tarea($1,$2,$3,$4,$5,false)', [tarea,'Ajena',null,null,null]), /tarea propia/);
    await assert.rejects(db.query("insert into public.notificaciones(destinatario_tipo,destinatario_id,tipo,titulo) values ('profesional',$1,'chat','Falso')", [uid(11)]), /permission denied/);
    await assert.rejects(db.query("select public.chat_abrir($1,$2,'profesional')", [uid(13),uid(11)]), /acceso/);
    await como(3);
    assert.equal((await db.query('select * from public.chat_mensajes')).rows.length, 2);
    const avisos = (await db.query("select id from public.notificaciones where tipo='chat' order by id")).rows;
    assert.equal(avisos.length, 2);
    await db.query("select public.marcar_notificaciones('cliente',$1)", [[avisos[0].id]]);
    assert.equal((await db.query("select * from public.notificaciones where tipo='chat' and leido_en is null")).rows.length, 1);
    await assert.rejects(db.query("select public.marcar_notificaciones('cliente',null)"), /no válida/);
    assert.equal((await db.query("select * from storage.objects where name=$1", [ruta])).rows.length, 1);
    let contactos = (await db.query("select * from public.chat_contactos('cliente')")).rows;
    assert.equal(Number(contactos[0].no_leidos), 2);
    await db.query("select public.chat_marcar_leido($1,'cliente',$2)", [conv,primero]);
    contactos = (await db.query("select * from public.chat_contactos('cliente')")).rows;
    assert.equal(Number(contactos[0].no_leidos), 1);
    await db.exec('reset role');
    await db.exec(`delete from public.profesional_cliente where cliente_id='${uid(13)}' and profesional_id='${uid(11)}'`);
    await como(3);
    assert.equal((await db.query('select * from public.chat_mensajes')).rows.length, 2);
    assert.equal((await db.query("select * from storage.objects where name=$1", [ruta])).rows.length, 1);
    await assert.rejects(send('cliente','Ya no permitido'), /cerrada/);
    contactos = (await db.query("select * from public.chat_contactos('cliente')")).rows;
    assert.equal(contactos[0].activo, false);
    await como(1);
    assert.equal((await db.query('select * from public.tareas_profesional where id=$1', [tarea])).rows.length, 1);
    assert.equal((await send('profesional','Hola',null,null,null,uid(100))).rows[0].id, primero);
    await assert.rejects(send('profesional','Ya no permitido'), /cerrada/);
    await db.query('select public.eliminar_tarea($1)', [tarea]);
    assert.equal((await db.query('select * from public.tareas_profesional where id=$1', [tarea])).rows.length, 0);
  } finally { await db.close(); }
});

test('Chat: al actualizar no se pierden mensajes si llegan más de 50 entre consultas', async () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'comunicacion.js'), 'utf8'), context);
  const ids = Array.from({ length: 121 }, (_, i) => ({ id: i + 1 }));
  const client = {
    from() {
      let limite, cursor;
      const consulta = {
        select() { return this; },
        eq() { return this; },
        gt(columna, valor) { cursor = valor; return this; },
        order() { return this; },
        async limit(valor) { limite = valor; return { data: ids.filter((m) => m.id > cursor).slice(0, limite), error: null }; },
      };
      return consulta;
    },
  };
  const nuevos = await context.window.FitNovaComunicacion.mensajesNuevos(client, 'conv', 1);
  assert.equal(nuevos.length, 120);
  assert.equal(nuevos[0].id, 2);
  assert.equal(nuevos[nuevos.length - 1].id, 121);
});

test('Chat: no abre contactos sin una referencia explícita', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'comunicacion.js'), 'utf8'), context);
  const { contactoInicial } = context.window.FitNovaComunicacion;
  const contactos = [{ cliente_id:'cli', conversacion_id:null }, { cliente_id:'otra', conversacion_id:'conv' }];
  assert.equal(contactoInicial(contactos, 'profesional', null, null), undefined);
  assert.equal(contactoInicial(contactos, 'profesional', null, 'cli'), contactos[0]);
  assert.equal(contactoInicial(contactos, 'cliente', 'conv', null), contactos[1]);
  assert.equal(contactoInicial(contactos, 'cliente', null, 'cli'), undefined);
});

test('Avisos: eventos de agenda, entrenamiento, nutrición y vídeo para el destinatario correcto', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      create table public.profesionales (id uuid primary key,auth_user_id uuid,nombre text,apellidos text);
      create table public.clientes (id uuid primary key,auth_user_id uuid,nombre text,apellidos text,estado text);
      create table public.profesional_cliente (cliente_id uuid,profesional_id uuid,rol text);
      create table public.sesiones (id uuid primary key,cliente_id uuid,profesional_id uuid,titulo text,tipo text,inicio timestamptz,fin timestamptz,lugar text,estado text);
      create table public.clientes_workouts (id uuid primary key,cliente_id uuid,profesional_id uuid,fecha date,nombre text,descripcion text,ejercicios jsonb);
      create table public.clientes_workout_registros (id uuid primary key,workout_id uuid,cliente_id uuid);
      create table public.clientes_workout_comentarios (id uuid primary key,workout_id uuid,cliente_id uuid);
      create table public.clientes_planes_nutricionales (id uuid primary key,cliente_id uuid,fin date);
      create table public.clientes_nutricion_comentarios (id uuid primary key,cliente_id uuid,fecha date);
      create table public.biblioteca_videos (id uuid primary key,publicado boolean,titulo text,descripcion text,categoria text,duracion_min int,video_url text);
      create table public.video_destinatarios (video_id uuid,cliente_id uuid);
      create function public.profesional_actual_id() returns uuid language sql stable security definer as
        $$ select id from public.profesionales where auth_user_id=auth.uid() $$;
      create function public.cliente_actual_id() returns uuid language sql stable security definer as
        $$ select id from public.clientes where auth_user_id=auth.uid() $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as
        $$ begin new.actualizado_en=now(); return new; end $$;
      insert into auth.users values ('${uid(1)}'),('${uid(2)}'),('${uid(3)}');
      insert into public.profesionales values ('${uid(11)}','${uid(1)}','Pro','Uno');
      insert into public.clientes values ('${uid(13)}','${uid(2)}','Cliente','Uno','activo'),('${uid(14)}','${uid(3)}','Cliente','Dos','activo');
      insert into public.profesional_cliente values ('${uid(13)}','${uid(11)}','entrenador');
      grant usage on schema public,auth,storage to authenticated,anon;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126140000_comunicacion_base.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126141000_notificaciones_eventos.sql'), 'utf8'));
    let ultimo = 0;
    async function evento(sql, parametros, esperados) {
      await db.query(sql, parametros);
      const { rows } = await db.query('select id,destinatario_tipo,destinatario_id,tipo,titulo from public.notificaciones where id>$1 order by id', [ultimo]);
      if (rows.length) ultimo = Number(rows[rows.length - 1].id);
      assert.deepEqual(rows.map(({ destinatario_tipo, destinatario_id, tipo }) => [destinatario_tipo,destinatario_id,tipo]), esperados);
      return rows;
    }
    const cli = (categoria, id = 13) => ['cliente',uid(id),categoria];
    const pro = (categoria) => ['profesional',uid(11),categoria];
    await evento("insert into public.sesiones values ($1,$2,$3,'Cita','seguimiento',now(),now()+interval '1 hour',null,'programada')", [uid(21),uid(13),uid(11)], [cli('agenda')]);
    await evento("update public.sesiones set titulo=titulo where id=$1", [uid(21)], []);
    const cancelada = await evento("update public.sesiones set estado='cancelada' where id=$1", [uid(21)], [cli('agenda')]);
    assert.match(cancelada[0].titulo, /cancelado|cancelada/);
    await evento("update public.sesiones set cliente_id=$2 where id=$1", [uid(21),uid(14)], [cli('agenda'),cli('agenda',14)]);
    await evento("insert into public.clientes_workouts values ($1,$2,$3,'2026-01-01','Rutina',null,'[]')", [uid(22),uid(13),uid(11)], [cli('entrenamiento')]);
    await evento("update public.clientes_workouts set nombre=nombre where id=$1", [uid(22)], []);
    await evento("update public.clientes_workouts set nombre='Cambio' where id=$1", [uid(22)], [cli('entrenamiento')]);
    await evento('insert into public.clientes_workout_registros values ($1,$2,$3)', [uid(23),uid(22),uid(13)], [pro('entrenamiento')]);
    await evento('update public.clientes_workout_registros set cliente_id=cliente_id where id=$1', [uid(23)], [pro('entrenamiento')]);
    await evento('delete from public.clientes_workout_registros where id=$1', [uid(23)], [pro('entrenamiento')]);
    await evento('insert into public.clientes_workout_comentarios values ($1,$2,$3)', [uid(24),uid(22),uid(13)], [cli('entrenamiento')]);
    await evento('delete from public.clientes_workouts where id=$1', [uid(22)], [cli('entrenamiento')]);
    await evento("insert into public.clientes_planes_nutricionales values ($1,$2,'2026-01-07')", [uid(25),uid(13)], [cli('nutricion')]);
    await evento("update public.clientes_planes_nutricionales set fin=fin where id=$1", [uid(25)], []);
    await evento("update public.clientes_planes_nutricionales set fin='2026-01-06' where id=$1", [uid(25)], [cli('nutricion')]);
    await evento('delete from public.clientes_planes_nutricionales where id=$1', [uid(25)], [cli('nutricion')]);
    await evento("insert into public.clientes_nutricion_comentarios values ($1,$2,'2026-01-01')", [uid(26),uid(13)], [cli('nutricion')]);
    await evento("insert into public.biblioteca_videos values ($1,false,'Vídeo',null,null,null,'https://example.com')", [uid(27)], []);
    await evento('insert into public.video_destinatarios values ($1,$2)', [uid(27),uid(13)], []);
    await evento('update public.biblioteca_videos set publicado=true where id=$1', [uid(27)], [cli('video')]);
    await evento('update public.biblioteca_videos set titulo=titulo where id=$1', [uid(27)], []);
    await evento("update public.biblioteca_videos set titulo='Cambio' where id=$1", [uid(27)], [cli('video')]);
    await evento('insert into public.video_destinatarios values ($1,$2)', [uid(27),uid(14)], [cli('video',14)]);
    await evento('delete from public.video_destinatarios where video_id=$1 and cliente_id=$2', [uid(27),uid(14)], [cli('video',14)]);
    await evento('delete from public.biblioteca_videos where id=$1', [uid(27)], [cli('video')]);
  } finally { await db.close(); }
});
