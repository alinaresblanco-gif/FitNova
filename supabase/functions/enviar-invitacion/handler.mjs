const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respuesta(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function crearHandler({ env, fetch: pedir, log = console }) {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return respuesta(405, { error: 'Método no permitido.' });

    const url = env('SUPABASE_URL');
    const anon = env('SUPABASE_ANON_KEY');
    const service = env('SUPABASE_SERVICE_ROLE_KEY');
    const resend = env('RESEND_API_KEY');
    const from = env('FITNOVA_EMAIL_FROM');
    if (!url || !anon || !service || !resend || !from) {
      log.error('El servicio de correo no está configurado.');
      return respuesta(503, { error: 'El servicio de correo no está configurado.' });
    }

    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/i.test(authorization)) return respuesta(401, { error: 'Sesión necesaria.' });
    let body;
    try { body = await request.json(); }
    catch { return respuesta(400, { error: 'Solicitud no válida.' }); }
    if (!body || !['cliente', 'equipo'].includes(body.tipo)
      || typeof body.invitacion_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.invitacion_id)
      || typeof body.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) {
      return respuesta(400, { error: 'Solicitud no válida.' });
    }

    const adminHeaders = {
      apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json',
    };
    const rpc = (name, payload) => pedir(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(payload),
    });
    let intento;
    try {
      const auth = await pedir(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
      if (!auth.ok) return respuesta(401, { error: 'Sesión no válida.' });
      const user = await auth.json();
      if (!user.id) return respuesta(401, { error: 'Sesión no válida.' });
      const preparar = await rpc('correo_preparar_invitacion', {
        p_usuario: user.id, p_tipo: body.tipo, p_invitacion: body.invitacion_id, p_token: body.token,
      });
      if (!preparar.ok) {
        log.error('No se pudo autorizar o reservar el envío.', preparar.status);
        return respuesta(403, { error: 'No se pudo autorizar o reservar el envío. Comparte el enlace o inténtalo más tarde.' });
      }
      const datos = await preparar.json();
      intento = datos[0];
      if (!intento || typeof intento.destinatario !== 'string') throw new Error('Respuesta de reserva inválida');
      if (intento.ya_aceptado) return respuesta(200, { estado: 'aceptado' });
      if (!intento.intento_id) throw new Error('Reserva sin identificador');
    } catch (error) {
      log.error('No se pudo preparar el envío.', error);
      return respuesta(503, { error: 'No se pudo preparar el envío.' });
    }

    const destino = body.tipo === 'cliente'
      ? new URL('https://alinaresblanco-gif.github.io/FitNova/mockup-fitnova-go/invitacion.html')
      : new URL('https://alinaresblanco-gif.github.io/FitNova/fitnova-manager/equipo-invitacion.html');
    if (body.tipo === 'cliente') destino.searchParams.set('token', body.token);
    else destino.hash = body.token;
    const texto = body.tipo === 'cliente'
      ? 'Tu profesional te ha invitado a registrarte en FitNova Go.'
      : 'Has recibido una invitación para unirte a un equipo en FitNova Manager.';

    let aceptado = false;
    let proveedorId = null;
    try {
      const envio = await pedir('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `fitnova-invitacion/${body.tipo}/${body.invitacion_id}`,
        },
        body: JSON.stringify({
          from, to: [intento.destinatario], subject: 'Tu invitación a FitNova',
          text: `${texto}\n\nAbre este enlace privado para continuar:\n${destino.href}\n\nEl enlace caduca 7 días después de su creación. Si no esperabas esta invitación, ignora este mensaje.`,
        }),
      });
      if (envio.ok) {
        const resultado = await envio.json();
        if (typeof resultado.id === 'string' && resultado.id.length > 0) {
          aceptado = true;
          proveedorId = resultado.id;
        }
      } else {
        log.error('El proveedor no aceptó el envío.', envio.status);
      }
    } catch (error) {
      log.error('No se pudo confirmar la respuesta del proveedor.', error);
    }

    try {
      const registro = await rpc('correo_finalizar_intento', {
        p_intento: intento.intento_id, p_aceptado: aceptado, p_proveedor_id: proveedorId,
      });
      if (!registro.ok) throw new Error(`Error al registrar el intento (${registro.status})`);
    } catch (error) {
      log.error('No se pudo registrar el resultado del envío.', error);
      return respuesta(503, { error: 'No se pudo confirmar el envío.' });
    }
    if (!aceptado) return respuesta(502, { error: 'No se pudo confirmar el envío.' });
    return respuesta(200, { estado: 'aceptado' });
  };
}
