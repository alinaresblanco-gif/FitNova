const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const leer = (...partes) => fs.readFileSync(path.join(root, ...partes), 'utf8');

function cargarInvitacion(sesionInicial = null) {
  const elementos = {};
  const elementosPorId = (id) => elementos[id] ||= {
    value: '', checked: false, textContent: '', disabled: false, hidden: false, style: {},
  };
  let sesion = sesionInicial;
  let creado = 0, accesos = 0, completado;
  const grupos = { 'v2-genero': 'no_especificado', 'v3-objetivo': 'ponerme_en_forma' };
  const auth = {
    getSession: async () => ({ data: { session: sesion }, error: null }),
    signUp: async ({ email }) => { creado++; sesion = { user: { email } }; return { data: { session: sesion } }; },
    signInWithPassword: async ({ email }) => { accesos++; sesion = { user: { email } }; return { data: { session: sesion } }; },
    signOut: async () => { sesion = null; return { error: null }; },
  };
  const supabaseClient = { auth, rpc: async (nombre, datos) => {
    if (nombre === 'obtener_invitacion') return { data: [{ nombre: 'Cliente', email: 'cliente@example.test' }], error: null };
    completado = datos;
    return { error: null };
  } };
  let iniciar;
  const context = {
    supabaseClient, URLSearchParams, location: { search: '?token=prueba' },
    window: { location: {} }, console: { error() {} }, setTimeout() {}, confirm: () => true,
    document: {
      getElementById: elementosPorId,
      querySelector: (selector) => {
        const valor = grupos[selector.split(' ')[0].slice(1)];
        return valor === undefined ? null : { dataset: { value: valor } };
      },
      querySelectorAll: () => Array.from({ length: 9 }, (_, i) => elementosPorId(`ventana-${i + 1}`)),
      addEventListener: (_, fn) => { iniciar = fn; },
    },
  };
  vm.runInNewContext(leer('mockup-fitnova-go', 'js', 'invitacion.js'), context);
  return { context, elementos: elementosPorId, grupos, iniciar, auth,
    setSesion: (valor) => { sesion = valor; },
    datos: () => ({ creado, accesos, completado }) };
}

function rellenarAlta(caso) {
  caso.elementos('v1-apellidos').value = 'Prueba';
  caso.elementos('v1-terminos').checked = true;
  caso.elementos('v1-privacidad').checked = true;
  caso.elementos('v1-salud').checked = true;
  caso.elementos('v1-password').value = 'clave-segura';
  caso.elementos('v4-nacimiento').value = '1990-01-01';
  caso.elementos('v5-peso').value = '70.5';
  caso.elementos('v6-altura').value = '170';
  for (let n = 1; n <= 7; n++) caso.grupos[`parq-${n}`] = n === 1 ? 'true' : 'false';
}

test('alta reanudada reutiliza la sesión o accede a la cuenta sin otro registro', async () => {
  for (const inicial of [null, { user: { email: 'CLIENTE@example.test' } }]) {
    const caso = cargarInvitacion(inicial);
    await caso.iniciar();
    rellenarAlta(caso);
    if (!inicial) caso.context.cambiarModoCuenta();
    if (!inicial) caso.elementos('v1-password').value = 'clave-segura';
    await caso.context.pasoCrearCuenta();
    assert.equal(caso.datos().creado, 0);
    assert.equal(caso.datos().accesos, inicial ? 0 : 1);
    assert.equal(caso.elementos('v1-password').value, '');
    assert.equal(caso.elementos('ventana-2').style.display, 'block');
    await caso.context.finalizarOnboarding();
    assert.equal(caso.datos().completado.p_parq.enfermedad_cardiaca_supervisada, true);
    assert.equal(caso.datos().completado.p_parq.dolor_pecho_actividad, false);
    assert.equal(caso.datos().completado.p_version_terminos, 'borrador-20261124');
    assert.equal(caso.datos().completado.p_version_privacidad, 'borrador-20261124');
    assert.equal(caso.datos().completado.p_acepta_salud, true);
  }
});

