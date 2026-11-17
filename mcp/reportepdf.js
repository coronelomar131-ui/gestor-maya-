// Reporte de ventas en PDF (por cliente, vendedor, día, mes o pieza), con el logo de la app. Lo usa Pepito
// (mandar_pdf tipo reporte) para mandarlo por WhatsApp. Las cifras salen de las mismas notas que resumen_ventas.
const datos = require('./datos');

const TITULOS = { cliente: 'Ventas por cliente', vendedor: 'Ventas por vendedor', dia: 'Ventas por día', mes: 'Ventas por mes', articulo: 'Ventas por pieza' };
const COLUMNA = { cliente: 'Cliente', vendedor: 'Vendedor', dia: 'Día', mes: 'Mes', articulo: 'Pieza' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaLarga = iso => { if (!iso) return ''; const [a, m, d] = iso.split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + a; };
const mesLargo = iso => { const [a, m] = iso.split('-').map(Number); return MESES[m - 1].replace(/^./, c => c.toUpperCase()) + ' ' + a; };

// f = { agrupar_por, desde, hasta, tipo, cliente, vendedor, quitar_en_cero (true), limite }
async function armar(f) {
  const por = TITULOS[f.agrupar_por] ? f.agrupar_por : 'cliente';
  const todas = datos.filtrar(await datos.cargarRegistros(), Object.assign({ tipo: 'todas' }, f));
  const quitarCero = f.quitar_en_cero !== false;
  const lista = quitarCero ? todas.filter(x => x.total > 0) : todas;
  const grupos = new Map();
  const sumar = (clave, etiqueta, nota, total) => {
    const g = grupos.get(clave) || { etiqueta, notas: new Set(), total: 0 };
    g.notas.add(nota); g.total += total; grupos.set(clave, g);
  };
  lista.forEach(x => {
    if (por === 'articulo') x.items.forEach(it => sumar(datos.norm(it.texto), it.texto, x.tipo + x.id, it.importe / 100));
    else if (por === 'dia' || por === 'mes') { const iso = x.fecha ? datos.fechaISO(x.fecha) : 'sin fecha'; const k = por === 'mes' && x.fecha ? iso.slice(0, 7) : iso; sumar(k, k, x.tipo + x.id, x.total / 100); }
    else { const v = String((por === 'vendedor' ? x.vendedor : x.cliente) || '').trim() || '(sin ' + por + ')'; sumar(datos.norm(v), v, x.tipo + x.id, x.total / 100); }
  });
  let filas = [...grupos.values()].map(g => ({ etiqueta: g.etiqueta, notas: g.notas.size, total: Math.round(g.total * 100) / 100 }));
  if (por === 'dia' || por === 'mes') filas.sort((a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta)));
  else filas.sort((a, b) => b.total - a.total);
  if (por === 'mes') filas = filas.map(r => Object.assign(r, { etiqueta: /^\d{4}-\d{2}$/.test(r.etiqueta) ? mesLargo(r.etiqueta) : r.etiqueta }));
  const limite = Math.min(Math.max(Number(f.limite) || 60, 1), 200);
  const total = Math.round(lista.reduce((s, x) => s + x.total, 0)) / 100;
  // Quiénes se quitaron por estar en $0 (p. ej. clientes con nota sin precio)
  const quitados = [];
  if (quitarCero && (por === 'cliente' || por === 'vendedor')) {
    const ceros = new Map();
    todas.filter(x => x.total === 0).forEach(x => { const v = String((por === 'vendedor' ? x.vendedor : x.cliente) || '').trim() || '(sin ' + por + ')'; ceros.set(v, (ceros.get(v) || 0) + 1); });
    ceros.forEach((n, v) => { if (!filas.some(r => datos.norm(r.etiqueta) === datos.norm(v))) quitados.push({ etiqueta: v, notas: n }); });
  }
  const r = datos.resumen(lista);
  const desde = f.desde || r.desde, hasta = f.hasta || r.hasta;
  return {
    por, titulo: TITULOS[por], columna: COLUMNA[por],
    periodo: desde && hasta ? 'Del ' + fechaLarga(desde) + ' al ' + fechaLarga(hasta) : 'Todo el historial',
    filtros: [f.cliente ? 'Cliente: ' + f.cliente : '', f.vendedor ? 'Vendedor: ' + f.vendedor : '', f.tipo === 'entrega' ? 'Solo notas de entrega' : f.tipo === 'venta' ? 'Solo notas de venta' : ''].filter(Boolean),
    filas: filas.slice(0, limite), mas: Math.max(0, filas.length - limite),
    notas: lista.length, total, sin_cero: quitarCero, ceros: todas.length - lista.length, quitados,
    duplicados: r.posibles_duplicados || []
  };
}

