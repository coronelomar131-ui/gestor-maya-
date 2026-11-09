// Empareja una factura de CONTPAQi (CFDI) con las notas pendientes de facturar, sin IA y sin gastar tokens.
// Cada nota recibe puntos por lo que coincide con la factura:
//   • siniestro de la nota escrito en la factura (en conceptos u observaciones)  → lo más fuerte
//   • la pieza de la nota se parece a un concepto (palabras en común, con sinónimos: der/derecho, del/delantero…)
//   • el importe de una partida es igual al de un concepto
//   • mismo cliente (RFC o nombre) y fecha razonable (nota antes de la factura, hasta 120 días)
// Se eligen SOLO las notas de esa factura: las que traen su siniestro y, para completar, la combinación de notas del
// cliente que cuadra con el total (la de más evidencia y menos notas). Si nada cuadra, a lo más una nota por concepto.
// Funciones puras: no tocan la página, así se pueden probar.

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por', 'en', 'a', 'al', 'un', 'una', 'pza', 'pzas', 'pieza', 'piezas', 'servicio', 'refaccion', 'refacciones', 'auto', 'parte', 'no', 'num', 'mod', 'modelo', 'marca']);
const SINONIMOS = {
  der: 'derecho', derecha: 'derecho', rh: 'derecho', dere: 'derecho', izq: 'izquierdo', izquierda: 'izquierdo', lh: 'izquierdo',
  del: 'delantero', delantera: 'delantero', frontal: 'delantero', front: 'delantero', tras: 'trasero', trasera: 'trasero', post: 'trasero', posterior: 'trasero',
  faros: 'faro', calaveras: 'calavera', fascias: 'fascia', defensa: 'fascia', parachoques: 'fascia', espejos: 'espejo', retrovisor: 'espejo',
  cofre: 'cofre', capo: 'cofre', cristal: 'cristal', parabrisas: 'cristal', vw: 'volkswagen', chevy: 'chevrolet', radiadores: 'radiador'
};

export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = s => norm(s).replace(/[^a-z0-9]/g, '');

function palabras(s) {
  return norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(w => w && !VACIAS.has(w) && !(w.length < 2 && !/\d/.test(w)))
    .map(w => SINONIMOS[w] || w);
}

// Siniestros: tokens con letras y números o solo números largos (B84247461, S-0002, 1060-2026…)
export function siniestrosDe(nota) {
  const crudos = [nota.siniestro].concat((nota.items || []).map(i => i.siniestro || i.numSiniestro));
  const vistos = new Set();
  crudos.join(' | ').split(/[|,;\s/]+/).forEach(s => {
    const c = compacto(s);
    if (c.length >= 5 && /\d/.test(c) && !/^0+$/.test(c)) vistos.add(c);
  });
  return [...vistos];
}

// Partidas de la nota con su texto y su importe sin IVA (NE: cantidad × precio; NV: precio de la partida)
function partidasDe(nota) {
  const items = nota.items && nota.items.length ? nota.items : [{ descripcion: nota.piezas, precio: nota.total }];
  return items.map(i => ({
    texto: [i.descripcion || i.pedido || '', i.anio || ''].join(' '),
    importe: i.precioUnit != null ? (Number(i.cantidad) || 1) * (Number(i.precioUnit) || 0) : Number(i.precio) || 0,
    siniestro: compacto(i.siniestro || i.numSiniestro || '')
  }));
}

// Qué tanto de la pieza aparece en el concepto (0 a 1), dando más peso a las palabras raras y a los años
function parecido(pieza, concepto) {
  const p = [...new Set(palabras(pieza))];
  const c = new Set(palabras(concepto));
  if (!p.length || !c.size) return 0;
  let total = 0, comun = 0;
  p.forEach(w => {
    const peso = /^\d{4}$/.test(w) ? 1.5 : w.length >= 6 ? 1.3 : 1;
    total += peso;
    if (c.has(w) || [...c].some(x => x.length >= 5 && w.length >= 5 && (x.startsWith(w) || w.startsWith(x)))) comun += peso;
  });
  return comun / total;
}

const cerca = (a, b) => Math.abs(a - b) < 1 || (b > 0 && Math.abs(a - b) / b < 0.005);

/**
 * @param cfdi        { conceptos:[{descripcion, importe, clave}], subtotal, total, fecha, receptorRfc, receptorNombre, textoCompleto }
 * @param notas       [{ clave, folio, cliente, fecha, total, siniestro, piezas, items }]
 * @param esDelCliente nota => boolean
 * @returns { elegidas:[{clave, puntos, razones[]}], otras:[...], suma, cuadra }
 */
