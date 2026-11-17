// Herramientas del día a día que se piden por Pepito: registrar pagos, convertir una cotización en venta,
// historial de costos por pieza, comisiones por vendedor y estado de cuenta de un cliente.
const { fb } = require('./firebase');
const datos = require('./datos');
const escritura = require('./escritura');

const { ErrorUsuario } = escritura;
const candados = require('../public/diseno/alertas.js');
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const texto = v => String(v == null ? '' : v).trim();
const DIA = 86400000;
const TZ = 'America/Mexico_City';
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const primera = s => datos.norm(s).split(' ')[0] || '';
const rolDe = u => (u && (u.rolReal || u.rol)) || '';
const esDireccion = u => rolDe(u) === 'admin';
const veTodo = u => ['admin', 'facturacion'].includes(rolDe(u));
const quien = u => texto(u && (u.nombre || u.email)) || 'Usuario';

// Fechas de Firestore (Timestamp, número, texto AAAA-MM-DD) a milisegundos
function ms(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v._seconds != null) return v._seconds * 1000;
  if (v.seconds != null) return v.seconds * 1000;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [a, m, d] = v.split('-').map(Number); return new Date(a, m - 1, d, 12).getTime(); }
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}
const dia = t => t ? new Date(t).toLocaleDateString('en-CA', { timeZone: TZ }) : null;
const diaCorto = t => t ? new Date(t).toLocaleDateString('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const hoyCero = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const inicioDia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const desdeHasta = (a) => ({
  desde: a.desde ? ms(a.desde) - 12 * 3600000 : 0,
  hasta: a.hasta ? ms(a.hasta) + 12 * 3600000 - 1 : Infinity
});
const cancelada = v => /^cancel/.test(datos.norm(v.estatus)) || v.estado === 'cancelada';

// ══════════════ 1. Registrar pago de una factura (igual que Cobranza → Registrar pago) ══════════════
const folioNorm = s => datos.norm(s).replace(/[\s-]/g, '');
async function buscarFactura(a) {
  if (a.id) {
    const f = await fb().obtener('facturas', a.id);
    if (!f) throw new ErrorUsuario('No existe una factura con id ' + a.id);
    return Object.assign({ id: a.id }, f);
  }
  const todas = await fb().leerColeccion('facturas');
  const q = folioNorm(a.factura);
  const num = String(a.factura || '').replace(/\D/g, '');
  let hallazgos = q ? todas.filter(f => folioNorm(f.serieFolio) === q) : [];
  if (!hallazgos.length && num) hallazgos = todas.filter(f => String(f.serieFolio || '').replace(/\D/g, '') === num);
  if (a.cliente) hallazgos = hallazgos.filter(f => datos.norm(f.clienteNombre || f.receptorNombre).includes(datos.norm(a.cliente)));
  if (!hallazgos.length) {
    if (a.cliente) {
      const delCliente = todas.filter(f => f.estatus === 'por_cobrar' && Number(f.saldo) > 0.009 && datos.norm(f.clienteNombre || f.receptorNombre).includes(datos.norm(a.cliente)));
      if (delCliente.length) throw new ErrorUsuario('No encontré la factura ' + (a.factura || '') + '. ' + texto(a.cliente) + ' tiene por cobrar: ' + delCliente.map(f => f.serieFolio + ' (saldo ' + pesos(f.saldo) + ')').join(', ') + '. ¿A cuál va el pago?');
    }
    throw new ErrorUsuario('No encontré la factura ' + (a.factura || '') + '. Revisa el folio con la herramienta cobranza.');
  }
  if (hallazgos.length > 1) throw new ErrorUsuario('Hay varias facturas con el folio ' + a.factura + ': ' + hallazgos.map(f => f.serieFolio + ' de ' + (f.clienteNombre || f.receptorNombre) + ' (id ' + f.id + ')').join('; ') + '. Usa su id.');
  return hallazgos[0];
}

