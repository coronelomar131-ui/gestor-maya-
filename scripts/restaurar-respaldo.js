#!/usr/bin/env node
// Restaura un respaldo del gestor (el .json que se descarga en Configuración → Respaldos). Uso manual del dueño o su técnico.
//
//   node scripts/restaurar-respaldo.js archivo.json                          solo SIMULA: dice qué haría
//   node scripts/restaurar-respaldo.js archivo.json --aplicar                crea los documentos que NO existen
//   node scripts/restaurar-respaldo.js archivo.json --aplicar --sobrescribir además reemplaza los que ya existen
//
// Opciones: --colecciones=ventas,clientes   solo esas
//           --credencial=ruta.json          cuenta de servicio de Firebase (o variable FIREBASE_SERVICE_ACCOUNT
//                                           con el JSON, o GOOGLE_APPLICATION_CREDENTIALS con la ruta)
//           --otro-proyecto                 permite restaurar en un proyecto distinto al del respaldo (p. ej. uno de pruebas)
//
// Nunca borra documentos. No crea cuentas de acceso (Firebase Auth), solo los datos.
// Ojo: "crear los que no existen" también revive lo que se haya borrado a propósito después del respaldo: simula primero.
// Antes de usarlo: npm install en la carpeta del proyecto. La cuenta de servicio es secreta: no la subas ni la compartas.
const fs = require('fs');

// Llaves, accesos y la copia de roles (la recrea el servidor): no se restauran aunque vengan en el archivo
const EXCLUIDAS = ['ml_tokens', 'mcp_codigos', 'mcp_refresh', 'mcp_tokens', 'roles'];
// Restaurarlas podría hacer que Pepito vuelva a mandar mensajes viejos: solo si se piden en --colecciones
const TEMPORALES = ['presencia', 'recordatorios', 'whatsapp_pendientes'];
const LOTE = 100;

