// Importación de actividades desde archivos de relojes y apps deportivas
// (GPX, TCX, FIT y sus versiones .gz). Se procesa en el navegador: el archivo
// original no se sube; solo se guardan los datos resumidos y, si hay GPS,
// una imagen del recorrido. Requiere js/actividades.js.
window.FitNovaImportar = (() => {
  const MAX_BYTES = 30 * 1024 * 1024;
  const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z en segundos Unix
  const SEMICIRCULO = 180 / 2 ** 31;
  const MAX_PUNTOS = 1500;
  const FORMATO = 'Formato no reconocido. Usa un archivo GPX, TCX o FIT exportado de tu reloj o app.';

  const NOMBRES = [
    [/trail|run|carrera|correr/, 'Carrera'],
    [/bik|cycl|ride|bici|ciclis/, 'Ciclismo'],
    [/hik|sender/, 'Senderismo'],
    [/walk|camin|paseo/, 'Caminata'],
    [/swim|nata/, 'Natación'],
    [/row|remo/, 'Remo'],
    [/train|fitness|strength|gym|fuerza/, 'Entrenamiento'],
  ];
  const DEPORTES_FIT = { 1: 'running', 2: 'cycling', 4: 'fitness', 5: 'swimming', 10: 'training', 11: 'walking', 15: 'rowing', 17: 'hiking' };

  function nombreDeporte(deporte) {
    const t = String(deporte || '').toLowerCase();
    const encontrado = NOMBRES.find(([re]) => re.test(t));
    return encontrado ? encontrado[1] : 'Actividad importada';
  }

  function distanciaM([lat1, lon1], [lat2, lon2]) {
    const r = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
      + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }

  function longitudRuta(puntos) {
    let total = 0;
    for (let i = 1; i < puntos.length; i += 1) total += distanciaM(puntos[i - 1], puntos[i]);
    return total;
  }

  // Tiempo en movimiento: descarta pausas de más de 2 min entre puntos (autopausa).
  function segundosEnMovimiento(tiempos) {
    if (tiempos.length < 2) return null;
    const ordenados = [...tiempos].sort((a, b) => a - b);
    const total = (ordenados[ordenados.length - 1] - ordenados[0]) / 1000;
    let movimiento = 0;
    for (let i = 1; i < ordenados.length; i += 1) {
      const paso = (ordenados[i] - ordenados[i - 1]) / 1000;
      if (paso <= 120) movimiento += paso;
    }
    return movimiento >= total * 0.5 ? movimiento : total;
  }

  async function descomprimir(buffer) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no puede abrir archivos .gz. Descomprímelo antes de importarlo.');
    }
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  // ---------- GPX y TCX (XML) ----------
  const porNombre = (nodo, nombre) => Array.from(nodo.getElementsByTagNameNS('*', nombre));
  const hijo = (nodo, nombre) => (nodo ? Array.from(nodo.children).find((c) => c.localName === nombre) : null);
  const textoHijo = (nodo, nombre) => hijo(nodo, nombre)?.textContent.trim() || '';

  function leerGpx(doc) {
    const puntos = [];
    const tiempos = [];
    porNombre(doc, 'trkpt').concat(porNombre(doc, 'rtept')).forEach((p) => {
      const lat = parseFloat(p.getAttribute('lat'));
      const lon = parseFloat(p.getAttribute('lon'));
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push([lat, lon]);
      const t = Date.parse(textoHijo(p, 'time'));
      if (!Number.isNaN(t)) tiempos.push(t);
    });
    const trk = porNombre(doc, 'trk')[0];
    const metadata = porNombre(doc, 'metadata')[0];
    const inicioMeta = Date.parse(textoHijo(metadata, 'time'));
    const inicio = tiempos.length ? Math.min(...tiempos) : (Number.isNaN(inicioMeta) ? null : inicioMeta);
    return {
      nombre: textoHijo(trk, 'name') || textoHijo(metadata, 'name'),
      deporte: textoHijo(trk, 'type'),
      inicio: inicio == null ? null : new Date(inicio),
      segundos: segundosEnMovimiento(tiempos),
      metros: puntos.length > 1 ? longitudRuta(puntos) : null,
      calorias: null,
      puntos,
    };
  }

  function leerTcx(doc) {
    const actividad = porNombre(doc, 'Activity')[0];
    if (!actividad) throw new Error('El archivo TCX no contiene ninguna actividad.');
    let segundos = 0;
    let metros = 0;
    let calorias = 0;
    const vueltas = porNombre(actividad, 'Lap');
    vueltas.forEach((lap) => {
      segundos += parseFloat(textoHijo(lap, 'TotalTimeSeconds')) || 0;
      metros += parseFloat(textoHijo(lap, 'DistanceMeters')) || 0;
      calorias += parseFloat(textoHijo(lap, 'Calories')) || 0;
    });
    const puntos = [];
    porNombre(actividad, 'Position').forEach((pos) => {
      const lat = parseFloat(textoHijo(pos, 'LatitudeDegrees'));
      const lon = parseFloat(textoHijo(pos, 'LongitudeDegrees'));
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push([lat, lon]);
    });
    const inicio = Date.parse(vueltas[0]?.getAttribute('StartTime') || textoHijo(actividad, 'Id'));
    return {
      nombre: '',
      deporte: actividad.getAttribute('Sport'),
      inicio: Number.isNaN(inicio) ? null : new Date(inicio),
      segundos: segundos || null,
      metros: metros || (puntos.length > 1 ? longitudRuta(puntos) : null),
      calorias: calorias || null,
      puntos,
    };
  }

  // ---------- FIT (binario de Garmin, Polar, Suunto, Coros, Wahoo...) ----------
  const TAMANOS = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4 };

  function leerValor(v, pos, tam, tipo, le) {
    if (TAMANOS[tipo] !== tam) return null; // cadenas, arrays y 64 bits no se necesitan
    let x;
    switch (tipo) {
      case 0: case 2: x = v.getUint8(pos); return x === 0xff ? null : x;
      case 1: x = v.getInt8(pos); return x === 0x7f ? null : x;
      case 3: x = v.getInt16(pos, le); return x === 0x7fff ? null : x;
      case 4: x = v.getUint16(pos, le); return x === 0xffff ? null : x;
      case 5: x = v.getInt32(pos, le); return x === 0x7fffffff ? null : x;
      case 6: x = v.getUint32(pos, le); return x === 0xffffffff ? null : x;
      case 8: x = v.getFloat32(pos, le); return Number.isFinite(x) ? x : null;
      case 9: x = v.getFloat64(pos, le); return Number.isFinite(x) ? x : null;
      case 10: x = v.getUint8(pos); return x || null;
      case 11: x = v.getUint16(pos, le); return x || null;
      case 12: x = v.getUint32(pos, le); return x || null;
      default: return null;
    }
  }

  function leerFit(buffer) {
    const v = new DataView(buffer);
    const cabecera = v.getUint8(0);
    const fin = Math.min(buffer.byteLength, cabecera + v.getUint32(4, true));
    const definiciones = {};
    const sesiones = [];
    const vueltas = [];
    const puntos = [];
    let pos = cabecera;
    try {
      while (pos < fin) {
        const h = v.getUint8(pos);
        pos += 1;
        let local;
        if (h & 0x80) {
          local = (h >> 5) & 0x03; // cabecera de marca de tiempo comprimida
        } else if (h & 0x40) {
          local = h & 0x0f;
          const le = v.getUint8(pos + 1) === 0;
          const global = v.getUint16(pos + 2, le);
          const numCampos = v.getUint8(pos + 4);
          pos += 5;
          const campos = [];
          for (let i = 0; i < numCampos; i += 1, pos += 3) {
            campos.push({ num: v.getUint8(pos), tam: v.getUint8(pos + 1), tipo: v.getUint8(pos + 2) & 0x1f });
          }
          let extra = 0;
          if (h & 0x20) {
            const numDev = v.getUint8(pos);
            pos += 1;
            for (let i = 0; i < numDev; i += 1, pos += 3) extra += v.getUint8(pos + 1);
          }
          definiciones[local] = { le, global, campos, extra };
          continue;
        } else {
          local = h & 0x0f;
        }
        const def = definiciones[local];
        if (!def) throw new Error('sin definición');
        const msg = {};
        def.campos.forEach((c) => {
          msg[c.num] = leerValor(v, pos, c.tam, c.tipo, def.le);
          pos += c.tam;
        });
        pos += def.extra;
        if (def.global === 18) sesiones.push(msg);
        else if (def.global === 19) vueltas.push(msg);
        else if (def.global === 20 && msg[0] != null && msg[1] != null) puntos.push([msg[0] * SEMICIRCULO, msg[1] * SEMICIRCULO]);
      }
    } catch (error) {
      if (!sesiones.length && !vueltas.length) throw new Error('El archivo FIT está dañado o no es compatible.');
    }
    const fuente = sesiones.length ? sesiones : vueltas;
    const sumar = (num, escala) => {
      const valores = fuente.map((m) => m[num]).filter((x) => x != null);
      return valores.length ? valores.reduce((a, b) => a + b, 0) / escala : null;
    };
    const inicios = fuente.map((m) => m[2]).filter((x) => x != null);
    const deporte = sesiones.length ? sesiones[0][5] : vueltas[0]?.[25];
    return {
      nombre: '',
      deporte: DEPORTES_FIT[deporte] || '',
      inicio: inicios.length ? new Date((Math.min(...inicios) + FIT_EPOCH) * 1000) : null,
      segundos: sumar(8, 1000) ?? sumar(7, 1000),
      metros: sumar(9, 100) ?? (puntos.length > 1 ? longitudRuta(puntos) : null),
      calorias: sumar(11, 1),
      puntos,
    };
  }

  function simplificar(puntos) {
    if (puntos.length <= MAX_PUNTOS) return puntos;
    const salto = puntos.length / MAX_PUNTOS;
    const res = [];
    for (let i = 0; i < MAX_PUNTOS; i += 1) res.push(puntos[Math.floor(i * salto)]);
    res.push(puntos[puntos.length - 1]);
    return res;
  }

  function resumir(d) {
    const minutos = d.segundos ? Math.max(1, Math.round(d.segundos / 60)) : null;
    const km = d.metros ? Math.round(d.metros / 10) / 100 : null;
    if (!minutos && !km) throw new Error('El archivo no tiene duración ni distancia: no parece una actividad grabada.');
    const inicio = d.inicio && !Number.isNaN(d.inicio.getTime()) ? new Date(Math.round(d.inicio.getTime() / 1000) * 1000) : null;
    const calorias = d.calorias ? Math.round(d.calorias) : null;
    return {
      nombre: (d.nombre || nombreDeporte(d.deporte)).slice(0, 120),
      fecha: inicio ? window.FitNovaActividades.fechaLocal(inicio) : null,
      inicio: inicio ? inicio.toISOString() : null,
      duracion_min: minutos,
      distancia_km: km > 0 ? km : null,
      calorias_kcal: calorias >= 1 && calorias <= 20000 ? calorias : null,
      puntos: simplificar(d.puntos || []),
    };
  }

  // Analiza el contenido (ArrayBuffer) de un archivo GPX, TCX, FIT o .gz.
  async function analizar(buffer) {
    let datos = buffer;
    let bytes = new Uint8Array(datos);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      datos = await descomprimir(datos);
      bytes = new Uint8Array(datos);
    }
    if (bytes.length > 12 && String.fromCharCode(...bytes.slice(8, 12)) === '.FIT') return resumir(leerFit(datos));
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(FORMATO);
    const raiz = doc.documentElement.localName;
    if (raiz === 'gpx') return resumir(leerGpx(doc));
    if (raiz === 'TrainingCenterDatabase') return resumir(leerTcx(doc));
    throw new Error(FORMATO);
  }

  async function leer(archivo) {
    if (!archivo) throw new Error('No se ha elegido ningún archivo.');
    if (archivo.size > MAX_BYTES) throw new Error('El archivo es demasiado grande (máximo 30 MB).');
    return analizar(await archivo.arrayBuffer());
  }

  // Dibuja el recorrido (sin mapa de fondo) y lo devuelve como archivo JPEG, o null si no hay GPS.
  function imagenRuta(puntos, pie = '') {
    if (!puntos || puntos.length < 2) return Promise.resolve(null);
    const ancho = 800;
    const alto = 600;
    const margen = 60;
    const k = Math.cos((puntos.reduce((s, p) => s + p[0], 0) / puntos.length) * (Math.PI / 180));
    const xs = puntos.map((p) => p[1] * k);
    const ys = puntos.map((p) => p[0]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (maxX - minX < 1e-6 && maxY - minY < 1e-6) return Promise.resolve(null);
    const escala = Math.min((ancho - 2 * margen) / ((maxX - minX) || 1e-9), (alto - 2 * margen) / ((maxY - minY) || 1e-9));
    const offX = (ancho - (maxX - minX) * escala) / 2;
    const offY = (alto - (maxY - minY) * escala) / 2;
    const punto = (i) => [offX + (xs[i] - minX) * escala, alto - (offY + (ys[i] - minY) * escala)];

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a1a2f';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ancho; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, alto); ctx.stroke(); }
    for (let y = 0; y <= alto; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke(); }
    ctx.strokeStyle = '#ff7a1a';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    xs.forEach((_, i) => (i ? ctx.lineTo(...punto(i)) : ctx.moveTo(...punto(i))));
    ctx.stroke();
    [[0, '#2ecc71'], [xs.length - 1, '#e74c3c']].forEach(([i, color]) => {
      ctx.beginPath();
      ctx.arc(...punto(i), 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(pie ? `FitNova Go · ${pie}` : 'FitNova Go', 20, alto - 20);
    return new Promise((resolve) => canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], 'ruta.jpg', { type: 'image/jpeg' }) : null),
      'image/jpeg',
      0.85,
    ));
  }

  return { leer, analizar, imagenRuta, nombreDeporte };
})();
