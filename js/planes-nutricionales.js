// Representación compartida de planes semanales asignados.
window.FitNovaPlanesNutricionales = (() => {
  const N = window.FitNovaNutricion;
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const esc = N.escapar;

  function diaFecha(fecha) {
    return new Date(`${fecha}T12:00:00`).getDay() || 7;
  }

  async function consultar(client, clienteId) {
    const { data, error } = await client.from('clientes_planes_nutricionales')
      .select('id,cliente_id,profesional_id,inicio,fin,nombre,descripcion,dias,creado_en')
      .eq('cliente_id', clienteId).order('inicio', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  function diaHtml(dia) {
    const objetivos = [
      dia.kcal ? `${esc(dia.kcal)} kcal/día` : '',
      dia.agua_ml ? `${esc(dia.agua_ml)} ml de agua/día` : '',
    ].filter(Boolean);
    const comidas = dia.comidas.map((c) => {
      const r = c.receta;
      return `<article class="nut-plan-comida">
        <strong>${esc(N.comida(c.tipo).texto)}</strong>
        ${c.texto ? `<p class="nut-plan-texto" style="white-space:pre-line;overflow-wrap:anywhere;">${esc(c.texto)}</p>` : ''}
        ${r ? `<details><summary>${esc(r.titulo)}</summary>
          ${r.descripcion ? `<p class="nut-plan-texto" style="white-space:pre-line;overflow-wrap:anywhere;">${esc(r.descripcion)}</p>` : ''}
          ${r.foto_ruta ? `<img class="nut-plan-foto" data-receta-foto="${esc(r.foto_ruta)}" alt="Foto de ${esc(r.titulo)}" style="max-width:100%;max-height:220px;border-radius:10px;" hidden><span data-receta-foto-error="${esc(r.foto_ruta)}"></span>` : ''}
          <p>${r.raciones ? `${esc(r.raciones)} raciones` : ''}${r.raciones && r.kcal ? ' · ' : ''}${r.kcal ? `${esc(r.kcal)} kcal` : ''}</p>
          <strong>Ingredientes</strong><p class="nut-plan-texto" style="white-space:pre-line;overflow-wrap:anywhere;">${esc(r.ingredientes)}</p>
          <strong>Preparación</strong><p class="nut-plan-texto" style="white-space:pre-line;overflow-wrap:anywhere;">${esc(r.preparacion)}</p></details>` : ''}
      </article>`;
    }).join('');
    return `${objetivos.length ? `<p>Objetivos: ${objetivos.join(' · ')}</p>` : ''}${comidas || '<p>Sin comidas indicadas para este día.</p>'}`;
  }

  async function cargarFotos(client, contenedor) {
    await Promise.all([...contenedor.querySelectorAll('[data-receta-foto]')].map(async (img) => {
      const ruta = img.dataset.recetaFoto;
      const aviso = img.nextElementSibling;
      try {
        const { data, error } = await client.storage.from('recetas-fotos').createSignedUrl(ruta, 3600);
        if (error || !data?.signedUrl) throw new Error(error?.message || 'No se recibió la foto.');
        img.onerror = () => { img.hidden = true; aviso.textContent = 'No se pudo cargar la foto de la receta.'; };
        img.src = data.signedUrl;
        img.hidden = false;
      } catch (e) {
        aviso.textContent = `No se pudo cargar la foto de la receta: ${e.message}`;
      }
    }));
  }

  return { DIAS, diaFecha, consultar, diaHtml, cargarFotos };
})();
