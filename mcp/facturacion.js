// Geraldine Bot: facturación por WhatsApp y desde Pepito.
// Geraldine timbra en CONTPAQi y le manda el XML (o el PDF) a Pepito por WhatsApp. Aquí se lee el CFDI, se buscan las
// notas que cubre (mismo algoritmo que Facturación en el gestor: diseno/emparejar.js, sin IA) y se arma la propuesta;
// cuando la persona confirma con SÍ, la factura se guarda igual que desde el gestor (colección facturas, notas ligadas,
// etapa "facturada") y pasa sola a Cobranza. Si la factura no tiene nota (orden directa del seguro, p. ej. FLEC), se
// registra como venta directa ya facturada.
const crypto = require('crypto');
const { fb } = require('./firebase');
const datos = require('./datos');
const { PERMISOS } = require('./herramientas');

const DIA = 86400000;
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = datos.norm;
const puedeFacturar = u => !!u && (PERMISOS.facturas || []).includes(u.rol);
const nombreDe = u => (u && (u.nombre || u.email)) || 'Pepito';
// Medianoche de la Ciudad de México (UTC−6 todo el año) del día de esa fecha
const inicioDiaCDMX = ms => { const d = new Date(ms - 6 * 3600000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 6 * 3600000; };
const fechaCorta = ms => new Date(ms).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' });

let emparejarMod = null;
async function emparejador() {
  if (!emparejarMod) emparejarMod = await import('../public/diseno/emparejar.js');
  return emparejarMod;
}

// ── Lectura del CFDI (XML de CONTPAQi) sin DOMParser: los atributos vienen entrecomillados, así basta con expresiones ──
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const sinEntidades = s => String(s).replace(/&(amp|lt|gt|quot|apos);/g, m => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
function etiqueta(xml, nombre, filtro) {
  const re = new RegExp('<(?:[\\w.-]+:)?' + nombre + '\\b([^>]*?)/?>', 'g');
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    m[1].replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k.replace(/^[\w-]+:/, '')] = sinEntidades(v); return ''; });
    if (!filtro || filtro(attrs)) return attrs;
  }
  return null;
}
function etiquetas(xml, nombre) {
  const re = new RegExp('<(?:[\\w.-]+:)?' + nombre + '\\b([^>]*?)/?>', 'g');
  const lista = [];
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    m[1].replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k.replace(/^[\w-]+:/, '')] = sinEntidades(v); return ''; });
    lista.push(attrs);
  }
  return lista;
}

// Mismo resultado que leerCFDI() de diseno/operacion.js
function leerCFDI(texto, nombre = 'XML') {
  const xml = String(texto || '');
  const comp = etiqueta(xml, 'Comprobante');
  if (!comp) throw new Error(nombre + ': no es un CFDI (no trae Comprobante)');
  const tfd = etiqueta(xml, 'TimbreFiscalDigital');
  if (!tfd || !tfd.UUID) throw new Error(nombre + ': no está timbrado (no trae UUID)');
  const tipo = comp.TipoDeComprobante || 'I';
  if (tipo !== 'I') throw new Error(nombre + ': es tipo ' + tipo + ' (solo se suben facturas de ingreso, tipo I)');
  const receptor = etiqueta(xml, 'Receptor') || {};
  const emisor = etiqueta(xml, 'Emisor') || {};
  const impuestos = etiqueta(xml, 'Impuestos', a => a.TotalImpuestosTrasladados != null) || {};
  const conceptos = etiquetas(xml, 'Concepto').map(c => ({
    descripcion: c.Descripcion || '', cantidad: Number(c.Cantidad) || 0, importe: Number(c.Importe) || 0, clave: c.NoIdentificacion || ''
  }));
  const serie = comp.Serie || '', folio = comp.Folio || '';
  return {
    uuid: String(tfd.UUID).toUpperCase(), serie, folio, serieFolio: (serie ? serie + '-' : 'F-') + (folio || String(tfd.UUID).slice(0, 8)),
    fecha: Date.parse(comp.Fecha) || Date.now(), fechaTimbrado: tfd.FechaTimbrado || '',
    subtotal: Number(comp.SubTotal) || 0, descuento: Number(comp.Descuento) || 0,
    iva: Number(impuestos.TotalImpuestosTrasladados) || 0, total: Number(comp.Total) || 0,
    moneda: comp.Moneda || 'MXN', metodoPago: comp.MetodoPago || '', formaPago: comp.FormaPago || '',
    receptorRfc: receptor.Rfc || '', receptorNombre: receptor.Nombre || '', emisorRfc: emisor.Rfc || '',
    conceptos, xmlNombre: nombre, textoCompleto: xml
  };
}

