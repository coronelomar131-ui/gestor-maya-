// Reporte diario de Maya para WhatsApp: ventas de ayer, lo que falta facturar y la cobranza vencida.
// Cada quien recibe lo de su rol: admin todo; facturación, lo de facturar y cobrar.
const datos = require('./datos');

const TZ = 'America/Mexico_City';
const diaCDMX = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaLarga = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d, 12).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); };

async function armar(ahora = Date.now()) {
  const ayer = diaCDMX(ahora - 86400000);
  const [registros, porFacturar, cobro] = await Promise.all([datos.cargarRegistros(), datos.pendientesFacturar({}), datos.cobranza({ limite: 200 })]);
  const deAyer = datos.filtrar(registros, { tipo: 'todas', desde: ayer, hasta: ayer });
  const r = datos.resumen(deAyer);
  const porCliente = {};
  deAyer.forEach(x => { porCliente[x.cliente || 'Sin cliente'] = (porCliente[x.cliente || 'Sin cliente'] || 0) + x.total; });
  const top = Object.entries(porCliente).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const vencidas = cobro.detalle.filter(f => f.dias_vencida > 0);
  const hoy = diaCDMX(ahora);
  const vencenHoy = cobro.detalle.filter(f => f.vence === hoy);
  return {
    ayer, fecha: fechaLarga(ayer),
    ventas: { notas: r.notas, total: r.total, sinImporte: r.notas_sin_importe || 0, top },
    facturar: { notas: porFacturar.notas_pendientes, total: porFacturar.total },
    cobranza: { porCobrar: cobro.por_cobrar, vencido: cobro.vencido, vencidas: vencidas.length, vencenHoy: vencenHoy.length, peor: vencidas[0] || null }
  };
}

function texto(rep, persona) {
  const verVentas = persona.rol === 'admin';
  const lineas = ['Buenos días, ' + String(persona.nombre || '').split(' ')[0] + '. Así cerró el ' + rep.fecha + ':'];
  if (verVentas) {
    lineas.push('', '🧾 *Ventas:* ' + (rep.ventas.notas ? rep.ventas.notas + (rep.ventas.notas === 1 ? ' nota' : ' notas') + ' por ' + pesos(rep.ventas.total) : 'no hubo notas'));
    if (rep.ventas.sinImporte) lineas.push('   ' + rep.ventas.sinImporte + ' sin precio a propósito');
    rep.ventas.top.forEach(([c, v]) => lineas.push('   • ' + c + ': ' + pesos(v)));
  }
  lineas.push('', '📄 *Por facturar:* ' + (rep.facturar.notas ? rep.facturar.notas + (rep.facturar.notas === 1 ? ' nota' : ' notas') + ' por ' + pesos(rep.facturar.total) : 'nada pendiente'));
  const c = rep.cobranza;
  lineas.push('💰 *Por cobrar:* ' + pesos(c.porCobrar) + (c.vencido ? ', vencido ' + pesos(c.vencido) + ' en ' + c.vencidas + (c.vencidas === 1 ? ' factura' : ' facturas') : ', nada vencido'));
  if (c.peor) lineas.push('   La más atrasada: ' + c.peor.factura + ' de ' + c.peor.cliente + ', ' + c.peor.dias_vencida + ' días');
  if (c.vencenHoy) lineas.push('   Hoy vencen ' + c.vencenHoy + (c.vencenHoy === 1 ? ' factura' : ' facturas'));
  lineas.push('', 'Pregúntame lo que quieras para ver el detalle.');
  return lineas.join('\n');
}

// Una línea para la plantilla de Meta (sin saltos de línea)
function corto(rep, persona) {
  const partes = [];
  if (persona.rol === 'admin') partes.push('ventas ' + pesos(rep.ventas.total) + ' en ' + rep.ventas.notas + ' notas');
  partes.push('por facturar ' + pesos(rep.facturar.total));
  partes.push('vencido ' + pesos(rep.cobranza.vencido));
  return partes.join(', ');
}

module.exports = { armar, texto, corto };
