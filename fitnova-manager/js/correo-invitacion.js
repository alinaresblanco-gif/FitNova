async function enviarCorreoInvitacion(tipo, invitacion, estado, reintentar) {
  const solicitud = {};
  estado.correoSolicitud = solicitud;
  reintentar.hidden = true;
  estado.textContent = 'Solicitando el envío por correo…';
  try {
    const { data, error } = await supabaseClient.functions.invoke('enviar-invitacion', {
      body: { tipo, invitacion_id: invitacion.invitacion_id, token: invitacion.token },
    });
    if (error || data?.estado !== 'aceptado') throw error || new Error('Respuesta inesperada del servidor.');
    if (estado.correoSolicitud !== solicitud) return;
    estado.textContent = 'El proveedor ha aceptado el correo. La entrega en la bandeja del destinatario no está garantizada.';
  } catch (error) {
    console.error('No se pudo confirmar el envío de la invitación:', error);
    if (estado.correoSolicitud !== solicitud) return;
    estado.textContent = 'No se pudo confirmar el envío. Comparte el enlace manualmente o vuelve a intentar el correo.';
    reintentar.hidden = false;
    reintentar.onclick = () => enviarCorreoInvitacion(tipo, invitacion, estado, reintentar);
  }
}
