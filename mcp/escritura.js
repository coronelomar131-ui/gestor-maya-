// Altas, cambios y bajas desde Claude, con el mismo formato y numeración que guarda la app (public/index.html)
const { fb } = require('./firebase');
const datos = require('./datos');

const ORIGEN = 'Claude (MCP)';
const redondear2 = n => parseFloat(Number(n).toFixed(2));
const texto = v => String(v == null ? '' : v).trim();
const hoy = () => datos.fechaISO(new Date());
const mediodiaMs = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12).getTime();
};
const maxNumero = (lista, valor) => lista.reduce((max, x) => Math.max(max, parseInt(String(valor(x) || '').replace(/\D/g, ''), 10) || 0), 0);
const autor = u => ({ createdBy: u.uid, createdByName: u.nombre || u.email || 'Usuario', origen: ORIGEN });
const sinNulos = o => Object.keys(o).reduce((r, k) => { if (o[k] !== undefined) r[k] = o[k]; return r; }, {});

class ErrorUsuario extends Error {}
const duplicados = require('../public/diseno/duplicados.js');
const sat = require('../public/diseno/sat.js');
const candados = require('../public/diseno/alertas.js');

// Candados antes de guardar (public/diseno/alertas.js): venta repetida, siniestro, precio contra costo y contra lo de antes.
// Pepito los corre como ensayo (soloRevisar) y se los enseña a la persona antes del SÍ; quien llama directo al MCP
// tiene que mandar confirmar_alertas: true después de mostrárselos.
async function alertasDe(venta, ventas, opciones) {
  const compras = await datos.leer('compras').catch(() => []);
  return candados.revisar(venta, ventas, compras, opciones);
}
function exigirConfirmacion(alertas, a, que) {
  if (alertas.length && !a.confirmar_alertas) {
    throw new ErrorUsuario('Antes de guardar ' + que + ' revisa esto con la persona: ' + alertas.map((x, i) => (i + 1) + ') ' + x).join(' ') + ' Si todo está bien, repite con confirmar_alertas: true.');
  }
}

// Reglas del equipo (proceso de venta por Pepito): cada quien registra SUS ventas y el cliente debe estar registrado.
// Dirección puede capturar por otros (vendedor libre) y vender a un cliente sin registrar.
const esDireccion = u => (u && (u.rolReal || u.rol)) === 'admin';
function vendedorDe(u, a) {
  if (esDireccion(u)) return texto(a.vendedor);
  const yo = texto(u && (u.nombre || u.email));
  const dicho = texto(a.vendedor);
  const primera = s => datos.norm(s).split(' ')[0];
  // "Israel" o "Israel Ramírez" para Israel Ramírez está bien; otro nombre no
  if (dicho && primera(dicho) !== primera(yo)) {
    throw new ErrorUsuario('Solo puedes registrar tus propias ventas: esta quedaría a nombre de ' + dicho + '. Que ' + dicho + ' la registre con su usuario.');
  }
  return yo;
}
function exigirClienteRegistrado(u, cliente, nombre) {
  if (esDireccion(u) || cliente.registrado) return;
  throw new ErrorUsuario('El cliente "' + nombre + '" no está registrado. Primero regístralo con sus datos fiscales (guardar_cliente) y luego hacemos la nota.');
}

// Usa el nombre del cliente registrado si coincide (sin acentos ni mayúsculas), para no crear variantes del mismo cliente
async function resolverCliente(nombre) {
  const n = duplicados.claveNombre(nombre);
  const c = n ? (await fb().leerColeccion('clientes')).find(x => duplicados.claveNombre(x.razonSocial || x.nombre) === n) : null;
  return c ? { id: c.id, nombre: c.razonSocial || c.nombre, registrado: true } : { id: '', nombre: texto(nombre), registrado: false };
}

// Partidas con precio por línea, IVA por porcentaje (toFixed(2) como calcularIVA) y ajuste, como Ventas y Cotizaciones
// Una partida. Con conIva (ventas, por omisión) el precio es lo que pagó el cliente y el IVA se saca de ahí:
// 3,900 con 16 % = 3,362.07 + 537.93 de IVA. Sin conIva (cotizaciones, notas) el IVA se suma al precio, como en la app.
function itemDe(p, conIva) {
  const capturado = Number(p.precio) || 0;
  const porcentaje = p.iva_porcentaje == null ? 16 : Number(p.iva_porcentaje);
  const precio = conIva ? redondear2(capturado / (1 + porcentaje / 100)) : capturado;
  const iva = conIva ? redondear2(capturado - precio) : redondear2((capturado * porcentaje) / 100);
  const item = { pedido: texto(p.descripcion), numSiniestro: texto(p.siniestro), precio, iva, ajuste: Number(p.ajuste) || 0 };
  if (conIva) item.ivaPorcentaje = porcentaje;
  // Proveedor y costo total (pieza + guía + paquetería + logística) para la utilidad y las comisiones
  if (texto(p.proveedor)) item.proveedor = texto(p.proveedor);
  if (p.costo != null) item.costo = redondear2(Number(p.costo) || 0);
  if (texto(p.costo_desglose)) item.costoDesglose = texto(p.costo_desglose);
  return item;
}

function sumar(items) {
  let subtotal = 0, ivaTotal = 0, ajusteTotal = 0;
  items.forEach(i => { subtotal += i.precio; ivaTotal += i.iva; ajusteTotal += i.ajuste; });
  return {
    items,
    siniestros: items.map(i => i.numSiniestro).filter(Boolean).join(' | '),
    subtotal: redondear2(subtotal), ivaTotal: redondear2(ivaTotal), ajusteTotal: redondear2(ajusteTotal),
    total: redondear2(subtotal + ivaTotal - ajusteTotal)
  };
}

function partidas(lista, conIva) { return sumar(lista.map(p => itemDe(p, conIva))); }

// IVA de una venta, la regla de siempre: "más IVA" le suma el 16 %; "sin IVA" (o si no dicen nada) deja el precio tal cual;
// "con IVA incluido" lo desglosa dentro del precio. precio_con_iva se acepta por compatibilidad (true = incluido, false = más IVA).
const MODOS_IVA = ['sin_iva', 'mas_iva', 'incluido'];
function modoIva(a, previo) {
  if (a.iva && MODOS_IVA.includes(a.iva)) return a.iva;
  if (a.precio_con_iva === true) return 'incluido';
  if (a.precio_con_iva === false) return 'mas_iva';
  return previo || 'sin_iva';
}
function partidasModo(lista, modo) {
  return partidas(lista.map(p => (modo === 'sin_iva' ? Object.assign({}, p, { iva_porcentaje: 0 }) : p)), modo === 'incluido');
}