// Los datos que Claude lee de un PDF (o que vienen de un XML) en la forma que guarda el gestor
function normalizarCfdi(c) {
  const fecha = typeof c.fecha === 'number' ? c.fecha : (Date.parse(c.fecha) || Date.now());
  const conceptos = (c.conceptos || []).map(x => ({ descripcion: String(x.descripcion || ''), cantidad: Number(x.cantidad) || 1, importe: Number(x.importe) || 0, clave: String(x.clave || '') }));
  const serie = String(c.serie || ''), folio = String(c.folio || '');
  const total = Number(c.total) || 0;
  const subtotal = Number(c.subtotal) || conceptos.reduce((s, x) => s + x.importe, 0) || total;
  const iva = c.iva != null ? Number(c.iva) || 0 : Math.max(0, Math.round((total - subtotal) * 100) / 100);
  let uuid = String(c.uuid || '').toUpperCase().replace(/[^A-F0-9-]/g, '');
  const sinXml = !/^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/.test(uuid);
  if (sinXml) uuid = 'PDF-' + crypto.createHash('sha1').update([serie, folio, total, c.receptorRfc || c.receptorNombre || ''].join('|')).digest('hex').slice(0, 16).toUpperCase();
  const siniestros = (c.siniestros || []).map(String).filter(Boolean);
  return {
    uuid, serie, folio, serieFolio: c.serieFolio || ((serie ? serie + '-' : 'F-') + (folio || uuid.slice(-8))),
    fecha, fechaTimbrado: c.fechaTimbrado || '', subtotal, descuento: Number(c.descuento) || 0, iva, total,
    moneda: c.moneda || 'MXN', metodoPago: c.metodoPago || '', formaPago: c.formaPago || '',
    receptorRfc: String(c.receptorRfc || '').toUpperCase(), receptorNombre: String(c.receptorNombre || ''), emisorRfc: String(c.emisorRfc || ''),
    conceptos, sinXml, xmlNombre: c.xmlNombre || (sinXml ? 'PDF' : 'XML'),
    textoCompleto: c.textoCompleto || [conceptos.map(x => x.descripcion + ' ' + x.clave).join(' '), siniestros.join(' ')].join(' ')
  };
}

// ── Notas pendientes de facturar, en la forma que pide emparejar() (importes en pesos, items crudos) ──
async function pendientes() {
  const [ne, nv, fs, clientes] = await Promise.all([datos.leer('notasEntrega'), datos.leer('ventas'), datos.leer('facturas'), datos.leer('clientes')]);
  const canceladas = new Set(fs.filter(x => x.estatus === 'cancelada').map(x => x.id));
  const facturable = x => !x.facturaId || canceladas.has(x.facturaId);
  const lista = [];
  ne.forEach(n => {
    if (!facturable(n) || /^cancel/.test(norm(n.etapa))) return;
    lista.push({ clave: 'notasEntrega:' + n.id, col: 'notasEntrega', id: n.id, tipo: 'NE', folio: n.notaId || 'NE', raw: n,
      cliente: n.cliente || '', siniestro: n.siniestro || (n.items || []).map(i => i.siniestro).filter(Boolean).join(' | '),
      piezas: (n.items || []).map(i => i.descripcion).filter(Boolean).join(', '),
      fecha: datos.desdeEntrega(n).fecha ? Date.parse(datos.desdeEntrega(n).fecha) : 0, total: Number(n.total) || 0, items: n.items || [] });
  });
  nv.forEach(v => {
    if (v.fuente === 'nota_entrega' || v.notaEntregaId || /^cancel/.test(norm(v.estatus)) || /^cancel/.test(norm(v.etapa)) || !facturable(v)) return;
    lista.push({ clave: 'ventas:' + v.id, col: 'ventas', id: v.id, tipo: 'NV', folio: v.notaId ? 'NV #' + v.notaId : (v.notaNumero || 'NV'), raw: v,
      cliente: v.clienteNombre || v.cliente || '', siniestro: String(v.siniestros || (v.items || []).map(i => i.numSiniestro).filter(Boolean).join(' | ') || v.numeroReporte || ''),
      piezas: (v.items || []).map(i => i.pedido || i.descripcion).filter(Boolean).join(', ') || v.descripcion || '',
      fecha: datos.desdeVenta(v).fecha ? Date.parse(datos.desdeVenta(v).fecha) : 0, total: Number(v.total) || 0, items: v.items || [] });
  });
  return { lista: lista.filter(x => x.total > 0), facturas: fs, clientes };
}