test('cada casilla se exige antes de crear la cuenta y al finalizar', async () => {
  for (const id of ['v1-terminos', 'v1-privacidad', 'v1-salud']) {
    const caso = cargarInvitacion({ user: { email: 'cliente@example.test' } });
    await caso.iniciar();
    rellenarAlta(caso);
    caso.elementos(id).checked = false;
    await caso.context.pasoCrearCuenta();
    assert.match(caso.elementos('v1-error').textContent, /tres casillas/);
    assert.equal(caso.elementos('ventana-2').style.display, 'none');
    caso.elementos(id).checked = true;
    await caso.context.pasoCrearCuenta();
    caso.elementos(id).checked = false;
    await caso.context.finalizarOnboarding();
    assert.match(caso.elementos('v1-error').textContent, /tres casillas/);
    assert.equal(caso.datos().completado, undefined);
  }
});

test('otra sesión queda bloqueada y no se sustituye sin cerrar sesión', async () => {
  const caso = cargarInvitacion({ user: { email: 'otra@example.test' } });
  await caso.iniciar();
  rellenarAlta(caso);
  await caso.context.pasoCrearCuenta();
  assert.equal(caso.elementos('v1-continuar').disabled, true);
  assert.equal(caso.datos().creado, 0);
  assert.equal(caso.datos().accesos, 0);
  await caso.context.cerrarSesionInvitacion();
  assert.equal(caso.elementos('v1-continuar').disabled, false);
});

test('el alta nueva crea una cuenta y comunica un fallo de conexión al acceder', async () => {
  const nuevo = cargarInvitacion();
  await nuevo.iniciar();
  rellenarAlta(nuevo);
  await nuevo.context.pasoCrearCuenta();
  assert.equal(nuevo.datos().creado, 1);
  const existente = cargarInvitacion();
  await existente.iniciar();
  rellenarAlta(existente);
  existente.context.cambiarModoCuenta();
  existente.elementos('v1-password').value = 'clave-segura';
  existente.auth.signInWithPassword = async () => ({ error: { message: 'fallo de red' } });
  await existente.context.pasoCrearCuenta();
  assert.match(existente.elementos('v1-error').textContent, /fallo de red/);
});

test('no finaliza con PAR-Q incompleto, dato inválido, consentimiento retirado o sesión caducada', async () => {
  const caso = cargarInvitacion({ user: { email: 'cliente@example.test' } });
  await caso.iniciar();
  rellenarAlta(caso);
  await caso.context.pasoCrearCuenta();
  delete caso.grupos['parq-3'];
  await caso.context.finalizarOnboarding();
  assert.match(caso.elementos('v8-error').textContent, /Responde/);
  caso.grupos['parq-3'] = 'false';
  caso.elementos('v5-peso').value = '0.001';
  await caso.context.finalizarOnboarding();
  assert.match(caso.elementos('v5-error').textContent, /válido/);
  caso.elementos('v5-peso').value = '70';
  caso.elementos('v1-terminos').checked = false;
  await caso.context.finalizarOnboarding();
  assert.match(caso.elementos('v1-error').textContent, /tres casillas/);
  caso.elementos('v1-terminos').checked = true;
  caso.setSesion(null);
  await caso.context.finalizarOnboarding();
  assert.match(caso.elementos('v9-error').textContent, /caducado/);
  assert.equal(caso.datos().completado, undefined);
});

test('acceso distingue una cuenta sin ficha de un fallo al consultar el perfil', async () => {
  const html = leer('mockup-fitnova-go', 'login.html');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { value: '', textContent: '', hidden: false };
  let respuesta = { data: null, error: null };
  const session = { user: { id: 'auth' } };
  const context = {
    document: { getElementById: elemento, addEventListener() {} },
    window: { location: { href: '' } },
    supabaseClient: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => respuesta }) }) }) },
  };
  vm.runInNewContext(script, context);
  await context.continuarConSesion(session);
  assert.match(elemento('login-info').textContent, /invitación/);
  assert.equal(context.window.location.href, '');
  elemento('login-info').textContent = '';
  respuesta = { data: null, error: { message: 'red' } };
  await context.continuarConSesion(session);
  assert.match(elemento('login-error').textContent, /red/);
  assert.equal(elemento('login-info').textContent, '');
  respuesta = { data: { id: 'cliente' }, error: null };
  await context.continuarConSesion(session);
  assert.equal(context.window.location.href, 'index.html');
});

