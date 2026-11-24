const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'js', 'recuperacion.js'), 'utf8');

function cargar(hash = '', app = 'go', invitacion = false) {
  const elementos = {};
  for (const id of ['recuperacion-estado', 'recuperacion-formulario', 'recuperacion-guardar',
    'recuperacion-clave', 'recuperacion-confirmacion', 'recuperacion-acceso']) {
    elementos[id] = { textContent: '', hidden: id === 'recuperacion-formulario', value: '', disabled: false };
  }
  elementos['recuperacion-formulario'].addEventListener = (_, callback) => {
    elementos.enviar = () => callback({ preventDefault() {} });
  };
  const location = { href: `https://example.test/${app}/recuperar.html${hash}`, hash, pathname: `/${app}/recuperar.html`, search: '' };
  const history = { state: null, replaceState: (_, __, url) => { history.url = url; } };
  const context = {
    URL, URLSearchParams, console: { error() {} },
    window: { location }, history,
    document: { body: { dataset: { app } }, getElementById: (id) => elementos[id] },
    sessionStorage: { getItem: () => invitacion ? 'token' : null },
  };
  vm.runInNewContext(script, context);
  return { api: context.window.FitNovaRecuperacion, elementos, location, history };
}

const valido = '#access_token=token&refresh_token=refresh&type=recovery';

test('solicita recuperación con retorno propio y comunica errores', async () => {
  const { api } = cargar();
  const email = { value: ' cliente@example.com ', validity: { valid: true } };
  const error = { textContent: '' }, info = { textContent: '' }, boton = { disabled: false };
  let llamada;
  const cliente = { auth: { resetPasswordForEmail: async (valor, opciones) => {
    llamada = { valor, redirectTo: opciones.redirectTo };
    return { error: null };
  } } };
  await api.solicitar(cliente, { email, error, info, boton });
  assert.deepEqual(llamada, { valor: 'cliente@example.com', redirectTo: 'https://example.test/go/recuperar.html' });
  assert.match(info.textContent, /Si existe una cuenta/);
  assert.equal(boton.disabled, false);

  cliente.auth.resetPasswordForEmail = async () => ({ error: { message: 'rate limit' } });
  await api.solicitar(cliente, { email, error, info, boton });
  assert.match(error.textContent, /No se pudo solicitar/);
  assert.equal(info.textContent, '');
  email.validity.valid = false;
  await api.solicitar(cliente, { email, error, info, boton });
  assert.match(error.textContent, /email válido/);
});

test('exige un enlace de recuperación incluso si se proporciona una sesión ordinaria', async () => {
  for (const hash of ['', '#type=signup&access_token=token&refresh_token=refresh', '#error=access_denied']) {
    const { api, elementos, history } = cargar(hash);
    await api.iniciar({ auth: { getSession: async () => ({ data: { session: {} }, error: null }) } });
    assert.equal(elementos['recuperacion-formulario'].hidden, true);
    assert.match(elementos['recuperacion-estado'].textContent, /no es válido/);
    assert.equal(history.url, '/go/recuperar.html');
  }
});

test('rechaza enlaces caducados y permite solicitar otro', async () => {
  const { api, elementos } = cargar(valido);
  await api.iniciar({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } });
  assert.equal(elementos['recuperacion-formulario'].hidden, true);
  assert.match(elementos['recuperacion-estado'].textContent, /caducado/);
});

test('cambia la contraseña solo cuando coincide y conserva el retorno a invitación', async () => {
  const { api, elementos } = cargar(valido, 'manager', true);
  let guardada;
  const cliente = { auth: {
    getSession: async () => ({ data: { session: {} }, error: null }),
    updateUser: async ({ password }) => { guardada = password; return { error: null }; },
  } };
  await api.iniciar(cliente);
  assert.equal(elementos['recuperacion-formulario'].hidden, false);
  assert.equal(elementos['recuperacion-acceso'].href, 'login.html?equipo=1');
  elementos['recuperacion-clave'].value = '12345678';
  elementos['recuperacion-confirmacion'].value = 'diferente';
  await elementos.enviar();
  assert.equal(guardada, undefined);
  assert.match(elementos['recuperacion-estado'].textContent, /no coinciden/);
  elementos['recuperacion-confirmacion'].value = '12345678';
  await elementos.enviar();
  assert.equal(guardada, '12345678');
  assert.equal(elementos['recuperacion-formulario'].hidden, true);
  assert.equal(elementos['recuperacion-clave'].value, '');
  assert.match(elementos['recuperacion-estado'].textContent, /actualizada/);
});

test('muestra errores al guardar sin aparentar éxito', async () => {
  const { api, elementos } = cargar(valido);
  await api.iniciar({ auth: {
    getSession: async () => ({ data: { session: {} }, error: null }),
    updateUser: async () => ({ error: { message: 'expired' } }),
  } });
  elementos['recuperacion-clave'].value = elementos['recuperacion-confirmacion'].value = '12345678';
  await elementos.enviar();
  assert.match(elementos['recuperacion-estado'].textContent, /No se pudo cambiar/);
  assert.equal(elementos['recuperacion-formulario'].hidden, false);
  assert.equal(elementos['recuperacion-guardar'].disabled, false);
});

test('ambas apps aíslan el cliente de recuperación de las sesiones normales', () => {
  for (const app of ['mockup-fitnova-go', 'fitnova-manager']) {
    const source = fs.readFileSync(path.join(root, app, 'js', 'supabase-client.js'), 'utf8');
    let options;
    const context = {
      document: { body: { dataset: { view: 'recuperacion' } }, addEventListener() {} },
      window: { location: { href: 'https://example.test/' }, supabase: { createClient: (_, __, opts) => { options = opts; return {}; } } },
      URL,
    };
    vm.runInNewContext(source, context);
    assert.equal(options.auth.persistSession, false);
    assert.equal(options.auth.autoRefreshToken, false);
    assert.match(options.auth.storageKey, /recuperacion$/);
  }
});
