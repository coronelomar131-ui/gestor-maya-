// Respaldos (solo Dirección): descarga en un .json todas las colecciones del negocio, o un Excel legible, desde
// Configuración. Anota la fecha en config/respaldo y recuerda al admin si pasaron más de 7 días. Solo LEE los datos;
// lo único que escribe es config/respaldo. Para restaurar: scripts/restaurar-respaldo.js (lo usa el dueño o su técnico).

// Si el gestor estrena una colección hay que agregarla aquí. [nombre, cómo se le dice, grupo]
// negocio = sin ella no cuenta como respaldo; sistema = apoyo y técnicas; fotos = solo si se piden
export const COLECCIONES = [
  ['ventas', 'Ventas', 'negocio'],
  ['notasEntrega', 'Notas de entrega', 'negocio'],
  ['cotizaciones', 'Cotizaciones', 'negocio'],
  ['clientes', 'Clientes', 'negocio'],
  ['productos', 'Productos (inventario)', 'negocio'],
  ['movimientos', 'Movimientos de existencias', 'negocio'],
  ['proveedores', 'Proveedores', 'negocio'],
  ['compras', 'Compras', 'negocio'],
  ['facturas', 'Facturas y cobranza', 'negocio'],
  ['entregas', 'Entregas', 'negocio'],
  ['envios', 'Envíos', 'negocio'],
  ['visitasTalleres', 'Visitas a talleres', 'negocio'],
  ['finanzas_prestamos', 'Préstamos', 'negocio'],
  ['finanzas_pagos', 'Pagos de finanzas', 'negocio'],
  ['usuarios', 'Usuarios', 'negocio'],
  ['config', 'Configuración', 'negocio'],
  ['preferencias', 'Preferencias de pantalla', 'sistema'],
  ['papelera', 'Papelera', 'sistema'],
  ['inventario', 'Inventario de Mercado Libre', 'sistema'],
  ['ml_productos', 'Publicaciones de Mercado Libre', 'sistema'],
  ['ordenes', 'Órdenes de Mercado Libre', 'sistema'],
  ['avisos_usuario', 'Avisos de la campanita', 'sistema'],
  ['buzon_pepito', 'Buzón de Pepito', 'sistema'],
  ['pepito_conversacion', 'Conversaciones con Pepito', 'sistema'],
  ['pepito_uso', 'Uso de Pepito', 'sistema'],
  ['recordatorios', 'Recordatorios', 'sistema'],
  ['presencia', 'Quién está en línea', 'sistema'],
  ['whatsapp_enviados', 'WhatsApp enviados', 'sistema'],
  ['whatsapp_pendientes', 'WhatsApp pendientes', 'sistema'],
  ['whatsapp_vistos', 'WhatsApp recibidos', 'sistema'],
  ['productosFotos', 'Fotos de productos', 'fotos'],
  ['visitasTalleresFotos', 'Fotos de visitas', 'fotos']
];
// Llaves y accesos: nunca salen en un respaldo. "roles" es una copia de "usuarios" que el servidor vuelve a crear
export const EXCLUIDAS = ['ml_tokens', 'mcp_codigos', 'mcp_refresh', 'mcp_tokens', 'roles'];
// Si las reglas no dejan listar "config", se lee documento por documento (agregar aquí los nuevos)
export const CONFIG_IDS = ['datos_fiscales', 'comisiones', 'geraldine', 'grupo_entregas_cobranza', 'ml_global', 'ml_firmas', 'ml_ultima_sync', 'ml_importacion',
  'pepito', 'pepito_actividad', 'pepito_fuera_rol', 'buzon_pepito', 'whatsapp_estado', 'avisos_turno', 'avisos_ultimo', 'respaldo'];
const CAMPOS_SECRETOS = /^(access_token|refresh_token|client_secret)$/;

// ── Tipos: lo que JSON no sabe guardar se marca con __tipo ──
const esAdjunto = s => (s.length > 20000 && s.startsWith('data:')) || (s.length > 100000 && /^[A-Za-z0-9+/=\r\n]+$/.test(s));

