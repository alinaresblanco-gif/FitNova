// Planes nutricionales de la ficha del cliente.
(() => {
  const N = window.FitNovaNutricion;
  const P = window.FitNovaPlanesNutricionales;
  const clienteId = new URLSearchParams(location.search).get('id');
  const lista = document.getElementById('cp-planes');
  const aviso = document.getElementById('cp-plan-aviso');
  let profesionalId;
  let planes = [];

  async function cargar() {
    aviso.textContent = '';
    try {
      planes = await P.consultar(supabaseClient, clienteId);
      const hoy = N.hoyIso();
      lista.innerHTML = planes.length ? planes.map((p) => `<article style="border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0;">
        <h4>${N.escapar(p.nombre)}</h4><p>Del ${N.escapar(p.inicio)} al ${N.escapar(p.fin)}${p.inicio <= hoy && p.fin >= hoy ? ' · En curso' : p.inicio > hoy ? ' · Próximo' : ' · Finalizado'}</p>
        ${p.descripcion ? `<p>${N.escapar(p.descripcion)}</p>` : ''}
        ${p.dias.map((dia) => `<details><summary>${P.DIAS[dia.dia - 1]}</summary>${P.diaHtml(dia)}</details>`).join('')}
        ${p.profesional_id === profesionalId && p.fin >= hoy ? `<button type="button" class="btn-outline" data-finalizar-plan="${p.id}">${p.inicio >= hoy ? 'Retirar plan' : 'Finalizar plan'}</button>` : ''}
      </article>`).join('') : '<p>No hay planes nutricionales asignados.</p>';
      await P.cargarFotos(supabaseClient, lista);
    } catch (e) {
      lista.innerHTML = '';
      aviso.textContent = `No se pudieron cargar los planes: ${e.message}`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!await requireSession()) return;
    if (!clienteId) { aviso.textContent = 'Falta el cliente.'; return; }
    try {
      profesionalId = await EntMgr.profesionalId();
      document.getElementById('cp-plan-asignar').addEventListener('click', () => NutPlanesMgr.abrirAsignar({ clienteId, onAsignado: cargar }));
      lista.addEventListener('click', async (event) => {
        const boton = event.target.closest('[data-finalizar-plan]');
        if (!boton) return;
        const plan = planes.find((p) => p.id === boton.dataset.finalizarPlan);
        if (!plan) return;
        const mensaje = plan.inicio >= N.hoyIso()
          ? 'Se retirará el plan completo. ¿Continuar?'
          : 'El plan terminará ayer y se conservará su historial anterior. ¿Continuar?';
        if (!window.confirm(mensaje)) return;
        boton.disabled = true;
        try {
          const { error } = await supabaseClient.rpc('finalizar_plan_nutricional', { p_id: plan.id });
          if (error) throw new Error(error.message);
          await cargar();
        } catch (e) {
          aviso.textContent = `No se pudo finalizar el plan: ${e.message}`;
          boton.disabled = false;
        }
      });
      await cargar();
    } catch (e) { aviso.textContent = `No se pudieron cargar los planes: ${e.message}`; }
  });
})();
