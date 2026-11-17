// Plazos de facturación (Geraldine Bot): lo usan el gestor (Facturación y Seguimiento) y el servidor (resumen diario, Pepito).
// Cada cliente tiene sus días para facturar (clientes/{id}.diasFacturar; si no, DIAS_FACTURAR); el reloj corre desde que la
// pieza se marca Entregada. Estados de una nota pendiente de facturar:
//   en_entrega      todavía no se entrega (no corre el plazo)
//   sin_movimiento  no se ha entregado y lleva 10 días sin ningún cambio → posible cancelación, hay que preguntar
//   espera          entregada, aún no toca facturar (el cliente pide esperar sus días)
//   por_vencer      mañana se cumple el plazo (día 5 de 6)
//   lista           ya se cumplió el plazo: lista para facturar (día 6 de 6)
//   vencida         se pasó del plazo (día 7 en adelante)
// Una nota también puede estar "cancelada" (con motivo obligatorio): ya no se factura.
(function (raiz) {
  const DIA = 86400000;
  const DIAS_FACTURAR = 6;
  // Geraldine Bot solo vigila las notas creadas desde que arrancó. Lo anterior se facturó en CONTPAQi sin subir el XML
  // al gestor, así que aquí aparece "sin factura" aunque ya esté facturado: no se alarma (se cambia en config/geraldine.desde).
  const DESDE = '2026-11-10';
  const creadaEn = doc => ms(doc && doc.createdAt) || ms(doc && doc.fecha) || 0;
  const desdeMs = desde => Date.parse((desde || DESDE) + 'T00:00:00-06:00');
  const esHistorica = (doc, desde) => { const c = creadaEn(doc); return !!c && c < desdeMs(desde); };
  const DIAS_SIN_MOVIMIENTO = 10;
  const MOTIVOS_CANCELACION = [
    { id: 'taller_no_acepto', nombre: 'El taller no aceptó la pieza' },
    { id: 'reparada', nombre: 'La pieza estaba reparada' },
    { id: 'siniestro_cancelado', nombre: 'El seguro canceló el siniestro (pago de daños)' },
    { id: 'cambio_pieza', nombre: 'Cambio de pieza por otra referencia' },
    { id: 'otra', nombre: 'Otra causa (especificar)' }
  ];
  const nombreMotivo = id => { const m = MOTIVOS_CANCELACION.find(x => x.id === id); return m ? m.nombre : String(id || ''); };

  const ms = f => (!f ? 0 : f.toMillis ? f.toMillis() : f.seconds ? f.seconds * 1000 : f._seconds ? f._seconds * 1000 : typeof f === 'number' ? f : (Date.parse(f) || 0));
  const diasFacturarDe = (cliente, defecto) => (cliente && Number(cliente.diasFacturar) >= 0 && cliente.diasFacturar !== '' && cliente.diasFacturar != null ? Number(cliente.diasFacturar) : (defecto == null ? DIAS_FACTURAR : defecto));

  // Cuándo se entregó: el último evento "entregada" del seguimiento; si la nota ya decía Entregado sin evento, su fecha
  function entregadaEn(doc) {
    const ev = (doc.seguimiento || []).filter(h => h.etapa === 'entregada').map(h => ms(h.fecha)).filter(Boolean);
    if (ev.length) return Math.max.apply(null, ev);
    return ms(doc.fecha) || ms(doc.createdAt) || 0;
  }
  // Último cambio que tuvo la nota (para "sin movimiento")
  function ultimoMovimiento(doc) {
    const fechas = (doc.seguimiento || []).map(h => ms(h.fecha)).concat(ms(doc.createdAt), ms(doc.fecha)).filter(Boolean);
    return fechas.length ? Math.max.apply(null, fechas) : 0;
  }

  // etapa: registrada | preparacion | transito | entregada | facturada | pagada | cancelada
  function estadoFacturacion(doc, etapa, dias, ahora, desde) {
    ahora = ahora || Date.now();
    if (['facturada', 'pagada', 'cancelada'].includes(etapa)) return null;
    if (esHistorica(doc, desde)) return null;
    const plazo = dias == null ? DIAS_FACTURAR : dias;
    if (etapa !== 'entregada') {
      const quieto = Math.floor((ahora - (ultimoMovimiento(doc) || ahora)) / DIA);
      return quieto >= DIAS_SIN_MOVIMIENTO
        ? { clave: 'sin_movimiento', dias: quieto, texto: 'Sin movimiento ' + quieto + ' d', detalle: 'No se ha entregado y lleva ' + quieto + ' días sin cambios. ¿Se mantiene o se cancela?' }
        : { clave: 'en_entrega', dias: quieto, texto: 'En entrega', detalle: 'Todavía no se entrega; el plazo corre al entregarla.' };
    }
    const d = Math.floor((ahora - (entregadaEn(doc) || ahora)) / DIA);
    if (d > plazo) return { clave: 'vencida', dias: d, texto: 'Vencida ' + d + ' d', detalle: 'Entregada hace ' + d + ' días; el plazo era de ' + plazo + '. Hay que facturarla ya.' };
    if (d === plazo) return { clave: 'lista', dias: d, texto: 'Lista para facturar', detalle: 'Hoy se cumplen los ' + plazo + ' días: ya se puede facturar.' };
    if (d === plazo - 1) return { clave: 'por_vencer', dias: d, texto: 'Vence mañana', detalle: 'Mañana se cumplen los ' + plazo + ' días.' };
    return { clave: 'espera', dias: d, texto: 'Espera ' + (plazo - d) + ' d', detalle: 'Entregada hace ' + d + ' días; el cliente pide facturar a los ' + plazo + '.' };
  }
  // Envíos: lo que lleva cada nota cuando sale por paquetería (nota.envio = { tipo, paqueteria, guia, estatus, fechaEnvio, fechaEntrega, observaciones })
  const PAQUETERIAS = ['Paquete Express', 'Skydrops', 'Mercado Envíos', 'Estafeta', 'DHL', 'FedEx', 'Otra'];
  // Semáforo de paquetería: el envío sigue el camino real del paquete. Cada paso tiene su tiempo: verde a tiempo,
  // amarillo cuando ya se tardó, rojo cuando se atoró. Incidencia (retenido, dirección, devolución) siempre es rojo.
  const ESTATUS_ENVIO = [
    { id: 'almacen', nombre: 'En almacén', paso: 0, ayuda: 'Empacando o esperando que pase la paquetería' },
    { id: 'recoleccion', nombre: 'Recolectado', paso: 1, ayuda: 'La paquetería ya lo recogió o se dejó en sucursal' },
    { id: 'transito', nombre: 'En movimiento', paso: 2, ayuda: 'Va en camino al cliente' },
    { id: 'entregado', nombre: 'Entregado', paso: 3, ayuda: 'El cliente ya lo recibió' },
    { id: 'incidencia', nombre: 'Incidencia', paso: null, ayuda: 'Retenido, dirección incorrecta, dañado o devuelto' },
    { id: 'cancelado', nombre: 'Envío cancelado', paso: null, ayuda: '' }
  ];
  const PASOS_ENVIO = ESTATUS_ENVIO.filter(e => e.paso != null);
  // Días en cada paso antes de amarillo y de rojo
  const LIMITES_ENVIO = { almacen: [1, 2], recoleccion: [1, 2], transito: [3, 5] };
  // Los estatus de antes se leen como los nuevos
  const ANTES = { sin_guia: 'almacen', guia_generada: 'almacen', en_transito: 'transito', recibido: 'entregado' };
  const estatusEnvio = id => ANTES[id] || (ESTATUS_ENVIO.some(e => e.id === id) ? id : 'almacen');
  const nombreEnvio = id => { const e = ESTATUS_ENVIO.find(x => x.id === estatusEnvio(id)); return e ? e.nombre : String(id || ''); };
  const DIAS_ENVIO_QUIETO = LIMITES_ENVIO.transito[0];
  // Desde cuándo está en su paso actual (envio.pasos guarda la hora de cada cambio; los envíos de antes, su última actualización)
  function desdePaso(e, doc) {
    const est = estatusEnvio(e.estatus);
    return ms(e.pasos && e.pasos[est]) || ms(e.actualizado) || (est === 'transito' ? ms(e.fechaEnvio) : 0) || ms(e.fechaGuia) || ultimoMovimiento(doc);
  }
  // { color: verde|amarillo|rojo|gris, texto, paso (0-3 o null), estatus, dias }
  function semaforoEnvio(doc, ahora) {
    const e = doc && doc.envio;
    if (!e) return null;
    ahora = ahora || Date.now();
    const est = estatusEnvio(e.estatus);
    const info = ESTATUS_ENVIO.find(x => x.id === est);
    const base = { estatus: est, paso: info.paso, dias: 0 };
    if (est === 'cancelado') return Object.assign(base, { color: 'gris', texto: 'Envío cancelado' });
    if (est === 'entregado') return Object.assign(base, { color: 'verde', texto: 'Entregado' });
    if (est === 'incidencia') return Object.assign(base, { color: 'rojo', texto: 'Incidencia' + (e.observaciones ? ': ' + String(e.observaciones).slice(0, 60) : '') });
    const d = Math.max(0, Math.floor((ahora - (desdePaso(e, doc) || ahora)) / DIA));
    base.dias = d;
    const [amarillo, rojo] = LIMITES_ENVIO[est];
    if (e.tipo !== 'local' && !e.guia) return Object.assign(base, { color: d >= rojo ? 'rojo' : 'amarillo', texto: 'Falta la guía' + (d ? ' · ' + d + ' d' : ''), sinGuia: true });
    if (d >= rojo) return Object.assign(base, { color: 'rojo', texto: info.nombre + ' ' + d + ' d · atorado' });
    if (d >= amarillo) return Object.assign(base, { color: 'amarillo', texto: info.nombre + ' ' + d + ' d' });
    return Object.assign(base, { color: 'verde', texto: info.nombre + (d ? ' · ' + d + ' d' : '') });
  }
  // Alerta para listas, resumen y Pepito: sin guía, quieto (amarillo o rojo) o incidencia; null si va bien
  function alertaEnvio(doc, etapa, ahora, desde) {
    const e = doc && doc.envio;
    if (!e || ['entregada', 'facturada', 'pagada', 'cancelada'].includes(etapa)) return null;
    if (esHistorica(doc, desde)) return null;
    const s = semaforoEnvio(doc, ahora);
    if (!s || s.color === 'verde' || s.color === 'gris') return null;
    return { clave: s.sinGuia ? 'sin_guia' : s.estatus === 'incidencia' ? 'incidencia' : 'quieto', texto: s.texto, dias: s.dias, color: s.color };
  }

  const ORDEN = ['vencida', 'lista', 'por_vencer', 'sin_movimiento', 'espera', 'en_entrega'];
  const NOMBRES = { vencida: 'Vencidas', lista: 'Listas para facturar', por_vencer: 'Por vencer', sin_movimiento: 'Sin movimiento', espera: 'En espera', en_entrega: 'En entrega' };

  const api = { DESDE, creadaEn, esHistorica, DIA, DIAS_FACTURAR, DIAS_SIN_MOVIMIENTO, MOTIVOS_CANCELACION, nombreMotivo, diasFacturarDe, entregadaEn, ultimoMovimiento, estadoFacturacion, ORDEN, NOMBRES, PAQUETERIAS, ESTATUS_ENVIO, PASOS_ENVIO, LIMITES_ENVIO, estatusEnvio, nombreEnvio, DIAS_ENVIO_QUIETO, semaforoEnvio, alertaEnvio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaPlazos = api;
})(typeof window !== 'undefined' ? window : globalThis);