// Utilidad = lo que pagó el cliente (con IVA, menos ajustes) − costo total; % = utilidad / ese precio × 100. Base de las comisiones.
// También se guarda la utilidad sin IVA (el IVA se le paga al SAT) como referencia.
function utilidadDe(t) {
  const conCosto = t.items.filter(i => i.costo != null);
  if (!conCosto.length) return { costoTotal: null, utilidad: null, utilidadPct: null, utilidadSinIva: null, completo: false };
  const costoTotal = redondear2(conCosto.reduce((s, i) => s + i.costo, 0));
  const utilidad = redondear2(t.total - costoTotal);
  return {
    costoTotal, utilidad, utilidadPct: t.total > 0 ? redondear2((utilidad / t.total) * 100) : null,
    utilidadSinIva: redondear2(t.subtotal - t.ajusteTotal - costoTotal), completo: conCosto.length === t.items.length
  };
}

const faltaRegistro = (lista, etiqueta) => {
  const faltan = [];
  lista.forEach((x, i) => {
    const n = lista.length > 1 ? ' de la partida ' + (i + 1) + ' (' + texto(x.descripcion || x.pedido) + ')' : '';
    if (!texto(x.proveedor)) faltan.push('proveedor' + n);
    if (x.costo == null) faltan.push('costo total' + n + ' (pieza + guía + paquetería + logística)');
  });
  if (faltan.length) throw new ErrorUsuario(etiqueta + ' Faltan: ' + faltan.join('; ') + '. Sin costo no se puede calcular la utilidad para las comisiones.');
};

// Lo que se le dice a la persona del dinero de una venta
const resumenDinero = (t, u_) => ({
  venta_con_iva: t.total, venta_sin_iva: redondear2(t.subtotal - t.ajusteTotal), iva: t.ivaTotal,
  costo_total: u_.costoTotal, utilidad: u_.utilidad, utilidad_porcentaje: u_.utilidadPct, utilidad_sin_iva: u_.utilidadSinIva,
  costo_completo: u_.completo
});

function registroVenta(id, venta) {
  return datos.notaJSON(datos.desdeVenta(Object.assign({ id }, venta, { createdAt: new Date() })), true);
}

// Igual que saveNotaEntrega(), incluida la venta automática de la casilla "Registrar también como venta"
async function crearNotaEntrega(u, a, opciones = {}) {
  const cliente = await resolverCliente(a.cliente);
  exigirClienteRegistrado(u, cliente, a.cliente);
  const vendedor = vendedorDe(u, a);
  const fecha = a.fecha || hoy();
  const formaPago = a.forma_pago || (a.dias_credito ? 'credito' : 'contado');
  const credito = await creditoDe(cliente, formaPago, a.dias_credito);
  const items = a.articulos.map(it => sinNulos({
    descripcion: texto(it.descripcion), siniestro: texto(it.siniestro), anio: texto(it.anio),
    cantidad: Number(it.cantidad) || 1, precioUnit: Number(it.precio_unitario) || 0,
    proveedor: texto(it.proveedor) || undefined, costo: it.costo != null ? redondear2(it.costo) : undefined, costoDesglose: texto(it.costo_desglose) || undefined
  }));
  // Lo mismo que será su venta, para el ensayo (candados) y la utilidad
  const itemsVenta = items.map(it => {
    const linea = it.cantidad * it.precioUnit;
    return sinNulos({
      pedido: it.descripcion + (it.anio ? ' (' + it.anio + ')' : '') + (it.cantidad > 1 ? ' x' + it.cantidad : ''),
      numSiniestro: it.siniestro, precio: linea, iva: a.con_iva ? parseFloat((linea * 0.16).toFixed(2)) : 0, ajuste: 0,
      proveedor: it.proveedor, costo: it.costo, costoDesglose: it.costoDesglose
    });
  });
  const tv = sumar(itemsVenta);
  const u_ = utilidadDe(tv);
  // Anticipo o apartado: la nota dice cuánto dejaron y cuánto resta
  const anticipo = a.anticipo ? redondear2(a.anticipo) : 0;
  if (anticipo > tv.total + 0.005) throw new ErrorUsuario('El anticipo (' + pesos2(anticipo) + ') es mayor que el total de la nota (' + pesos2(tv.total) + ').');
  const conAnticipo = anticipo > 0 ? { anticipo, resta: redondear2(tv.total - anticipo) } : {};
  if (opciones.soloRevisar) {
    const alertas = await alertasDe({ clienteId: cliente.id, clienteNombre: cliente.nombre, items: itemsVenta, total: tv.total, utilidad: u_.utilidad }, await fb().leerColeccion('ventas'));
    return Object.assign({ revision: true, alertas, cliente: cliente.nombre, dinero: resumenDinero(tv, u_), forma_pago: formaPago, dias_credito: credito.dias || undefined }, conAnticipo);
  }
  if (credito.asignar) await asignarCredito(u, cliente, credito.dias);
  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precioUnit, 0);
  const ivaTotal = a.con_iva ? subtotal * 0.16 : 0;
  const notaId = 'NE-' + String(maxNumero(await fb().leerColeccion('notasEntrega'), n => n.notaId) + 1).padStart(3, '0');
  const nota = Object.assign({
    notaId, fecha, cliente: cliente.nombre,
    siniestro: items.map(it => it.siniestro).filter(Boolean).join(' | '),
    siniestros: items.filter(it => it.siniestro).map(it => ({ num: it.siniestro, anio: it.anio })),
    vendedor, items, subtotal, ivaTotal, total: subtotal + ivaTotal, formaPago, diasCredito: credito.dias,
    createdAt: new Date().toISOString()
  }, conAnticipo, autor(u));
  const id = await fb().agregar('notasEntrega', nota);

  let venta = null;
  if (a.registrar_venta) {
    const ventaNotaId = String(maxNumero(await fb().leerColeccion('ventas'), v => v.notaId || v.notaNumero) + 1);
    const ventaDoc = Object.assign({
      notaId: ventaNotaId,
      fecha: mediodiaMs(fecha),
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      vendedor: nota.vendedor,
      items: itemsVenta,
      siniestros: nota.siniestro,
      subtotal: redondear2(subtotal), ivaTotal: redondear2(ivaTotal), ajusteTotal: 0, total: redondear2(nota.total),
      formaPago, diasCredito: credito.dias, ivaModo: a.con_iva ? 'mas_iva' : 'sin_iva',
      costoTotal: u_.costoTotal, utilidad: u_.utilidad, utilidadPct: u_.utilidadPct, utilidadSinIva: u_.utilidadSinIva, costoCompleto: u_.completo,
      incluyeDatosFiscales: false, estado: 'pendiente', estatus: 'Entregado', facturaURL: '', tieneFactura: false,
      fuente: 'nota_entrega', notaEntregaId: notaId, notas: 'Generada automáticamente desde Nota de Entrega ' + notaId,
      createdAt: fb().marcaTiempo()
    }, conAnticipo, autor(u));
    const ventaId = await fb().agregar('ventas', ventaDoc);
    venta = { id: ventaId, folio: 'NV #' + ventaNotaId };
  }
  datos.olvidarCache();
  return {
    creada: datos.notaJSON(datos.desdeEntrega(Object.assign({ id }, nota)), true),
    cliente_registrado: cliente.registrado,
    venta_registrada: venta,
    forma_pago: formaPago, dias_credito: credito.dias || undefined, credito_asignado_al_cliente: credito.asignar || undefined,
    iva_modo: a.con_iva ? 'más IVA (16 %)' : 'sin IVA',
    anticipo: conAnticipo.anticipo, resta: conAnticipo.resta,
    utilidad: u_.costoTotal == null ? 'pendiente de costo (proveedor y costo se pueden mandar después)' : resumenDinero(tv, u_),
    pdf: 'Se descarga desde la app: Notas de Entrega → ' + notaId + ' → PDF'
  };
}

