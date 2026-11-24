// Diario alimentario en FitNova Go: página nutricion.html y tarjeta de Inicio.
const goNut = {
  clienteId: null, fecha: null, datos: null, error: '', archivo: null, quitarFoto: false, fotoActual: null,
  aguaPendiente: null, aguaTimer: null, aguaGuardando: Promise.resolve(),
};

async function nutClienteId() {
  if (goNut.clienteId) return goNut.clienteId;
  if (!await requireSessionGo()) return null;
  const { data, error } = await supabaseClient.rpc('cliente_actual_id');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No hay un cliente vinculado a esta cuenta.');
  goNut.clienteId = data;
  return data;
}

function nutChips(nombre, opciones, permitirVacio) {
  const N = FitNovaNutricion;
  return `<div class="chip-select nut-chips" id="nut-${nombre}" data-vacio="${permitirVacio ? '1' : ''}">${opciones.map((o) => (
    `<button type="button" data-value="${o.valor}" onclick="nutElegirChip(this)">${o.icono} ${N.escapar(o.texto)}</button>`
  )).join('')}</div>`;
}

function nutElegirChip(boton) {
  const grupo = boton.closest('.chip-select');
  const estaba = boton.classList.contains('active');
  grupo.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  if (!(estaba && grupo.dataset.vacio)) boton.classList.add('active');
}

function nutValorChip(nombre) {
  const activo = document.querySelector(`#nut-${nombre} button.active`);
  return activo ? activo.dataset.value : '';
}

function nutMarcarChip(nombre, valor) {
  document.querySelectorAll(`#nut-${nombre} button`).forEach((b) => b.classList.toggle('active', b.dataset.value === valor));
}