export function emparejar(cfdi, notas, esDelCliente = () => false) {
  const todoFactura = compacto(cfdi.textoCompleto || cfdi.conceptos.map(c => c.descripcion + ' ' + (c.clave || '')).join(' '));
  const conceptos = cfdi.conceptos.map(c => ({ ...c, txt: c.descripcion + ' ' + (c.clave || ''), compacto: compacto(c.descripcion + ' ' + (c.clave || '')) }));
  const fechaF = Number(cfdi.fecha) || Date.now();

  const evaluadas = notas.map(n => {
    let puntos = 0;
    const razones = [];
    const delCliente = esDelCliente(n);
    if (delCliente) { puntos += 25; razones.push({ tipo: 'cliente', texto: 'Mismo cliente' }); }
    // Siniestro escrito en la factura
    const sinHallados = siniestrosDe(n).filter(s => todoFactura.includes(s));
    if (sinHallados.length) { puntos += 100; razones.push({ tipo: 'siniestro', texto: 'Siniestro ' + sinHallados[0].toUpperCase() }); }
    // Piezas e importes contra conceptos
    let mejorPieza = 0, piezaTxt = '', importeIgual = false;
    partidasDe(n).forEach(p => {
      conceptos.forEach(c => {
        const sim = parecido(p.texto, c.txt);
        if (sim > mejorPieza) { mejorPieza = sim; piezaTxt = p.texto.trim(); }
        if (p.importe > 0 && cerca(p.importe, c.importe) && (sim >= 0.34 || delCliente)) importeIgual = true;
      });
    });
    if (mejorPieza >= 0.5) { puntos += Math.round(60 * mejorPieza); razones.push({ tipo: 'pieza', texto: 'Pieza: ' + piezaTxt }); }
    if (importeIgual) { puntos += 30; razones.push({ tipo: 'importe', texto: 'Mismo importe' }); }
    // Fecha: la nota debe ser de antes de la factura y no muy vieja
    const dias = n.fecha ? (fechaF - n.fecha) / 86400000 : null;
    // Más cerca de la fecha de la factura, más puntos (desempata entre notas iguales)
    if (dias != null && dias >= -1 && dias <= 120) puntos += 8 * (1 - Math.max(0, dias) / 120);
    const posterior = dias != null && dias < -1; // una factura no cubre ventas que todavía no existían
    if (posterior) { puntos -= 40; razones.push({ tipo: 'fecha', texto: 'Es de después de la factura' }); }
    return { clave: n.clave, total: Number(n.total) || 0, puntos, razones, delCliente, posterior, fuerte: sinHallados.length > 0 };
  });

  const UMBRAL = 60;
  const BASE = 33; // lo que cualquier nota del cliente trae solo por ser suya y de fecha razonable
  const hayCliente = evaluadas.some(e => e.delCliente);
  const sumaDe = lista => lista.reduce((s, e) => s + e.total, 0);
  const cuadraCon = s => cerca(s, cfdi.total) || cerca(s, cfdi.subtotal);
  const conPrueba = e => e.razones.some(r => r.tipo === 'pieza' || r.tipo === 'importe');

  // 1) Las que traen un siniestro escrito en la factura son de esa factura
  const fuertes = evaluadas.filter(e => !e.posterior && e.fuerte);
  let elegidas = fuertes.slice();

  // 2) Si no cuadra, la combinación (hasta 6 notas) del cliente que completa el total con más evidencia y menos notas
  if (!cuadraCon(sumaDe(elegidas))) {
    const base = new Set(elegidas.map(e => e.clave));
    const pool = evaluadas
      .filter(e => !e.posterior && !base.has(e.clave) && e.total > 0 && (e.delCliente || (!hayCliente && e.puntos >= 90)))
      .sort((a, b) => b.puntos - a.puntos).slice(0, 20);
    const fijo = sumaDe(elegidas), tope = Math.max(cfdi.total, cfdi.subtotal) + 1;
    const valor = e => e.puntos - BASE - 6; // evidencia propia; cada nota de más cuesta un poco
    let mejor = null, mejorValor = -Infinity;
    const buscar = (i, actual, suma, val) => {
      if (actual.length && cuadraCon(fijo + suma)) {
        if (val > mejorValor + 1e-9 || (Math.abs(val - mejorValor) < 1e-9 && actual.length < mejor.length)) { mejor = actual.slice(); mejorValor = val; }
        return;
      }
      if (actual.length >= 6 || i >= pool.length || fijo + suma > tope) return;
      actual.push(pool[i]); buscar(i + 1, actual, suma + pool[i].total, val + valor(pool[i])); actual.pop();
      buscar(i + 1, actual, suma, val);
    };
    buscar(0, [], 0, 0);
    if (mejor) {
      mejor.forEach(e => { if (!conPrueba(e)) e.razones.push({ tipo: 'suma', texto: 'Completa el total' }); elegidas.push(e); });
    } else if (!fuertes.length) {
      // 3) Nada cuadra: a lo más una nota por concepto, solo las de mucha evidencia; lo demás queda en "otras posibles"
      const usadas = new Set();
      pool.filter(e => e.puntos >= UMBRAL && conPrueba(e)).forEach(e => {
        if (usadas.size < cfdi.conceptos.length && sumaDe(elegidas) + e.total <= tope) { elegidas.push(e); usadas.add(e.clave); }
      });
    }
  }

  elegidas.sort((a, b) => b.puntos - a.puntos);
  const elegidasSet = new Set(elegidas.map(e => e.clave));
  const otras = evaluadas.filter(e => !elegidasSet.has(e.clave) && (e.puntos >= 25 || e.delCliente)).sort((a, b) => b.puntos - a.puntos).slice(0, 8);
  const suma = sumaDe(elegidas);
  return { elegidas, otras, suma, cuadra: cuadraCon(suma) };
}