function clientePor(clientes, nombre, rfc) {
  const r = String(rfc || '').toUpperCase().trim();
  const n = norm(nombre);
  return (r && clientes.find(c => String(c.rfc || '').toUpperCase().trim() === r)) ||
    (n && clientes.find(c => norm(c.razonSocial || c.nombre) === n)) || null;
}

// Qué notas cubre la factura (lo que el gestor muestra antes de guardar)
async function proponer(cfdiCrudo) {
  const cfdi = normalizarCfdi(cfdiCrudo);
  const { emparejar } = await emparejador();
  const { lista, facturas, clientes } = await pendientes();
  const repetida = facturas.find(f => f.uuid === cfdi.uuid && f.estatus !== 'cancelada');
  const cliente = clientePor(clientes, cfdi.receptorNombre, cfdi.receptorRfc);
  const nombreCli = cliente ? (cliente.razonSocial || cliente.nombre) : cfdi.receptorNombre;
  const porClave = new Map(lista.map(r => [r.clave, r]));
  const esDelCliente = n => { const r = porClave.get(n.clave); return !!r && (norm(r.cliente) === norm(nombreCli) || (cliente && clientePor(clientes, r.cliente) === cliente)); };
  const res = emparejar(cfdi, lista.map(r => ({ clave: r.clave, folio: r.folio, cliente: r.cliente, fecha: r.fecha, total: r.total, siniestro: r.siniestro, piezas: r.piezas, items: r.items })), esDelCliente);
  const vista = e => { const r = porClave.get(e.clave); return { clave: e.clave, folio: r.folio, cliente: r.cliente, piezas: r.piezas, siniestro: r.siniestro, total: r.total, razones: (e.razones || []).map(x => x.texto) }; };
  const { textoCompleto, ...limpio } = cfdi;
  return {
    cfdi: limpio, cliente: cliente ? { id: cliente.id, nombre: nombreCli, diasCredito: Number(cliente.diasCredito) >= 0 ? Number(cliente.diasCredito) : 0 } : null,
    repetida: repetida ? { id: repetida.id, serieFolio: repetida.serieFolio } : null,
    elegidas: res.elegidas.map(vista), otras: res.otras.map(vista), suma: res.suma, cuadra: res.cuadra,
    pue: cfdi.metodoPago === 'PUE'
  };
}