function asegurarModalComida() {
  if (document.getElementById('modal-comida')) return;
  const N = FitNovaNutricion;
  document.querySelector('.app').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modal-comida">
      <div class="modal">
        <div class="modal-header">
          <h2 id="comida-modal-title">Registrar comida</h2>
          <button class="modal-close" type="button" onclick="closeModal('modal-comida')">✕</button>
        </div>
        <input type="hidden" id="comida-id" />
        <label for="comida-fecha">Fecha</label>
        <input type="date" id="comida-fecha" />
        <label>Tipo de comida</label>
        ${nutChips('tipo', N.COMIDAS, false)}
        <label for="comida-alimentos">¿Qué has comido?</label>
        <textarea id="comida-alimentos" maxlength="1000" placeholder="Ej. 2 tostadas integrales con aguacate y un café con leche"></textarea>
        <label>¿Cómo te has sentido? (opcional)</label>
        ${nutChips('sensacion', N.SENSACIONES, true)}
        <label for="comida-foto-input">Foto del plato (opcional)</label>
        <div class="upload-box act-foto">
          <img id="comida-foto-preview" alt="Foto del plato" hidden />
          <label class="act-foto-elegir" for="comida-foto-input" id="comida-foto-elegir">📷 Subir foto del plato</label>
          <input type="file" id="comida-foto-input" accept="image/jpeg,image/png,image/webp" hidden />
          <button type="button" class="btn-link" id="comida-foto-quitar" onclick="quitarFotoComida()" hidden>Quitar foto</button>
        </div>
        <p id="comida-error" class="sesion-error" role="alert"></p>
        <div class="row" style="margin-top:18px;">
          <button class="btn-secondary" type="button" onclick="closeModal('modal-comida')">Cancelar</button>
          <button class="btn-primary" type="button" id="comida-guardar" onclick="guardarComida()">Guardar</button>
        </div>
        <button id="comida-eliminar" type="button" class="btn-link" onclick="eliminarComidaModal()" style="display:none;margin:14px auto 0;">Eliminar comida</button>
      </div>
    </div>`);
  document.getElementById('comida-foto-input').addEventListener('change', (event) => elegirFotoComida(event.target.files[0]));
}

function comidaError(texto) {
  document.getElementById('comida-error').textContent = texto || '';
}

function mostrarFotoComida(url) {
  const img = document.getElementById('comida-foto-preview');
  img.hidden = !url;
  if (url) img.src = url;
  else img.removeAttribute('src');
  document.getElementById('comida-foto-quitar').hidden = !url;
  document.getElementById('comida-foto-elegir').textContent = url ? '📷 Cambiar foto' : '📷 Subir foto del plato';
}

function elegirFotoComida(archivo) {
  if (!archivo) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    document.getElementById('comida-foto-input').value = '';
    comidaError('Formato no admitido: usa una imagen JPG, PNG o WebP.');
    return;
  }
  comidaError('');
  goNut.archivo = archivo;
  goNut.quitarFoto = false;
  mostrarFotoComida(URL.createObjectURL(archivo));
}

function quitarFotoComida() {
  goNut.archivo = null;
  goNut.quitarFoto = Boolean(goNut.fotoActual);
  document.getElementById('comida-foto-input').value = '';
  mostrarFotoComida(null);
}

// Tipo de comida propuesto según la hora, para registrar más rápido.
function comidaSegunHora() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 13) return 'media_manana';
  if (h < 17) return 'comida';
  if (h < 20) return 'merienda';
  return 'cena';
}

function abrirModalComida(id, fecha) {
  asegurarModalComida();
  const registro = id && goNut.datos ? goNut.datos.comidas.find((c) => c.id === id) : null;
  document.getElementById('comida-id').value = registro ? registro.id : '';
  document.getElementById('comida-modal-title').textContent = registro ? 'Editar comida' : 'Registrar comida';
  const campoFecha = document.getElementById('comida-fecha');
  campoFecha.max = FitNovaNutricion.hoyIso();
  campoFecha.value = registro ? registro.fecha : (fecha || goNut.fecha || FitNovaNutricion.hoyIso());
  nutMarcarChip('tipo', registro ? registro.comida : comidaSegunHora());
  document.getElementById('comida-alimentos').value = registro ? registro.alimentos : '';
  nutMarcarChip('sensacion', registro ? registro.sensacion : '');
  document.getElementById('comida-eliminar').style.display = registro ? 'block' : 'none';
  goNut.archivo = null;
  goNut.quitarFoto = false;
  goNut.fotoActual = registro ? registro.foto_ruta : null;
  document.getElementById('comida-foto-input').value = '';
  mostrarFotoComida(null);
  comidaError('');
  openModal('modal-comida');
  if (registro && registro.foto_ruta) {
    FitNovaNutricion.urlFoto(supabaseClient, registro.foto_ruta).then((url) => {
      if (document.getElementById('comida-id').value === registro.id && !goNut.archivo && !goNut.quitarFoto) mostrarFotoComida(url);
    }).catch(() => comidaError('No se pudo cargar la foto del plato.'));
  }
}

async function guardarComida() {
  const N = FitNovaNutricion;
  const { fila, error } = N.validar({
    fecha: document.getElementById('comida-fecha').value,
    comida: nutValorChip('tipo'),
    alimentos: document.getElementById('comida-alimentos').value,
    sensacion: nutValorChip('sensacion'),
  });
  if (error) return comidaError(error);
  if (fila.fecha > N.hoyIso()) return comidaError('La fecha no puede ser futura.');
  const boton = document.getElementById('comida-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    const clienteId = await nutClienteId();
    await N.guardar(supabaseClient, clienteId, document.getElementById('comida-id').value || null, fila, {
      archivo: goNut.archivo, quitarFoto: goNut.quitarFoto, fotoAnterior: goNut.fotoActual,
    });
    closeModal('modal-comida');
    if (document.getElementById('nut-diario')) goNut.fecha = fila.fecha;
    await cargarNutricion();
  } catch (e) {
    comidaError(`No se pudo guardar la comida: ${e.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function eliminarComida(id) {
  const N = FitNovaNutricion;
  const registro = goNut.datos && goNut.datos.comidas.find((c) => c.id === id);
  if (!registro || !confirm(`¿Eliminar «${N.comida(registro.comida).texto}» de ${N.etiquetaDia(registro.fecha).toLowerCase()}?`)) return false;
  try {
    await N.eliminar(supabaseClient, registro);
  } catch (e) {
    alert(`No se pudo eliminar la comida: ${e.message}`);
    return false;
  }
  await cargarNutricion();
  return true;
}

async function eliminarComidaModal() {
  if (await eliminarComida(document.getElementById('comida-id').value)) closeModal('modal-comida');
}

// ---------- Agua: se guarda unos instantes después del último toque ----------
function cambiarAgua(cambio) {
  if (!goNut.datos) return;
  const N = FitNovaNutricion;
  const fecha = goNut.fecha;
  const actual = goNut.datos.agua[fecha] || 0;
  const nuevo = Math.max(0, Math.min(N.MAX_VASOS, actual + cambio));
  if (nuevo === actual) return;
  goNut.datos.agua[fecha] = nuevo;
  goNut.aguaPendiente = { fecha, vasos: nuevo };
  pintarAgua('Guardando...');
  clearTimeout(goNut.aguaTimer);
  goNut.aguaTimer = setTimeout(guardarAguaPendiente, 600);
}

function guardarAguaPendiente() {
  const pendiente = goNut.aguaPendiente;
  goNut.aguaPendiente = null;
  if (!pendiente) return goNut.aguaGuardando;
  goNut.aguaGuardando = goNut.aguaGuardando.then(async () => {
    try {
      await FitNovaNutricion.guardarAgua(supabaseClient, pendiente.fecha, pendiente.vasos);
      if (!goNut.aguaPendiente) pintarAgua('Guardado ✓');
    } catch (e) {
      pintarAgua(`No se pudo guardar el agua: ${e.message}`, true);
    }
  });
  return goNut.aguaGuardando;
}

function pintarAgua(estado, esError) {
  const cont = document.getElementById('nut-agua');
  if (!cont || !goNut.datos) return;
  const vasos = goNut.datos.agua[goNut.fecha] || 0;
  document.getElementById('nut-agua-numero').textContent = vasos;
  document.getElementById('nut-agua-vasos').textContent = vasos ? '💧'.repeat(Math.min(vasos, 12)) + (vasos > 12 ? ' +' : '') : 'Aún sin registrar';
  document.getElementById('nut-agua-menos').disabled = vasos <= 0;
  document.getElementById('nut-agua-mas').disabled = vasos >= FitNovaNutricion.MAX_VASOS;
  const aviso = document.getElementById('nut-agua-estado');
  aviso.textContent = estado || '';
  aviso.classList.toggle('sesion-error', Boolean(esError));
  document.getElementById('nut-resumen').textContent = FitNovaNutricion.resumenDia(goNut.datos.comidas, vasos);
}

window.addEventListener('pagehide', () => {
  if (goNut.aguaPendiente) {
    clearTimeout(goNut.aguaTimer);
    guardarAguaPendiente();
  }
});

// ---------- Página del diario ----------
function cambiarDiaNutricion(cambio) {
  const N = FitNovaNutricion;
  const nueva = N.sumarDias(goNut.fecha, cambio);
  if (nueva > N.hoyIso()) return;
  if (goNut.aguaPendiente) {
    clearTimeout(goNut.aguaTimer);
    guardarAguaPendiente();
  }
  goNut.fecha = nueva;
  cargarNutricion();
}

function irAHoyNutricion() {
  goNut.fecha = FitNovaNutricion.hoyIso();
  cargarNutricion();
}

async function cargarNutricion() {
  const N = FitNovaNutricion;
  if (!goNut.fecha) goNut.fecha = N.hoyIso();
  const fecha = goNut.fecha;
  if (document.getElementById('nut-diario')) pintarCargandoDiario();
  try {
    const clienteId = await nutClienteId();
    if (!clienteId) return;
    await goNut.aguaGuardando;
    const datos = await N.consultar(supabaseClient, clienteId, fecha, fecha);
    if (fecha !== goNut.fecha) return;
    goNut.datos = datos;
    goNut.error = '';
  } catch (e) {
    goNut.datos = null;
    goNut.error = `No se pudo cargar tu diario: ${e.message}. Revisa tu conexión y recarga la página.`;
  }
  if (document.getElementById('nut-diario')) pintarDiario();
  if (document.getElementById('inicio-nutricion-texto')) pintarInicioNutricion();
}

function pintarCargandoDiario() {
  const N = FitNovaNutricion;
  const hoy = N.hoyIso();
  document.getElementById('nut-dia-titulo').textContent = N.etiquetaDia(goNut.fecha, hoy);
  document.getElementById('nut-dia-fecha').textContent = goNut.fecha === hoy || goNut.fecha === N.sumarDias(hoy, -1) ? N.fechaLarga(goNut.fecha) : '';
  document.getElementById('nut-dia-siguiente').disabled = goNut.fecha >= hoy;
  document.getElementById('nut-dia-hoy').hidden = goNut.fecha === hoy;
  document.getElementById('nut-error').textContent = '';
  document.getElementById('nut-comidas').innerHTML = '<p class="agenda-empty">Cargando tu diario...</p>';
}

function pintarDiario() {
  const N = FitNovaNutricion;
  const error = document.getElementById('nut-error');
  error.textContent = goNut.error;
  document.getElementById('nut-agua').hidden = Boolean(goNut.error);
  document.getElementById('nut-comentarios-bloque').hidden = true;
  if (goNut.error) {
    document.getElementById('nut-comidas').innerHTML = '';
    document.getElementById('nut-resumen').textContent = '';
    return;
  }
  const { comidas, comentarios } = goNut.datos;
  pintarAgua('');
  document.getElementById('nut-comidas').innerHTML = comidas.length ? comidas.map((c) => {
    const tipo = N.comida(c.comida);
    const sens = N.sensacion(c.sensacion);
    return `
      <article class="nut-comida">
        <div class="nut-comida-info" onclick="abrirModalComida('${c.id}')">
          <strong>${tipo.icono} ${N.escapar(tipo.texto)}${sens ? ` <span class="nut-sensacion" title="Me he sentido: ${N.escapar(sens.texto)}">${sens.icono}</span>` : ''}</strong>
          <p>${N.escapar(c.alimentos)}</p>
          ${c.foto_ruta ? `<img class="nut-foto" data-ruta="${N.escapar(c.foto_ruta)}" alt="Foto del plato" hidden />` : ''}
        </div>
        <button class="day-activity-delete" type="button" onclick="eliminarComida('${c.id}')" title="Eliminar comida">🗑</button>
      </article>`;
  }).join('') : '<p class="agenda-empty">No hay comidas registradas este día. Pulsa «+ Añadir comida» para empezar.</p>';
  document.querySelectorAll('#nut-comidas .nut-foto').forEach((img) => {
    N.urlFoto(supabaseClient, img.dataset.ruta).then((url) => { img.src = url; img.hidden = false; }).catch(() => {});
  });
  const bloque = document.getElementById('nut-comentarios-bloque');
  bloque.hidden = !comentarios.length;
  document.getElementById('nut-comentarios').innerHTML = comentarios.map((c) => `
    <div class="nut-comentario">
      <strong>${N.escapar(c.autor_nombre || 'Tu profesional')} · ${N.escapar(N.rol(c.autor_rol))}</strong>
      <p>${N.escapar(c.texto)}</p>
      <span>${N.escapar(N.horaCorta(c.creado_en))}</span>
    </div>`).join('');
}

// ---------- Tarjeta de Inicio ----------
function pintarInicioNutricion() {
  const N = FitNovaNutricion;
  const texto = document.getElementById('inicio-nutricion-texto');
  if (goNut.error) {
    texto.textContent = goNut.error;
    texto.classList.add('sesion-error');
    return;
  }
  texto.classList.remove('sesion-error');
  const { comidas, agua, comentarios } = goNut.datos;
  const vasos = agua[goNut.fecha] || 0;
  if (!comidas.length && !vasos) texto.textContent = 'Hoy aún no has registrado ninguna comida. Apunta lo que comes y tu profesional podrá orientarte mejor.';
  else texto.textContent = `Hoy: ${N.resumenDia(comidas, vasos)}${comidas.length ? ` (${comidas.map((c) => N.comida(c.comida).texto.toLowerCase()).join(', ')})` : ''}.`;
  if (comentarios.length) texto.textContent += ` 💬 Tienes ${comentarios.length === 1 ? 'un comentario' : `${comentarios.length} comentarios`} de tu profesional.`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('nut-diario') && !document.getElementById('inicio-nutricion-texto')) return;
  const fecha = new URLSearchParams(window.location.search).get('fecha');
  const hoy = FitNovaNutricion.hoyIso();
  goNut.fecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') && fecha <= hoy ? fecha : hoy;
  asegurarModalComida();
  cargarNutricion();
  if (document.getElementById('nut-diario') && new URLSearchParams(window.location.search).get('nueva') === '1') abrirModalComida(null, goNut.fecha);
});
