const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Archivos privados: acceso, tipo, retirada y conservación tras desvinculación', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  const ruta = `${uid(21)}/${uid(1)}/${uid(31)}`;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid
      $$;
      create table public.clientes (id uuid primary key, estado text);
      create table public.autorizados (cliente_id uuid, usuario uuid);
      create function public.can_access_client_health(c uuid) returns boolean language sql stable security definer as $$
        select exists (select 1 from public.autorizados where cliente_id=c and usuario=auth.uid())
      $$;
      create function public.cliente_actual_id() returns uuid language sql stable security definer as $$
        select case when auth.uid()='${uid(2)}' then '${uid(21)}'::uuid end
      $$;
      create function public.cliente_de_ruta_foto(r text) returns uuid language sql immutable as $$
        select case when split_part(r,'/',1) ~ '^[0-9a-f-]{36}$' then split_part(r,'/',1)::uuid end
      $$;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;
      grant select on public.clientes to authenticated;
      insert into auth.users values ('${uid(1)}'),('${uid(2)}'),('${uid(3)}'),('${uid(4)}');
      insert into public.clientes values ('${uid(21)}','activo');
      insert into public.autorizados values ('${uid(21)}','${uid(1)}'), ('${uid(21)}','${uid(2)}'), ('${uid(21)}','${uid(4)}');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127110000_archivos_seguimiento.sql'), 'utf8'));
    await como(1);
    await db.query("insert into storage.objects values ('seguimiento-archivos',$1,$2::jsonb)", [ruta, JSON.stringify({ mimetype:'application/pdf',size:128 })]);
    await como(2);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await como(1);
    await assert.rejects(db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),ruta,'a.pdf','image/png']), /extensión/);
    await assert.rejects(db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),ruta,'a.png','image/png']), /no está disponible/);
    const id = (await db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4) as id', [uid(21),ruta,'a.pdf','application/pdf'])).rows[0].id;
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [ruta])).rows.length, 0);
    await como(2);
    assert.equal((await db.query('select id from public.clientes_archivos')).rows.length, 1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 1);
    await como(4);
    await assert.rejects(db.query('select public.quitar_archivo_seguimiento($1)', [id]), /sin permiso/);
    await como(3);
    assert.equal((await db.query('select id from public.clientes_archivos')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await db.exec(`reset role; delete from public.autorizados where usuario='${uid(1)}'`);
    await como(1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [ruta])).rows.length, 0);
    await db.exec(`reset role; insert into public.autorizados values ('${uid(21)}','${uid(1)}')`);
    await como(2);
    assert.equal((await db.query('select public.quitar_archivo_seguimiento($1) as ruta', [id])).rows[0].ruta, ruta);
    await assert.rejects(db.query('select public.finalizar_limpieza_archivo($1)', [ruta]), /todavía existe/);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name', [ruta])).rows.length, 1);
    await db.query('select public.finalizar_limpieza_archivo($1)', [ruta]);
    await db.exec('reset role');
    assert.equal((await db.query('select ruta from public.archivos_limpieza')).rows.length, 0);
    await como(1);
    const word = `${uid(21)}/${uid(1)}/${uid(32)}`;
    const wordTipo = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    await db.query("insert into storage.objects values ('seguimiento-archivos',$1,$2::jsonb)", [word, JSON.stringify({mimetype:wordTipo,size:20971520})]);
    await db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),word,'informe.docx',wordTipo]);
    const grande = `${uid(21)}/${uid(1)}/${uid(33)}`;
    await db.query("insert into storage.objects values ('seguimiento-archivos',$1,$2::jsonb)", [grande, JSON.stringify({mimetype:'application/pdf',size:20971521})]);
    await assert.rejects(db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),grande,'grande.pdf','application/pdf']), /20 MB/);
    await assert.rejects(db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),grande,'video.mp4','video/mp4']), /tipo de archivo/);
  } finally { await db.close(); }
});
