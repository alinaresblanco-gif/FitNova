// Consulta del plan semanal del cliente.
(() => {
  const N = window.FitNovaNutricion;
  const P = window.FitNovaPlanesNutricionales;
  const caja = document.getElementById('go-plan');
  const aviso = document.getElementById('go-plan-error');
  let planes = [];
  let planId;
  let dia = P.diaFecha(N.hoyIso());

  function pintar() {
    const plan = planes.find((p) => p.id === planId);
    if (!plan) { caja.innerHTML = '<p>Tu profesional aún no te ha asignado un plan nutricional.</p>'; return; }
    const contenido = plan.dias.find((d) => d.dia === dia);
    caja.innerHTML = `
      <label>Plan<select id="go-plan-selector" class="nut-plan-select">${planes.map((p) => `<option value="${p.id}" ${p.id === planId ? 'selected' : ''}>${N.escapar(p.nombre)} · ${N.escapar(p.inicio)} a ${N.escapar(p.fin)}</option>`).join('')}</select></label>
      ${plan.descripcion ? `<p class="nut-plan-texto">${N.escapar(plan.descripcion)}</p>` : ''}
      <label>Día de la semana<select id="go-plan-dia" class="nut-plan-select">${P.DIAS.map((d, i) => `<option value="${i + 1}" ${i + 1 === dia ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <div id="go-plan-dia-contenido">${contenido ? P.diaHtml(contenido) : '<p>No hay información para este día.</p>'}</div>
      <p>La semana se repite solo durante las fechas indicadas. Los objetivos son orientaciones de tu profesional.</p>`;
    document.getElementById('go-plan-selector').addEventListener('change', (event) => { planId = event.target.value; pintar(); });
    document.getElementById('go-plan-dia').addEventListener('change', (event) => { dia = Number(event.target.value); pintar(); });
    P.cargarFotos(supabaseClient, caja);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!await requireSessionGo()) return;
      const { data: cliente, error } = await supabaseClient.rpc('cliente_actual_id');
      if (error) throw new Error(error.message);
      if (!cliente) throw new Error('No hay un cliente vinculado a esta cuenta.');
      planes = await P.consultar(supabaseClient, cliente);
      const hoy = N.hoyIso();
      const seleccionado = planes.find((p) => p.inicio <= hoy && p.fin >= hoy)
        || [...planes].reverse().find((p) => p.inicio > hoy) || planes[0];
      planId = seleccionado?.id;
      pintar();
    } catch (e) {
      caja.innerHTML = '';
      aviso.textContent = `No se pudieron cargar tus planes: ${e.message}`;
    }
  });
})();