export function codificar(v, op = {}) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (op.sinAdjuntos && esAdjunto(v)) { op.omitidos = (op.omitidos || 0) + 1; return { __tipo: 'omitido', largo: v.length }; }
    return v;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : { __tipo: 'numero', v: String(v) };
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => codificar(x, op));
  if (v instanceof Date) return isNaN(v) ? null : { __tipo: 'fecha', iso: v.toISOString() };
  const plano = Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null;
  if (!plano) {
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') return { __tipo: 'timestamp', s: v.seconds, n: v.nanoseconds || 0, iso: v.toDate().toISOString() };
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number') return { __tipo: 'geopoint', lat: v.latitude, lng: v.longitude };
    if (typeof v.toBase64 === 'function') return { __tipo: 'bytes', base64: v.toBase64() };
    if (typeof v.path === 'string' && v.firestore) return { __tipo: 'ref', ruta: v.path };
    // Mejor reportar la colección como incompleta que guardar algo que no se podrá restaurar
    if (Object.getPrototypeOf(Object.getPrototypeOf(v)) !== null) throw new Error('Hay un dato de un tipo que no se sabe respaldar');
  }
  const o = {};
  Object.keys(v).forEach(k => { if (!CAMPOS_SECRETOS.test(k)) o[k] = codificar(v[k], op); });
  return Object.prototype.hasOwnProperty.call(o, '__tipo') ? { __tipo: 'mapa', v: o } : o;
}

// Un documento por línea: así el script de restauración puede leer archivos grandes poco a poco
const aLinea = x => JSON.stringify(x).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function motivo(e) {
  const c = String((e && e.code) || ''), m = String((e && e.message) || e || '');
  if (/permission-denied|insufficient permissions/i.test(c + ' ' + m)) return 'Firebase no da permiso de leerla (reglas de Firestore)';
  if (/unavailable|offline|network|tiempo/i.test(c + ' ' + m)) return 'Sin conexión o tardó demasiado';
  return m || 'Error desconocido';
}