// Igual que saveVentaMultiLinea(); la fecha se guarda a mediodía local para que todas las vistas muestren el mismo día
// Crédito: 7 o 14 días. Si piden crédito y dicen los días (dias_credito), se le asignan al cliente sin trabas;
// si no los dicen y el cliente ya tiene, se usan los suyos; si no tiene, se pregunta solo "¿7 o 14 días?".
const PLAZOS_CREDITO = [7, 14];
async function creditoDe(cliente, formaPago, pedido) {
  if (formaPago !== 'credito') return { dias: 0, asignar: false };
  const doc = cliente.id ? await fb().obtener('clientes', cliente.id) : null;
  const actuales = doc ? Number(doc.diasCredito) || 0 : 0;
  if (pedido != null && pedido !== '') {
    const dias = Number(pedido);
    if (!PLAZOS_CREDITO.includes(dias)) throw new ErrorUsuario('El crédito es de 7 o 14 días. ¿Cuál le damos a ' + cliente.nombre + '?');
    return { dias, asignar: !!cliente.id && dias !== actuales };
  }
  if (actuales) return { dias: actuales, asignar: false };
  throw new ErrorUsuario(cliente.nombre + ' todavía no tiene días de crédito. ¿Le damos 7 o 14 días? (vuelve a proponer con dias_credito)');
}
async function diasCreditoDe(cliente, formaPago, pedido) { return (await creditoDe(cliente, formaPago, pedido)).dias; }
// Guarda el plazo en el cliente y avisa a Dirección si lo dio alguien más
async function asignarCredito(u, cliente, dias) {
  await fb().actualizar('clientes', cliente.id, { diasCredito: dias, creditoAsignado: { dias, por: texto(u.nombre || u.email), fecha: Date.now() } });
  if (!corrigeTodo(u)) {
    const avisos = require('./avisos');
    const admins = (await fb().leerColeccion('usuarios')).filter(x => x.rol === 'admin' && x.uid !== u.uid);
    for (const a of admins) await avisos.avisar(a, { tipo: 'momento', titulo: 'Crédito asignado', texto: '💳 ' + texto(u.nombre || u.email) + ' le dio ' + dias + ' días de crédito a ' + cliente.nombre + '.' }).catch(() => {});
  }
}

async function crearVenta(u, a, opciones = {}) {
  const cliente = await resolverCliente(a.cliente);
  exigirClienteRegistrado(u, cliente, a.cliente);
  const vendedor = vendedorDe(u, a);
  // Forma de pago: contado, o crédito solo si el cliente tiene crédito autorizado (días de crédito en Clientes / Cobranza)
  const formaPago = a.forma_pago || (a.dias_credito ? 'credito' : 'contado');
  const credito = await creditoDe(cliente, formaPago, a.dias_credito);
  const diasCredito = credito.dias;
  const fecha = a.fecha || hoy();
  // Proveedor y costo son opcionales: si no vienen, la venta queda pendiente de costo para las comisiones
  const modo = modoIva(a);
  const conIva = modo === 'incluido';
  const p = partidasModo(a.partidas, modo);
  const u_ = utilidadDe(p);
  const todas = await fb().leerColeccion('ventas');
  const alertas = await alertasDe({ clienteId: cliente.id, clienteNombre: cliente.nombre, items: p.items, total: p.total, utilidad: u_.utilidad }, todas);
  if (opciones.soloRevisar) return { revision: true, alertas, cliente: cliente.nombre, dinero: resumenDinero(p, u_), credito: formaPago === 'credito' ? { dias: diasCredito, se_asigna_al_cliente: credito.asignar } : null };
  exigirConfirmacion(alertas, a, 'la venta');
  if (credito.asignar) await asignarCredito(u, cliente, diasCredito);
  const notaId = String(maxNumero(todas, v => v.notaId || v.notaNumero) + 1);
  const venta = Object.assign({
    notaId, fecha: mediodiaMs(fecha), clienteId: cliente.id, clienteNombre: cliente.nombre,
    vendedor, items: p.items, siniestros: p.siniestros,
    subtotal: p.subtotal, ivaTotal: p.ivaTotal, ajusteTotal: p.ajusteTotal, total: p.total,
    formaPago, diasCredito,
    contacto: texto(a.contacto), impuestoNota: texto(a.impuesto_nota),
    precioConIva: conIva, ivaModo: modo,
    costoTotal: u_.costoTotal, utilidad: u_.utilidad, utilidadPct: u_.utilidadPct, utilidadSinIva: u_.utilidadSinIva, costoCompleto: u_.completo,
    incluyeDatosFiscales: !!a.incluye_datos_fiscales, estado: 'pendiente', estatus: a.estatus,
    facturaURL: '', tieneFactura: false, createdAt: fb().marcaTiempo()
  }, autor(u));
  const id = await fb().agregar('ventas', venta);
  datos.olvidarCache();
  return {
    creada: Object.assign(registroVenta(id, venta), {
      estatus: venta.estatus, forma_pago: formaPago, dias_credito: diasCredito, credito_asignado_al_cliente: credito.asignar || undefined,
      contacto: venta.contacto || null, impuesto: venta.impuestoNota || null,
      proveedores: [...new Set(p.items.map(i => i.proveedor).filter(Boolean))]
    }, resumenDinero(p, u_), {
      iva_modo: modo === 'mas_iva' ? 'más IVA (16 %)' : modo === 'incluido' ? 'IVA incluido en el precio' : 'sin IVA',
      pendiente_de_costo: u_.costoTotal == null ? 'Sin proveedor ni costo: queda pendiente para comisiones; se completa después con corregir_venta.' : undefined,
      se_puede_corregir: 'Si algo quedó mal, se corrige con corregir_venta (o en el gestor: Ver → Corregir).' }),
    cliente_registrado: cliente.registrado
  };
}

