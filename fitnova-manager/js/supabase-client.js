// Conexión con Supabase (proyecto fitnova-dev). Clave publicable: segura para el navegador, protegida por RLS.
const SUPABASE_URL = 'https://rvonyrsfhghlqjlhuubo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C_dvWW90caDIlyU3vGjgDQ_0BzdVql1';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: document.body.dataset.view === 'recuperacion'
    ? { persistSession: false, autoRefreshToken: false, storageKey: 'fitnova-manager-recuperacion' }
    : { storageKey: 'fitnova-manager-auth' },
});

// URL base de FitNova Go para construir los enlaces de invitación.
// Al desplegar en producción, sustituir por la URL pública de Go,
// p. ej.: const FITNOVA_GO_URL = 'https://go.fitnova.app/';
const FITNOVA_GO_URL = new URL('../mockup-fitnova-go/', window.location.href).toString();

// Redirige a login.html si no hay sesión activa. Se llama desde cada página protegida.
async function requireSession() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    mostrarErrorSesionManager(`No se pudo comprobar la sesión: ${error.message}`);
    return null;
  }
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

function mostrarErrorSesionManager(texto) {
  let aviso = document.getElementById('manager-acceso-error');
  if (!aviso) {
    aviso = document.createElement('p');
    aviso.id = 'manager-acceso-error';
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'padding:12px;color:#b3261e;background:#fff0ee;';
    (document.querySelector('.app-shell') || document.body).prepend(aviso);
  }
  aviso.textContent = texto;
}

async function cerrarSesionManager() {
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;
    window.location.href = 'login.html';
  } catch (error) {
    mostrarErrorSesionManager(`No se pudo cerrar sesión: ${error.message}`);
  }
}

// Guarda de sesión automática en todas las páginas salvo login.html
document.addEventListener('DOMContentLoaded', async () => {
  if (['login', 'recuperacion'].includes(document.body.dataset.view)) return;
  try {
    const session = await requireSession();
    if (!session) return;
    const { data: profesional, error } = await supabaseClient.from('profesionales')
      .select('id,nombre,apellidos,foto_perfil').eq('auth_user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!profesional) {
      window.location.href = 'login.html';
      return;
    }
    const avatarBtn = document.querySelector('.topbar-avatar');
    if (!avatarBtn) return;
    avatarBtn.style.cursor = 'pointer';
    avatarBtn.title = 'Mi cuenta';
    avatarBtn.setAttribute('role', 'link');
    avatarBtn.tabIndex = 0;
    const abrirCuenta = () => { window.location.href = 'cuenta.html'; };
    avatarBtn.addEventListener('click', abrirCuenta);
    avatarBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirCuenta(); }
    });
    const avatarCircle = document.querySelector('.avatar-circle');
    if (avatarCircle && profesional.nombre) {
      avatarCircle.textContent = profesional.nombre.trim().charAt(0).toUpperCase();
      if (profesional.foto_perfil) {
        const firma = await supabaseClient.storage.from('profesionales-fotos')
          .createSignedUrl(`${profesional.id}/perfil.jpg`, 3600);
        if (firma.error || !firma.data?.signedUrl) throw firma.error || new Error('No se pudo obtener la foto.');
        const imagen = document.createElement('img');
        imagen.alt = 'Foto de perfil';
        imagen.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        imagen.onerror = () => mostrarErrorSesionManager('No se pudo mostrar tu foto de perfil.');
        imagen.onload = () => { avatarCircle.textContent = ''; avatarCircle.appendChild(imagen); };
        imagen.src = firma.data.signedUrl;
      }
    }
  } catch (error) {
    console.error('Error al cargar la cuenta profesional:', error);
    mostrarErrorSesionManager(`No se pudo cargar tu cuenta: ${error.message}.`);
  }
});
