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
  function estadoFacturacion(doc, etapa, dias, ahora) {
    ahora = ahora || Date.now();
    if (['facturada', 'pagada', 'cancelada'].includes(etapa)) return null;
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
  const ESTATUS_ENVIO = [
    { id: 'sin_guia', nombre: 'Sin guía' },
    { id: 'guia_generada', nombre: 'Guía generada' },
    { id: 'en_transito', nombre: 'En tránsito' },
    { id: 'recibido', nombre: 'Recibido' },
    { id: 'cancelado', nombre: 'Envío cancelado' }
  ];
  const nombreEnvio = id => { const e = ESTATUS_ENVIO.find(x => x.id === id); return e ? e.nombre : String(id || ''); };
  const DIAS_ENVIO_QUIETO = 3;
  // Alerta de un envío: sin guía (nacional sin guía), quieto (guía generada o en tránsito sin cambio en 3 días) o null
  function alertaEnvio(doc, etapa, ahora) {
    const e = doc && doc.envio;
    if (!e || ['entregada', 'facturada', 'pagada', 'cancelada'].includes(etapa)) return null;
    if (e.estatus === 'recibido' || e.estatus === 'cancelado') return null;
    ahora = ahora || Date.now();
    if (e.tipo === 'nacional' && (!e.guia || e.estatus === 'sin_guia')) return { clave: 'sin_guia', texto: 'Falta la guía', dias: 0 };
    const desde = ms(e.actualizado) || ms(e.fechaEnvio) || ultimoMovimiento(doc);
    const d = desde ? Math.floor((ahora - desde) / DIA) : 0;
    if (['guia_generada', 'en_transito'].includes(e.estatus) && d >= DIAS_ENVIO_QUIETO) return { clave: 'quieto', texto: nombreEnvio(e.estatus) + ' ' + d + ' d sin cambio', dias: d };
    return null;
  }

  const ORDEN = ['vencida', 'lista', 'por_vencer', 'sin_movimiento', 'espera', 'en_entrega'];
  const NOMBRES = { vencida: 'Vencidas', lista: 'Listas para facturar', por_vencer: 'Por vencer', sin_movimiento: 'Sin movimiento', espera: 'En espera', en_entrega: 'En entrega' };

  const api = { DIA, DIAS_FACTURAR, DIAS_SIN_MOVIMIENTO, MOTIVOS_CANCELACION, nombreMotivo, diasFacturarDe, entregadaEn, ultimoMovimiento, estadoFacturacion, ORDEN, NOMBRES, PAQUETERIAS, ESTATUS_ENVIO, nombreEnvio, DIAS_ENVIO_QUIETO, alertaEnvio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaPlazos = api;
})(typeof window !== 'undefined' ? window : globalThis);
