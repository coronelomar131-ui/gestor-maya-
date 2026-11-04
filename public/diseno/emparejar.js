// Empareja una factura de CONTPAQi (CFDI) con las notas pendientes de facturar, sin IA y sin gastar tokens.
// Cada nota recibe puntos por lo que coincide con la factura:
//   • siniestro de la nota escrito en la factura (en conceptos u observaciones)  → lo más fuerte
//   • la pieza de la nota se parece a un concepto (palabras en común, con sinónimos: der/derecho, del/delantero…)
//   • el importe de una partida es igual al de un concepto
//   • mismo cliente (RFC o nombre) y fecha razonable (nota antes de la factura, hasta 120 días)
// Se eligen las notas que pasan el umbral; si no alcanza, se busca la combinación de notas del cliente que suma el total.
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
    if (dias != null && dias >= -1 && dias <= 120) puntos += 8;
    const posterior = dias != null && dias < -1; // una factura no cubre ventas que todavía no existían
    if (posterior) { puntos -= 40; razones.push({ tipo: 'fecha', texto: 'Es de después de la factura' }); }
    return { clave: n.clave, total: Number(n.total) || 0, puntos, razones, delCliente, posterior, fuerte: sinHallados.length > 0 };
  });

  const UMBRAL = 60;
  // Una nota de otro cliente solo entra si trae el siniestro, salvo que el cliente de la factura no esté en el gestor
  const hayCliente = evaluadas.some(e => e.delCliente);
  let elegidas = evaluadas.filter(e => !e.posterior && e.puntos >= UMBRAL && (e.fuerte || e.delCliente || (!hayCliente && e.puntos >= 90)));
  const sumaDe = lista => lista.reduce((s, e) => s + e.total, 0);
  const cuadraCon = s => cerca(s, cfdi.total) || cerca(s, cfdi.subtotal);

  // Si con lo encontrado no cuadra, busca la combinación de notas del cliente (hasta 5) que suma el total de la factura
  if (!cuadraCon(sumaDe(elegidas))) {
    const base = new Set(elegidas.map(e => e.clave));
    const pool = evaluadas.filter(e => e.delCliente && !e.posterior && !base.has(e.clave) && e.total > 0).sort((a, b) => b.puntos - a.puntos).slice(0, 18);
    const fijo = sumaDe(elegidas);
    let mejor = null;
    const buscar = (i, actual, suma) => {
      if (mejor && mejor.length <= actual.length) return;
      if (actual.length && cuadraCon(fijo + suma)) { mejor = actual.slice(); return; }
      if (actual.length >= 5 || i >= pool.length || fijo + suma > Math.max(cfdi.total, cfdi.subtotal) + 1) return;
      actual.push(pool[i]); buscar(i + 1, actual, suma + pool[i].total); actual.pop();
      buscar(i + 1, actual, suma);
    };
    buscar(0, [], 0);
    if (mejor) mejor.forEach(e => { e.razones.push({ tipo: 'suma', texto: 'Completa el total' }); elegidas.push(e); });
  }

  elegidas.sort((a, b) => b.puntos - a.puntos);
  const elegidasSet = new Set(elegidas.map(e => e.clave));
  const otras = evaluadas.filter(e => !elegidasSet.has(e.clave) && (e.puntos >= 25 || e.delCliente)).sort((a, b) => b.puntos - a.puntos).slice(0, 8);
  const suma = sumaDe(elegidas);
  return { elegidas, otras, suma, cuadra: cuadraCon(suma) };
}