async function encontrarVenta(a) {
  if (a.id) {
    const v = await fb().obtener('ventas', a.id);
    if (!v) throw new ErrorUsuario('No existe una venta con id ' + a.id);
    return Object.assign({ id: a.id }, v);
  }
  const t = datos.norm(a.folio).replace(/\s+/g, '');
  const num = parseInt(t.replace(/\D/g, ''), 10);
  const hallazgos = (await fb().leerColeccion('ventas')).filter(v =>
    (v.notaNumero && datos.norm(v.notaNumero).replace(/\s+/g, '') === t) || (!!num && String(v.notaId || '') === String(num)));
  if (!hallazgos.length) throw new ErrorUsuario('No hay ninguna venta con el folio ' + a.folio);
  if (hallazgos.length > 1) throw new ErrorUsuario('Hay varias ventas con el folio ' + a.folio + '; usa su id: ' + hallazgos.map(v => v.id).join(', '));
  return hallazgos[0];
}

// ── Corregir una venta ya guardada (por si alguien se equivocó) ──
// Cambia piezas, precios, costos, cliente, fecha, contacto, impuesto o forma de pago; recalcula IVA, total y utilidad;
// guarda en "correcciones" quién cambió qué y cómo estaba antes, para poder deshacerlo.
const CAMPOS_ANTES = ['items', 'siniestros', 'subtotal', 'ivaTotal', 'ajusteTotal', 'total', 'clienteId', 'clienteNombre', 'fecha', 'contacto', 'impuestoNota',
  'formaPago', 'diasCredito', 'precioConIva', 'costoTotal', 'utilidad', 'utilidadPct', 'utilidadSinIva', 'costoCompleto'];
const fotoDe = v => CAMPOS_ANTES.reduce((o, k) => { if (v[k] !== undefined) o[k] = v[k]; return o; }, {});
const pesos2 = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corrigeTodo = u => esDireccion(u) || (u && (u.rolReal || u.rol)) === 'facturacion';