// leerPagina(nombre, cursor) → { docs: [{ id, datos }], sigue: cursor o null }
export async function generarRespaldo({ leerPagina, leerDoc = null, fotos = false, por = '', proyecto = '', ahora = new Date(), alProgreso = () => {}, armar = partes => new Blob(partes, { type: 'application/json' }) }) {
  const lista = COLECCIONES.filter(c => fotos || c[2] !== 'fotos');
  const cuerpo = [], resumen = [], errores = [], conteos = {};
  const op = { sinAdjuntos: !fotos, omitidos: 0 };
  let total = 0, escritas = 0;
  for (let i = 0; i < lista.length; i++) {
    let [nombre, etiqueta, grupo] = lista[i];
    alProgreso({ i, de: lista.length, nombre, etiqueta, leidos: 0 });
    const partes = [];
    let n = 0, cursor = null, fallo = null;
    try {
      do {
        let pagina;
        try { pagina = await leerPagina(nombre, cursor); }
        catch (e) {
          if (/permission-denied/.test(String(e && e.code))) throw e;
          pagina = await leerPagina(nombre, cursor); // un segundo intento por si fue la señal
        }
        const lineas = pagina.docs.map(d => aLinea({ id: d.id, datos: codificar(d.datos, op) }));
        if (lineas.length) partes.push(armar([(n ? ',\n' : '') + lineas.join(',\n')]));
        n += lineas.length;
        cursor = pagina.sigue;
        alProgreso({ i, de: lista.length, nombre, etiqueta, leidos: n });
      } while (cursor);
    } catch (e) {
      fallo = motivo(e);
      if (nombre === 'config' && leerDoc && !n && /permission-denied/.test(String(e && e.code))) {
        const lineas = [], sin = [];
        let otraFalla = false;
        for (const id of CONFIG_IDS) {
          try {
            const datos = await leerDoc(nombre, id);
            if (datos) lineas.push(aLinea({ id, datos: codificar(datos, op) }));
          } catch (x) {
            sin.push(id);
            if (!/permission-denied/.test(String(x && x.code))) otraFalla = true;
          }
        }
        if (lineas.length) {
          partes.push(armar([lineas.join(',\n')]));
          n = lineas.length;
          fallo = 'Firebase solo deja leer una parte' + (sin.length ? '; faltó: ' + sin.join(', ') : ' (puede haber documentos sin revisar)');
          // Con los datos fiscales y sin fallas de señal, lo que falta es del servidor: no detiene la fecha del respaldo
          if (!otraFalla && !sin.includes('datos_fiscales')) grupo = 'sistema';
        }
      }
      errores.push({ coleccion: nombre, etiqueta, grupo, error: fallo, leidos: n });
    }
    // Una colección que no se pudo leer no se escribe vacía: se vería como si no tuviera datos
    if (!fallo || n) {
      cuerpo.push((escritas++ ? ',\n' : '') + JSON.stringify(nombre) + ':[\n', ...partes, (n ? '\n' : '') + ']');
      conteos[nombre] = n;
      total += n;
    }
    resumen.push({ nombre, etiqueta, grupo, n, error: fallo });
  }
  const sinErrores = !errores.length;
  const completo = sinErrores && fotos && !op.omitidos;
  const encabezado = {
    formato: 'maya-respaldo', version: 1, proyecto, creado: ahora.toISOString(), creadoPor: por,
    completo, sinErrores, incluyeFotos: fotos, adjuntosOmitidos: op.omitidos, errores, conteos, excluidas: EXCLUIDAS
  };
  const primera = aLinea(encabezado).slice(0, -1) + ',"colecciones":{\n';
  const p = x => String(x).padStart(2, '0');
  const sello = ahora.getFullYear() + '-' + p(ahora.getMonth() + 1) + '-' + p(ahora.getDate()) + '_' + p(ahora.getHours()) + p(ahora.getMinutes());
  return {
    blob: armar([primera, ...cuerpo, '\n}}\n']),
    archivo: 'respaldo-maya-' + sello + (sinErrores ? (fotos ? '' : '-sin-fotos') : '-INCOMPLETO') + '.json',
    completo, sinErrores, negocioCompleto: !errores.some(e => e.grupo === 'negocio'),
    errores, resumen, total, omitidos: op.omitidos, fotos
  };
}

// ── Excel legible ──
// Igual que cancelar.js: una venta tampoco cuenta si se canceló su nota de entrega
const cancelada = d => !!d && (/^cancel/i.test(d.estatus || '') || d.estado === 'cancelada' || (d.etapa === 'cancelada' && !d.estatus));
const ms = f => (!f ? 0 : f.toMillis ? f.toMillis() : f.seconds ? f.seconds * 1000 : typeof f === 'number' ? f : Date.parse(f) || 0);
const notaCancelada = (v, notas) => {
  if (!v.notaEntregaId) return false;
  const l = notas.filter(n => n.notaId === v.notaEntregaId);
  const n = l.length > 1 ? l.find(x => x.cliente === v.clienteNombre) : l[0];
  // Misma regla que cancelar.js: el folio de una nota borrada se reutiliza
  const ajena = !!n && v.clienteNombre !== n.cliente && !!ms(v.createdAt) && ms(v.createdAt) < ms(n.createdAt) - 86400000;
  return !ajena && cancelada(n);
};
const aFecha = f => {
  if (!f) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f.split('-').reverse().join('/');
  const d = f.toDate ? f.toDate() : new Date(f);
  return isNaN(d) ? String(f) : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Number(v));
const txt = v => (v == null ? '' : String(v)).slice(0, 32000);
const piezas = (v, f) => txt(Array.isArray(v.items) && v.items.length ? v.items.map(f).filter(Boolean).join(', ') : v.descripcion);

