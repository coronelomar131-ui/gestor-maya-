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

// Usa el nombre del cliente registrado si coincide (sin acentos ni mayúsculas), para no crear variantes del mismo cliente
async function resolverCliente(nombre) {
  const n = datos.norm(nombre);
  const c = (await fb().leerColeccion('clientes')).find(x => datos.norm(x.razonSocial || x.nombre) === n);
  return c ? { id: c.id, nombre: c.razonSocial || c.nombre, registrado: true } : { id: '', nombre: texto(nombre), registrado: false };
}

// Partidas con precio por línea, IVA por porcentaje (toFixed(2) como calcularIVA) y ajuste, como Ventas y Cotizaciones
function partidas(lista) {
  const items = lista.map(p => {
    const precio = Number(p.precio) || 0;
    const porcentaje = p.iva_porcentaje == null ? 16 : Number(p.iva_porcentaje);
    return { pedido: texto(p.descripcion), numSiniestro: texto(p.siniestro), precio, iva: parseFloat(((precio * porcentaje) / 100).toFixed(2)), ajuste: Number(p.ajuste) || 0 };
  });
  let subtotal = 0, ivaTotal = 0, ajusteTotal = 0;
  items.forEach(i => { subtotal += i.precio; ivaTotal += i.iva; ajusteTotal += i.ajuste; });
  return {
    items,
    siniestros: items.map(i => i.numSiniestro).filter(Boolean).join(' | '),
    subtotal: redondear2(subtotal), ivaTotal: redondear2(ivaTotal), ajusteTotal: redondear2(ajusteTotal),
    total: redondear2(subtotal + ivaTotal - ajusteTotal)
  };
}

function registroVenta(id, venta) {
  return datos.notaJSON(datos.desdeVenta(Object.assign({ id }, venta, { createdAt: new Date() })), true);
}

// Igual que saveNotaEntrega(), incluida la venta automática de la casilla "Registrar también como venta"
async function crearNotaEntrega(u, a) {
  const cliente = await resolverCliente(a.cliente);
  const fecha = a.fecha || hoy();
  const items = a.articulos.map(it => ({
    descripcion: texto(it.descripcion), siniestro: texto(it.siniestro), anio: texto(it.anio),
    cantidad: Number(it.cantidad) || 1, precioUnit: Number(it.precio_unitario) || 0
  }));
  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precioUnit, 0);
  const ivaTotal = a.con_iva ? subtotal * 0.16 : 0;
  const notaId = 'NE-' + String(maxNumero(await fb().leerColeccion('notasEntrega'), n => n.notaId) + 1).padStart(3, '0');
  const nota = Object.assign({
    notaId, fecha, cliente: cliente.nombre,
    siniestro: items.map(it => it.siniestro).filter(Boolean).join(' | '),
    siniestros: items.filter(it => it.siniestro).map(it => ({ num: it.siniestro, anio: it.anio })),
    vendedor: texto(a.vendedor), items, subtotal, ivaTotal, total: subtotal + ivaTotal,
    createdAt: new Date().toISOString()
  }, autor(u));
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
      items: items.map(it => {
        const linea = it.cantidad * it.precioUnit;
        return {
          pedido: it.descripcion + (it.anio ? ' (' + it.anio + ')' : '') + (it.cantidad > 1 ? ' x' + it.cantidad : ''),
          numSiniestro: it.siniestro, precio: linea, iva: a.con_iva ? parseFloat((linea * 0.16).toFixed(2)) : 0, ajuste: 0
        };
      }),
      siniestros: nota.siniestro,
      subtotal: redondear2(subtotal), ivaTotal: redondear2(ivaTotal), ajusteTotal: 0, total: redondear2(nota.total),
      incluyeDatosFiscales: false, estado: 'pendiente', estatus: 'Entregado', facturaURL: '', tieneFactura: false,
      fuente: 'nota_entrega', notaEntregaId: notaId, notas: 'Generada automáticamente desde Nota de Entrega ' + notaId,
      createdAt: fb().marcaTiempo()
    }, autor(u));
    const ventaId = await fb().agregar('ventas', ventaDoc);
    venta = { id: ventaId, folio: 'NV #' + ventaNotaId };
  }
  datos.olvidarCache();
  return {
    creada: datos.notaJSON(datos.desdeEntrega(Object.assign({ id }, nota)), true),
    cliente_registrado: cliente.registrado,
    venta_registrada: venta,
    pdf: 'Se descarga desde la app: Notas de Entrega → ' + notaId + ' → PDF'
  };
}

