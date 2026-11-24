const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const leer = (...partes) => fs.readFileSync(path.join(root, ...partes), 'utf8');

function cargarCuenta() {
  const elementos = {};
  const elemento = (id) => elementos[id] ||= {
    value: '', textContent: '', disabled: false, hidden: false, files: [], style: {},
    addEventListener(tipo, fn) { this[tipo] = fn; },
  };
  const profesional = { id: 'profesional', nombre: 'Ana', apellidos: '', email: 'ana@example.test', rol: 'entrenador', foto_perfil: false };
  const estado = { guardados: [], falloDatos: false, falloFoto: false, clave: null, objeto: null };
  const supabaseClient = {
    auth: { updateUser: async ({ password }) => { estado.clave = password; return { error: null }; } },
    storage: { from: () => ({
      upload: async (ruta) => { if (!estado.falloFoto) estado.objeto = ruta; return { error: estado.falloFoto ? { message: 'storage' } : null }; },
      remove: async () => { estado.objeto = null; return { error: null }; },
      createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/imagen?token=x' }, error: null }),
    }) },
    from: () => {
      let cambio;
      const consulta = {
        update(datos) { cambio = datos; estado.guardados.push(datos); return consulta; },
        select() { return consulta; }, eq() { return consulta; },
        async maybeSingle() {
          if (cambio && estado.falloDatos) return { data: null, error: { message: 'red' } };
          if (cambio) { Object.assign(profesional, cambio); return { data: { id: profesional.id }, error: null }; }
          return { data: profesional, error: null };
        },
      };
      return consulta;
    },
  };
  let iniciar;
  const context = {
    document: { getElementById: elemento, addEventListener: (_, fn) => { iniciar = fn; } },
    supabaseClient, requireSession: async () => ({ user: { id: 'auth' } }), cerrarSesionManager() {},
    FitNovaFotos: { comprimir: async () => ({ size: 200 }) }, confirm: () => true,
    location: {}, console, Date,
  };
  vm.runInNewContext(leer('fitnova-manager', 'js', 'cuenta.js'), context);
  return { elemento, estado, profesional, iniciar };
}

test('cuenta profesional guarda nombre y valida la contraseña independientemente', async () => {
  const caso = cargarCuenta();
  await caso.iniciar();
  const evento = { preventDefault() {}, submitter: { disabled: false } };
  caso.elemento('cuenta-nombre').value = ' Alicia ';
  await caso.elemento('cuenta-perfil-form').submit(evento);
  assert.equal(caso.profesional.nombre, 'Alicia');
  caso.elemento('cuenta-clave').value = '12345678';
  caso.elemento('cuenta-clave-confirmar').value = 'distinta';
  await caso.elemento('cuenta-clave-form').submit(evento);
  assert.equal(caso.estado.clave, null);
  caso.elemento('cuenta-clave-confirmar').value = '12345678';
  await caso.elemento('cuenta-clave-form').submit(evento);
  assert.equal(caso.estado.clave, '12345678');
  assert.equal(caso.elemento('cuenta-clave').value, '');
});

test('foto profesional comunica fallos parciales y permite eliminar el archivo subido', async () => {
  const caso = cargarCuenta();
  await caso.iniciar();
  caso.elemento('cuenta-archivo').files = [{ name: 'foto.png' }];
  caso.estado.falloDatos = true;
  await caso.elemento('cuenta-archivo').change();
  assert.equal(caso.estado.objeto, 'profesional/perfil.jpg');
  assert.match(caso.elemento('cuenta-foto-mensaje').textContent, /imagen se subió/);
  caso.estado.falloDatos = false;
  await caso.elemento('cuenta-borrar-foto').click();
  assert.equal(caso.estado.objeto, null);
  assert.match(caso.elemento('cuenta-foto-mensaje').textContent, /eliminada/);
});

test('acceso de Manager retoma un perfil incompleto y conserva el retorno a equipo', async () => {
  const html = leer('fitnova-manager', 'login.html');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { value: '', textContent: '', style: {} };
  const panels = [{ style: {} }, { style: {} }];
  let iniciar, cerrada = false;
  const session = { user: { id: 'auth' } };
  const context = {
    document: { getElementById: elemento, querySelectorAll: () => panels, addEventListener: (_, fn) => { iniciar = fn; } },
    window: { location: {} }, location: { search: '?equipo=1' }, URLSearchParams,
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session }, error: null }), signOut: async () => { cerrada = true; return { error: null }; } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    },
  };
  vm.runInNewContext(script, context);
  await iniciar();
  assert.equal(elemento('perfil-profesional-pendiente').style.display, 'block');
  await context.salirPerfilPendiente();
  assert.equal(cerrada, true);
  assert.equal(context.window.location.href, 'login.html?equipo=1');
});

test('dashboard filtra los últimos eventos reales y no borra avisos de error', async () => {
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { value: '', textContent: '', innerHTML: '' };
  const context = vm.createContext({ document: { getElementById: elemento, addEventListener() {} } });
  vm.runInContext(leer('fitnova-manager', 'js', 'dashboard.js'), context);
  vm.runInContext("dashboardCargado=true; dashboardActividad=[{tipo:'alta',texto:'Alta de Ana',fecha:'2026-01-01',href:'clientes.html'},{tipo:'acceso',texto:'Luis ha iniciado actividad',fecha:'2026-01-02',href:'clientes.html'}]", context);
  elemento('dashboard-filtro').value = 'alta';
  context.renderActividadDashboard();
  assert.match(elemento('dashboard-actividad').innerHTML, /Ana/);
  assert.doesNotMatch(elemento('dashboard-actividad').innerHTML, /Luis/);
  elemento('dashboard-buscar').value = 'Luis';
  context.renderActividadDashboard();
  assert.match(elemento('dashboard-actividad').innerHTML, /No hay actividad/);
  vm.runInContext('dashboardCargado=false', context);
  elemento('dashboard-actividad').innerHTML = 'Error de red';
  context.renderActividadDashboard();
  assert.equal(elemento('dashboard-actividad').innerHTML, 'Error de red');
});

test('Clientes conserva errores de carga y comunica si no puede copiar el enlace', async () => {
  const elementos = {};
  const elemento = (id) => elementos[id] ||= { value: 'enlace', textContent: '', innerHTML: '', select() {} };
  const context = {
    document: { getElementById: elemento, addEventListener() {} },
    supabaseClient: { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'red' } }) }) }) },
    navigator: { clipboard: { writeText: async () => { throw new Error('permiso denegado'); } } },
    console,
  };
  vm.runInNewContext(leer('fitnova-manager', 'js', 'clientes.js'), context);
  assert.equal(await context.cargarClientes(), false);
  assert.match(elemento('tabla-activos').innerHTML, /red/);
  context.renderClientes();
  assert.match(elemento('tabla-activos').innerHTML, /red/);
  await context.copiarEnlaceInvitacion();
  assert.match(elemento('nc-copia-estado').textContent, /manualmente/);
});