async function corregirVenta(u, a, opciones = {}) {
  const v = await encontrarVenta(a);
  const folio = registroVenta(v.id, v).folio;
  if (!corrigeTodo(u)) {
    const primera = s => datos.norm(s).split(' ')[0];
    const mia = (v.createdBy && v.createdBy === u.uid) || (texto(v.vendedor) && primera(v.vendedor) === primera(u.nombre || u.email));
    if (!mia) throw new ErrorUsuario('Solo puedes corregir tus propias ventas. ' + folio + ' es de ' + (v.vendedor || 'otra persona') + '; pídeselo a Dirección o a Facturación.');
    if (v.tieneFactura || v.facturaId) throw new ErrorUsuario(folio + ' ya está facturada: pídele la corrección a Facturación, porque también hay que corregir la factura.');
  }
  if (/^cancel/.test(datos.norm(v.estatus)) || v.estado === 'cancelada') throw new ErrorUsuario(folio + ' está cancelada; no se corrige.');
  const historial = Array.isArray(v.correcciones) ? v.correcciones.slice() : [];
  const quien = texto(u.nombre || u.email);
  const registro = (cambios, antes) => historial.concat([{ por: quien, uid: u.uid || '', cuando: Date.now(), motivo: texto(a.motivo), cambios, antes }]).slice(-20);

  if (a.deshacer_ultima) {
    const ult = historial.pop();
    if (!ult || !ult.antes) throw new ErrorUsuario(folio + ' no tiene correcciones que deshacer.');
    const cuando = new Date(ult.cuando).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
    const cambios = ['Deshizo la corrección de ' + ult.por + ' (' + cuando + '): ' + (ult.cambios || []).join('; ')];
    const restaurar = Object.assign({}, ult.antes);
    CAMPOS_ANTES.forEach(k => { if (!(k in restaurar)) restaurar[k] = null; }); // lo que no existía antes se vacía
    await fb().actualizar('ventas', v.id, Object.assign(restaurar, { correcciones: registro(cambios, fotoDe(v)), actualizado: Date.now() }));
    datos.olvidarCache();
    return { venta: folio, id: v.id, deshecho: true, cambios, total_antes: v.total, total_ahora: ult.antes.total, utilidad_ahora: ult.antes.utilidad == null ? null : ult.antes.utilidad };
  }

  const modo = modoIva(a, v.ivaModo || (v.precioConIva ? 'incluido' : (v.ivaTotal ? 'mas_iva' : 'sin_iva')));
  const conIva = modo === 'incluido';
  const items = (v.items || []).map(i => Object.assign({}, i));
  const cambios = [];
  const nombreDe = n => '#' + n + ' (' + (items[n - 1] ? items[n - 1].pedido : '?') + ')';
  const revisar = n => { if (!items[n - 1]) throw new ErrorUsuario(folio + ' tiene ' + items.length + (items.length === 1 ? ' partida' : ' partidas') + '; no existe la ' + n + '.'); };

  (a.cambiar_partidas || []).forEach(c => {
    revisar(c.numero);
    const it = items[c.numero - 1];
    const etiqueta = nombreDe(c.numero);
    if (c.precio != null || c.iva_porcentaje != null) {
      const pct = c.iva_porcentaje != null ? Number(c.iva_porcentaje) : modo === 'sin_iva' ? 0 : (it.ivaPorcentaje != null ? it.ivaPorcentaje : (it.precio ? Math.round((it.iva / it.precio) * 100) : 16));
      const capturado = c.precio != null ? Number(c.precio) : (conIva ? it.precio + it.iva : it.precio);
      const nuevo = itemDe({ precio: capturado, iva_porcentaje: pct }, conIva);
      cambios.push(etiqueta + ': precio ' + pesos2(conIva ? it.precio + it.iva : it.precio) + ' → ' + pesos2(capturado) + (conIva ? ' (con IVA)' : ' (sin IVA)'));
      it.precio = nuevo.precio; it.iva = nuevo.iva; if (conIva) it.ivaPorcentaje = pct; else delete it.ivaPorcentaje;
    }
    if (c.descripcion != null) { cambios.push(etiqueta + ': pieza "' + it.pedido + '" → "' + texto(c.descripcion) + '"'); it.pedido = texto(c.descripcion); }
    if (c.siniestro != null) { cambios.push(etiqueta + ': siniestro ' + (it.numSiniestro || '—') + ' → ' + (texto(c.siniestro) || '—')); it.numSiniestro = texto(c.siniestro); }
    if (c.ajuste != null) { cambios.push(etiqueta + ': ajuste ' + pesos2(it.ajuste) + ' → ' + pesos2(c.ajuste)); it.ajuste = Number(c.ajuste) || 0; }
    if (c.proveedor != null) { cambios.push(etiqueta + ': proveedor ' + (it.proveedor || '—') + ' → ' + (texto(c.proveedor) || '—')); if (texto(c.proveedor)) it.proveedor = texto(c.proveedor); else delete it.proveedor; }
    if (c.costo != null) { cambios.push(etiqueta + ': costo ' + pesos2(it.costo) + ' → ' + pesos2(c.costo)); it.costo = redondear2(Number(c.costo) || 0); }
    if (c.costo_desglose != null) { if (texto(c.costo_desglose)) it.costoDesglose = texto(c.costo_desglose); else delete it.costoDesglose; }
  });
  const quitar = [...new Set(a.quitar_partidas || [])].sort((x, y) => y - x);
  quitar.forEach(n => { revisar(n); cambios.push('Quitó la partida ' + nombreDe(n)); });
  quitar.forEach(n => items.splice(n - 1, 1));
  (a.agregar_partidas || []).forEach(p => { const it = itemDe(modo === 'sin_iva' ? Object.assign({}, p, { iva_porcentaje: 0 }) : p, conIva); items.push(it); cambios.push('Agregó "' + it.pedido + '" en ' + pesos2(conIva ? it.precio + it.iva : it.precio)); });
  if (!items.length) throw new ErrorUsuario(folio + ' se quedaría sin piezas. Si la venta no va, cancélala con su motivo.');

  const nuevo = {};
  if (a.cliente) {
    const cliente = await resolverCliente(a.cliente);
    exigirClienteRegistrado(u, cliente, a.cliente);
    if (cliente.id !== v.clienteId || cliente.nombre !== v.clienteNombre) { cambios.push('Cliente: ' + (v.clienteNombre || '—') + ' → ' + cliente.nombre); nuevo.clienteId = cliente.id; nuevo.clienteNombre = cliente.nombre; }
  }
  if (a.fecha) { cambios.push('Fecha → ' + a.fecha); nuevo.fecha = mediodiaMs(a.fecha); }
  if (a.contacto != null) { cambios.push('Contacto: ' + (v.contacto || '—') + ' → ' + (texto(a.contacto) || '—')); nuevo.contacto = texto(a.contacto); }
  if (a.impuesto_nota != null) { cambios.push('Impuesto: ' + (v.impuestoNota || '—') + ' → ' + (texto(a.impuesto_nota) || '—')); nuevo.impuestoNota = texto(a.impuesto_nota); }
  if (a.forma_pago || a.dias_credito) {
    const cli = { id: nuevo.clienteId || v.clienteId, nombre: nuevo.clienteNombre || v.clienteNombre };
    const fp = a.forma_pago || 'credito';
    const cr = await creditoDe(cli, fp, a.dias_credito);
    nuevo.diasCredito = cr.dias;
    if (cr.asignar && !opciones.soloRevisar) await asignarCredito(u, cli, cr.dias);
    a = Object.assign({}, a, { forma_pago: fp });
    nuevo.formaPago = a.forma_pago;
    cambios.push('Forma de pago: ' + (v.formaPago || 'contado') + ' → ' + a.forma_pago + (a.forma_pago === 'credito' ? ' ' + cr.dias + ' días' : ''));
  }
  if (!cambios.length) throw new ErrorUsuario('No dijiste qué corregir de ' + folio + '.');

  const t = sumar(items);
  const u_ = utilidadDe(t);
  const alertas = await alertasDe({ id: v.id, clienteId: nuevo.clienteId || v.clienteId, clienteNombre: nuevo.clienteNombre || v.clienteNombre, items: t.items, total: t.total, utilidad: u_.utilidad },
    await fb().leerColeccion('ventas'), { repetida: false });
  if (opciones.soloRevisar) return { revision: true, alertas, venta: folio, dinero: resumenDinero(t, u_) };
  exigirConfirmacion(alertas, a, 'la corrección');
  if (t.total !== v.total) cambios.push('Total: ' + pesos2(v.total) + ' → ' + pesos2(t.total));
  if (u_.utilidad !== (v.utilidad == null ? null : v.utilidad)) cambios.push('Utilidad: ' + pesos2(v.utilidad) + ' → ' + pesos2(u_.utilidad) + (u_.utilidadPct != null ? ' (' + u_.utilidadPct + ' %)' : ''));
  Object.assign(nuevo, {
    items: t.items, siniestros: t.siniestros, subtotal: t.subtotal, ivaTotal: t.ivaTotal, ajusteTotal: t.ajusteTotal, total: t.total,
    precioConIva: conIva, ivaModo: modo, costoTotal: u_.costoTotal, utilidad: u_.utilidad, utilidadPct: u_.utilidadPct, utilidadSinIva: u_.utilidadSinIva, costoCompleto: u_.completo,
    correcciones: registro(cambios, fotoDe(v)), actualizado: Date.now()
  });
  await fb().actualizar('ventas', v.id, nuevo);
  datos.olvidarCache();
  return Object.assign({
    venta: folio, id: v.id, cambios, partidas: t.items.length,
    aviso: v.tieneFactura ? 'Esta venta ya tenía factura: revisa que la factura coincida con la corrección.' : undefined,
    se_puede_deshacer: 'Si la corrección quedó mal, se deshace con corregir_venta y deshacer_ultima: true.'
  }, resumenDinero(t, u_));
}

// Igual que cambiarEstatusVenta(): solo cambia el estatus
async function cambiarEstatusVenta(u, a) {
  const v = await encontrarVenta(a);
  await fb().actualizar('ventas', v.id, { estatus: a.estatus });
  datos.olvidarCache();
  return { venta: registroVenta(v.id, v).folio, id: v.id, estatus_anterior: v.estatus || 'Pendiente', estatus_nuevo: a.estatus };
}

const CAMPOS_CLIENTE = {
  nombre: 'razonSocial', rfc: 'rfc', email: 'email', telefono: 'telefono', calle: 'calle', numero_exterior: 'numeroExterior',
  numero_interior: 'numeroInterior', colonia: 'colonia', municipio: 'municipio', ciudad: 'ciudad', estado: 'estado',
  pais: 'pais', codigo_postal: 'codigoPostal', tipo_persona: 'tipoPersona', regimen_fiscal: 'regimenFiscal', uso_cfdi: 'usoCfdi'
};

