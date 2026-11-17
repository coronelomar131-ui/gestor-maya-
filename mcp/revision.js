// Revisión con IA de los pasos delicados (Geraldine Bot: qué notas cubre una factura).
// El emparejador sin IA (diseno/emparejar.js) propone; Claude lee la factura completa y las notas candidatas y dice si la
// propuesta es correcta o qué notas deberían ir. Lo que Claude sugiere NO se acepta a ciegas: el servidor vuelve a sumar y
// solo lo usa si cuadra con el total de la factura. Si no hay API de Claude o falla, se queda la propuesta del emparejador.
const MODELO = () => process.env.PEPITO_MODELO || 'claude-sonnet-5-5';

let clienteExterno = null;
function cliente() {
  if (clienteExterno) return clienteExterno;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const C = Anthropic.default || Anthropic;
  clienteExterno = new C();
  return clienteExterno;
}

const ESQUEMA = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: ['correcta', 'ajustar', 'dudosa', 'sin_nota'] },
    notas: { type: 'array', items: { type: 'string' }, description: 'Claves de las notas que cubre la factura' },
    explicacion: { type: 'string', description: 'Dos o tres frases: por qué esas notas (siniestro, pieza, importe)' },
    alertas: { type: 'array', items: { type: 'string' }, description: 'Lo que la persona debe revisar antes de guardar' }
  },
  required: ['veredicto', 'notas', 'explicacion', 'alertas'],
  additionalProperties: false
};

const SISTEMA = [
  'Eres el revisor de facturación de Maya Autopartes (refaccionaria en la Ciudad de México). Tu trabajo es evitar que una factura se ligue a las notas equivocadas.',
  'Recibes una factura timbrada en CONTPAQi (conceptos, importes sin IVA, total, receptor, observaciones) y notas pendientes de facturar del gestor con su clave, folio, cliente, siniestro, piezas, total con IVA y fecha.',
  'Decide qué notas cubre la factura. Reglas, en este orden:',
  '1. Un siniestro escrito en la factura (concepto u observaciones) que coincide con el de una nota es la prueba más fuerte.',
  '2. Cada concepto debe corresponder a una pieza de alguna nota elegida (sin importar abreviaturas: DER = derecho, DEL = delantero, etc.).',
  '3. La suma de los totales de las notas elegidas debe ser igual al total de la factura (o al subtotal si las notas no llevan IVA). Una diferencia mayor a $1 es un error.',
  '4. Las notas deben ser del mismo cliente que la factura (por nombre o RFC) y de antes de la fecha de la factura.',
  '5. Si dos notas son casi idénticas (misma pieza y monto), elige la que trae el siniestro de la factura o la más cercana en fecha, y menciónalo en alertas.',
  'Veredicto: "correcta" si la propuesta del emparejador ya cumple todo; "ajustar" si otras notas cumplen mejor (da su lista completa); "dudosa" si ninguna combinación cumple: deja en notas la mejor que veas y explica qué falta; "sin_nota" si ninguna nota corresponde (orden directa del seguro) y deja notas vacío.',
  'Usa solo claves que vengan en la lista. No inventes notas, montos ni siniestros. Contesta en español de México.'
].join('\n');

const cerca = (a, b) => Math.abs(a - b) < 1 || (b > 0 && Math.abs(a - b) / b < 0.005);

// propuesta = resultado de facturacion.proponer(); candidatas = [{clave, folio, cliente, siniestro, piezas, total, fecha}]
async function revisarFactura(cfdi, propuesta, candidatas, opciones = {}) {
  const cli = opciones.cliente || cliente();
  if (!cli) return { disponible: false };
  const lista = candidatas.slice(0, 40);
  const porClave = new Map(lista.map(c => [c.clave, c]));
  const entrada = {
    factura: {
      folio: cfdi.serieFolio, fecha: new Date(cfdi.fecha).toISOString().slice(0, 10), receptor: cfdi.receptorNombre, rfc: cfdi.receptorRfc,
      subtotal: cfdi.subtotal, iva: cfdi.iva, total: cfdi.total, metodo_pago: cfdi.metodoPago,
      conceptos: (cfdi.conceptos || []).map(c => ({ descripcion: c.descripcion, cantidad: c.cantidad, importe_sin_iva: c.importe, clave: c.clave })),
      observaciones_y_siniestros: String(cfdi.textoCompleto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500)
    },
    propuesta_del_emparejador: { notas: propuesta.elegidas.map(e => e.clave), suma: propuesta.suma, cuadra: propuesta.cuadra },
    notas_candidatas: lista.map(c => ({ clave: c.clave, folio: c.folio, cliente: c.cliente, siniestro: c.siniestro || '', piezas: c.piezas || '', total: c.total, fecha: c.fecha ? new Date(c.fecha).toISOString().slice(0, 10) : '' }))
  };
  let r;
  try {
    const params = {
      model: MODELO(), max_tokens: 4000, system: SISTEMA,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: 'Revisa esta factura:\n' + JSON.stringify(entrada) }]
    };
    r = await cli.messages.create(params);
  } catch (e) {
    console.error('revisión IA:', e.message);
    return { disponible: true, error: 'La revisión con IA no respondió; se usa la propuesta del emparejador.' };
  }
  if (r.stop_reason === 'refusal') return { disponible: true, error: 'La IA no quiso revisar esta factura; se usa la propuesta del emparejador.' };
  const texto = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let j;
  try { j = JSON.parse(texto); } catch (e) { return { disponible: true, error: 'La revisión con IA no se pudo leer; se usa la propuesta del emparejador.' }; }
  // Lo que dice la IA se verifica aquí: solo claves que existen, y la suma tiene que cuadrar
  const notas = [...new Set((j.notas || []).filter(k => porClave.has(k)))];
  const inventadas = (j.notas || []).filter(k => !porClave.has(k));
  const suma = notas.reduce((s, k) => s + (Number(porClave.get(k).total) || 0), 0);
  const cuadra = notas.length > 0 && (cerca(suma, cfdi.total) || cerca(suma, cfdi.subtotal));
  const misma = notas.length === propuesta.elegidas.length && notas.every(k => propuesta.elegidas.some(e => e.clave === k));
  const alertas = (j.alertas || []).map(String).filter(Boolean).slice(0, 5);
  if (inventadas.length) alertas.push('La IA mencionó notas que no están pendientes; se ignoraron.');
  let usar = 'emparejador';
  if (j.veredicto === 'ajustar' && cuadra && !misma) usar = 'ia';
  else if (j.veredicto === 'ajustar' && !cuadra) alertas.push('La IA sugirió otras notas pero su suma (' + suma.toFixed(2) + ') no cuadra con la factura; se dejó la propuesta del emparejador.');
  return {
    disponible: true, veredicto: j.veredicto, usar, notas, suma, cuadra, misma,
    explicacion: String(j.explicacion || '').slice(0, 600), alertas,
    modelo: r.model || MODELO()
  };
}

module.exports = { revisarFactura, _usarCliente: c => { clienteExterno = c; } };