async function registrarPago(u, a, opciones = {}) {
  const f = await buscarFactura(a);
  if (f.estatus === 'cancelada') throw new ErrorUsuario(f.serieFolio + ' está cancelada; no lleva pagos.');
  const saldo = r2(f.saldo);
  if (saldo <= 0.009) throw new ErrorUsuario(f.serieFolio + ' ya está pagada; no tiene saldo.');
  const monto = r2(a.monto);
  if (!(monto > 0)) throw new ErrorUsuario('El monto del pago debe ser mayor a cero.');
  if (monto - saldo > 0.009) throw new ErrorUsuario('El pago (' + pesos(monto) + ') es mayor que el saldo de ' + f.serieFolio + ' (' + pesos(saldo) + '). Si el cliente pagó varias facturas, regístralo factura por factura.');
  const alertas = candados.revisarPago(f, monto);
  if (opciones.soloRevisar) return { revision: true, alertas, factura: f.serieFolio, cliente: f.clienteNombre || f.receptorNombre, saldo_actual: saldo, saldo_despues: r2(saldo - monto) };
  if (alertas.length && !a.confirmar_alertas) throw new ErrorUsuario('Antes de registrar el pago revisa esto con la persona: ' + alertas.join(' ') + ' Si todo está bien, repite con confirmar_alertas: true.');
  const fecha = a.fecha ? ms(a.fecha) : Date.now();
  const pago = { monto, fecha, forma: a.forma || 'Transferencia', por: quien(u), origen: 'Pepito' };
  if (texto(a.referencia)) pago.nota = texto(a.referencia);
  const nuevo = r2(saldo - monto);
  const pagada = nuevo <= 0.009;
  await fb().actualizar('facturas', f.id, { pagos: (f.pagos || []).concat(pago), saldo: pagada ? 0 : nuevo, estatus: pagada ? 'pagada' : 'por_cobrar' });
  datos.olvidarCache();
  return {
    pago_registrado: true, id: f.id, factura: f.serieFolio, cliente: f.clienteNombre || f.receptorNombre,
    monto, fecha: dia(fecha), forma: pago.forma, referencia: pago.nota || null,
    saldo_anterior: saldo, saldo_nuevo: pagada ? 0 : nuevo, pagada,
    aviso: String(f.metodoPago || '').toUpperCase() === 'PPD' ? 'Es una factura PPD: hay que emitir el complemento de pago en CONTPAQi.' : undefined
  };
}

// ══════════════ 2. Cotización → venta ══════════════
async function buscarCotizacion(a) {
  if (a.id) {
    const c = await fb().obtener('cotizaciones', a.id);
    if (!c) throw new ErrorUsuario('No existe una cotización con id ' + a.id);
    return Object.assign({ id: a.id }, c);
  }
  const num = String(a.folio || '').replace(/\D/g, '');
  if (!num) throw new ErrorUsuario('Indica el folio de la cotización (por ejemplo COT-45) o su id.');
  const h = (await fb().leerColeccion('cotizaciones')).filter(c => String(c.notaId || '') === num);
  if (!h.length) throw new ErrorUsuario('No hay ninguna cotización con el folio COT-' + num + '.');
  if (h.length > 1) throw new ErrorUsuario('Hay varias cotizaciones COT-' + num + '; usa su id: ' + h.map(c => c.id).join(', '));
  return h[0];
}

