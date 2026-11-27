const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

test('Agenda: permisos, persistencia, estados y solapamientos en PostgreSQL', async (t) => {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  async function como(usuario, rol = 'authenticated') {
    await db.exec(`reset role; set role ${rol}; select set_config('request.jwt.claim.sub', '${uid(usuario)}', false);`);
  }
  async function guardar(cliente, inicio, fin, sesion = null) {
    const { rows } = await db.query('select public.guardar_sesion($1, $2, $3, $4, $5, $6, $7) as id',
      [uid(cliente), 'Revisión de prueba', 'seguimiento', inicio, fin, 'Sala de prueba', sesion]);
    return rows[0].id;
  }
  async function estado(id, nuevo) {
    return db.query('select public.cambiar_estado_sesion($1, $2)', [id, nuevo]);
  }
  async function eliminar(id) {
    return db.query('select public.eliminar_sesion($1)', [id]);
  }
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema extensions;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
      create table storage.objects (bucket_id text, name text, metadata jsonb);
      alter table storage.objects enable row level security;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant usage on schema storage to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
      grant execute on function auth.uid() to authenticated, anon;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant execute on functions to anon;
    `);
    const migraciones = path.join(__dirname, '..', 'migrations');
    for (const archivo of fs.readdirSync(migraciones).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migraciones, archivo), 'utf8'));
    }
    await db.exec(`
      insert into auth.users values
        ('${uid(1)}','profesional1@example.com'),('${uid(2)}','profesional2@example.com'),
        ('${uid(3)}','cliente1@example.com'),('${uid(4)}','cliente2@example.com'),
        ('${uid(5)}','cliente3@example.com');
      insert into public.profesionales (id,auth_user_id,nombre,email,rol) values
        ('${uid(11)}','${uid(1)}','Profesional 1','profesional1@example.com','entrenador'),
        ('${uid(12)}','${uid(2)}','Profesional 2','profesional2@example.com','entrenador');
      insert into public.clientes (id,auth_user_id,nombre,email,estado) values
        ('${uid(21)}','${uid(3)}','Cliente 1','cliente1@example.com','activo'),
        ('${uid(22)}','${uid(4)}','Cliente 2','cliente2@example.com','activo'),
        ('${uid(23)}','${uid(5)}','Cliente 3','cliente3@example.com','lead');
      insert into public.profesional_cliente (cliente_id,profesional_id,rol) values
        ('${uid(21)}','${uid(11)}','entrenador'),('${uid(22)}','${uid(11)}','entrenador'),
        ('${uid(21)}','${uid(12)}','entrenador'),('${uid(23)}','${uid(11)}','entrenador');
    `);
    let sesion;
    await t.test('crea una sesión y el cliente ve los mismos datos desde otra sesión autenticada', async () => {
      await como(1);
      sesion = await guardar(21, '2030-01-10T09:00:00+01:00', '2030-01-10T10:00:00+01:00');
      await como(3);
      const { rows } = await db.query('select id, estado, inicio, lugar from public.sesiones');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, sesion);
      assert.equal(rows[0].estado, 'programada');
      assert.equal(rows[0].inicio.toISOString(), '2030-01-10T08:00:00.000Z');
      assert.equal(rows[0].lugar, 'Sala de prueba');
    });
    await t.test('cliente ajeno y otro profesional no ven ni cambian la sesión', async () => {
      for (const usuario of [4, 2]) {
        await como(usuario);
        assert.equal((await db.query('select id from public.sesiones')).rows.length, 0);
        await assert.rejects(estado(sesion, 'cancelada'), /No autorizado|no disponible/);
        await assert.rejects(guardar(21, '2030-01-10T11:00Z', '2030-01-10T12:00Z', sesion),
          usuario === 2 ? /no disponible/ : /No autorizado/);
      }
    });
    await t.test('cliente y anónimo no pueden escribir ni saltarse las RPC', async () => {
      await como(3);
      await assert.rejects(guardar(21, '2030-01-10T11:00Z', '2030-01-10T12:00Z'), /No autorizado/);
      await assert.rejects(db.query('update public.sesiones set estado = $1 where id = $2', ['cancelada', sesion]), /permission denied/);
      await assert.rejects(db.query('delete from public.sesiones where id = $1', [sesion]), /permission denied/);
      await como(3, 'anon');
      await assert.rejects(db.query('select * from public.sesiones'), /permission denied/);
      await assert.rejects(estado(sesion, 'cancelada'), /permission denied/);
    });
    await t.test('rechaza duración inválida, clientes no activos y clientes ajenos', async () => {
      await como(1);
      await assert.rejects(guardar(21, '2030-01-10T09:00Z', '2030-01-10T09:00Z'), /Revisa/);
      await assert.rejects(guardar(21, 'infinity', 'infinity'), /Revisa/);
      await assert.rejects(guardar(23, '2030-01-10T12:00Z', '2030-01-10T13:00Z'), /cliente activo/);
      await como(2);
      await assert.rejects(guardar(22, '2030-01-10T12:00Z', '2030-01-10T13:00Z'), /cliente activo/);
    });
    await t.test('impide solapamientos del profesional y del cliente, permite intervalos contiguos', async () => {
      await como(1);
      await assert.rejects(guardar(22, '2030-01-10T08:30Z', '2030-01-10T09:30Z'), (error) => error.code === '23P01');
      await como(2);
      await assert.rejects(guardar(21, '2030-01-10T08:30Z', '2030-01-10T09:30Z'), (error) => error.code === '23P01');
      await como(1);
      await guardar(22, '2030-01-10T09:00Z', '2030-01-10T10:00Z');
    });
    await t.test('edita horario sin duplicar y Go lee el cambio', async () => {
      await como(1);
      await guardar(21, '2030-01-10T11:00Z', '2030-01-10T12:00Z', sesion);
      await como(3);
      const { rows } = await db.query('select id, inicio from public.sesiones');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].inicio.toISOString(), '2030-01-10T11:00:00.000Z');
    });
    await t.test('cancelación conserva el historial y libera el horario', async () => {
      await como(1);
      await estado(sesion, 'cancelada');
      await guardar(21, '2030-01-10T11:00Z', '2030-01-10T12:00Z');
      await como(3);
      assert.equal((await db.query('select estado from public.sesiones where id = $1', [sesion])).rows[0].estado, 'cancelada');
    });
    await t.test('completa solo citas terminadas y no permite reabrir estados finales', async () => {
      await como(1);
      const pasada = await guardar(21, '2020-01-10T11:00Z', '2020-01-10T12:00Z');
      await estado(pasada, 'completada');
      const futura = await guardar(21, '2030-01-12T11:00Z', '2030-01-12T12:00Z');
      await assert.rejects(estado(futura, 'completada'), /ya ha terminado/);
      await assert.rejects(estado(pasada, 'cancelada'), /no disponible/);
      await assert.rejects(guardar(21, '2030-01-13T11:00Z', '2030-01-13T12:00Z', pasada), /no disponible/);
    });
    await t.test('el profesional elimina sus sesiones en cualquier estado y Go recibe aviso', async () => {
      await como(1);
      const programada = await guardar(21, '2030-02-01T11:00Z', '2030-02-01T12:00Z');
      const cancelada = await guardar(21, '2030-02-02T11:00Z', '2030-02-02T12:00Z');
      const completada = await guardar(21, '2020-02-03T11:00Z', '2020-02-03T12:00Z');
      await estado(cancelada, 'cancelada');
      await estado(completada, 'completada');
      for (const id of [programada, cancelada, completada]) await eliminar(id);
      await assert.rejects(eliminar(programada), /no disponible/);
      await como(3);
      assert.equal((await db.query('select id from public.sesiones where id = any($1::uuid[])', [[programada, cancelada, completada]])).rows.length, 0);
      const avisos = await db.query("select titulo,referencia_id from public.notificaciones where tipo='agenda' and titulo='Se ha eliminado una cita de tu agenda.'");
      assert.equal(avisos.rows.length, 3);
      assert.ok(avisos.rows.every((aviso) => aviso.referencia_id === null));
      await como(1);
      await guardar(21, '2030-02-01T11:00Z', '2030-02-01T12:00Z');
    });
    await t.test('solo el profesional propietario con asignación puede eliminar', async () => {
      await como(1);
      const id = await guardar(21, '2030-02-04T11:00Z', '2030-02-04T12:00Z');
      await assert.rejects(db.query('delete from public.sesiones where id=$1', [id]), /permission denied/);
      await como(2);
      await assert.rejects(eliminar(id), /no disponible/);
      await como(3);
      await assert.rejects(eliminar(id), /No autorizado/);
      await como(3, 'anon');
      await assert.rejects(eliminar(id), /permission denied/);
      await db.exec('reset role');
      await db.query('delete from public.profesional_cliente where profesional_id=$1 and cliente_id=$2', [uid(11), uid(21)]);
      await como(1);
      await assert.rejects(eliminar(id), /no disponible/);
      await db.exec('reset role');
      assert.equal((await db.query('select id from public.sesiones where id=$1', [id])).rows.length, 1);
    });
  } finally { await db.close(); }
});

test('Agenda: conversión de horario, cambios de hora y medianoche', () => {
  process.env.TZ = 'Europe/Madrid';
  const contexto = { window: {}, Date, Number, String, Error };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'sesiones.js'), 'utf8'), contexto);
  const ui = contexto.window.FitNovaSesiones;
  const horario = ui.intervalo('2026-11-23', '09:00', '60');
  assert.equal(horario.inicio, '2026-11-23T08:00:00.000Z');
  assert.equal(horario.fin, '2026-11-23T09:00:00.000Z');
  assert.throws(() => ui.intervalo('2027-03-28', '02:30', '60'), /cambios de hora/);
  assert.throws(() => ui.intervalo('2027-02-30', '09:00', '60'), /fecha y hora/);
  assert.throws(() => ui.intervalo('2026-11-23', '09:00', '0'), /duración positiva/);
  assert.throws(() => ui.intervalo('2026-11-23', '09:00', '1.5'), /duración positiva/);
  const noche = { inicio: '2026-11-23T22:00Z', fin: '2026-11-23T23:00Z' };
  assert.equal(ui.enDia(noche, '2026-11-23'), true);
  assert.equal(ui.enDia(noche, '2026-11-24'), false);
});

test('Agenda ofrece eliminación con confirmación y comunica errores o refrescos fallidos', async () => {
  const elementos = new Map();
  const elemento = (id) => {
    if (!elementos.has(id)) elementos.set(id, { textContent: '' });
    return elementos.get(id);
  };
  const llamadas = [];
  let confirmar = false, falloRpc = false, falloRecarga = false;
  const contexto = vm.createContext({
    window: {}, Date, Number, String, Error,
    document: { addEventListener() {}, getElementById: elemento },
    confirm: () => confirmar,
    supabaseClient: { rpc: async (nombre, parametros) => {
      llamadas.push({ nombre, parametros });
      return { error: falloRpc ? { message: 'Error de prueba' } : null };
    } },
    recargar: async () => { if (falloRecarga) throw new Error('Error al recargar'); },
  });
  const raiz = path.join(__dirname, '..', '..');
  for (const archivo of ['js/sesiones.js', 'fitnova-manager/js/agenda.js']) {
    vm.runInContext(fs.readFileSync(path.join(raiz, ...archivo.split('/')), 'utf8'), contexto);
  }
  vm.runInContext('cargarAgendaManager = recargar', contexto);
  const tarjeta = vm.runInContext('tarjetaSesion', contexto);
  const accion = vm.runInContext('accionSesion', contexto);
  const sesion = { id: 's1', titulo: 'Cita', tipo: 'seguimiento', inicio: '2020-01-01T10:00:00Z', fin: '2020-01-01T11:00:00Z' };
  for (const estado of ['programada', 'cancelada', 'completada']) {
    assert.match(tarjeta({ ...sesion, estado }), /Eliminar sesión/);
  }
  const boton = { dataset: { sesion: 's1', accion: 'eliminar' }, disabled: false };
  const evento = { target: { closest: () => boton } };
  await accion(evento);
  assert.equal(llamadas.length, 0);
  confirmar = true;
  falloRpc = true;
  await accion(evento);
  assert.equal(llamadas[0].nombre, 'eliminar_sesion');
  assert.equal(llamadas[0].parametros.p_sesion_id, 's1');
  assert.match(elemento('agenda-error').textContent, /Error de prueba/);
  assert.equal(elemento('agenda-info').textContent, '');
  falloRpc = false;
  falloRecarga = true;
  await accion(evento);
  assert.match(elemento('agenda-error').textContent, /Sesión eliminada, pero no se pudo actualizar/);
  assert.match(elemento('agenda-info').textContent, /Sesión eliminada/);
  assert.equal(boton.disabled, false);
});