// Lee el archivo línea por línea (con fotos puede pesar cientos de MB). alDocumento es opcional y puede ser async.
async function leerRespaldo(archivo, alDocumento) {
  let encabezado = null, coleccion = null, terminado = false, resto = [];
  const conteos = {};
  const malo = motivo => new Error('El archivo no es un respaldo válido o está cortado: ' + motivo);
  async function linea(l) {
    l = l.replace(/\r$/, '');
    if (!encabezado) {
      const marca = ',"colecciones":{';
      if (!l.endsWith(marca)) throw malo('falta el encabezado');
      try { encabezado = JSON.parse(l.slice(0, -marca.length) + '}'); } catch (e) { throw malo('encabezado ilegible'); }
      if (encabezado.formato !== 'maya-respaldo' || encabezado.version !== 1) throw malo('formato o versión desconocidos');
      return;
    }
    if (!l) return;
    if (terminado) throw malo('hay texto después del final');
    if (coleccion === null) {
      if (l === '}}') { terminado = true; return; }
      const m = /^"([A-Za-z0-9_-]+)":\[$/.exec(l);
      if (!m || Object.prototype.hasOwnProperty.call(conteos, m[1])) throw malo('colección ilegible');
      coleccion = m[1];
      conteos[coleccion] = 0;
      return;
    }
    if (l === ']' || l === '],') { coleccion = null; return; }
    let d;
    try { d = JSON.parse(l.endsWith(',') ? l.slice(0, -1) : l); } catch (e) { throw malo('documento ilegible en ' + coleccion); }
    if (!d || typeof d.id !== 'string' || !d.id || d.id.includes('/') || !d.datos || typeof d.datos !== 'object') throw malo('documento sin id o sin datos en ' + coleccion);
    conteos[coleccion]++;
    if (alDocumento) await alDocumento(coleccion, d, encabezado);
  }
  for await (const trozo of fs.createReadStream(archivo, { encoding: 'utf8' })) {
    let desde = 0, salto;
    while ((salto = trozo.indexOf('\n', desde)) >= 0) {
      resto.push(trozo.slice(desde, salto));
      await linea(resto.join(''));
      resto = [];
      desde = salto + 1;
    }
    if (desde < trozo.length) resto.push(trozo.slice(desde));
  }
  if (resto.length) await linea(resto.join(''));
  if (!terminado) throw malo('no termina como debe');
  const esperado = (encabezado && encabezado.conteos) || {};
  const nombres = new Set(Object.keys(esperado).concat(Object.keys(conteos)));
  for (const n of nombres) if (esperado[n] !== conteos[n]) throw malo('"' + n + '" debía traer ' + esperado[n] + ' documentos y trae ' + conteos[n]);
  return { encabezado, conteos };
}

const OMITIDO = Symbol('omitido');
// Regresa el valor con sus tipos de Firestore; lo que no venía en el respaldo queda como OMITIDO
function decodificar(v, tipos, db, marca) {
  if (v === null || typeof v !== 'object') return v;
  const entrar = x => decodificar(x, tipos, db, marca);
  const objeto = o => {
    const r = {};
    Object.keys(o).forEach(k => { const x = entrar(o[k]); if (x !== OMITIDO) r[k] = x; });
    return r;
  };
  if (Array.isArray(v)) return v.map(x => { const y = entrar(x); return y === OMITIDO ? null : y; });
  if (!Object.prototype.hasOwnProperty.call(v, '__tipo')) return objeto(v);
  switch (v.__tipo) {
    case 'timestamp': return new tipos.Timestamp(v.s, v.n);
    case 'fecha': return new Date(v.iso);
    case 'geopoint': return new tipos.GeoPoint(v.lat, v.lng);
    case 'bytes': return Buffer.from(v.base64, 'base64');
    case 'ref': return db.doc(v.ruta);
    case 'numero': return Number(v.v);
    case 'mapa': return objeto(v.v);
    case 'omitido': marca.omitido = true; return OMITIDO;
    default: throw new Error('Tipo desconocido en el respaldo: ' + v.__tipo);
  }
}

// Convierte el documento y anota qué campos de primer nivel venían incompletos
function preparar(datos, tipos, db) {
  const completos = {}, incompletos = [];
  // Un documento con un campo llamado __tipo viene envuelto como "mapa"
  if (datos.__tipo === 'mapa') datos = datos.v;
  Object.keys(datos).forEach(k => {
    const marca = {};
    const x = decodificar(datos[k], tipos, db, marca);
    if (x !== OMITIDO) completos[k] = x;
    if (marca.omitido) incompletos.push(k);
  });
  return { datos: completos, incompletos };
}

async function restaurar({ archivo, db, tipos, aplicar = false, sobrescribir = false, colecciones = null }) {
  // Primero se revisa todo el archivo: si está mal, no se escribe nada
  const { encabezado, conteos } = await leerRespaldo(archivo);
  if (colecciones) {
    const faltan = colecciones.filter(c => !(c in conteos));
    if (faltan.length) throw new Error('El respaldo no trae: ' + faltan.join(', '));
  }
  const elegida = c => !EXCLUIDAS.includes(c) && (colecciones ? colecciones.includes(c) : !TEMPORALES.includes(c));
  const informe = {}, errores = [];
  Object.keys(conteos).filter(elegida).forEach(c => { informe[c] = { enRespaldo: conteos[c], nuevos: 0, existentes: 0, creados: 0, sobrescritos: 0, sinAdjunto: 0, errores: 0 }; });

  let lote = [], de = null;
  async function vaciar() {
    if (!lote.length) return;
    const col = de, grupo = lote, r = informe[col];
    lote = [];
    const refs = grupo.map(d => db.collection(col).doc(d.id));
    // fieldMask vacío: solo se pregunta si existen, sin descargarlos
    const actuales = await db.getAll(...refs, { fieldMask: [] });
    const tareas = grupo.map(async (d, i) => {
      const existe = actuales[i].exists;
      r[existe ? 'existentes' : 'nuevos']++;
      if (existe && !sobrescribir) return;
      try {
        const p = preparar(d.datos, tipos, db);
        if (p.incompletos.length) r.sinAdjunto++;
        if (!aplicar) return;
        if (!existe) {
          await refs[i].create(p.datos); // create falla si apareció mientras tanto: nunca pisa
          r.creados++;
        } else if (p.incompletos.length) {
          // Los campos que venían sin su adjunto se dejan como están
          const campos = Object.keys(p.datos).filter(k => !p.incompletos.includes(k));
          if (!campos.length) return;
          const parte = {};
          campos.forEach(k => { parte[k] = p.datos[k]; });
          await refs[i].set(parte, { mergeFields: campos.map(k => new tipos.FieldPath(k)) });
          r.sobrescritos++;
        } else {
          await refs[i].set(p.datos);
          r.sobrescritos++;
        }
      } catch (e) {
        r.errores++;
        errores.push(col + '/' + d.id + ': ' + e.message);
      }
    });
    await Promise.all(tareas);
  }
  await leerRespaldo(archivo, async (col, d) => {
    if (!elegida(col)) return;
    if (col !== de) { await vaciar(); de = col; }
    lote.push(d);
    if (lote.length >= (/Fotos$/.test(col) ? 20 : LOTE)) await vaciar();
  });
  await vaciar();
  return { encabezado, informe, errores, saltadas: Object.keys(conteos).filter(c => !elegida(c)) };
}

function leerArgumentos(argv) {
  const o = { aplicar: false, sobrescribir: false, otroProyecto: false, colecciones: null, credencial: null, archivo: null, ayuda: false };
  for (const a of argv) {
    if (a === '--aplicar') o.aplicar = true;
    else if (a === '--sobrescribir') o.sobrescribir = true;
    else if (a === '--otro-proyecto') o.otroProyecto = true;
    else if (a === '--ayuda' || a === '--help') o.ayuda = true;
    else if (a.startsWith('--colecciones=')) o.colecciones = a.slice(14).split(',').map(x => x.trim()).filter(Boolean);
    else if (a.startsWith('--credencial=')) o.credencial = a.slice(13);
    // Una bandera mal escrita detiene todo en vez de ignorarse
    else if (a.startsWith('-')) throw new Error('Opción desconocida: ' + a);
    else if (o.archivo) throw new Error('Solo un archivo a la vez');
    else o.archivo = a;
  }
  if (o.colecciones && !o.colecciones.length) throw new Error('--colecciones está vacío');
  return o;
}

function cuentaDeServicio(o) {
  const ruta = o.credencial || (!process.env.FIREBASE_SERVICE_ACCOUNT && process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const texto = ruta ? fs.readFileSync(ruta, 'utf8') : process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!texto) return null;
  let c;
  try { c = JSON.parse(texto); } catch (e) { throw new Error('La credencial no es un JSON válido'); }
  if (!c.project_id) throw new Error('La credencial no parece una cuenta de servicio de Firebase');
  return c;
}

async function principal(argv, { admin = null, log = console.log } = {}) {
  const o = leerArgumentos(argv);
  if (o.ayuda || !o.archivo) {
    log('Uso: node scripts/restaurar-respaldo.js archivo.json [--aplicar] [--sobrescribir] [--colecciones=a,b] [--credencial=ruta.json] [--otro-proyecto]');
    log('Sin --aplicar solo simula. Nunca borra.');
    return o.ayuda ? 0 : 1;
  }
  const { encabezado, conteos } = await leerRespaldo(o.archivo);
  log('Respaldo del ' + new Date(encabezado.creado).toLocaleString('es-MX') + (encabezado.creadoPor ? ' (' + encabezado.creadoPor + ')' : '') + ' · proyecto ' + (encabezado.proyecto || 'sin nombre'));
  if (!encabezado.sinErrores) log('AVISO: este respaldo está INCOMPLETO. No se pudo leer: ' + (encabezado.errores || []).map(e => e.coleccion).join(', '));
  if (!encabezado.incluyeFotos) log('AVISO: no trae fotos' + (encabezado.adjuntosOmitidos ? ' y le faltan ' + encabezado.adjuntosOmitidos + ' archivos adjuntos' : '') + '.');

  const cuenta = cuentaDeServicio(o);
  if (!cuenta) {
    if (o.aplicar) throw new Error('Falta la cuenta de servicio (--credencial=ruta.json)');
    Object.keys(conteos).forEach(c => log('  ' + c + ': ' + conteos[c]));
    log('El archivo está bien formado. Sin credencial no se compara contra la base de datos.');
    return 0;
  }
  if (cuenta.project_id !== encabezado.proyecto && !o.otroProyecto) {
    throw new Error('La credencial es del proyecto "' + cuenta.project_id + '" y el respaldo de "' + encabezado.proyecto + '". Si es a propósito, agrega --otro-proyecto');
  }
  const a = admin || require('firebase-admin');
  if (!a.apps.length) a.initializeApp({ credential: a.credential.cert(cuenta), projectId: cuenta.project_id });

  log('Destino: ' + cuenta.project_id);
  log(o.aplicar ? (o.sobrescribir ? 'APLICANDO: crea los que faltan y SOBRESCRIBE los existentes.' : 'APLICANDO: solo crea los que faltan.') : 'SIMULACIÓN: no se escribe nada.');
  const r = await restaurar({ archivo: o.archivo, db: a.firestore(), tipos: a.firestore, aplicar: o.aplicar, sobrescribir: o.sobrescribir, colecciones: o.colecciones });
  for (const [c, x] of Object.entries(r.informe)) {
    const hace = o.aplicar
      ? 'creados ' + x.creados + ', sobrescritos ' + x.sobrescritos
      : 'se crearían ' + x.nuevos + ', se sobrescribirían ' + (o.sobrescribir ? x.existentes : 0);
    log('  ' + c + ': ' + x.enRespaldo + ' en respaldo; ya existen ' + x.existentes + '; ' + hace +
      (x.sinAdjunto ? '; ' + x.sinAdjunto + ' sin su adjunto' : '') + (x.errores ? '; ERRORES ' + x.errores : ''));
  }
  if (r.saltadas.length) log('No se tocan (temporales o llaves; las temporales se pueden pedir con --colecciones): ' + r.saltadas.join(', '));
  r.errores.slice(0, 30).forEach(e => log('ERROR ' + e));
  if (r.errores.length) { log('Terminó con ' + r.errores.length + ' errores.'); return 1; }
  log(o.aplicar ? 'Listo.' : 'Para escribir de verdad agrega --aplicar');
  return 0;
}

module.exports = { leerRespaldo, restaurar, principal, decodificar, EXCLUIDAS, TEMPORALES };

if (require.main === module) {
  principal(process.argv.slice(2)).then(c => { process.exitCode = c; }).catch(e => {
    console.error('No se pudo restaurar: ' + e.message);
    process.exitCode = 1;
  });
}
