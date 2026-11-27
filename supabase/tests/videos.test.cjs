const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Vídeos: destinatarios seleccionados, retirada y favoritos privados', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (pro, cli) => db.exec(`reset role; set role authenticated; select set_config('test.prof', '${pro ? uid(pro) : ''}', false); select set_config('test.cli', '${cli ? uid(cli) : ''}', false);`);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.profesionales (id uuid primary key);
      create table public.clientes (id uuid primary key, nombre text, apellidos text, estado text);
      create table public.profesional_cliente (profesional_id uuid, cliente_id uuid, rol text);
      create function public.profesional_actual_id() returns uuid language sql stable as
        $$ select nullif(current_setting('test.prof', true), '')::uuid $$;
      create function public.cliente_actual_id() returns uuid language sql stable as
        $$ select nullif(current_setting('test.cli', true), '')::uuid $$;
      create function public.video_url_valida(url text) returns boolean language sql immutable as
        $$ select url is null or url like 'https://youtu.be/%' $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as
        $$ begin new.actualizado_en = now(); return new; end $$;
      insert into public.profesionales values ('${uid(1)}'),('${uid(2)}');
      insert into public.clientes values ('${uid(3)}','Ana','A','activo'), ('${uid(4)}','Bea','B','activo'), ('${uid(5)}','Carlos','C','activo');
      insert into public.profesional_cliente values ('${uid(1)}','${uid(3)}','entrenador'), ('${uid(1)}','${uid(4)}','entrenador'), ('${uid(2)}','${uid(5)}','entrenador');
      grant usage on schema public to authenticated, anon;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126120000_biblioteca_videos.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126121000_videos_vista_cliente.sql'), 'utf8'));
    await db.exec(`
      insert into public.biblioteca_videos (id, profesional_id, titulo, video_url, publicado)
      values ('${uid(9)}', '${uid(1)}', 'Antiguo', 'https://youtu.be/abcdefghijk', true);
      insert into public.video_destinatarios (video_id, cliente_id) values ('${uid(9)}', '${uid(3)}');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127191000_fecha_publicacion_videos.sql'), 'utf8'));
    assert.equal((await db.query('select publicado_en from public.video_destinatarios where video_id=$1', [uid(9)])).rows[0].publicado_en, null);
    await db.query('delete from public.biblioteca_videos where id=$1', [uid(9)]);
    await como(1, 0);
    assert.equal((await db.query('select * from public.clientes_para_videos()')).rows.length, 2);
    const guardar = (id, titulo, publicado, clientes) => db.query(
      'select public.guardar_video($1,$2,$3,$4,$5,$6,$7,$8) as id',
      [id, titulo, null, 'Movilidad', 15, 'https://youtu.be/abcdefghijk', publicado, clientes]);
    const id = (await guardar(null, 'Movilidad', true, [uid(3)])).rows[0].id;
    const fechaOriginal = (await db.query('select publicado_en from public.video_destinatarios where video_id=$1', [id])).rows[0].publicado_en;
    assert.ok(fechaOriginal);
    await guardar(id, 'Movilidad editada', true, [uid(3)]);
    assert.deepEqual((await db.query('select publicado_en from public.video_destinatarios where video_id=$1', [id])).rows[0].publicado_en, fechaOriginal);
    assert.equal((await db.query('select * from public.listar_videos_cliente()')).rows.length, 0);
    await assert.rejects(guardar(id, 'No autorizado', true, [uid(5)]), /clientes activos/);
    assert.equal((await db.query('select titulo from public.biblioteca_videos where id=$1', [id])).rows[0].titulo, 'Movilidad editada');
    await como(0, 3);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 1);
    assert.equal((await db.query('select * from public.listar_videos_cliente()')).rows.length, 1);
    await db.query('insert into public.video_favoritos(video_id,cliente_id) values ($1,$2)', [id, uid(3)]);
    await como(0, 4);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 0);
    assert.equal((await db.query('select * from public.listar_videos_cliente()')).rows.length, 0);
    assert.equal((await db.query('select * from public.video_favoritos')).rows.length, 0);
    await assert.rejects(db.query('insert into public.video_favoritos(video_id,cliente_id) values ($1,$2)', [id, uid(4)]), /row-level security/);
    await como(2, 0);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 0);
    await assert.rejects(guardar(id, 'Ajeno', true, [uid(5)]), /vídeo propio/);
    await como(1, 0);
    await guardar(id, 'Movilidad', false, [uid(3)]);
    assert.equal((await db.query('select publicado_en from public.video_destinatarios where video_id=$1', [id])).rows[0].publicado_en, null);
    await como(0, 3);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 0);
    assert.equal((await db.query('select * from public.video_favoritos')).rows.length, 0);
    await como(1, 0);
    await guardar(id, 'Movilidad', true, [uid(4)]);
    assert.ok((await db.query('select publicado_en from public.video_destinatarios where video_id=$1 and cliente_id=$2', [id, uid(4)])).rows[0].publicado_en);
    await como(0, 3);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 0);
    await como(0, 4);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 1);
    await db.exec('reset role');
    await db.query('delete from public.profesional_cliente where profesional_id=$1 and cliente_id=$2', [uid(1), uid(4)]);
    await como(0, 4);
    assert.equal((await db.query('select * from public.biblioteca_videos')).rows.length, 0);
  } finally { await db.close(); }
});