async function convertirCotizacion(u, a, opciones = {}) {
  const c = await buscarCotizacion(a);
  const folio = 'COT-' + (c.notaId || c.id);
  if (c.estatus === 'vendida' || c.ventaId) throw new ErrorUsuario(folio + ' ya se convirtió en venta' + (c.ventaFolio ? ' (' + c.ventaFolio + ')' : '') + '. Si algo cambió, corrige esa venta.');
  const items = Array.isArray(c.items) ? c.items : [];
  if (!items.length) throw new ErrorUsuario(folio + ' no tiene piezas.');
  const costos = new Map((a.costos || []).map(x => [x.numero, x]));
  (a.costos || []).forEach(x => { if (!items[x.numero - 1]) throw new ErrorUsuario(folio + ' tiene ' + items.length + (items.length === 1 ? ' pieza' : ' piezas') + '; no existe la ' + x.numero + '.'); });
  const partidas = items.map((it, i) => {
    const k = costos.get(i + 1) || {};
    const precio = Number(it.precio) || 0;
    return {
      descripcion: it.pedido || it.descripcion || 'Pieza', siniestro: it.numSiniestro || '',
      precio, iva_porcentaje: precio ? Math.round(((Number(it.iva) || 0) / precio) * 100) : 16, ajuste: Number(it.ajuste) || 0,
      proveedor: k.proveedor, costo: k.costo, costo_desglose: k.costo_desglose
    };
  });
  const venta = await escritura.crearVenta(u, {
    cliente: c.clienteNombre, fecha: a.fecha, forma_pago: a.forma_pago, dias_credito: a.dias_credito, estatus: a.estatus || 'Pendiente',
    vendedor: esDireccion(u) ? (a.vendedor || c.vendedor) : a.vendedor, contacto: a.contacto, impuesto_nota: a.impuesto_nota,
    precio_con_iva: false, // la cotización guarda precios sin IVA
    confirmar_alertas: a.confirmar_alertas,
    partidas
  }, opciones);
  if (opciones.soloRevisar) return Object.assign(venta, { cotizacion: folio });
  await fb().actualizar('cotizaciones', c.id, { estatus: 'vendida', ventaId: venta.creada.id, ventaFolio: venta.creada.folio, vendidaEn: Date.now(), vendidaPor: quien(u) });
  datos.olvidarCache();
  return Object.assign(venta, { cotizacion: folio });
}

// ══════════════ 3. Historial de costos por pieza ══════════════
async function historialCostos(a) {
  const palabras = datos.norm(a.pieza).split(' ').filter(p => p.length > 1);
  if (!palabras.length) throw new ErrorUsuario('Dime qué pieza buscar (por ejemplo "facia versa 2020").');
  const coincide = t => { const n = datos.norm(t); return palabras.every(p => n.includes(p)); };
  const filas = [];
  (await datos.leer('ventas')).forEach(v => {
    if (cancelada(v)) return;
    (Array.isArray(v.items) ? v.items : []).forEach(it => {
      if (it.costo == null || !coincide(it.pedido)) return;
      filas.push({
        fecha: dia(ms(v.fecha) || ms(v.createdAt)), origen: 'venta NV #' + (v.notaId || v.notaNumero || ''), pieza: it.pedido,
        proveedor: it.proveedor || null, costo: r2(it.costo), costo_desglose: it.costoDesglose || null,
        vendida_en: r2((Number(it.precio) || 0) + (Number(it.iva) || 0)), cliente: v.clienteNombre || null
      });
    });
  });
  (await datos.leer('compras')).forEach(c => {
    (Array.isArray(c.articulos) ? c.articulos : []).forEach(ar => {
      if (!coincide(ar.pieza)) return;
      filas.push({
        fecha: dia(ms(c.fecha) || ms(c.createdAt)), origen: 'compra', pieza: ar.pieza, proveedor: c.proveedor || null,
        costo: r2(ar.costoUnitario), costo_desglose: 'costo unitario de compra', vendida_en: ar.precioVenta ? r2(ar.precioVenta) : null, cliente: null
      });
    });
  });
  filas.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  const costosNum = filas.map(f => f.costo).filter(n => n > 0);
  const porProveedor = {};
  filas.forEach(f => {
    const p = f.proveedor || 'Sin proveedor';
    if (!porProveedor[p]) porProveedor[p] = { proveedor: p, veces: 0, ultimo_costo: f.costo, ultima_fecha: f.fecha };
    porProveedor[p].veces++;
  });
  return {
    pieza: a.pieza, encontradas: filas.length,
    resumen: costosNum.length ? {
      ultimo: filas[0], costo_minimo: Math.min(...costosNum), costo_maximo: Math.max(...costosNum),
      costo_promedio: r2(costosNum.reduce((s, n) => s + n, 0) / costosNum.length)
    } : null,
    por_proveedor: Object.values(porProveedor).sort((x, y) => String(y.ultima_fecha).localeCompare(String(x.ultima_fecha))),
    historial: filas.slice(0, a.limite || 15),
    nota: filas.length ? 'El costo de una venta es el costo total de la partida (pieza + guía + paquetería + logística); el de una compra es el costo unitario.' : 'No hay costos registrados para esa pieza. Los costos se guardan en cada venta desde que se pide proveedor y costo.'
  };
}

