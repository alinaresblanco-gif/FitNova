window.FitNovaSesiones = (() => {
  const estados = { programada: 'Programada', cancelada: 'Cancelada', completada: 'Completada' };
  const tipos = { entrenamiento_personal: 'Entrenamiento personal', seguimiento: 'Seguimiento' };
  const escapar = (valor) => String(valor ?? '').replace(/[&<>'"]/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[caracter]);

  function fechaLocal(fecha) {
    const date = new Date(fecha);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function horaLocal(fecha) {
    return new Date(fecha).toTimeString().slice(0, 5);
  }

  function horario(sesion) {
    const formato = { dateStyle: 'medium', timeStyle: 'short' };
    return `${new Date(sesion.inicio).toLocaleString('es-ES', formato)} – ${new Date(sesion.fin).toLocaleString('es-ES', formato)}`;
  }

  function enDia(sesion, fecha) {
    const inicioDia = new Date(`${fecha}T00:00:00`);
    const finDia = new Date(inicioDia);
    finDia.setDate(finDia.getDate() + 1);
    return new Date(sesion.inicio) < finDia && new Date(sesion.fin) > inicioDia;
  }

  function intervalo(fecha, hora, duracion) {
    const inicio = new Date(`${fecha}T${hora}:00`);
    const minutos = Number(duracion);
    if (!fecha || !hora || !Number.isFinite(inicio.getTime())
      || fechaLocal(inicio) !== fecha || horaLocal(inicio) !== hora
      || !Number.isInteger(minutos) || minutos <= 0) {
      throw new Error('Indica una fecha y hora válidas y una duración positiva en minutos. Revisa los cambios de hora.');
    }
    const fin = new Date(inicio.getTime() + minutos * 60000);
    if (!Number.isFinite(fin.getTime())) throw new Error('La duración indicada no es válida.');
    return { inicio: inicio.toISOString(), fin: fin.toISOString() };
  }

  function mensajeError(error) {
    if (error.code === '23P01') return 'El profesional o el cliente ya tiene una sesión programada en ese horario.';
    return error.message || 'No se pudo consultar o guardar la sesión. Comprueba la conexión.';
  }

  async function consultar(client, { profesionalId, clienteId, proximas = false, limite } = {}) {
    if (!profesionalId && !clienteId) throw new Error('No se pudo identificar al usuario de la agenda.');
    const sesiones = [];
    const tamano = limite || 500;
    for (let offset = 0; ; offset += tamano) {
      let consulta = client.from('sesiones')
        .select('id, profesional_id, cliente_id, titulo, tipo, inicio, fin, lugar, estado, clientes(nombre, apellidos), profesionales(nombre, apellidos)')
        .order('inicio', { ascending: true }).order('id', { ascending: true });
      if (profesionalId) consulta = consulta.eq('profesional_id', profesionalId);
      if (clienteId) consulta = consulta.eq('cliente_id', clienteId);
      if (proximas) consulta = consulta.eq('estado', 'programada').gt('fin', new Date().toISOString());
      const { data, error } = await consulta.range(offset, offset + tamano - 1)
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw new Error(mensajeError(error));
      sesiones.push(...data);
      if (limite || data.length < tamano) return sesiones;
    }
  }

  function nombre(persona) {
    return `${persona?.nombre || ''} ${persona?.apellidos || ''}`.trim();
  }

  return { estados, tipos, escapar, fechaLocal, horaLocal, horario, enDia, intervalo, mensajeError, consultar, nombre };
})();