// Alta igual que saveCliente() (código CL + consecutivo); con id solo cambia los campos que se manden
async function guardarCliente(u, a) {
  const cambios = {};
  Object.keys(CAMPOS_CLIENTE).forEach(k => { if (a[k] !== undefined) cambios[CAMPOS_CLIENTE[k]] = texto(a[k]); });
  if (a.venta_publica_redes !== undefined) cambios.redesSociales = !!a.venta_publica_redes;
  // Sin efectos fiscales: uso de CFDI S01, no lleva RFC ni datos fiscales obligatorios
  if (a.sin_efectos_fiscales) { cambios.usoCfdi = sat.SIN_EFECTOS; cambios.sinEfectosFiscales = true; }
  if (a.dias_credito != null) {
    if (![0].concat(PLAZOS_CREDITO).includes(Number(a.dias_credito))) throw new ErrorUsuario('El crédito es de 7 o 14 días (0 = contado).');
    cambios.diasCredito = Number(a.dias_credito);
  }
  else if (a.sin_efectos_fiscales === false && a.id) cambios.sinEfectosFiscales = false;

  if (a.id) {
    const actual = await fb().obtener('clientes', a.id);
    if (!actual) throw new ErrorUsuario('No existe un cliente con id ' + a.id);
    if (!Object.keys(cambios).length) throw new ErrorUsuario('No mandaste ningún dato para cambiar');
    // Solo se revisan los datos que cambian: que no lo dejen igual a otro cliente
    const choque = duplicados.buscarDuplicado(cambios, await fb().leerColeccion('clientes'), a.id);
    if (choque) throw new ErrorUsuario(duplicados.mensajeDuplicado(choque));
    await fb().actualizar('clientes', a.id, cambios);
    return { actualizado: a.id, campos: Object.keys(cambios) };
  }
  if (!cambios.razonSocial) throw new ErrorUsuario('Para dar de alta un cliente se necesita su nombre o razón social');
  const todos = await fb().leerColeccion('clientes');
  // Nunca se crea un cliente repetido (mismo nombre sin "S.A. de C.V.", RFC, teléfono o correo): se regresa el que ya existe
  const choque = duplicados.buscarDuplicado(cambios, todos);
  if (choque) {
    const e = choque.cliente;
    return { ya_existia: true, no_se_creo: true, motivo: choque.motivo, aviso: duplicados.mensajeDuplicado(choque), id: e.id, codigo: e.codigoCliente || null, nombre: e.razonSocial || e.nombre };
  }
  // Nombre casi igual (una letra): no se crea hasta que la persona confirme que es otro cliente
  const parecido = a.es_otro_cliente ? null : duplicados.buscarParecido(cambios, todos);
  if (parecido) {
    const e = parecido.cliente;
    return { no_se_creo: true, parecido: true, aviso: duplicados.mensajeParecido(parecido) + ' Si la persona confirma que es distinto, vuelve a mandarlo con es_otro_cliente: true.', id: e.id, codigo: e.codigoCliente || null, nombre: e.razonSocial || e.nombre };
  }
  // Datos fiscales obligatorios (CFDI 4.0), salvo clientes de venta pública
  if (!cambios.redesSociales) {
    const v = sat.validarCliente(cambios);
    if (!v.ok) throw new ErrorUsuario('No registré al cliente. ' + sat.mensaje(v) + ' Pídele a la persona lo que falta, en un solo mensaje.');
    Object.assign(cambios, { rfc: v.normalizado.rfc, tipoPersona: v.normalizado.tipoPersona, regimenFiscal: v.normalizado.regimenFiscal, usoCfdi: v.normalizado.usoCfdi });
    if (v.sinEfectosFiscales) cambios.sinEfectosFiscales = true;
  }
  const codigoCliente = texto(a.codigo) || 'CL' + (maxNumero(todos.filter(c => String(c.codigoCliente || '').startsWith('CL')), c => c.codigoCliente) + 1);
  const cliente = Object.assign({
    codigoCliente, razonSocial: '', rfc: '', email: '', telefono: '', calle: '', numeroExterior: '', numeroInterior: '',
    colonia: '', municipio: '', ciudad: '', estado: '', pais: 'México', codigoPostal: '', redesSociales: false
  }, cambios, { createdAt: fb().marcaTiempo(), origen: ORIGEN });
  const id = await fb().agregar('clientes', cliente);
  return { creado: id, codigo: codigoCliente, nombre: cliente.razonSocial,
    datos_fiscales: cliente.redesSociales ? null : cliente.sinEfectosFiscales ? { uso_cfdi: 'S01 Sin efectos fiscales', rfc: cliente.rfc || 'sin RFC' } : { rfc: cliente.rfc, tipo_persona: cliente.tipoPersona, regimen_fiscal: cliente.regimenFiscal + ' ' + ((sat.REGIMENES[cliente.regimenFiscal] || [])[0] || ''), uso_cfdi: cliente.usoCfdi + ' ' + (sat.USOS_CFDI[cliente.usoCfdi] || '') },
    siguiente: 'Pregúntale a la persona si quiere generar una nota de venta para este cliente.' };
}

// Alta igual que saveProducto(); con id o código existente cambia campos y ajusta existencias (+/-)
async function guardarProducto(u, a) {
  const cambios = sinNulos({
    codigo: a.codigo === undefined ? undefined : texto(a.codigo), descripcion: a.descripcion === undefined ? undefined : texto(a.descripcion),
    marca: a.marca === undefined ? undefined : texto(a.marca), compatibilidad: a.compatibilidad === undefined ? undefined : texto(a.compatibilidad),
    precio: a.precio, stock: a.stock, stockMin: a.stock_minimo, clase: a.clase
  });
  let existente = null;
  if (a.id) {
    existente = await fb().obtener('productos', a.id);
    if (!existente) throw new ErrorUsuario('No existe un producto con id ' + a.id);
    existente = Object.assign({ id: a.id }, existente);
  } else if (cambios.codigo) {
    // Si hay una pieza activa y otra archivada con el mismo código, gana la activa
    const iguales = (await fb().leerColeccion('productos')).filter(p => datos.norm(p.codigo) === datos.norm(cambios.codigo));
    existente = iguales.find(p => !p.archivado) || iguales[0] || null;
  }
  const NEGATIVO = 'Las existencias no pueden quedar en negativo';
  if (cambios.stock < 0) throw new ErrorUsuario(NEGATIVO);

  if (existente) {
    if (cambios.stock !== undefined && a.ajuste_stock) throw new ErrorUsuario('Manda stock (nuevo total) o ajuste_stock (sumar/restar), no los dos');
    const antes = Number(existente.stock) || 0;
    if (a.ajuste_stock < 0 && antes + a.ajuste_stock < 0) throw new ErrorUsuario(NEGATIVO + ': solo hay ' + antes);
    // Si se encontró por código, ese código es la búsqueda y no cambia; con id sí se puede cambiar el código
    if (!a.id) delete cambios.codigo;
    if (Object.keys(cambios).length || a.ajuste_stock) await fb().actualizar('productos', existente.id, Object.assign(cambios, { updatedAt: fb().marcaTiempo(), updatedBy: u.uid || '' }));
    if (a.ajuste_stock) await fb().incrementar('productos', existente.id, 'stock', a.ajuste_stock);
    const despues = await fb().obtener('productos', existente.id);
    await anotarMovimiento(u, despues, existente.id, 'ajuste', antes, Number(despues.stock) || 0);
    const r = { actualizado: existente.id, codigo: despues.codigo || null, descripcion: despues.descripcion, stock_anterior: antes, stock: Number(despues.stock) || 0, precio: despues.precio };
    if (despues.archivado) r.aviso = 'Esta pieza está archivada: no sale en el inventario hasta que se restaure en la app.';
    return r;
  }

  if (!cambios.descripcion) throw new ErrorUsuario('Para dar de alta un producto se necesita su descripción');
  const producto = Object.assign({ codigo: '', descripcion: '', marca: '', compatibilidad: '', precio: 0, stock: 0, stockMin: 0, clase: 'B' }, cambios);
  if (a.ajuste_stock) producto.stock += a.ajuste_stock;
  if (producto.stock < 0) throw new ErrorUsuario(NEGATIVO);
  const id = await fb().agregar('productos', Object.assign(producto, { createdAt: fb().marcaTiempo(), origen: ORIGEN }));
  await anotarMovimiento(u, producto, id, 'alta', 0, producto.stock);
  return { creado: id, codigo: producto.codigo, descripcion: producto.descripcion, stock: producto.stock, precio: producto.precio };
}