// ══════════════ 4. Comisiones ══════════════
// config/comisiones = { vendedores: { <primer nombre normalizado>: { nombre, porcentaje } } }
async function leerComisiones() { return (await fb().obtener('config', 'comisiones')) || { vendedores: {} }; }

async function configurarComision(u, a) {
  if (!esDireccion(u)) throw new ErrorUsuario('Solo Dirección define el porcentaje de comisión.');
  const clave = primera(a.vendedor);
  if (!clave) throw new ErrorUsuario('Dime de qué vendedor es la comisión.');
  const pct = Number(a.porcentaje);
  if (!(pct >= 0 && pct <= 100)) throw new ErrorUsuario('El porcentaje debe estar entre 0 y 100.');
  const cfg = await leerComisiones();
  const vendedores = Object.assign({}, cfg.vendedores || {});
  const antes = vendedores[clave] ? vendedores[clave].porcentaje : null;
  vendedores[clave] = { nombre: texto(a.vendedor), porcentaje: pct, actualizado: Date.now(), por: quien(u) };
  await fb().guardar('config', 'comisiones', Object.assign({}, cfg, { vendedores }));
  return { vendedor: texto(a.vendedor), porcentaje_antes: antes, porcentaje: pct, base: 'utilidad (lo que pagó el cliente con IVA − costo total)' };
}

// Ventas que cuentan para comisión, con su utilidad: vigentes, con costo de todas sus piezas
function utilidadVenta(v) {
  const items = Array.isArray(v.items) ? v.items : [];
  if (!items.length || !items.every(i => i.costo != null)) return null;
  if (v.utilidad != null && v.costoCompleto !== false) return r2(v.utilidad);
  const total = Number(v.total) || 0;
  return r2(total - items.reduce((s, i) => s + (Number(i.costo) || 0), 0));
}

async function ventasDeComision(u, a) {
  const { desde, hasta } = desdeHasta(a);
  const propio = veTodo(u) ? '' : primera(u.nombre || u.email);
  const filtro = propio || primera(a.vendedor);
  return (await fb().leerColeccion('ventas')).filter(v => {
    if (cancelada(v)) return false;
    const t = ms(v.fecha) || ms(v.createdAt);
    if (t < desde || t > hasta) return false;
    return !filtro || primera(v.vendedor) === filtro;
  });
}

async function comisiones(u, a) {
  const cfg = await leerComisiones();
  const pctDe = nombre => { const c = (cfg.vendedores || {})[primera(nombre)]; return c ? Number(c.porcentaje) : null; };
  const grupos = new Map();
  const sinCosto = [];
  (await ventasDeComision(u, a)).forEach(v => {
    const nombre = texto(v.vendedor) || 'Sin vendedor';
    const clave = primera(nombre) || 'sin';
    const g = grupos.get(clave) || { vendedor: nombre, porcentaje: pctDe(nombre), ventas: 0, utilidad_por_pagar: 0, utilidad_pagada: 0, comision_pagada: 0 };
    const ut = utilidadVenta(v);
    if (ut == null) { sinCosto.push({ folio: 'NV #' + (v.notaId || ''), vendedor: nombre, cliente: v.clienteNombre || '' }); grupos.set(clave, g); return; }
    g.ventas++;
    if (v.comisionPagada) { g.utilidad_pagada += ut; g.comision_pagada += Number(v.comisionPagada.monto) || 0; }
    else g.utilidad_por_pagar += ut;
    grupos.set(clave, g);
  });
  const lista = [...grupos.values()].map(g => ({
    vendedor: g.vendedor, porcentaje: g.porcentaje, ventas_con_costo: g.ventas,
    utilidad_por_pagar: r2(g.utilidad_por_pagar),
    comision_por_pagar: g.porcentaje == null ? null : r2(Math.max(0, g.utilidad_por_pagar) * g.porcentaje / 100),
    ya_pagado: r2(g.comision_pagada)
  })).sort((x, y) => (y.comision_por_pagar || 0) - (x.comision_por_pagar || 0));
  const faltaPct = lista.filter(g => g.porcentaje == null).map(g => g.vendedor);
  return {
    periodo: { desde: a.desde || null, hasta: a.hasta || null },
    por_vendedor: lista,
    total_por_pagar: r2(lista.reduce((s, g) => s + (g.comision_por_pagar || 0), 0)),
    ventas_sin_costo: sinCosto.length, sin_costo: sinCosto.slice(0, 20),
    aviso: faltaPct.length ? 'Falta definir el porcentaje de comisión de: ' + faltaPct.join(', ') + ' (Dirección lo pone con configurar_comision).' : undefined,
    nota: 'Comisión = utilidad × porcentaje del vendedor. Utilidad = lo que pagó el cliente (con IVA) − costo total. Las ventas sin costo no cuentan hasta que se corrijan.'
  };
}

