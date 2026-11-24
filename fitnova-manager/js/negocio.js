const negocioEstado = { planes: [], propuestas: [], clientes: [], editando: null };
const negocioEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const negocioModalidades = {
  unico: 'Pago único', semanal: 'Semanal', mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual',
};

function negocioCentimos(valor) {
  const texto = valor.trim().replace(',', '.');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(texto)) return null;
  const [euros, decimales = ''] = texto.split('.');
  const centimos = Number(euros) * 100 + Number(decimales.padEnd(2, '0'));
  return centimos >= 1 && centimos <= 99999999 ? centimos : null;
}

function negocioImporte(centimos) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(centimos / 100);
}

async function negocioRpc(nombre, args = {}) {
  const { data, error } = await supabaseClient.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

function negocioPintar() {
  const activos = negocioEstado.planes.filter((plan) => plan.activo);
  document.getElementById('negocio-planes').innerHTML = activos.length
    ? `<div class="mini-list">${activos.map((plan) => `<div class="mini-list-item">
      <div class="info"><strong>${negocioEsc(plan.nombre)}</strong><span>${negocioEsc(negocioImporte(plan.precio_centimos))} · ${negocioEsc(negocioModalidades[plan.modalidad])}</span></div>
      <button class="btn-ghost" type="button" data-negocio-editar="${negocioEsc(plan.id)}">Editar</button>
      <button class="btn-ghost" type="button" data-negocio-archivar="${negocioEsc(plan.id)}">Archivar</button>
    </div>`).join('')}</div>` : '<p>No tienes planes creados.</p>';
  document.getElementById('negocio-propuestas').innerHTML = negocioEstado.propuestas.length
    ? `<div class="mini-list">${negocioEstado.propuestas.map((p) => `<div class="mini-list-item">
      <div class="info"><strong>${negocioEsc(p.nombre)}</strong><span>${negocioEsc([p.clientes?.nombre, p.clientes?.apellidos].filter(Boolean).join(' ') || p.clientes?.email || 'Cliente')} · ${negocioEsc(negocioImporte(p.precio_centimos))} · ${negocioEsc(negocioModalidades[p.modalidad])} · Borrador</span></div>
      <button class="btn-ghost" type="button" data-negocio-retirar="${negocioEsc(p.id)}">Retirar</button>
    </div>`).join('')}</div>` : '<p>No tienes propuestas borrador.</p>';
  document.getElementById('negocio-nuevo').disabled = false;
  document.getElementById('negocio-proponer').disabled = !activos.length || !negocioEstado.clientes.length;
}

async function negocioCargar() {
  const errorEl = document.getElementById('negocio-error');
  errorEl.textContent = '';
  try {
    const [planes, propuestas, clientes] = await Promise.all([
      supabaseClient.from('negocio_planes').select('id,nombre,descripcion,modalidad,precio_centimos,activo').order('actualizado_en', { ascending: false }),
      supabaseClient.from('negocio_propuestas').select('id,cliente_id,nombre,modalidad,precio_centimos,clientes(nombre,apellidos,email)').eq('estado', 'borrador').order('creado_en', { ascending: false }),
      supabaseClient.rpc('negocio_clientes_disponibles'),
    ]);
    for (const resultado of [planes, propuestas, clientes]) if (resultado.error) throw new Error(resultado.error.message);
    negocioEstado.planes = planes.data;
    negocioEstado.propuestas = propuestas.data;
    negocioEstado.clientes = clientes.data;
    negocioPintar();
  } catch (error) {
    document.getElementById('negocio-planes').textContent = 'No se pudieron cargar los planes.';
    document.getElementById('negocio-propuestas').textContent = 'No se pudieron cargar las propuestas.';
    document.getElementById('negocio-nuevo').disabled = true;
    document.getElementById('negocio-proponer').disabled = true;
    errorEl.textContent = `No se pudo cargar Negocio: ${error.message}`;
  }
}

function negocioEditar(plan = null) {
  negocioEstado.editando = plan?.id || null;
  document.getElementById('negocio-plan-titulo').textContent = plan ? 'Editar plan' : 'Nuevo plan';
  document.getElementById('negocio-nombre').value = plan?.nombre || '';
  document.getElementById('negocio-descripcion').value = plan?.descripcion || '';
  document.getElementById('negocio-modalidad').value = plan?.modalidad || 'mensual';
  document.getElementById('negocio-precio').value = plan ? (plan.precio_centimos / 100).toFixed(2).replace('.', ',') : '';
  document.getElementById('negocio-plan-error').textContent = '';
  openModal('modal-negocio-plan');
}

function negocioProponer() {
  const planes = negocioEstado.planes.filter((plan) => plan.activo);
  document.getElementById('negocio-selector-plan').innerHTML = planes.map((plan) =>
    `<option value="${negocioEsc(plan.id)}">${negocioEsc(plan.nombre)} · ${negocioEsc(negocioImporte(plan.precio_centimos))} · ${negocioEsc(negocioModalidades[plan.modalidad])}</option>`).join('');
  document.getElementById('negocio-selector-cliente').innerHTML = negocioEstado.clientes.map((cliente) =>
    `<option value="${negocioEsc(cliente.id)}">${negocioEsc([cliente.nombre, cliente.apellidos].filter(Boolean).join(' ') || cliente.email)} · ${negocioEsc(cliente.email)}</option>`).join('');
  document.getElementById('negocio-propuesta-error').textContent = '';
  openModal('modal-negocio-propuesta');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireSession()) return;
  document.getElementById('negocio-nuevo').addEventListener('click', () => negocioEditar());
  document.getElementById('negocio-proponer').addEventListener('click', negocioProponer);
  document.getElementById('negocio-plan-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = document.getElementById('negocio-guardar');
    const errorEl = document.getElementById('negocio-plan-error');
    const precio = negocioCentimos(document.getElementById('negocio-precio').value);
    errorEl.textContent = '';
    if (precio === null) { errorEl.textContent = 'Introduce un importe mayor que cero con hasta dos decimales.'; return; }
    boton.disabled = true;
    try {
      await negocioRpc('negocio_guardar_plan', {
        p_id: negocioEstado.editando, p_nombre: document.getElementById('negocio-nombre').value,
        p_descripcion: document.getElementById('negocio-descripcion').value,
        p_modalidad: document.getElementById('negocio-modalidad').value, p_precio_centimos: precio,
      });
      closeModal('modal-negocio-plan');
      await negocioCargar();
    } catch (error) { errorEl.textContent = `No se pudo guardar el plan: ${error.message}`; }
    finally { boton.disabled = false; }
  });
  document.getElementById('negocio-propuesta-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = document.getElementById('negocio-propuesta-guardar');
    const errorEl = document.getElementById('negocio-propuesta-error');
    errorEl.textContent = '';
    boton.disabled = true;
    try {
      await negocioRpc('negocio_crear_propuesta', {
        p_plan: document.getElementById('negocio-selector-plan').value,
        p_cliente: document.getElementById('negocio-selector-cliente').value,
      });
      closeModal('modal-negocio-propuesta');
      await negocioCargar();
    } catch (error) { errorEl.textContent = `No se pudo preparar la propuesta: ${error.message}`; }
    finally { boton.disabled = false; }
  });
  document.addEventListener('click', async (event) => {
    const boton = event.target.closest('button');
    if (!boton) return;
    const { negocioEditar: editar, negocioArchivar: archivar, negocioRetirar: retirar } = boton.dataset;
    if (editar) {
      const plan = negocioEstado.planes.find((p) => p.id === editar);
      if (plan) negocioEditar(plan);
      return;
    }
    if (!archivar && !retirar) return;
    if (!confirm(archivar ? '¿Archivar este plan? Las propuestas ya creadas se conservarán.' : '¿Retirar esta propuesta borrador?')) return;
    boton.disabled = true;
    try {
      await negocioRpc(archivar ? 'negocio_archivar_plan' : 'negocio_retirar_propuesta', { p_id: archivar || retirar });
      await negocioCargar();
    } catch (error) { document.getElementById('negocio-error').textContent = `No se pudo completar la operación: ${error.message}`; }
    finally { boton.disabled = false; }
  });
  await negocioCargar();
});