// Igual que saveVentaMultiLinea(); la fecha se guarda a mediodía local para que todas las vistas muestren el mismo día
async function crearVenta(u, a) {
  const cliente = await resolverCliente(a.cliente);
  const fecha = a.fecha || hoy();
  const p = partidas(a.partidas);
  const notaId = String(maxNumero(await fb().leerColeccion('ventas'), v => v.notaId || v.notaNumero) + 1);
  const venta = Object.assign({
    notaId, fecha: mediodiaMs(fecha), clienteId: cliente.id, clienteNombre: cliente.nombre,
    vendedor: texto(a.vendedor), items: p.items, siniestros: p.siniestros,
    subtotal: p.subtotal, ivaTotal: p.ivaTotal, ajusteTotal: p.ajusteTotal, total: p.total,
    incluyeDatosFiscales: !!a.incluye_datos_fiscales, estado: 'pendiente', estatus: a.estatus,
    facturaURL: '', tieneFactura: false, createdAt: fb().marcaTiempo()
  }, autor(u));
  const id = await fb().agregar('ventas', venta);
  datos.olvidarCache();
  return { creada: Object.assign(registroVenta(id, venta), { estatus: venta.estatus }), cliente_registrado: cliente.registrado };
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
  pais: 'pais', codigo_postal: 'codigoPostal'
};

// Alta igual que saveCliente() (código CL + consecutivo); con id solo cambia los campos que se manden
async function guardarCliente(u, a) {
  const cambios = {};
  Object.keys(CAMPOS_CLIENTE).forEach(k => { if (a[k] !== undefined) cambios[CAMPOS_CLIENTE[k]] = texto(a[k]); });
  if (a.venta_publica_redes !== undefined) cambios.redesSociales = !!a.venta_publica_redes;

  if (a.id) {
    if (!(await fb().obtener('clientes', a.id))) throw new ErrorUsuario('No existe un cliente con id ' + a.id);
    if (!Object.keys(cambios).length) throw new ErrorUsuario('No mandaste ningún dato para cambiar');
    await fb().actualizar('clientes', a.id, cambios);
    return { actualizado: a.id, campos: Object.keys(cambios) };
  }
  if (!cambios.razonSocial) throw new ErrorUsuario('Para dar de alta un cliente se necesita su nombre o razón social');
  const todos = await fb().leerColeccion('clientes');
  const existente = todos.find(c => datos.norm(c.razonSocial || c.nombre) === datos.norm(cambios.razonSocial));
  if (existente) return { ya_existia: true, id: existente.id, codigo: existente.codigoCliente || null, nombre: existente.razonSocial || existente.nombre };
  const codigoCliente = texto(a.codigo) || 'CL' + (maxNumero(todos.filter(c => String(c.codigoCliente || '').startsWith('CL')), c => c.codigoCliente) + 1);
  const cliente = Object.assign({
    codigoCliente, razonSocial: '', rfc: '', email: '', telefono: '', calle: '', numeroExterior: '', numeroInterior: '',
    colonia: '', municipio: '', ciudad: '', estado: '', pais: 'México', codigoPostal: '', redesSociales: false
  }, cambios, { createdAt: fb().marcaTiempo(), origen: ORIGEN });
  const id = await fb().agregar('clientes', cliente);
  return { creado: id, codigo: codigoCliente, nombre: cliente.razonSocial };
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
    existente = (await fb().leerColeccion('productos')).find(p => datos.norm(p.codigo) === datos.norm(cambios.codigo)) || null;
  }

  if (existente) {
    if (cambios.stock !== undefined && a.ajuste_stock) throw new ErrorUsuario('Manda stock (nuevo total) o ajuste_stock (sumar/restar), no los dos');
    // Si se encontró por código, ese código es la búsqueda y no cambia; con id sí se puede cambiar el código
    if (!a.id) delete cambios.codigo;
    if (Object.keys(cambios).length) await fb().actualizar('productos', existente.id, cambios);
    if (a.ajuste_stock) await fb().incrementar('productos', existente.id, 'stock', a.ajuste_stock);
    const despues = await fb().obtener('productos', existente.id);
    return { actualizado: existente.id, codigo: despues.codigo || null, descripcion: despues.descripcion, stock_anterior: Number(existente.stock) || 0, stock: Number(despues.stock) || 0, precio: despues.precio };
  }

  if (!cambios.descripcion) throw new ErrorUsuario('Para dar de alta un producto se necesita su descripción');
  const producto = Object.assign({ codigo: '', descripcion: '', marca: '', compatibilidad: '', precio: 0, stock: 0, stockMin: 0, clase: 'B' }, cambios);
  if (a.ajuste_stock) producto.stock += a.ajuste_stock;
  const id = await fb().agregar('productos', Object.assign(producto, { createdAt: fb().marcaTiempo(), origen: ORIGEN }));
  return { creado: id, codigo: producto.codigo, descripcion: producto.descripcion, stock: producto.stock, precio: producto.precio };
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

const BORRABLES = ['notasEntrega', 'ventas', 'clientes', 'productos', 'cotizaciones', 'proveedores', 'entregas', 'envios'];

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
  crearNotaEntrega, crearVenta, cambiarEstatusVenta, guardarCliente, guardarProducto, guardarEntrega, crearCotizacion, guardarProveedor, eliminarRegistro
};