// Texto de la propuesta para WhatsApp (sin markdown pesado)
function textoPropuesta(p) {
  const c = p.cfdi;
  const l = ['🧾 *Factura ' + c.serieFolio + '* de ' + (c.receptorNombre || 'sin receptor') + (p.cliente ? '' : ' (no está en Clientes)'),
    pesos(c.total) + ' · ' + fechaCorta(c.fecha) + (c.metodoPago ? ' · ' + c.metodoPago : '') + (c.sinXml ? ' · leída del PDF, sin XML' : '')];
  if (p.repetida) { l.push('', '⚠️ Esta factura ya estaba subida (' + p.repetida.serieFolio + '). No la vuelvo a guardar.'); return l.join('\n'); }
  if (p.elegidas.length) {
    l.push('', 'Notas que cubre:');
    p.elegidas.forEach(e => l.push('• ' + e.folio + ' · ' + (e.piezas || '—').slice(0, 60) + (e.siniestro ? ' · Sin. ' + e.siniestro : '') + ' · ' + pesos(e.total) + (e.razones.length ? ' (' + e.razones.slice(0, 2).join(', ') + ')' : '')));
    l.push(p.cuadra ? '✅ Suma ' + pesos(p.suma) + ', cuadra con la factura' : '⚠️ Suma ' + pesos(p.suma) + ' y la factura es de ' + pesos(c.total) + (p.suma > c.total ? ': sobran notas' : ': falta alguna nota'));
  } else {
    l.push('', 'No encontré notas con ese siniestro, pieza o importe.', 'Si dices SÍ, la registro como *venta directa* (sin nota previa, como las órdenes de FLEC) ya facturada.');
  }
  if (p.otras.length) l.push('Otras posibles: ' + p.otras.slice(0, 3).map(o => o.folio).join(', ') + '. Si va con otra nota, dímelo: "liga la factura a la NE-245".');
  l.push('', 'Crédito: ' + (p.cliente ? p.cliente.diasCredito : 0) + ' días' + (p.pue ? ' · se marca pagada (PUE)' : ''));
  return l.join('\n');
}

// Los argumentos de la herramienta ligar_factura a partir de la propuesta
const argsDe = p => ({ cfdi: p.cfdi, notas: p.elegidas.map(e => e.clave), dias_credito: p.cliente ? p.cliente.diasCredito : 0, pagada: p.pue, venta_directa: !p.elegidas.length });