export const HOJAS = [
  { coleccion: 'ventas', nombre: 'Ventas', columnas: [['Folio', 10], ['Fecha', 12], ['Cliente', 32], ['Vendedor', 18], ['Estatus', 14], ['Piezas', 50], ['Siniestro', 20], ['Subtotal', 13, '$'], ['IVA', 11, '$'], ['Ajuste', 11, '$'], ['Total', 13, '$'], ['Factura', 12], ['Cancelada', 11]],
    fila: v => [txt(v.notaId || v.notaNumero), aFecha(v.fecha || v.createdAt), txt(v.clienteNombre || v.cliente), txt(v.vendedor), txt(v.estatus), piezas(v, i => i.pedido || i.descripcion),
      txt(v.siniestros || (v.items || []).map(i => i.numSiniestro).filter(Boolean).join(' | ')), num(v.subtotal), num(v.ivaTotal), num(v.ajusteTotal), num(v.total), txt(v.facturaNumero || (v.tieneFactura ? 'Sí' : '')), v.anulada ? 'Sí' : ''] },
  { coleccion: 'notasEntrega', nombre: 'Notas', columnas: [['Folio', 10], ['Fecha', 12], ['Cliente', 32], ['Vendedor', 18], ['Etapa', 14], ['Piezas', 50], ['Siniestro', 20], ['Subtotal', 13, '$'], ['IVA', 11, '$'], ['Total', 13, '$'], ['Cancelada', 11]],
    fila: n => [txt(n.notaId), aFecha(n.fecha || n.createdAt), txt(n.cliente), txt(n.vendedor), txt(n.etapa || n.estatus), piezas(n, i => (i.cantidad ? i.cantidad + ' x ' : '') + (i.descripcion || '')), txt(n.siniestro), num(n.subtotal), num(n.ivaTotal), num(n.total), cancelada(n) ? 'Sí' : ''] },
  { coleccion: 'clientes', nombre: 'Clientes', columnas: [['Código', 12], ['Razón social', 36], ['RFC', 16], ['Teléfono', 16], ['Email', 28], ['Calle', 24], ['Núm. ext.', 10], ['Núm. int.', 10], ['Colonia', 20], ['Municipio', 20], ['Estado', 16], ['C.P.', 8], ['Días de crédito', 10]],
    fila: c => [txt(c.codigoCliente || c.codigo), txt(c.razonSocial || c.nombre), txt(c.rfc), txt(c.telefono), txt(c.email), txt(c.calle), txt(c.numeroExterior), txt(c.numeroInterior), txt(c.colonia), txt(c.municipio), txt(c.estado), txt(c.codigoPostal), num(c.diasCredito)] },
  { coleccion: 'productos', nombre: 'Productos', columnas: [['Código', 16], ['Descripción', 44], ['Marca', 16], ['Compatibilidad', 36], ['Precio', 13, '$'], ['Existencia', 11], ['Mínimo', 9], ['Archivada', 10]],
    fila: p => [txt(p.codigo), txt(p.descripcion), txt(p.marca), txt(p.compatibilidad), num(p.precio), num(p.stock), num(p.stockMin), p.archivado ? 'Sí' : ''] }
];

export async function leerHojas({ leerPagina, alProgreso = () => {} }) {
  const hojas = [], leidos = {};
  for (let i = 0; i < HOJAS.length; i++) {
    const h = HOJAS[i], docs = [];
    let cursor = null, error = null;
    alProgreso({ i, de: HOJAS.length, etiqueta: h.nombre, leidos: 0 });
    try {
      do {
        const pagina = await leerPagina(h.coleccion, cursor);
        pagina.docs.forEach(d => docs.push(d.datos));
        cursor = pagina.sigue;
        alProgreso({ i, de: HOJAS.length, etiqueta: h.nombre, leidos: docs.length });
      } while (cursor);
    } catch (e) { error = motivo(e); }
    leidos[h.coleccion] = docs;
    hojas.push({ nombre: h.nombre, columnas: h.columnas, n: docs.length, error });
  }
  // Las filas se arman al final: para saber si una venta está cancelada hacen falta las notas
  const orden = d => { const f = d.createdAt || d.fecha; const x = f && f.toDate ? f.toDate() : new Date(f || 0); return +x || 0; };
  hojas.forEach((hoja, i) => {
    const h = HOJAS[i];
    let docs = leidos[h.coleccion].sort((a, b) => orden(b) - orden(a));
    if (h.coleccion === 'ventas') docs = docs.map(v => Object.assign({}, v, { anulada: cancelada(v) || notaCancelada(v, leidos.notasEntrega || []) }));
    hoja.filas = docs.map(h.fila);
    if (hoja.error) hoja.filas.unshift(['INCOMPLETO: ' + hoja.error]);
  });
  return hojas;
}

