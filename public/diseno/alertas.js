// Candados antes de guardar una venta: cosas que casi siempre son un error de captura. NO bloquean para siempre: se le
// enseñan a la persona antes de su SÍ (Pepito) o en un "¿Seguro?" (gestor), y si está bien, se guarda.
// Lo usan el formulario de Ventas del gestor y el servidor (crear_venta, corregir_venta, convertir_cotizacion), así los
// dos revisan exactamente lo mismo.
(function (raiz) {
  const DIA = 86400000;
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ms = v => {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (v.seconds != null) return v.seconds * 1000;
    if (v._seconds != null) return v._seconds * 1000;
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  };
  const cuando = v => ms(v.fecha) || ms(v.createdAt);
  // Las ventas del gestor se guardan a medianoche UTC (ese día); las de Pepito a mediodía local
  const fecha = t => { const d = new Date(t); const utc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0; return d.toLocaleDateString('es-MX', { timeZone: utc ? 'UTC' : 'America/Mexico_City', day: 'numeric', month: 'short' }); };
  const cancelada = v => /^cancel/.test(norm(v.estatus)) || v.estado === 'cancelada';
  const folio = v => 'NV #' + (v.notaId || v.notaNumero || '');
  const palabras = s => norm(s).split(' ').filter(p => p.length > 2);
  const mediana = l => { const a = l.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const fuera = (x, ref) => ref > 0 && x > 0 && (x / ref > 3 || ref / x > 3);

  // venta = { id?, clienteId, clienteNombre, items: [{ pedido, numSiniestro, precio, iva, costo }], total, utilidad }
  // ventas / compras = lo que ya hay guardado. opciones.repetida = false para no comparar contra ventas recientes (corrección).
  function revisar(venta, ventas, compras, opciones) {
    const o = Object.assign({ repetida: true, ahora: Date.now() }, opciones);
    const alertas = [];
    const otras = (ventas || []).filter(v => v && v.id !== venta.id && !cancelada(v));
    const items = venta.items || [];
    const piezas = new Set(items.map(i => norm(i.pedido)).filter(Boolean));

    // 1. Venta repetida: mismo cliente en los últimos 3 días con el mismo total o la misma pieza
    if (o.repetida) {
      const mismoCliente = v => (venta.clienteId && v.clienteId ? v.clienteId === venta.clienteId : norm(v.clienteNombre) === norm(venta.clienteNombre));
      const rep = otras.find(v => mismoCliente(v) && o.ahora - cuando(v) < 3 * DIA &&
        (Math.abs((Number(v.total) || 0) - (Number(venta.total) || 0)) < 1 || (v.items || []).some(i => piezas.has(norm(i.pedido)))));
      if (rep) alertas.push('Parece repetida: ya hay una venta a ' + (rep.clienteNombre || 'este cliente') + ' del ' + fecha(cuando(rep)) + ' (' + folio(rep) + ') por ' + pesos(rep.total) + '. ¿Es otra venta?');
    }

    items.forEach(i => {
      const s = String(i.numSiniestro || '').trim();
      // 2. Siniestro: incompleto, o la misma pieza con el mismo siniestro ya vendida
      if (s && s.replace(/[^A-Za-z0-9]/g, '').length < 5) alertas.push('El siniestro "' + s + '" se ve incompleto.');
      if (s) {
        const otra = otras.find(v => (v.items || []).some(x => norm(x.numSiniestro) === norm(s) && norm(x.pedido) === norm(i.pedido)));
        if (otra) alertas.push('"' + i.pedido + '" con el siniestro ' + s + ' ya está en ' + folio(otra) + '.');
      }
      // 3. Precio contra su propio costo: abajo del costo, o más de 4 veces (¿un cero de más o de menos?)
      const cliente = (Number(i.precio) || 0) + (Number(i.iva) || 0);
      if (i.costo > 0 && cliente > 0) {
        if (cliente > 4 * i.costo) alertas.push('"' + i.pedido + '": el precio (' + pesos(cliente) + ') es más de 4 veces el costo (' + pesos(i.costo) + '). ¿Sobra o falta un cero?');
        else if (cliente < i.costo) alertas.push('"' + i.pedido + '" se vende en ' + pesos(cliente) + ', abajo de su costo (' + pesos(i.costo) + ').');
      }
      // 4. Contra lo de antes: la misma pieza costó o se vendió en algo muy distinto (3 veces más o menos)
      const pal = palabras(i.pedido);
      if (pal.length >= 2) {
        const coincide = t => { const n = norm(t); return pal.every(p => n.includes(p)); };
        const costos = [], precios = [];
        otras.slice().sort((a, b) => cuando(b) - cuando(a)).forEach(v => (v.items || []).forEach(x => {
          if (!coincide(x.pedido) || costos.length >= 20) return;
          if (x.costo > 0) costos.push(Number(x.costo));
          const p = (Number(x.precio) || 0) + (Number(x.iva) || 0);
          if (p > 0) precios.push(p);
        }));
        (compras || []).forEach(c => (c.articulos || []).forEach(a => { if (coincide(a.pieza) && a.costoUnitario > 0) costos.push(Number(a.costoUnitario)); }));
        if (costos.length && i.costo > 0 && fuera(i.costo, mediana(costos))) alertas.push('"' + i.pedido + '": antes costaba alrededor de ' + pesos(mediana(costos)) + ' y ahora el costo es ' + pesos(i.costo) + '. Revisa el costo.');
        if (precios.length && cliente > 0 && fuera(cliente, mediana(precios))) alertas.push('"' + i.pedido + '": antes se vendía en alrededor de ' + pesos(mediana(precios)) + ' y ahora en ' + pesos(cliente) + '. Revisa el precio.');
      }
    });

    // 5. Toda la venta abajo del costo
    if (venta.utilidad != null && venta.utilidad < 0 && !alertas.some(a => /abajo de su costo/.test(a))) alertas.push('La venta pierde ' + pesos(-venta.utilidad) + ': el costo total es mayor que lo que paga el cliente.');
    return [...new Set(alertas)];
  }

  // Pago repetido: misma factura y mismo monto en los últimos 3 días
  function revisarPago(factura, monto, ahora) {
    const t = ahora || Date.now();
    const igual = (factura.pagos || []).find(p => Math.abs((Number(p.monto) || 0) - monto) < 0.01 && t - ms(p.fecha) < 3 * DIA);
    return igual ? ['Ya hay un pago de ' + pesos(monto) + ' a ' + factura.serieFolio + ' del ' + fecha(ms(igual.fecha)) + '. ¿Es otro pago?'] : [];
  }

  const api = { revisar, revisarPago };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaAlertas = api;
})(typeof window !== 'undefined' ? window : globalThis);