// ── Guardar: igual que "Guardar factura" en Facturación del gestor ──
async function ligar(usuario, a) {
  if (!puedeFacturar(usuario)) throw new Error('Tu rol no puede subir facturas.');
  const cfdi = normalizarCfdi(a.cfdi || {});
  if (!cfdi.total) throw new Error('La factura no trae total.');
  const { lista, facturas, clientes } = await pendientes();
  const repetida = facturas.find(f => f.uuid === cfdi.uuid && f.estatus !== 'cancelada');
  if (repetida) throw new Error('La factura ' + cfdi.serieFolio + ' ya estaba subida (' + repetida.serieFolio + ').');
  const cliente = clientePor(clientes, cfdi.receptorNombre, cfdi.receptorRfc);
  const nombreCli = cliente ? (cliente.razonSocial || cliente.nombre) : cfdi.receptorNombre;
  const porClave = new Map(lista.map(r => [r.clave, r]));
  const claves = [...new Set((a.notas || []).map(String))];
  const notas = claves.map(k => porClave.get(k) || buscarPorFolio(lista, k)).filter(Boolean);
  const faltan = claves.filter((k, i) => !(porClave.get(k) || buscarPorFolio(lista, k)));
  if (faltan.length) throw new Error('No encontré pendientes de facturar: ' + faltan.join(', ') + '. Puede que ya tengan factura.');
  const quien = nombreDe(usuario);
  const dias = Math.max(0, Number(a.dias_credito != null ? a.dias_credito : (cliente ? cliente.diasCredito : 0)) || 0);
  const pagada = a.pagada != null ? !!a.pagada : cfdi.metodoPago === 'PUE';
  const ahora = Date.now();

  let venta = null;
  if (!notas.length) {
    if (!a.venta_directa) throw new Error('No hay notas para ligar. Si es una orden directa (sin nota), mándala con venta_directa: true.');
    // Orden directa del seguro: la venta nace ya facturada, con las partidas de la factura
    const items = cfdi.conceptos.map(c => ({ pedido: c.descripcion, numSiniestro: siniestroEn(c.descripcion + ' ' + c.clave), precio: c.importe, iva: Math.round(c.importe * (cfdi.subtotal ? cfdi.iva / cfdi.subtotal : 0.16) * 100) / 100, ajuste: 0 }));
    const notaId = String((await fb().leerColeccion('ventas')).reduce((m, v) => Math.max(m, parseInt(String(v.notaId || v.notaNumero || '').replace(/\D/g, ''), 10) || 0), 0) + 1);
    venta = {
      notaId, fecha: cfdi.fecha, clienteId: cliente ? cliente.id : '', clienteNombre: nombreCli, vendedor: '',
      items, siniestros: items.map(i => i.numSiniestro).filter(Boolean).join(' | '),
      subtotal: cfdi.subtotal, ivaTotal: cfdi.iva, ajusteTotal: cfdi.descuento || 0, total: cfdi.total,
      estado: 'pendiente', estatus: 'Entregado', etapa: 'entregada', fuente: 'factura_directa', tieneFactura: true, facturaURL: '',
      seguimiento: [{ etapa: 'entregada', fecha: ahora, por: quien, nota: 'Orden directa facturada con ' + cfdi.serieFolio }],
      creadoPor: quien, createdAt: fb().marcaTiempo()
    };
    const id = await fb().agregar('ventas', venta);
    notas.push({ col: 'ventas', id, tipo: 'NV', folio: 'NV #' + notaId, total: cfdi.total, raw: venta });
  }

  const { textoCompleto, sinXml, ...datosCfdi } = cfdi;
  const factura = Object.assign({}, datosCfdi, {
    sinXml: !!sinXml, clienteId: cliente ? cliente.id : '', clienteNombre: nombreCli,
    notas: notas.map(r => ({ tipo: r.tipo, col: r.col, id: r.id, folio: r.folio, total: r.total })),
    diasCredito: dias, vencimiento: inicioDiaCDMX(cfdi.fecha) + dias * DIA,
    pagos: pagada ? [{ monto: cfdi.total, fecha: cfdi.fecha, forma: cfdi.formaPago || 'PUE', por: quien, nota: 'Pagada al facturar' }] : [],
    saldo: pagada ? 0 : cfdi.total, estatus: pagada ? 'pagada' : 'por_cobrar',
    subidaPor: quien, subidaDesde: 'whatsapp', createdAt: fb().marcaTiempo()
  });
  const facturaId = await fb().agregar('facturas', factura);
  for (const r of notas) {
    await fb().actualizar(r.col, r.id, {
      facturaId, facturaFolio: cfdi.serieFolio, facturaUUID: cfdi.uuid,
      seguimiento: (r.raw.seguimiento || []).concat({ etapa: 'facturada', fecha: ahora, por: quien, nota: cfdi.serieFolio })
    });
  }
  if (cliente && dias !== (Number(cliente.diasCredito) || 0)) await fb().actualizar('clientes', cliente.id, { diasCredito: dias }).catch(() => {});
  datos.olvidarCache();
  return {
    guardada: true, id: facturaId, factura: cfdi.serieFolio, cliente: nombreCli, total: cfdi.total,
    notas_ligadas: notas.map(r => r.folio), venta_directa: !!venta, estatus: factura.estatus,
    vence: pagada ? null : new Date(factura.vencimiento).toISOString().slice(0, 10), dias_credito: dias,
    aviso: 'Las notas pasaron a Facturada; ' + (pagada ? 'quedó pagada.' : 'la factura ya está en Cobranza.')
  };
}
function buscarPorFolio(lista, texto) {
  const t = norm(texto).replace(/[\s#-]+/g, '');
  if (!t) return null;
  return lista.find(r => norm(r.folio).replace(/[\s#-]+/g, '') === t) || null;
}
// Siniestro dentro de un concepto: "SIN. B648770", "SINIESTRO 1060-2026" o un token con letras y números (nunca un año solo)
function siniestroEn(s) {
  const t = String(s || '').toUpperCase();
  const m = t.match(/SIN(?:IESTRO)?\.?\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{4,})/);
  if (m) return m[1];
  const tokens = t.match(/\b[A-Z0-9-]{5,}\b/g) || [];
  return tokens.find(x => /\d/.test(x) && /[A-Z]/.test(x) && !/^(19|20)\d\d$/.test(x)) || tokens.find(x => /^\d{5,}$/.test(x)) || '';
}

// ── Herramientas para Pepito (solo facturación y admin) ──
const CFDI_SCHEMA = {
  type: 'object',
  description: 'Datos de la factura (del XML o leídos del PDF). Copia los valores tal cual; nunca inventes totales ni folios.',
  properties: {
    uuid: { type: 'string', description: 'Folio fiscal (UUID) si aparece' }, serie: { type: 'string' }, folio: { type: 'string' },
    fecha: { type: 'string', description: 'AAAA-MM-DD' }, subtotal: { type: 'number' }, iva: { type: 'number' }, total: { type: 'number' },
    metodoPago: { type: 'string', description: 'PUE o PPD' }, formaPago: { type: 'string' },
    receptorRfc: { type: 'string' }, receptorNombre: { type: 'string', description: 'Razón social del cliente al que se factura' },
    conceptos: { type: 'array', items: { type: 'object', properties: { descripcion: { type: 'string' }, cantidad: { type: 'number' }, importe: { type: 'number', description: 'Importe sin IVA' }, clave: { type: 'string' } }, required: ['descripcion', 'importe'] } },
    siniestros: { type: 'array', items: { type: 'string' }, description: 'Números de siniestro que aparezcan en la factura u observaciones' }
  },
  required: ['total', 'receptorNombre', 'conceptos']
};
const HERRAMIENTAS = [
  {
    name: 'emparejar_factura',
    description: 'Busca qué notas pendientes de facturar cubre una factura (por siniestro, pieza, importe y cliente), sin guardar nada. ' +
      'Úsala con los datos de la factura (de un PDF que te mandaron o que la persona dicte) antes de ligar_factura, y enséñale a la persona las notas encontradas.',
    input_schema: { type: 'object', properties: { cfdi: CFDI_SCHEMA }, required: ['cfdi'], additionalProperties: false }
  },
  {
    name: 'ligar_factura',
    description: 'Guarda la factura en el gestor y la liga a sus notas (pasan a Facturada y la factura entra a Cobranza). ' +
      'notas = claves "notasEntrega:<id>" o "ventas:<id>" tal como las regresa emparejar_factura, o folios como "NE-245". ' +
      'Si la factura no tiene nota (orden directa del seguro, p. ej. FLEC) manda venta_directa: true y se registra la venta ya facturada. ' +
      'Esto se guarda hasta que la persona confirme.',
    input_schema: {
      type: 'object',
      properties: {
        cfdi: CFDI_SCHEMA,
        notas: { type: 'array', items: { type: 'string' } },
        dias_credito: { type: 'number', description: 'Días de crédito; si no lo dicen, los del cliente' },
        pagada: { type: 'boolean', description: 'true si ya está pagada (PUE)' },
        venta_directa: { type: 'boolean' }
      },
      required: ['cfdi'],
      additionalProperties: false
    }
  }
];
const NOMBRES = new Set(HERRAMIENTAS.map(t => t.name));
const ESCRIBE = new Set(['ligar_factura']);

async function llamar(usuario, nombre, a) {
  try {
    if (!puedeFacturar(usuario)) return { error: true, texto: 'Tu rol no puede facturar.' };
    if (nombre === 'emparejar_factura') {
      const p = await proponer(a.cfdi || {});
      return { error: false, texto: JSON.stringify({ factura: p.cfdi.serieFolio, cliente: p.cliente, ya_subida: p.repetida, notas_que_cubre: p.elegidas, otras_posibles: p.otras, suma: p.suma, cuadra: p.cuadra, pue: p.pue,
        siguiente: p.repetida ? 'No la vuelvas a guardar.' : 'Si la persona está de acuerdo, llama ligar_factura con estas claves en notas' + (p.elegidas.length ? '.' : ' o con venta_directa: true si es orden directa.') }) };
    }
    return { error: false, texto: JSON.stringify(await ligar(usuario, a || {})) };
  } catch (e) { return { error: true, texto: e.message }; }
}

module.exports = { leerCFDI, normalizarCfdi, pendientes, proponer, textoPropuesta, argsDe, ligar, puedeFacturar, HERRAMIENTAS, NOMBRES, ESCRIBE, llamar };
