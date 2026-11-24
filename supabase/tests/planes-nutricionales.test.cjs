const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

test('Planes nutricionales: permisos, fechas, copias y retirada', async () => {
  const db = new PGlite();
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (pro, cli) => db.exec(`reset role; set role authenticated; select set_config('test.prof','${pro ? uid(pro) : ''}',false); select set_config('test.cli','${cli ? uid(cli) : ''}',false);`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text);
      alter table storage.objects enable row level security;
      create table public.profesionales (id uuid primary key);
      create table public.clientes (id uuid primary key,estado text);
      create function public.profesional_actual_id() returns uuid language sql stable as
        $$ select nullif(current_setting('test.prof',true),'')::uuid $$;
      create function public.cliente_actual_id() returns uuid language sql stable as
        $$ select nullif(current_setting('test.cli',true),'')::uuid $$;
      create function public.es_profesional_salud_de(id uuid) returns boolean language sql stable as
        $$ select id='${uid(3)}' and public.profesional_actual_id() in ('${uid(1)}','${uid(2)}') $$;
      create function public.can_access_client_health(id uuid) returns boolean language sql stable as
        $$ select id=public.cliente_actual_id() or public.es_profesional_salud_de(id) $$;
      create function public.set_actualizado_en() returns trigger language plpgsql as
        $$ begin new.actualizado_en=now(); return new; end $$;
      insert into public.profesionales values ('${uid(1)}'),('${uid(2)}');
      insert into public.clientes values ('${uid(3)}','activo'),('${uid(4)}','activo');
      grant usage on schema public,storage to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261126130000_recetas_planes.sql'), 'utf8'));
    await como(1, 0);
    const receta = (await db.query(`insert into public.recetas (profesional_id,titulo,ingredientes,preparacion,foto_ruta)
      values ($1,'Receta original','Ingredientes','Pasos',$2) returning id`, [uid(1), `${uid(1)}/${uid(9)}.jpg`])).rows[0].id;
    const dias = Array.from({ length: 7 }, (_, i) => ({
      dia: i + 1, kcal: i ? null : 1800, agua_ml: null,
      comidas: i ? [] : [{ tipo: 'comida', texto: 'Con ensalada', receta_id: receta }],
    }));
    const guardar = (id, value) => db.query('select public.guardar_plan_nutricional($1,$2,$3,$4) as id', [id, 'Plan', null, JSON.stringify(value)]);
    const plan = (await guardar(null, dias)).rows[0].id;
    await assert.rejects(db.query('delete from public.recetas where id=$1', [receta]), /foreign key constraint/);
    await assert.rejects(guardar(plan, [...dias.slice(0, 6), dias[0]]), /duplicados/);
    await assert.rejects(guardar(null, dias.map((d, i) => i ? d : { ...d, comidas: [{ tipo:'comida', receta_id:uid(8) }] })), /receta no existe/);
    const asignar = (inicio, fin, cliente = uid(3)) => db.query('select public.asignar_plan_nutricional($1,$2,$3,$4) as id', [plan, cliente, inicio, fin]);
    const asignacion = (await asignar('2090-01-01', '2090-01-31')).rows[0].id;
    await assert.rejects(asignar('2090-01-31', '2090-02-01'), /Ya existe un plan/);
    await assert.rejects(asignar('2090-02-01', '2090-02-28', uid(4)), /clientes activos/);
    await db.query("update public.recetas set titulo='Modificada' where id=$1", [receta]);
    await como(0, 3);
    const copia = (await db.query('select dias from public.clientes_planes_nutricionales where id=$1', [asignacion])).rows[0].dias;
    assert.equal(copia[0].comidas[0].receta.titulo, 'Receta original');
    assert.equal((await db.query('select * from public.recetas')).rows.length, 0);
    assert.equal((await db.query('select public.puede_ver_foto_receta($1) as permitido', [`${uid(1)}/${uid(9)}.jpg`])).rows[0].permitido, true);
    await assert.rejects(db.query('delete from public.clientes_planes_nutricionales where id=$1', [asignacion]), /permission denied/);
    await como(0, 4);
    assert.equal((await db.query('select * from public.clientes_planes_nutricionales')).rows.length, 0);
    assert.equal((await db.query('select public.puede_ver_foto_receta($1) as permitido', [`${uid(1)}/${uid(9)}.jpg`])).rows[0].permitido, false);
    await como(2, 0);
    assert.equal((await db.query('select * from public.planes_nutricionales')).rows.length, 0);
    await assert.rejects(db.query('select public.finalizar_plan_nutricional($1)', [asignacion]), /No puedes/);
    await como(1, 0);
    await db.query('select public.finalizar_plan_nutricional($1)', [asignacion]);
    assert.equal((await db.query('select * from public.clientes_planes_nutricionales')).rows.length, 0);
    await asignar('2090-01-01', '2090-01-31');
    const fechas = (await db.query("select (current_date-7)::text as inicio, (current_date-1)::text as ayer, (current_date+7)::text as fin")).rows[0];
    const historico = (await asignar(fechas.inicio, fechas.fin)).rows[0].id;
    await db.query('select public.finalizar_plan_nutricional($1)', [historico]);
    const finalizado = (await db.query('select inicio::text,fin::text from public.clientes_planes_nutricionales where id=$1', [historico])).rows[0];
    assert.deepEqual(finalizado, { inicio: fechas.inicio, fin: fechas.ayer });
    await db.query("select public.asignar_plan_nutricional($1,$2,current_date,current_date+7)", [plan, uid(3)]);
  } finally { await db.close(); }
});

test('El plan usa el día real y escapa texto y recetas', () => {
  const escape = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);
  const window = { FitNovaNutricion: { escapar: escape, comida: () => ({ texto: 'Comida' }) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'planes-nutricionales.js'), 'utf8'), { window });
  const P = window.FitNovaPlanesNutricionales;
  assert.equal(P.diaFecha('2026-11-24'), 2);
  assert.equal(P.diaFecha('2026-11-29'), 7);
  const html = P.diaHtml({ kcal: 1800, agua_ml: null, comidas: [{ tipo:'comida', texto:'<script>', receta: {
    titulo:'<receta>', descripcion:null, ingredientes:'<img>', preparacion:'Pasos', kcal:null, raciones:null, foto_ruta:null,
  } }] });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img&gt;/);
  assert.doesNotMatch(html, /<script>|<img>/);
});