// Historial de existencias que muestra la ficha del Inventario; si falla, el cambio ya quedó guardado
async function anotarMovimiento(u, p, productoId, tipo, antes, despues) {
  if (antes === despues) return;
  try {
    await fb().agregar('movimientos', {
      productoId, codigo: p.codigo || '', descripcion: p.descripcion || '', tipo, cantidad: despues - antes, stockAntes: antes, stockDespues: despues,
      motivo: tipo === 'alta' ? 'Alta de la pieza' : 'Cambio desde Pepito', nota: '', por: u.uid || '', porNombre: u.nombre || u.email || '',
      createdAt: fb().marcaTiempo(), origen: ORIGEN
    });
  } catch (e) { console.warn('No se pudo anotar el movimiento:', e.message); }
}

const ESTATUS_ENTREGA = { pendiente: 'pending', entregado: 'delivered', cancelado: 'cancelled' };

// Alta igual que saveEntrega(); con id cambia los campos que se manden (el estatus como updateEntregaStatus)
async function guardarEntrega(u, a) {
  const cambios = sinNulos({
    cliente: a.cliente === undefined ? undefined : texto(a.cliente), direccion: a.direccion === undefined ? undefined : texto(a.direccion),
    monto: a.monto, metodoPago: a.metodo_pago, estatus: a.estatus && ESTATUS_ENTREGA[a.estatus], notas: a.notas === undefined ? undefined : texto(a.notas)
  });
  if (a.id) {
    if (!(await fb().obtener('entregas', a.id))) throw new ErrorUsuario('No existe una entrega con id ' + a.id);
    if (!Object.keys(cambios).length) throw new ErrorUsuario('No mandaste ningún dato para cambiar');
    await fb().actualizar('entregas', a.id, cambios);
    return { actualizada: a.id, campos: Object.keys(cambios) };
  }
  if (!cambios.cliente) throw new ErrorUsuario('Para registrar una entrega se necesita el cliente');
  const entrega = Object.assign({ cliente: '', direccion: '', monto: 0, metodoPago: 'Efectivo', estatus: 'pending', notas: '' }, cambios,
    { creadoPor: u.uid, createdAt: fb().marcaTiempo(), origen: ORIGEN });
  return { creada: await fb().agregar('entregas', entrega), cliente: entrega.cliente, estatus: entrega.estatus, monto: entrega.monto };
}

// Igual que saveCotizacion(): COT-consecutivo, estatus "vigente"
async function crearCotizacion(u, a) {
  const cliente = await resolverCliente(a.cliente);
  const p = partidas(a.partidas);
  const notaId = String(maxNumero(await fb().leerColeccion('cotizaciones'), c => c.notaId) + 1);
  const cotizacion = {
    notaId, fecha: mediodiaMs(a.fecha || hoy()), clienteId: cliente.id, clienteNombre: cliente.nombre,
    vendedor: texto(a.vendedor), items: p.items, siniestros: p.siniestros,
    subtotal: p.subtotal, ivaTotal: p.ivaTotal, ajusteTotal: p.ajusteTotal, total: p.total,
    estatus: 'vigente', createdAt: fb().marcaTiempo(), createdBy: u.uid, origen: ORIGEN
  };
  const id = await fb().agregar('cotizaciones', cotizacion);
  return { creada: id, folio: 'COT-' + notaId, cliente: cliente.nombre, subtotal: p.subtotal, iva: p.ivaTotal, ajuste: p.ajusteTotal, total: p.total };
}

// Alta igual que saveProveedor(); con id cambia los campos que se manden
async function guardarProveedor(u, a) {
  const cambios = sinNulos({
    nombre: a.nombre === undefined ? undefined : texto(a.nombre), contacto: a.contacto === undefined ? undefined : texto(a.contacto),
    telefono: a.telefono === undefined ? undefined : texto(a.telefono), email: a.email === undefined ? undefined : texto(a.email),
    productos: a.productos === undefined ? undefined : texto(a.productos)
  });
  if (a.id) {
    if (!(await fb().obtener('proveedores', a.id))) throw new ErrorUsuario('No existe un proveedor con id ' + a.id);
    if (!Object.keys(cambios).length) throw new ErrorUsuario('No mandaste ningún dato para cambiar');
    await fb().actualizar('proveedores', a.id, cambios);
    return { actualizado: a.id, campos: Object.keys(cambios) };
  }
  if (!cambios.nombre) throw new ErrorUsuario('Para dar de alta un proveedor se necesita su nombre');
  const proveedor = Object.assign({ nombre: '', contacto: '', telefono: '', email: '', productos: '' }, cambios, { createdAt: fb().marcaTiempo(), origen: ORIGEN });
  return { creado: await fb().agregar('proveedores', proveedor), nombre: proveedor.nombre };
}

