// Conexión con Supabase para FitNova Go (mismo proyecto que FitNova Manager).
const SUPABASE_URL = 'https://rvonyrsfhghlqjlhuubo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C_dvWW90caDIlyU3vGjgDQ_0BzdVql1';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Redirige a login.html si no hay sesión activa. Se usa en las páginas protegidas.
async function requireSessionGo() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
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
  await supabaseClient.auth.signOut();
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
  const session = await requireSessionGo();
  if (!session) return;
  registrarUltimaActividad();
});
