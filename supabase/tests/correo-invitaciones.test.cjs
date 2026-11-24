const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const token = 'a'.repeat(64);

test('reservas de correo: permisos, estado, idempotencia y límites', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema extensions; create extension pgcrypto with schema extensions;
      create table public.profesionales (id uuid primary key, auth_user_id uuid);
      create table public.invitaciones (id uuid primary key, profesional_id uuid, email_destino text, token_hash text, estado text, fecha_expiracion timestamptz);
      create table public.equipos (id uuid primary key, responsable_id uuid);
      create table public.equipo_invitaciones (id uuid primary key, equipo_id uuid, email text, token_hash text, estado text, expira_en timestamptz);
      insert into public.profesionales values ('${uid(11)}','${uid(1)}'), ('${uid(12)}','${uid(2)}');
      insert into public.invitaciones values ('${uid(21)}','${uid(11)}','cliente@example.test',encode(extensions.digest('${token}','sha256'),'hex'),'enviada',now()+interval '1 day');
      insert into public.equipos values ('${uid(31)}','${uid(11)}');
      insert into public.equipo_invitaciones values ('${uid(41)}','${uid(31)}','equipo@example.test',encode(extensions.digest('${token}','sha256'),'hex'),'pendiente',now()+interval '1 day');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127130000_correo_invitaciones.sql'), 'utf8'));
    const preparar = (usuario, tipo, id, valor = token) => db.query(
      'select * from public.correo_preparar_invitacion($1,$2,$3,$4)', [usuario, tipo, id, valor]);
    await db.exec('set role authenticated');
    await assert.rejects(preparar(uid(1), 'cliente', uid(21)), /permission denied/);
    await assert.rejects(db.query('select * from public.correo_invitacion_intentos'), /permission denied/);
    await db.exec('reset role; set role service_role');
    await assert.rejects(preparar(uid(2), 'cliente', uid(21)), /sin permiso/);
    await assert.rejects(preparar(uid(1), 'equipo', uid(41), 'b'.repeat(64)), /sin permiso/);
    const cliente = (await preparar(uid(1), 'cliente', uid(21))).rows[0];
    assert.equal(cliente.destinatario, 'cliente@example.test');
    await assert.rejects(preparar(uid(1), 'cliente', uid(21)), /en curso/);
    await db.query('select public.correo_finalizar_intento($1, false, null)', [cliente.intento_id]);
    const reintento = (await preparar(uid(1), 'cliente', uid(21))).rows[0];
    await db.query('select public.correo_finalizar_intento($1, true, $2)', [reintento.intento_id, 'provider-id']);
    assert.equal((await preparar(uid(1), 'cliente', uid(21))).rows[0].ya_aceptado, true);
    const equipo = (await preparar(uid(1), 'equipo', uid(41))).rows[0];
    assert.equal(equipo.destinatario, 'equipo@example.test');
    await db.query('select public.correo_finalizar_intento($1, false, null)', [equipo.intento_id]);
    await db.exec('reset role');
    await db.query("update public.equipo_invitaciones set estado='cancelada' where id=$1", [uid(41)]);
    await db.exec('set role service_role');
    await assert.rejects(preparar(uid(1), 'equipo', uid(41)), /sin permiso/);
    await db.exec('reset role');
    await db.query("update public.equipo_invitaciones set estado='pendiente', expira_en=now()-interval '1 second' where id=$1", [uid(41)]);
    await db.exec('set role service_role');
    await assert.rejects(preparar(uid(1), 'equipo', uid(41)), /sin permiso/);
    await db.exec('reset role');
    await db.query("update public.equipo_invitaciones set expira_en=now()+interval '1 day' where id=$1", [uid(41)]);
    await db.query("insert into public.correo_invitacion_intentos (profesional_id,tipo,invitacion_id,estado) select $1,'equipo',gen_random_uuid(),'error' from generate_series(1,27)", [uid(11)]);
    await db.exec('set role service_role');
    await assert.rejects(preparar(uid(1), 'equipo', uid(41)), /Límite/);
    await db.exec('reset role; delete from public.correo_invitacion_intentos');
    await db.query("insert into public.correo_invitacion_intentos (profesional_id,tipo,invitacion_id,estado,creado_en) select $1,'equipo',gen_random_uuid(),'error',now()-interval '2 hours' from generate_series(1,300)", [uid(12)]);
    await db.exec('set role service_role');
    await assert.rejects(preparar(uid(1), 'equipo', uid(41)), /Límite/);
  } finally { await db.close(); }
});