async function marcarComisionesPagadas(u, a) {
  if (!esDireccion(u)) throw new ErrorUsuario('Solo Dirección marca comisiones como pagadas.');
  if (!texto(a.vendedor)) throw new ErrorUsuario('Dime de qué vendedor son las comisiones.');
  const cfg = await leerComisiones();
  const c = (cfg.vendedores || {})[primera(a.vendedor)];
  if (!c) throw new ErrorUsuario('Primero define el porcentaje de comisión de ' + a.vendedor + ' con configurar_comision.');
  const pct = Number(c.porcentaje);
  const ventas = (await ventasDeComision(u, a)).filter(v => !v.comisionPagada && utilidadVenta(v) != null);
  if (!ventas.length) throw new ErrorUsuario('No hay ventas de ' + a.vendedor + ' con comisión pendiente en ese periodo.');
  const cuando = Date.now();
  let total = 0;
  for (const v of ventas) {
    const monto = r2(Math.max(0, utilidadVenta(v)) * pct / 100);
    total += monto;
    await fb().actualizar('ventas', v.id, { comisionPagada: { monto, porcentaje: pct, fecha: cuando, por: quien(u), referencia: texto(a.referencia) } });
  }
  datos.olvidarCache();
  return { vendedor: c.nombre || a.vendedor, porcentaje: pct, ventas: ventas.length, folios: ventas.map(v => 'NV #' + (v.notaId || '')), total_pagado: r2(total), fecha: dia(cuando) };
}