function cargarFoto() {
  const elementos = {};
  for (const id of ['foto-perfil-elegir', 'foto-perfil-archivo', 'foto-perfil-borrar', 'foto-perfil-mensaje']) {
    elementos[id] = { disabled: false, textContent: '', files: [], addEventListener(evento, fn) { this[evento] = fn; } };
  }
  const cliente = { id: 'cliente', foto_url: null };
  const estado = { errorSubida: null, errorDatos: null, errorBorrar: null, ruta: null };
  const bucket = {
    upload: async (ruta) => { if (!estado.errorSubida) estado.ruta = ruta; return { error: estado.errorSubida }; },
    remove: async () => { if (!estado.errorBorrar) estado.ruta = null; return { error: estado.errorBorrar }; },
  };
  const supabaseClient = {
    storage: { from: () => bucket },
    from: () => ({ update: (cambio) => ({ eq: () => ({ select: () => ({ maybeSingle: async () => {
      if (estado.errorDatos) return { error: estado.errorDatos, data: null };
      return { data: cambio, error: null };
    } }) }) }) }),
  };
  let iniciar;
  const context = {
    document: { getElementById: (id) => elementos[id], addEventListener: (_, fn) => { iniciar = fn; } },
    supabaseClient, cargarClienteActual: async () => cliente, mostrarFotoClienteGo: async () => {},
    FitNovaFotos: { comprimir: async () => ({ size: 100 }) }, confirm: () => true, console: { error() {} },
  };
  vm.runInNewContext(leer('mockup-fitnova-go', 'js', 'foto-perfil.js'), context);
  iniciar();
  elementos['foto-perfil-archivo'].files = [{ name: 'foto.jpg' }];
  return { elementos, cliente, estado };
}

test('foto privada se sube, reemplaza y elimina en la ruta fija del cliente', async () => {
  const { elementos, cliente, estado } = cargarFoto();
  await elementos['foto-perfil-archivo'].change();
  assert.equal(cliente.foto_url, 'cliente/perfil/avatar.jpg');
  await elementos['foto-perfil-archivo'].change();
  assert.equal(estado.ruta, cliente.foto_url);
  await elementos['foto-perfil-borrar'].click();
  assert.equal(estado.ruta, null);
  assert.equal(cliente.foto_url, null);
  assert.match(elementos['foto-perfil-mensaje'].textContent, /eliminada/);
});

test('foto informa fallos parciales y permite reintentar la eliminación', async () => {
  const { elementos, cliente, estado } = cargarFoto();
  estado.errorDatos = { message: 'red' };
  await elementos['foto-perfil-archivo'].change();
  assert.match(elementos['foto-perfil-mensaje'].textContent, /imagen se subió/);
  assert.equal(estado.ruta, 'cliente/perfil/avatar.jpg');
  estado.errorDatos = null;
  await elementos['foto-perfil-borrar'].click();
  assert.equal(estado.ruta, null);
  assert.equal(cliente.foto_url, null);
  estado.errorSubida = { message: 'storage' };
  await elementos['foto-perfil-archivo'].change();
  assert.match(elementos['foto-perfil-mensaje'].textContent, /storage/);
  assert.equal(elementos['foto-perfil-elegir'].disabled, false);
});

function cargarAjustesPrueba() {
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { value: '', textContent: '', style: {} };
  elemento('perfil-nombre').value = 'Nombre';
  elemento('sobre-altura').value = '170';
  const estado = { escrituras: [], falloObjetivo: false, falloClave: false };
  const supabaseClient = {
    auth: { updateUser: async () => ({ error: estado.falloClave ? { message: 'clave' } : null }) },
    from: (tabla) => ({ update: (datos) => {
      estado.escrituras.push({ tabla, datos });
      return { eq: () => ({ select: () => ({ maybeSingle: async () =>
        estado.falloObjetivo && tabla === 'clientes_objetivo'
          ? { data: null, error: { message: 'red' } }
          : { data: { id: 'cliente' }, error: null },
      }) }) };
    } }),
  };
  const context = vm.createContext({
    document: { getElementById: elemento, querySelector: () => ({ dataset: { value: 'mujer' } }), addEventListener() {} },
    supabaseClient, setTimeout() {}, console, _clienteActual: {},
  });
  vm.runInContext(leer('mockup-fitnova-go', 'js', 'ajustes.js'), context);
  vm.runInContext("ajCliente={id:'cliente'}; ajObjetivo={altura_cm:170}", context);
  return { context, elemento, estado };
}

