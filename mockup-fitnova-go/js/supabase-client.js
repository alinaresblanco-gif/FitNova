// Conexión con Supabase para FitNova Go (mismo proyecto que FitNova Manager).
const SUPABASE_URL = 'https://rvonyrsfhghlqjlhuubo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C_dvWW90caDIlyU3vGjgDQ_0BzdVql1';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: document.body.dataset.view === 'recuperacion'
    ? { persistSession: false, autoRefreshToken: false, storageKey: 'fitnova-go-recuperacion' }
    : { storageKey: 'fitnova-go-auth' },
});

// Redirige a login.html si no hay sesión activa. Se usa en las páginas protegidas.
async function requireSessionGo() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    mostrarErrorAccesoGo(`No se pudo comprobar la sesión: ${error.message}`);
    return null;
  }
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

function mostrarErrorAccesoGo(texto) {
  let aviso = document.getElementById('acceso-go-error');
  if (!aviso) {
    aviso = document.createElement('p');
    aviso.id = 'acceso-go-error';
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'padding:12px;color:#b3261e;background:#fff0ee;';
    (document.querySelector('main') || document.body).prepend(aviso);
  }
  aviso.textContent = texto;
}

async function mostrarFotoClienteGo(cliente) {
  const imagenes = document.querySelectorAll('a[href="perfil.html"] img, img[data-foto-perfil]');
  if (!imagenes.length) return;
  const ruta = `${cliente.id}/perfil/avatar.jpg`;
  if (!cliente.foto_url) {
    imagenes.forEach((imagen) => { imagen.src = '../imagenes/LOGO-FITNOVA USUARIO.png'; });
    return;
  }
  if (cliente.foto_url !== ruta) throw new Error('La ruta de la foto de perfil no es válida.');
  const { data, error } = await supabaseClient.storage.from('progreso-fotos').createSignedUrl(ruta, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo obtener la foto.');
  imagenes.forEach((imagen) => {
    imagen.onerror = () => {
      imagen.onerror = null;
      imagen.src = '../imagenes/LOGO-FITNOVA USUARIO.png';
      mostrarErrorAccesoGo('No se pudo mostrar la foto de perfil. Revisa la conexión o vuelve a subirla.');
    };
    imagen.src = `${data.signedUrl}&v=${Date.now()}`;
  });
}

// Carga (y cachea en memoria) la ficha del cliente autenticado.
let _clienteActual = null;
async function cargarClienteActual() {
  if (_clienteActual) return _clienteActual;
  const session = await requireSessionGo();
  if (!session) return null;

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nombre, apellidos, nombre_avatar, email, telefono, fecha_nacimiento, genero, foto_url')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error || !data) return null;
  _clienteActual = data;
  return data;
}

async function cerrarSesionGo() {
  await supabaseClient.auth.signOut({ scope: 'local' });
  window.location.href = 'login.html';
}

// Registra actividad del cliente (columna "Última actividad" en Manager),
// como mucho una vez por sesión de navegación.
async function registrarUltimaActividad() {
  if (sessionStorage.getItem('fitnova_actividad_registrada')) return;
  const cliente = await cargarClienteActual();
  if (!cliente) return;
  await supabaseClient
    .from('clientes')
    .update({ ultima_actividad: new Date().toISOString() })
    .eq('id', cliente.id);
  sessionStorage.setItem('fitnova_actividad_registrada', '1');
}

// Guarda de sesión automática en las páginas marcadas con <body data-auth="required">
document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.auth !== 'required') return;
  try {
    const session = await requireSessionGo();
    if (!session) return;
    const { data, error } = await supabaseClient.from('clientes')
      .select('id').eq('auth_user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      window.location.href = 'login.html';
      return;
    }
    registrarUltimaActividad();
    if (document.querySelector('a[href="perfil.html"] img, img[data-foto-perfil]')) {
      const cliente = await cargarClienteActual();
      if (!cliente) throw new Error('No se pudo cargar el perfil.');
      await mostrarFotoClienteGo(cliente);
    }
  } catch (error) {
    console.error('Error al cargar FitNova Go:', error);
    mostrarErrorAccesoGo(`No se pudo cargar tu perfil: ${error.message}. Revisa la conexión y vuelve a intentarlo.`);
  }
});