async function crearCompra(u, a) {
  const fecha = a.fecha || hoy();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha + 'T12:00:00'))) {
    throw new ErrorUsuario('La fecha debe usar el formato AAAA-MM-DD');
  }
  if (!Array.isArray(a.articulos) || !a.articulos.length || a.articulos.length > 100) {
    throw new ErrorUsuario('La compra debe tener de 1 a 100 artículos');
  }
  const articulos = a.articulos.map((articulo, indice) => {
    const pieza = texto(articulo.pieza);
    const cantidadComprada = Number(articulo.cantidad_comprada);
    const costoUnitario = Number(articulo.costo_unitario);
    const cantidadVendida = Number(articulo.cantidad_vendida) || 0;
    const precioVenta = Number(articulo.precio_venta) || 0;
    const linea = indice + 1;
    if (!pieza) throw new ErrorUsuario('Falta el nombre del artículo ' + linea);
    if (!Number.isInteger(cantidadComprada) || cantidadComprada < 1) {
      throw new ErrorUsuario('La cantidad comprada del artículo ' + linea + ' debe ser un entero mayor a cero');
    }
    if (!Number.isFinite(costoUnitario) || costoUnitario < 0) {
      throw new ErrorUsuario('El costo unitario del artículo ' + linea + ' debe ser válido y no negativo');
    }
    if (!Number.isInteger(cantidadVendida) || cantidadVendida < 0 || cantidadVendida > cantidadComprada) {
      throw new ErrorUsuario('La cantidad vendida del artículo ' + linea + ' debe estar entre cero y lo comprado');
    }
    if (!Number.isFinite(precioVenta) || precioVenta < 0 || (cantidadVendida > 0 && precioVenta <= 0)) {
      throw new ErrorUsuario('El precio de venta del artículo ' + linea + ' debe ser mayor a cero cuando ya se vendió');
    }
    return {
      pieza, cantidadComprada, costoUnitario: redondear2(costoUnitario),
      cantidadVendida, precioVenta: redondear2(precioVenta)
    };
  });
  const compra = Object.assign({
    fecha,
    proveedor: texto(a.proveedor),
    notas: texto(a.notas),
    articulos,
    createdAt: fb().marcaTiempo()
  }, autor(u));
  const id = await fb().agregar('compras', compra);
  datos.olvidarCache();
  return {
    id,
    fecha: compra.fecha,
    proveedor: compra.proveedor || null,
    articulos: articulos.map(articulo => ({
      pieza: articulo.pieza,
      cantidad_comprada: articulo.cantidadComprada,
      costo_unitario: articulo.costoUnitario,
      cantidad_vendida: articulo.cantidadVendida,
      precio_venta_unitario: articulo.precioVenta,
      utilidad_bruta: redondear2(articulo.cantidadVendida * (articulo.precioVenta - articulo.costoUnitario))
    }))
  };
}

// Venta de piezas de un lote ya comprado: suma las piezas vendidas y deja el precio de venta promedio, para que
// los ingresos registrados antes no cambien. No toca ventas, notas ni inventario (Compras es independiente).
async function venderDeCompra(u, a) {
  const id = texto(a.id);
  const compra = id && await fb().obtener('compras', id);
  if (!compra) throw new ErrorUsuario('No encontré esa compra. Búscala primero con resumen_compras para tener su id.');
  if (!Array.isArray(compra.articulos) || !compra.articulos.length) {
    throw new ErrorUsuario('Esta compra se capturó con el formato anterior; edítala en el gestor (Compras → Editar compra).');
  }
  const q = datos.norm(a.pieza);
  const exactos = compra.articulos.map((x, i) => i).filter(i => datos.norm(compra.articulos[i].pieza) === q);
  const parecidos = exactos.length ? exactos : compra.articulos.map((x, i) => i).filter(i => q && datos.norm(compra.articulos[i].pieza).includes(q));
  if (!parecidos.length) throw new ErrorUsuario('En esa compra no hay un artículo "' + a.pieza + '". Tiene: ' + compra.articulos.map(x => x.pieza).join(', ') + '.');
  if (parecidos.length > 1) throw new ErrorUsuario('Varios artículos coinciden con "' + a.pieza + '": ' + parecidos.map(i => compra.articulos[i].pieza).join(', ') + '. ¿Cuál?');
  const i = parecidos[0];
  const art = Object.assign({}, compra.articulos[i]);
  const nuevas = Number(a.cantidad_vendida);
  const precio = Number(a.precio_venta);
  const antes = Number(art.cantidadVendida) || 0;
  const compradas = Number(art.cantidadComprada) || 0;
  if (!Number.isInteger(nuevas) || nuevas < 1) throw new ErrorUsuario('La cantidad vendida debe ser un entero mayor a cero');
  if (antes + nuevas > compradas) throw new ErrorUsuario('Solo quedan ' + (compradas - antes) + ' piezas sin vender de "' + art.pieza + '"');
  if (!Number.isFinite(precio) || precio <= 0) throw new ErrorUsuario('El precio de venta por pieza debe ser mayor a cero');
  const ingresos = antes * (Number(art.precioVenta) || 0) + nuevas * precio;
  art.cantidadVendida = antes + nuevas;
  art.precioVenta = redondear2(ingresos / art.cantidadVendida);
  const articulos = compra.articulos.slice();
  articulos[i] = art;
  await fb().actualizar('compras', id, { articulos, updatedAt: fb().marcaTiempo(), updatedBy: u.uid });
  datos.olvidarCache();
  return {
    id, pieza: art.pieza, vendidas_ahora: nuevas, precio_venta_ahora: redondear2(precio),
    vendidas_en_total: art.cantidadVendida, sin_vender: compradas - art.cantidadVendida,
    precio_venta_promedio: art.precioVenta,
    utilidad_bruta_del_articulo: redondear2(art.cantidadVendida * (art.precioVenta - (Number(art.costoUnitario) || 0)))
  };
}

const BORRABLES = ['notasEntrega', 'ventas', 'clientes', 'productos', 'cotizaciones', 'proveedores', 'entregas', 'envios', 'compras'];

// Como deleteItem() de la app, pero antes guarda una copia en "papelera" para poder recuperarlo
async function eliminarRegistro(u, a) {
  const doc = await fb().obtener(a.coleccion, a.id);
  if (!doc) throw new ErrorUsuario('No existe ningún registro con id ' + a.id + ' en ' + a.coleccion);
  const respaldo = a.coleccion + '_' + a.id + '_' + Date.now();
  await fb().guardar('papelera', respaldo, {
    coleccion: a.coleccion, idOriginal: a.id, datos: doc, eliminadoPor: u.email, eliminadoPorNombre: u.nombre,
    eliminadoEn: new Date().toISOString(), origen: ORIGEN
  });
  await fb().borrar(a.coleccion, a.id);
  datos.olvidarCache();
  const r = { eliminado: a.id, coleccion: a.coleccion, respaldo_en_papelera: respaldo };
  if (a.coleccion === 'notasEntrega' && doc.notaId) {
    const ligadas = (await fb().leerColeccion('ventas')).filter(v => v.notaEntregaId === doc.notaId);
    if (ligadas.length) r.aviso = 'La venta generada desde ' + doc.notaId + ' sigue registrada (' + ligadas.map(v => 'NV #' + v.notaId + ', id ' + v.id).join('; ') + '). Bórrala aparte si también debe irse.';
  }
  return r;
}

module.exports = {
  ErrorUsuario, BORRABLES,
  crearNotaEntrega, crearVenta, corregirVenta, cambiarEstatusVenta, guardarCliente, guardarProducto, guardarEntrega, crearCotizacion, guardarProveedor,
  crearCompra, venderDeCompra, eliminarRegistro
};