test('ajustes valida antes de escribir y comunica cambios parciales', async () => {
  const caso = cargarAjustesPrueba();
  caso.elemento('perfil-password').value = 'corta';
  await caso.context.guardarMiPerfil();
  assert.equal(caso.estado.escrituras.length, 0);
  assert.match(caso.elemento('perfil-msg').textContent, /8 caracteres/);
  caso.elemento('perfil-password').value = 'clave-segura';
  caso.estado.falloClave = true;
  await caso.context.guardarMiPerfil();
  assert.match(caso.elemento('perfil-msg').textContent, /datos personales se guardaron/);
  caso.elemento('sobre-altura').value = '0';
  await caso.context.guardarSobreMi();
  assert.equal(caso.estado.escrituras.length, 1);
  assert.match(caso.elemento('sobre-msg').textContent, /altura válida/);
  caso.elemento('sobre-altura').value = '170.5';
  caso.estado.falloObjetivo = true;
  await caso.context.guardarSobreMi();
  assert.match(caso.elemento('sobre-msg').textContent, /género se guardó/);
  vm.runInContext('ajObjetivo=null', caso.context);
  await caso.context.guardarSobreMi();
  assert.match(caso.elemento('sobre-msg').textContent, /cargar tu objetivo/);
  assert.equal(caso.estado.escrituras.length, 3);
});

test('perfil distingue error al cargar profesionales de lista vacía', async () => {
  const cont = { innerHTML: '' };
  let respuesta = { data: null, error: { message: 'red' } };
  const context = vm.createContext({
    document: { getElementById: () => cont, addEventListener() {} },
    supabaseClient: { from: () => ({ select: () => ({ eq: async () => respuesta }) }) },
    FitNovaMetricas: { escapar: (texto) => texto }, console,
  });
  vm.runInContext(leer('mockup-fitnova-go', 'js', 'perfil.js'), context);
  vm.runInContext("pfCliente={id:'cliente'}", context);
  await context.cargarProfesionales();
  assert.match(cont.innerHTML, /red/);
  assert.match(cont.innerHTML, /Reintentar/);
  respuesta = { data: [], error: null };
  await context.cargarProfesionales();
  assert.match(cont.innerHTML, /no tienes profesionales/);
});

test('Manager muestra la foto solo a profesionales de salud asignados', async () => {
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { textContent: '', hidden: false };
  let autorizado = false, firmas = 0;
  const context = {
    document: { getElementById: elemento, addEventListener() {} },
    supabaseClient: {
      rpc: async () => ({ data: autorizado, error: null }),
      storage: { from: () => ({ createSignedUrl: async () => {
        firmas++;
        return { data: { signedUrl: 'https://example.test/firmada' }, error: null };
      } }) },
    },
  };
  vm.runInNewContext(leer('fitnova-manager', 'js', 'cliente-perfil.js'), context);
  await context.cargarFotoFichaCliente('cliente', 'cliente/perfil/avatar.jpg');
  assert.equal(firmas, 0);
  autorizado = true;
  await context.cargarFotoFichaCliente('cliente', 'cliente/perfil/avatar.jpg');
  assert.equal(firmas, 1);
  elemento('cp-foto').onload();
  assert.equal(elemento('cp-foto').hidden, false);
  assert.equal(elemento('cp-iniciales').hidden, true);
  await context.cargarFotoFichaCliente('cliente', 'otro/perfil/avatar.jpg');
  assert.match(elemento('cp-foto-error').textContent, /ruta/);
});