function pdf(rep) {
  const { jsPDF } = require('jspdf');
  require('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const logo = require('./pdf').logo();
  if (logo) { try { doc.addImage(logo, 'JPEG', 14, 10, 32, 16); } catch (e) { /* sin logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 79, 122);
  doc.text(rep.titulo, W - 14, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70);
  doc.text(rep.periodo, W - 14, 23, { align: 'right' });
  doc.text(['Maya Autopartes'].concat(rep.filtros).join(' · '), W - 14, 28, { align: 'right' });
  doc.setDrawColor(59, 188, 212); doc.setFillColor(232, 247, 251);
  doc.roundedRect(14, 36, 88, 20, 3, 3, 'FD'); doc.roundedRect(108, 36, 88, 20, 3, 3, 'FD');
  doc.setTextColor(30, 79, 122); doc.setFontSize(9); doc.text('TOTAL VENDIDO', 19, 43); doc.text('NOTAS', 113, 43);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pesos(rep.total), 19, 51); doc.text(String(rep.notas), 113, 51);
  const centro = { 0: 'center', 2: 'center', 3: 'right', 4: 'right' };
  doc.autoTable({
    startY: 64,
    head: [['#', rep.columna, 'Notas', 'Total', '% del total']],
    body: rep.filas.length ? rep.filas.map((f, i) => [i + 1, f.etiqueta, f.notas, pesos(f.total), rep.total ? (f.total / rep.total * 100).toFixed(1) + ' %' : '—']) : [['', 'Sin ventas en ese periodo', '', '', '']],
    foot: [['', 'Total' + (rep.mas ? ' (incluye ' + rep.mas + ' más que no caben)' : ''), rep.notas, pesos(rep.total), '100 %']],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [30, 79, 122] }, footStyles: { fillColor: [232, 247, 251], textColor: [30, 79, 122], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'center', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 36 }, 4: { halign: 'right', cellWidth: 26 } },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    didParseCell: d => { if (d.section !== 'body') d.cell.styles.halign = centro[d.column.index] || 'left'; }
  });
  const notas = [];
  if (rep.sin_cero && rep.ceros) notas.push('No incluye ' + rep.ceros + (rep.ceros === 1 ? ' nota en $0' : ' notas en $0') + (rep.quitados.length ? ' (' + rep.quitados.map(q => q.etiqueta + ': ' + q.notas).join(', ') + ')' : '') + '.');
  rep.duplicados.slice(0, 5).forEach(d => notas.push('Posible duplicado: ' + d + '. Si son la misma venta, el total cuenta una de más.'));
  notas.push('Montos como están en el gestor (con IVA cuando la nota lo lleva).');
  let y = doc.lastAutoTable.finalY + 10;
  if (y > H - 40) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 79, 122); doc.text('Notas', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
  notas.forEach(t => { const l = doc.splitTextToSize('• ' + t, W - 28); doc.text(l, 14, y + 6); y += 6 * l.length; });
  doc.setFontSize(8); doc.setTextColor(130);
  const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text('Generado el ' + hoy + ' · gestor-maya.vercel.app', 14, H - 10);
  const nombre = rep.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') + '.pdf';
  return { datos: Buffer.from(doc.output('arraybuffer')), archivo: nombre };
}

module.exports = { armar, pdf, TITULOS };