async function archivoExcel(hojas) {
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  try {
    const ExcelJS = await window.cargarExcelJS();
    const wb = new ExcelJS.Workbook();
    hojas.forEach(h => {
      const ws = wb.addWorksheet(h.nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = h.columnas.map(([header, width, f]) => ({ header, width, style: f === '$' ? { numFmt: '$#,##0.00' } : {} }));
      h.filas.forEach(f => ws.addRow(f));
      ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D2A4A' } }; });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
    });
    return new Blob([await wb.xlsx.writeBuffer()], { type: tipo });
  } catch (e) {
    if (!window.XLSX) throw e;
    console.warn('ExcelJS falló; Excel básico:', e);
    const X = window.XLSX, wb = X.utils.book_new();
    hojas.forEach(h => {
      const ws = X.utils.aoa_to_sheet([h.columnas.map(c => c[0]), ...h.filas]);
      ws['!cols'] = h.columnas.map(c => ({ wch: c[1] }));
      X.utils.book_append_sheet(wb, ws, h.nombre);
    });
    return new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: tipo });
  }
}

// ── Pantalla ──
const DIA = 86400000;
export const diasDesde = (t, ahora = Date.now()) => {
  const a = new Date(t), b = new Date(ahora);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DIA);
};

if (typeof document !== 'undefined') pantalla();