test('función de correo autentica, construye enlace propio y registra la aceptación', async () => {
  const { crearHandler } = await import('../functions/enviar-invitacion/handler.mjs');
  const calls = [];
  const env = (key) => ({
    SUPABASE_URL: 'https://backend.test', SUPABASE_ANON_KEY: 'public',
    SUPABASE_SERVICE_ROLE_KEY: 'private', RESEND_API_KEY: 'provider-private',
    FITNOVA_EMAIL_FROM: 'FitNova <sender@example.test>',
  })[key];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: uid(1) });
    if (url.endsWith('/correo_preparar_invitacion')) return Response.json([{ intento_id: uid(51), destinatario: 'destino@example.test', ya_aceptado: false }]);
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'mail-id' });
    if (url.endsWith('/correo_finalizar_intento')) return Response.json(null);
    throw new Error('URL inesperada');
  };
  const handler = crearHandler({ env, fetch: fakeFetch, log: { error() {} } });
  const request = (body, authorization = 'Bearer user-token') => new Request('https://edge.test', {
    method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const tipo of ['cliente', 'equipo']) {
    calls.length = 0;
    const response = await handler(request({ tipo, invitacion_id: uid(21), token, url: 'https://attacker.test' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).estado, 'aceptado');
    const envio = calls.find((call) => call.url === 'https://api.resend.com/emails');
    const mensaje = JSON.parse(envio.opts.body);
    assert.deepEqual(mensaje.to, ['destino@example.test']);
    assert.match(mensaje.text, /https:\/\/alinaresblanco-gif\.github\.io\/FitNova\//);
    assert.doesNotMatch(mensaje.text, /attacker\.test/);
    assert.equal(envio.opts.headers['Idempotency-Key'], `fitnova-invitacion/${tipo}/${uid(21)}`);
    const final = JSON.parse(calls.find((call) => call.url.endsWith('/correo_finalizar_intento')).opts.body);
    assert.equal(final.p_aceptado, true);
    assert.equal(final.p_proveedor_id, 'mail-id');
  }
  calls.length = 0;
  assert.equal((await handler(request({ tipo: 'cliente', invitacion_id: uid(21), token }, ''))).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await handler(request({ tipo: 'cliente', invitacion_id: uid(21), token: 'bad' }))).status, 400);
});

test('función de correo registra fallos y no envía si no hay permiso o configuración', async () => {
  const { crearHandler } = await import('../functions/enviar-invitacion/handler.mjs');
  const env = () => 'configured';
  const body = { tipo: 'cliente', invitacion_id: uid(21), token };
  const request = () => new Request('https://edge.test', { method: 'POST',
    headers: { authorization: 'Bearer user', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: uid(1) });
    if (url.endsWith('/correo_preparar_invitacion')) return Response.json([{ intento_id: uid(51), destinatario: 'destino@example.test' }]);
    if (url === 'https://api.resend.com/emails') return new Response('', { status: 500 });
    return Response.json(null);
  };
  const handler = crearHandler({ env, fetch, log: { error() {} } });
  assert.equal((await handler(request())).status, 502);
  assert.equal(JSON.parse(calls.at(-1).opts.body).p_aceptado, false);
  const sinConfig = crearHandler({ env: () => undefined, fetch, log: { error() {} } });
  calls.length = 0;
  assert.equal((await sinConfig(request())).status, 503);
  assert.equal(calls.length, 0);
  const sinPermiso = crearHandler({ env, log: { error() {} }, fetch: async (url) =>
    url.endsWith('/auth/v1/user') ? Response.json({ id: uid(2) }) : new Response('', { status: 403 }) });
  assert.equal((await sinPermiso(request())).status, 403);
});

test('la interfaz conserva el enlace y permite reintentar un envío no confirmado', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'fitnova-manager', 'js', 'correo-invitacion.js'), 'utf8');
  let fallo = true, llamadas = 0;
  const context = { console: { error() {} }, supabaseClient: { functions: { invoke: async () => {
    llamadas++;
    return fallo ? { error: new Error('fallo') } : { data: { estado: 'aceptado' }, error: null };
  } } } };
  vm.runInNewContext(source, context);
  const estado = {}, boton = {};
  await context.enviarCorreoInvitacion('cliente', { invitacion_id: uid(21), token }, estado, boton);
  assert.equal(boton.hidden, false);
  assert.match(estado.textContent, /manualmente/);
  fallo = false;
  await boton.onclick();
  assert.equal(llamadas, 2);
  assert.equal(boton.hidden, true);
  assert.match(estado.textContent, /aceptado/);
});

test('una respuesta anterior no modifica el estado de otra invitación', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'fitnova-manager', 'js', 'correo-invitacion.js'), 'utf8');
  let terminarPrimera;
  const context = { console: { error() {} }, supabaseClient: { functions: { invoke: (_, { body }) =>
    body.invitacion_id === uid(21)
      ? new Promise((resolve) => { terminarPrimera = resolve; })
      : Promise.resolve({ data: { estado: 'aceptado' }, error: null }),
  } } };
  vm.runInNewContext(source, context);
  const estado = {}, boton = {};
  const primera = context.enviarCorreoInvitacion('cliente', { invitacion_id: uid(21), token }, estado, boton);
  await context.enviarCorreoInvitacion('cliente', { invitacion_id: uid(22), token }, estado, boton);
  terminarPrimera({ error: new Error('fallo') });
  await primera;
  assert.match(estado.textContent, /aceptado/);
  assert.equal(boton.hidden, true);
});