// ══════════════ 5. Estado de cuenta de un cliente ══════════════
async function estadoCuenta(a) {
  const q = datos.norm(a.cliente);
  if (!q) throw new ErrorUsuario('Dime de qué cliente es el estado de cuenta.');
  const facturas = (await fb().leerColeccion('facturas')).filter(f => f.estatus !== 'cancelada' && datos.norm(f.clienteNombre || f.receptorNombre).includes(q));
  const nombres = [...new Set(facturas.map(f => f.clienteNombre || f.receptorNombre))];
  if (nombres.length > 1) throw new ErrorUsuario('Varios clientes coinciden con "' + a.cliente + '": ' + nombres.join(', ') + '. ¿Cuál?');
  if (!facturas.length) throw new ErrorUsuario('No hay facturas de "' + a.cliente + '" en el gestor.');
  const h = hoyCero();
  const pendientes = facturas.filter(f => f.estatus === 'por_cobrar' && Number(f.saldo) > 0.009).map(f => {
    const vence = ms(f.vencimiento);
    const dv = vence && inicioDia(vence) < h ? Math.round((h - inicioDia(vence)) / DIA) : 0;
    return { factura: f.serieFolio, fecha: dia(ms(f.fecha)), vence: dia(vence), dias_vencida: dv, total: r2(f.total), pagado: r2((Number(f.total) || 0) - (Number(f.saldo) || 0)), saldo: r2(f.saldo), notas: (f.notas || []).map(n => n.folio).filter(Boolean) };
  }).sort((x, y) => String(x.vence).localeCompare(String(y.vence)));
  const desdePagos = Date.now() - (a.dias_pagos || 60) * DIA;
  const pagos = [];
  facturas.forEach(f => (f.pagos || []).forEach(p => { if (ms(p.fecha) >= desdePagos) pagos.push({ factura: f.serieFolio, fecha: dia(ms(p.fecha)), monto: r2(p.monto), forma: p.forma || '' }); }));
  pagos.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  const porPagar = r2(pendientes.reduce((s, f) => s + f.saldo, 0));
  const vencido = r2(pendientes.filter(f => f.dias_vencida > 0).reduce((s, f) => s + f.saldo, 0));
  const cliente = nombres[0];
  const lineas = ['Estado de cuenta de ' + cliente + ' al ' + diaCorto(Date.now()) + ' (Maya Autopartes)', ''];
  if (pendientes.length) {
    pendientes.forEach(f => lineas.push('• Factura ' + f.factura + ': saldo ' + pesos(f.saldo) + (f.vence ? (f.dias_vencida ? ', vencida hace ' + f.dias_vencida + ' días' : ', vence ' + diaCorto(ms(f.vence))) : '')));
    lineas.push('', 'Total por pagar: ' + pesos(porPagar) + (vencido ? ' (vencido ' + pesos(vencido) + ')' : ''));
  } else lineas.push('No tiene saldo pendiente. ¡Gracias!');
  return { cliente, por_pagar: porPagar, vencido, facturas_pendientes: pendientes, pagos_recientes: pagos.slice(0, 20), texto_para_cliente: lineas.join('\n') };
}

// PDF del estado de cuenta (jsPDF en el servidor, con el logo de la app)
function pdfEstadoCuenta(e) {
  const { jsPDF } = require('jspdf');
  require('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const logo = require('./pdf').logo();
  if (logo) { try { doc.addImage(logo, 'JPEG', 14, 10, 32, 16); } catch (err) { /* sin logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 79, 122);
  doc.text('Estado de cuenta', W - 14, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
  doc.text('Maya Autopartes · ' + diaCorto(Date.now()), W - 14, 24, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20);
  doc.text(e.cliente, 14, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Total por pagar: ' + pesos(e.por_pagar) + (e.vencido ? '   ·   Vencido: ' + pesos(e.vencido) : ''), 14, 45);
  doc.autoTable({
    startY: 52, head: [['Factura', 'Fecha', 'Vence', 'Total', 'Pagado', 'Saldo', 'Estado']],
    body: e.facturas_pendientes.length ? e.facturas_pendientes.map(f => [f.factura, diaCorto(ms(f.fecha)), f.vence ? diaCorto(ms(f.vence)) : '—', pesos(f.total), pesos(f.pagado), pesos(f.saldo), f.dias_vencida ? 'Vencida ' + f.dias_vencida + ' d' : 'Al corriente']) : [['Sin saldo pendiente', '', '', '', '', '', '']],
    styles: { fontSize: 9 }, headStyles: { fillColor: [30, 79, 122] }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
  });
  if (e.pagos_recientes.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Pagos recibidos recientes', 14, doc.lastAutoTable.finalY + 10);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 13, head: [['Fecha', 'Factura', 'Monto', 'Forma']],
      body: e.pagos_recientes.map(p => [diaCorto(ms(p.fecha)), p.factura, pesos(p.monto), p.forma]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [59, 188, 212] }, columnStyles: { 2: { halign: 'right' } }
    });
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Si ya realizó algún pago que no aparece, por favor compártanos el comprobante.', 14, doc.internal.pageSize.getHeight() - 10);
  const archivo = 'estado-cuenta-' + datos.norm(e.cliente).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.pdf';
  return { datos: Buffer.from(doc.output('arraybuffer')), archivo };
}

module.exports = { registrarPago, convertirCotizacion, historialCostos, configurarComision, comisiones, marcarComisionesPagadas, estadoCuenta, pdfEstadoCuenta, utilidadVenta };
