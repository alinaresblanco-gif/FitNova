// Conexión con Supabase (proyecto fitnova-dev). Clave publicable: segura para el navegador, protegida por RLS.
const SUPABASE_URL = 'https://rvonyrsfhghlqjlhuubo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C_dvWW90caDIlyU3vGjgDQ_0BzdVql1';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Redirige a login.html si no hay sesión activa. Se llama desde cada página protegida.
async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

async function cerrarSesionManager() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// Guarda de sesión automática en todas las páginas salvo login.html
document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.view === 'login') return;
  const session = await requireSession();
  if (!session) return;

  const avatarBtn = document.querySelector('.topbar-avatar');
  if (avatarBtn) {
    avatarBtn.style.cursor = 'pointer';
    avatarBtn.title = 'Cerrar sesión';
    avatarBtn.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) cerrarSesionManager();
    });
  }

  const { data: profesional } = await supabaseClient
    .from('profesionales')
    .select('nombre, apellidos')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  const avatarCircle = document.querySelector('.avatar-circle');
  if (avatarCircle && profesional?.nombre) {
    avatarCircle.textContent = profesional.nombre.trim().charAt(0).toUpperCase();
  }
});