function pantalla() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aviso = (m, t) => window.toast && window.toast(String(m).replace(/</g, '‹').replace(/>/g, '›'), t);
  const cuantos = n => Number(n || 0).toLocaleString('es-MX');
  const fechaLarga = t => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const esAdmin = () => window.currentRole === 'admin' && !!(window.auth && window.auth.currentUser) && !!window.db;
  const refEstado = () => window.doc(window.db, 'config', 'respaldo');

  let estado; // undefined = sin consultar, null = no se pudo, {} = nunca
  let trabajando = false, consultando = false, enlace = null, uid = null;

  // Lee siempre del servidor: una copia guardada en el navegador podría venir a medias
  let sdk = null;
  async function lector() {
    if (!sdk) sdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').catch(() => null);
    return async (nombre, cursor) => {
      const col = window.collection(window.db, nombre);
      const tam = /Fotos$/.test(nombre) ? 40 : 300;
      let pedido;
      if (sdk) {
        const q = [sdk.orderBy(sdk.documentId()), cursor ? sdk.startAfter(cursor) : null, sdk.limit(tam)].filter(Boolean);
        pedido = sdk.getDocsFromServer(sdk.query(col, ...q));
      } else pedido = window.getDocs(col);
      let reloj;
      const snap = await Promise.race([pedido, new Promise((_, no) => { reloj = setTimeout(() => no(new Error('Tardó demasiado')), 120000); })]).finally(() => clearTimeout(reloj));
      if (!sdk && snap.metadata && snap.metadata.fromCache) throw new Error('Sin conexión (offline)');
      return {
        docs: snap.docs.map(d => ({ id: d.id, datos: d.data() })),
        sigue: sdk && snap.docs.length === tam ? snap.docs[snap.docs.length - 1] : null
      };
    };
  }

  async function consultar() {
    if (consultando) return;
    consultando = true;
    try {
      const s = await window.getDoc(refEstado());
      estado = s.exists() ? s.data() : {};
    } catch (e) { console.warn('respaldos: no se pudo leer config/respaldo', e); estado = null; }
    consultando = false;
    pintarEstado();
    recordar();
  }

  function montar() {
    const mod = $('#mod-configuracion');
    if (!mod || $('#m-respaldo', mod)) return;
    const caja = document.createElement('div');
    caja.id = 'm-respaldo';
    caja.className = 'table-card m-respaldo';
    caja.innerHTML = `<div class="table-header"><div class="table-title">Respaldos</div>
        <p>Una copia de la información del negocio para guardarla fuera del gestor.</p></div>
      <div class="m-respaldo-cuerpo">
        <p class="m-respaldo-ultimo" role="status"></p>
        <label class="m-respaldo-fotos"><input type="checkbox" id="m-respaldo-fotos">
          <span><strong>Incluir fotos y archivos adjuntos</strong><small>Fotos de productos y visitas, y facturas guardadas. Pesa y tarda mucho más; mejor con Wi-Fi.</small></span></label>
        <div class="m-respaldo-botones">
          <button type="button" class="btn btn-primary" data-respaldo="json">Descargar respaldo</button>
          <button type="button" class="btn btn-secondary" data-respaldo="excel">Excel para consultar</button>
        </div>
        <p class="m-respaldo-nota">El respaldo (.json) es el que sirve para restaurar. El Excel solo trae ventas, notas, clientes y productos, para leerlos.
          El archivo tiene datos de clientes: guárdalo en un lugar seguro. Las llaves de Mercado Libre y de Pepito no se incluyen.</p>
        <div class="m-respaldo-avance" hidden><progress max="100" value="0"></progress><span aria-live="polite"></span></div>
        <div class="m-respaldo-resultado" aria-live="polite"></div>
      </div>`;
    caja.addEventListener('click', e => {
      const b = e.target.closest('[data-respaldo]');
      if (b) correr(b.dataset.respaldo);
    });
    mod.appendChild(caja);
    pintarEstado();
  }

  function pintarEstado() {
    const p = $('.m-respaldo-ultimo');
    if (!p) return;
    let html, alerta = true;
    if (estado === undefined) { html = 'Consultando el último respaldo…'; alerta = false; }
    else if (estado === null) html = 'No se pudo consultar la fecha del último respaldo.';
    else if (!estado.fecha) html = '<strong>Todavía no hay ningún respaldo registrado.</strong>';
    else {
      const d = diasDesde(estado.fecha);
      alerta = d > 7;
      html = 'Último respaldo: <strong>' + esc(fechaLarga(estado.fecha)) + '</strong> (' + (d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días') + ')' +
        (estado.por ? ' · ' + esc(estado.por) : '') +
        '<br><small>' + (estado.completo ? 'Completo, con fotos y adjuntos.' : (estado.fotos ? '' : 'Sin fotos ni adjuntos. ') +
          (estado.faltaron && estado.faltaron.length ? 'Incompleto, faltó: ' + esc(estado.faltaron.join(', ')) + '.' : '')) + '</small>';
    }
    const fallido = estado && estado.intentoFallido;
    if (fallido && fallido.fecha > (estado.fecha || 0)) {
      alerta = true;
      html += '<br><small>El intento del ' + esc(fechaLarga(fallido.fecha)) + ' quedó incompleto (faltó: ' + esc((fallido.faltaron || []).join(', ')) + ').</small>';
    }
    p.innerHTML = html;
    p.classList.toggle('alerta', alerta);
  }

  // ── Recordatorio en el Resumen (se puede quitar por hoy) ──
  const hoy = () => new Date().toDateString();
  function recordar() {
    const previo = $('#m-respaldo-recordatorio');
    const toca = esAdmin() && estado && (!estado.fecha || diasDesde(estado.fecha) > 7);
    let quitado = false;
    try { quitado = localStorage.getItem('maya.respaldo.quitado') === hoy(); } catch (e) { /* sin almacenamiento */ }
    if (!toca || quitado) { if (previo) previo.remove(); return; }
    const mod = $('#mod-dashboard');
    if (!mod || previo) return;
    const d = document.createElement('div');
    d.id = 'm-respaldo-recordatorio';
    d.className = 'm-respaldo-recordatorio';
    d.setAttribute('role', 'note');
    d.innerHTML = `<span>${estado.fecha ? 'Hace ' + diasDesde(estado.fecha) + ' días del último respaldo.' : 'Aún no se ha hecho ningún respaldo.'}</span>
      <button type="button" class="btn btn-sm btn-secondary" data-ir>Respaldar</button>
      <button type="button" class="btn btn-sm m-respaldo-luego" data-luego>Hoy no</button>`;
    d.addEventListener('click', e => {
      if (e.target.closest('[data-ir]')) { window.showModule('configuracion'); const c = $('#m-respaldo'); if (c) c.scrollIntoView({ block: 'start' }); }
      if (e.target.closest('[data-luego]')) {
        try { localStorage.setItem('maya.respaldo.quitado', hoy()); } catch (x) { /* sin almacenamiento */ }
        d.remove();
      }
    });
    mod.insertBefore(d, mod.firstChild);
  }

  function descargar(blob, nombre) {
    if (enlace) URL.revokeObjectURL(enlace);
    enlace = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = enlace;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return `<a class="btn btn-secondary m-respaldo-otra" href="${enlace}" download="${esc(nombre)}">¿No se bajó? Descargar ${esc(nombre)}</a>`;
  }

  const noCerrar = e => { e.preventDefault(); e.returnValue = ''; };

  async function correr(tipo) {
    if (trabajando) return;
    if (!esAdmin()) return aviso('Solo Dirección puede descargar respaldos', 'error');
    trabajando = true;
    const quien = window.auth.currentUser.uid;
    const caja = $('#m-respaldo'), salida = $('.m-respaldo-resultado', caja), avance = $('.m-respaldo-avance', caja);
    const controles = caja.querySelectorAll('button, input');
    controles.forEach(c => { c.disabled = true; });
    salida.innerHTML = '';
    avance.hidden = false;
    addEventListener('beforeunload', noCerrar);
    const alProgreso = a => {
      $('progress', avance).value = Math.round(a.i / a.de * 100);
      $('span', avance).textContent = 'Leyendo ' + a.etiqueta + ' (' + (a.i + 1) + ' de ' + a.de + ')' + (a.leidos ? ': ' + cuantos(a.leidos) : '') + '… No cierres esta pantalla.';
    };
    try {
      const leerPagina = await lector();
      if (tipo === 'excel') await correrExcel(leerPagina, alProgreso, salida);
      else await correrJson(leerPagina, alProgreso, salida, $('#m-respaldo-fotos', caja).checked);
    } catch (e) {
      console.error('respaldos:', e);
      salida.innerHTML = '<p class="m-respaldo-mal">No se generó el archivo: ' + esc(motivo(e)) + '</p>';
      aviso('No se generó el archivo', 'error');
    } finally {
      removeEventListener('beforeunload', noCerrar);
      avance.hidden = true;
      controles.forEach(c => { c.disabled = false; });
      trabajando = false;
      // Si la sesión cambió mientras se generaba, el resultado no se queda para otra persona
      if (!esAdmin() || window.auth.currentUser.uid !== quien) caja.remove();
    }
  }

  async function correrExcel(leerPagina, alProgreso, salida) {
    const hojas = await leerHojas({ leerPagina, alProgreso });
    const mal = hojas.filter(h => h.error);
    if (mal.length === hojas.length) throw new Error(mal[0].error);
    const f = new Date(), p = x => String(x).padStart(2, '0');
    const nombre = 'maya-consulta-' + f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) + (mal.length ? '-INCOMPLETO' : '') + '.xlsx';
    const boton = descargar(await archivoExcel(hojas), nombre);
    salida.innerHTML = (mal.length ? '<p class="m-respaldo-mal"><strong>Excel INCOMPLETO.</strong> No se pudo leer: ' + esc(mal.map(h => h.nombre + ' (' + h.error + ')').join('; ')) + '</p>'
      : '<p class="m-respaldo-bien">Excel generado.</p>') +
      '<ul>' + hojas.map(h => `<li class="${h.error ? 'mal' : ''}"><span>${esc(h.nombre)}</span><b>${h.error ? 'incompleta' : cuantos(h.n)}</b></li>`).join('') + '</ul>' + boton;
  }

  async function correrJson(leerPagina, alProgreso, salida, fotos) {
    const u = window.auth.currentUser;
    const por = (window.miPerfil && window.miPerfil.nombre) || u.email || '';
    const leerDoc = async (col, id) => {
      const ref = window.doc(window.db, col, id);
      const s = await (sdk ? sdk.getDocFromServer(ref) : window.getDoc(ref));
      return s.exists() ? s.data() : null;
    };
    const r = await generarRespaldo({ leerPagina, leerDoc, fotos, por, proyecto: (window.db.app && window.db.app.options.projectId) || '', alProgreso });
    // Si no se leyó nada no vale la pena entregar un archivo
    if (!r.total && r.errores.length) throw new Error(r.errores[0].error);
    const boton = descargar(r.blob, r.archivo);
    const faltaron = r.errores.map(e => e.etiqueta);
    const titulo = r.sinErrores
      ? '<p class="m-respaldo-bien"><strong>' + (r.completo ? 'Respaldo completo.' : 'Respaldo de todos los datos, sin fotos ni adjuntos.') + '</strong> ' + cuantos(r.total) + ' registros.</p>'
      : '<div class="m-respaldo-mal"><strong>Respaldo INCOMPLETO.</strong> No se pudo leer:<ul>' + r.errores.map(e => '<li>' + esc(e.etiqueta) + ': ' + esc(e.error) + (e.leidos ? ' (solo ' + cuantos(e.leidos) + ')' : '') + '</li>').join('') +
        '</ul>' + (r.negocioCompleto ? 'Los datos principales del negocio sí quedaron. Avisa a tu técnico.' : 'Faltan datos importantes: revisa la conexión, intenta otra vez o avisa a tu técnico.') + '</div>';
    salida.innerHTML = titulo + boton + '<details><summary>Ver cuántos registros trae cada parte</summary><ul>' +
      r.resumen.map(x => `<li class="${x.error ? 'mal' : ''}"><span>${esc(x.etiqueta)}</span><b>${x.error ? 'no se leyó completa' : cuantos(x.n)}</b></li>`).join('') +
      (fotos ? '' : '<li><span>Fotos</span><b>no incluidas</b></li>') + (r.omitidos ? '<li><span>Archivos adjuntos</span><b>' + cuantos(r.omitidos) + ' no incluidos</b></li>' : '') + '</ul></details>';
    aviso(r.sinErrores ? 'Respaldo descargado' : 'El respaldo quedó incompleto', r.sinErrores ? 'success' : 'error');
    const dato = r.negocioCompleto
      ? { fecha: Date.now(), por, completo: r.completo, fotos, faltaron, documentos: r.total, archivo: r.archivo }
      : { intentoFallido: { fecha: Date.now(), por, faltaron } };
    try {
      await window.setDoc(refEstado(), dato, { merge: true });
      estado = Object.assign({}, estado || {}, dato);
      pintarEstado();
      recordar();
    } catch (e) {
      console.warn('respaldos: no se pudo anotar la fecha', e);
      salida.insertAdjacentHTML('beforeend', '<p class="m-respaldo-mal">El archivo se generó, pero no se pudo anotar la fecha en el gestor.</p>');
    }
  }

  // El perfil tarda en cargar y la sesión puede cambiar sin recargar la página
  function revisar() {
    const actual = esAdmin() ? window.auth.currentUser.uid : null;
    if (actual !== uid) {
      uid = actual;
      estado = undefined;
      if (enlace) { URL.revokeObjectURL(enlace); enlace = null; }
      const c = $('#m-respaldo');
      if (c && !trabajando) c.remove();
      recordar();
      if (uid) consultar();
    }
    if (uid) { montar(); recordar(); }
  }
  setInterval(revisar, 3000);
  revisar();
}
