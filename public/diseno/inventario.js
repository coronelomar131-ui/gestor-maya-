// Inventario: tarjetas con foto, buscador, ficha, alta y edición, ajuste de existencias y Excel.
// Reemplaza la vista de #mod-inventario sin tocar renderProductos() ni la colección "productos".
// Colecciones: productos (campos nuevos opcionales), productosFotos y movimientos.
// Fotos (hasta 6 por pieza, un documento por foto): la portada es productosFotos/{id del producto}, como siempre;
// las demás son productosFotos/{id}_{clave} y el producto guarda su orden en "fotosExtra".
import { icono } from './iconos.js';

const URL_FIRESTORE = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
const COL = 'productos';
const COL_FOTOS = 'productosFotos';
const COL_MOV = 'movimientos';
const POR_PAGINA = 48;

// ══ Lógica sin pantalla (se puede probar con node) ══
export const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
// Para comparar códigos sin guiones ni espacios
export const compacto = s => norm(s).replace(/[^a-z0-9]/g, '');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const texto = s => String(s == null ? '' : s).trim();
const num = v => Number(v) || 0;
export const dinero = v => '$' + num(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cuantos = (n, uno, varios) => n.toLocaleString('es-MX') + ' ' + (n === 1 ? uno : varios);

export const LADOS = ['Izquierdo', 'Derecho', 'Delantero', 'Trasero', 'Delantero izquierdo', 'Delantero derecho', 'Trasero izquierdo', 'Trasero derecho', 'Par (ambos lados)'];
export const CONDICIONES = ['Nuevo original', 'Nuevo genérico', 'Usado', 'Reconstruido'];
const MARCAS_DOBLES = ['alfa romeo', 'aston martin', 'land rover', 'mercedes benz', 'great wall', 'general motors'];

export const tipoDe = p => (p.tipo === 'bajo_pedido' ? 'bajo_pedido' : 'existencia');
export const esDisponible = p => !p.archivado && tipoDe(p) === 'existencia' && num(p.stock) > 0;
// "Poco stock" solo aplica a piezas de existencia que tienen un mínimo
export const pocoStock = p => !p.archivado && tipoDe(p) === 'existencia' && num(p.stockMin) > 0 && num(p.stock) <= num(p.stockMin);
export const MAX_FOTOS = 6;
// Documentos de las fotos adicionales, en orden (las piezas de antes no traen el campo)
export const extrasDe = p => Array.from(new Set((Array.isArray(p.fotosExtra) ? p.fotosExtra : []).filter(x => typeof x === 'string' && x && x !== p.id && !x.includes('/'))));
// Todas las fotos de la pieza; la primera es la portada
export const fotosDe = p => (p.tieneFoto ? [p.id] : []).concat(extrasDe(p));
// Para saber si las fotos cambiaron (por ejemplo, desde otro teléfono mientras se editaba)
export const firmaFotos = p => JSON.stringify([!!p.tieneFoto, p.fotoEn || 0, extrasDe(p)]);
export const listaOem = v => (Array.isArray(v) ? v : String(v || '').split(/[,;\n]+/)).map(texto).filter(Boolean);

const anio = v => { const n = parseInt(v, 10); return n >= 1900 && n <= 2100 ? n : null; };
export function aplicacionesDe(p) {
  return (Array.isArray(p.aplicaciones) ? p.aplicaciones : [])
    .map(a => ({ marca: texto(a && a.marca), modelo: texto(a && a.modelo), anioDesde: anio(a && a.anioDesde), anioHasta: anio(a && a.anioHasta) }))
    .filter(a => a.marca || a.modelo || a.anioDesde || a.anioHasta);
}
const rangoTexto = a => (a.anioDesde && a.anioHasta && a.anioDesde !== a.anioHasta) ? a.anioDesde + '-' + a.anioHasta : String(a.anioDesde || a.anioHasta || '');
export const textoAplicaciones = apps => (apps || []).map(a => [a.marca, a.modelo, rangoTexto(a)].filter(Boolean).join(' ')).filter(Boolean).join('; ');
// "Honda Civic 2018-2022; Land Rover Evoque 2020" → lista de aplicaciones
export function parsearAplicaciones(cadena) {
  return String(cadena || '').split(/[;\n|]+/).map(parte => {
    let resto = parte.trim();
    if (!resto) return null;
    let anioDesde = null, anioHasta = null;
    const m = /\b((?:19|20)\d{2})(?:\s*(?:-|–|—|\/|\ba\b|\bal\b)\s*((?:19|20)\d{2}|\d{2}))?\s*$/i.exec(resto);
    if (m) {
      anioDesde = Number(m[1]);
      anioHasta = m[2] ? completarAnio(anioDesde, m[2]) : anioDesde;
      resto = resto.slice(0, m.index).trim();
    }
    const palabras = resto.split(/\s+/).filter(Boolean);
    const n = MARCAS_DOBLES.includes(norm(palabras.slice(0, 2).join(' '))) ? 2 : 1;
    return { marca: palabras.slice(0, n).join(' '), modelo: palabras.slice(n).join(' '), anioDesde, anioHasta };
  }).filter(Boolean);
}
const completarAnio = (desde, hasta) => (hasta.length === 4 ? Number(hasta) : Math.floor(desde / 100) * 100 + Number(hasta) + (Number(hasta) < desde % 100 ? 100 : 0));
// Rangos de años escritos a mano en la compatibilidad ("Civic 2018-2022", "Versa 2015 a 19")
export function rangosDeTexto(s) {
  const rangos = [];
  const re = /\b((?:19|20)\d{2})\s*(?:-|–|—|\/|\ba\b|\bal\b)\s*((?:19|20)\d{2}|\d{2})\b/gi;
  let m;
  while ((m = re.exec(String(s || '')))) rangos.push([Number(m[1]), completarAnio(Number(m[1]), m[2])]);
  return rangos;
}
const enRango = (a, y) => (a.anioDesde || a.anioHasta) && y >= (a.anioDesde || a.anioHasta) && y <= (a.anioHasta || a.anioDesde);

// Texto de búsqueda de cada pieza (se calcula una vez por registro)
const indices = new WeakMap();
function indice(p) {
  let i = indices.get(p);
  if (i) return i;
  const apps = aplicacionesDe(p), oem = listaOem(p.oem);
  i = {
    texto: norm([p.codigo, p.descripcion, p.marca, p.compatibilidad, p.ubicacion, p.lado, oem.join(' '),
      apps.map(a => a.marca + ' ' + a.modelo + ' ' + (a.anioDesde || '') + ' ' + (a.anioHasta || '')).join(' ')].filter(Boolean).join(' ')),
    codigos: [p.codigo].concat(oem).map(compacto).filter(Boolean).join(' '),
    apps: apps.map(a => Object.assign({ n: norm(a.marca + ' ' + a.modelo) }, a)),
    compat: norm(p.compatibilidad),
    rangos: rangosDeTexto(p.compatibilidad)
  };
  indices.set(p, i);
  return i;
}

// Todas las palabras, en cualquier orden. Un año también vale si cae dentro del rango de la aplicación.
export function coincide(p, consulta) {
  const palabras = norm(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const i = indice(p);
  const esAnio = w => /^(19|20)\d{2}$/.test(w);
  const otras = palabras.filter(w => !esAnio(w));
  // Si las demás palabras señalan un auto concreto, el año se revisa en ese auto
  const delAuto = i.apps.filter(a => (a.anioDesde || a.anioHasta) && otras.some(w => a.n.includes(w)));
  return palabras.every(w => {
    if (esAnio(w)) {
      if (i.codigos.includes(w)) return true;
      const y = Number(w);
      if (delAuto.length) return delAuto.some(a => enRango(a, y));
      return i.texto.includes(w) || i.apps.some(a => enRango(a, y)) || i.rangos.some(r => y >= r[0] && y <= r[1]);
    }
    if (i.texto.includes(w)) return true;
    const c = compacto(w);
    return c.length >= 3 && /\d/.test(c) && i.codigos.includes(c);
  });
}

// Filtro por auto: marca, modelo y año deben cumplirse en la misma aplicación (o en el texto de compatibilidad)
export function paraAuto(p, auto, modelo, y) {
  if (!auto && !modelo && !y) return true;
  const i = indice(p);
  const a = norm(auto), m = norm(modelo), n = anio(y);
  if (i.apps.some(x => (!a || norm(x.marca) === a) && (!m || norm(x.modelo) === m) && (!n || enRango(x, n)))) return true;
  if (!i.compat || (a && !i.compat.includes(a)) || (m && !i.compat.includes(m))) return false;
  return !n || i.compat.includes(String(n)) || i.rangos.some(r => n >= r[0] && n <= r[1]);
}

export const FILTROS = [
  { id: 'todas', nombre: 'Todas', pasa: p => !p.archivado },
  { id: 'disponibles', nombre: 'Disponibles', pasa: esDisponible },
  { id: 'pedido', nombre: 'Bajo pedido', pasa: p => !p.archivado && tipoDe(p) === 'bajo_pedido' },
  { id: 'poco', nombre: 'Poco stock', pasa: pocoStock },
  { id: 'sinfoto', nombre: 'Sin foto', pasa: p => !p.archivado && !fotosDe(p).length },
  { id: 'archivadas', nombre: 'Archivadas', pasa: p => !!p.archivado }
];

export function resumen(lista) {
  const r = { referencias: 0, piezas: 0, valorPrecio: 0, valorCosto: 0, sinCosto: 0, poco: 0 };
  lista.forEach(p => {
    if (p.archivado) return;
    r.referencias++;
    if (pocoStock(p)) r.poco++;
    const s = Math.max(0, num(p.stock));
    r.piezas += s;
    r.valorPrecio += s * num(p.precio);
    r.valorCosto += s * num(p.costoRef);
    if (s && !num(p.costoRef)) r.sinCosto++;
  });
  return r;
}

// Mismo código (sin importar mayúsculas, guiones o espacios)
export function repetidos(lista, codigo, exceptoId) {
  const c = compacto(codigo);
  return c ? lista.filter(p => p.id !== exceptoId && compacto(p.codigo) === c) : [];
}

// ── Importación desde Excel ──
const COLUMNAS = {
  codigo: ['codigo', 'sku', 'codigo sku', 'clave', 'numero de parte', 'no parte', 'no de parte'],
  descripcion: ['descripcion', 'nombre', 'pieza', 'producto', 'articulo'],
  marca: ['marca', 'fabricante', 'marca de la pieza'],
  tipo: ['tipo'],
  stock: ['existencias', 'existencia', 'stock', 'cantidad', 'piezas'],
  stockMin: ['minimo', 'stock minimo', 'stockmin', 'existencia minima'],
  precio: ['precio', 'precio venta', 'precio de venta', 'precio publico'],
  costoRef: ['costo', 'costo ref', 'costo de referencia'],
  ubicacion: ['ubicacion', 'anaquel', 'lugar'],
  oem: ['codigos alternos', 'oem', 'codigo oem', 'codigo alterno'],
  aplicaciones: ['aplicaciones', 'autos'],
  compatibilidad: ['compatibilidad', 'compatible'],
  lado: ['lado', 'posicion'],
  condicion: ['condicion', 'estado'],
  proveedor: ['proveedor'],
  clase: ['clase', 'clasificacion']
};
const limpiarTitulo = s => norm(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function mapearEncabezados(fila) {
  const mapa = {};
  (fila || []).forEach((celda, i) => {
    const t = limpiarTitulo(celda);
    const campo = Object.keys(COLUMNAS).find(k => COLUMNAS[k].includes(t));
    if (campo && mapa[campo] === undefined) mapa[campo] = i;
  });
  return mapa;
}
export function numeroDeCelda(v) {
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[$\s]|mxn/gi, '');
  // La coma solo vale como separador de miles ("12,5" se marca como error, no se lee como 125)
  if (s.includes(',')) s = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s) ? s.replace(/,/g, '') : '';
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}
// filas = arreglo de arreglos (primera fila con títulos). admin: solo Dirección importa costos.
export function leerFilasImportacion(filas, admin) {
  const inicio = (filas || []).slice(0, 10).findIndex(f => { const m = mapearEncabezados(f); return m.codigo !== undefined || m.descripcion !== undefined; });
  if (inicio < 0) return { error: 'No encontré las columnas. La primera fila debe decir al menos "Código" o "Descripción".', filas: [] };
  const mapa = mapearEncabezados(filas[inicio]);
  if (!admin) delete mapa.costoRef;
  const salida = [];
  filas.slice(inicio + 1).forEach((f, i) => {
    const datos = {}, errores = [];
    Object.keys(mapa).forEach(campo => {
      const v = f[mapa[campo]];
      if (v === undefined || v === null || texto(v) === '') return;
      if (['stock', 'stockMin', 'precio', 'costoRef'].includes(campo)) {
        const n = numeroDeCelda(v);
        const entero = campo === 'stock' || campo === 'stockMin';
        if (!Number.isFinite(n) || n < 0 || (entero && !Number.isInteger(n))) errores.push((entero ? 'Cantidad no válida: ' : 'Importe no válido: ') + texto(v));
        else datos[campo] = entero ? n : Math.round(n * 100) / 100;
      } else if (campo === 'tipo') {
        // Un texto que no se reconoce no cambia el tipo
        if (norm(v).includes('pedido')) datos.tipo = 'bajo_pedido';
        else if (norm(v).includes('existencia')) datos.tipo = 'existencia';
      }
      else if (campo === 'oem') datos.oem = listaOem(v);
      else if (campo === 'aplicaciones') datos.aplicaciones = parsearAplicaciones(v);
      else if (campo === 'clase') { const c = texto(v).toUpperCase().charAt(0); if ('ABC'.includes(c)) datos.clase = c; }
      else if (campo === 'lado' || campo === 'condicion') {
        const lista = campo === 'lado' ? LADOS : CONDICIONES;
        datos[campo] = lista.find(x => norm(x) === norm(texto(v))) || texto(v);
      } else datos[campo] = texto(v);
    });
    if (Object.keys(datos).length || errores.length) salida.push({ fila: inicio + i + 2, datos, errores });
  });
  return { filas: salida, columnas: Object.keys(mapa) };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Qué pasará con cada fila: nueva, actualizar, igual, omitida o error. Nunca duplica un código.
export function planImportacion(filas, productos, opciones) {
  const op = Object.assign({ actualizar: true, existencias: false }, opciones);
  const porCodigo = new Map(), porCompacto = new Map(), porNombre = new Map();
  const claveNombre = d => norm(texto(d.descripcion)) + '|' + norm(texto(d.marca));
  const autos = d => norm(textoAplicaciones(aplicacionesDe(d)) || texto(d.compatibilidad));
  const choca = (a, b) => !!a && !!b && a !== b;
  const agregar = (m, k, p) => { if (!m.has(k)) m.set(k, []); m.get(k).push(p); };
  productos.forEach(p => {
    if (compacto(p.codigo)) { agregar(porCodigo, norm(texto(p.codigo)), p); agregar(porCompacto, compacto(p.codigo), p); }
    if (texto(p.descripcion)) agregar(porNombre, claveNombre(p), p);
  });
  const vistos = new Map(), tomadas = new Map();
  return filas.map(f => {
    const r = { fila: f.fila, datos: f.datos, accion: 'error', motivo: '' };
    if (f.errores.length) { r.motivo = f.errores.join('. '); return r; }
    const d = f.datos;
    const omitir = motivo => { r.accion = 'omitida'; r.motivo = motivo; return r; };
    // Un "código" sin letras ni números ("-") cuenta como sin código
    const codigo = compacto(d.codigo) ? norm(texto(d.codigo)) : '';
    if (!codigo && !d.descripcion) { r.motivo = 'Falta el código o la descripción'; return r; }
    const clave = codigo ? 'c:' + compacto(codigo) : 'n:' + [claveNombre(d), norm(texto(d.lado)), autos(d)].join('|');
    if (vistos.has(clave)) return omitir('Repetida en el archivo (igual que la fila ' + vistos.get(clave) + ')');
    vistos.set(clave, f.fila);
    let candidatos = (codigo ? porCodigo.get(codigo) : porNombre.get(claveNombre(d))) || [];
    // Sin código: además no deben ser de otro lado ni de otros autos
    if (!codigo) candidatos = candidatos.filter(x => !choca(norm(texto(d.lado)), norm(texto(x.lado))) && !choca(autos(d), autos(x)));
    const activas = candidatos.filter(x => !x.archivado);
    const posibles = activas.length ? activas : candidatos;
    // Si no se sabe cuál es, no se toca ninguna
    if (posibles.length > 1) return omitir('Hay ' + posibles.length + ' piezas ' + (codigo ? 'con ese código' : 'con esa descripción') + ' en la app; cámbialas una por una');
    const p = posibles[0];
    if (!p) {
      const parecido = codigo && (porCompacto.get(compacto(codigo)) || [])[0];
      if (parecido) return omitir('Se parece al código ' + parecido.codigo + ' que ya existe; corrígelo en el archivo');
      if (!d.descripcion) { r.motivo = 'Para dar de alta falta la descripción'; return r; }
      r.accion = 'nueva';
      return r;
    }
    if (!codigo && compacto(p.codigo)) return omitir('Ya existe con el código ' + p.codigo + '; ponlo en el archivo para actualizarla');
    if (tomadas.has(p.id)) return omitir('Es la misma pieza que la fila ' + tomadas.get(p.id));
    tomadas.set(p.id, f.fila);
    r.id = p.id;
    r.actual = p;
    if (!op.actualizar) return omitir('Ya existe');
    const antes = camposDe(p);
    const cambios = {};
    Object.keys(d).forEach(k => {
      if (k === 'codigo' || (k === 'stock' && !op.existencias)) return;
      const mismo = k === 'aplicaciones' ? textoAplicaciones(antes[k]) === textoAplicaciones(d[k]) : igual(antes[k], d[k]);
      if (!mismo) cambios[k] = d[k];
    });
    r.cambios = cambios;
    r.accion = Object.keys(cambios).length ? 'actualizar' : 'igual';
    if (p.archivado) r.motivo = 'Está archivada (seguirá archivada)';
    return r;
  });
}

// Registro tal como lo maneja el formulario (los campos que falten toman su valor normal)
export function camposDe(p) {
  return {
    codigo: texto(p.codigo), descripcion: texto(p.descripcion), marca: texto(p.marca), compatibilidad: texto(p.compatibilidad),
    precio: num(p.precio), stock: num(p.stock), stockMin: num(p.stockMin), clase: p.clase || 'B', tipo: tipoDe(p),
    ubicacion: texto(p.ubicacion), oem: listaOem(p.oem), aplicaciones: aplicacionesDe(p), lado: texto(p.lado),
    condicion: texto(p.condicion), costoRef: num(p.costoRef), proveedor: texto(p.proveedor)
  };
}

// ══ Pantalla ══
if (typeof document !== 'undefined') iniciar();

async function iniciar() {
  // Las funciones del script principal pueden no existir todavía
  const listo = () => window.data && window.db && window.doc && window.openModal && window.toast && document.getElementById('mod-inventario');
  for (let i = 0; i < 200 && !listo(); i++) await new Promise(r => setTimeout(r, 50));
  if (!listo()) return console.warn('Inventario: no se pudo preparar la pantalla nueva');
  try { montar(); } catch (e) { console.error('Inventario:', e); }
}

function montar() {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mod = $('#mod-inventario');
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('maya.inventario.v1')) || {}; } catch (e) { return {}; } })();
  const estado = {
    q: '', filtro: 'todas', marca: '', auto: '', modelo: '', anio: '',
    orden: guardado.orden || 'recientes', vista: guardado.vista === 'lista' ? 'lista' : 'tarjetas',
    limite: POR_PAGINA, cargado: false
  };
  const recordar = () => { try { localStorage.setItem('maya.inventario.v1', JSON.stringify({ vista: estado.vista, orden: estado.orden })); } catch (e) { /* sin almacenamiento */ } };

  const rol = () => window.currentRole || 'vendedor';
  const puedeEditar = () => (window.mayaRoles ? window.mayaRoles.puedeModulo(rol(), 'inventario') : ['admin', 'almacen', 'facturacion'].includes(rol()));
  const esAdmin = () => rol() === 'admin';
  const productos = () => window.data.productos || [];
  const porId = id => productos().find(p => p.id === id);
  // toast puede insertar como texto (maya.js) o como HTML (el original): sin < > se ve bien y es seguro en ambos
  const avisar = (m, t) => window.toast(String(m).replace(/</g, '‹').replace(/>/g, '›'), t);
  const uid = () => (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || '';
  const correo = () => (window.auth && window.auth.currentUser && window.auth.currentUser.email) || '';
  const nombreDe = id => { const u = (window.data.usuarios || []).find(x => x.uid === id); return (u && (u.nombre || u.email)) || ''; };
  const miNombre = () => nombreDe(uid()) || (window.miPerfil && window.miPerfil.nombre) || correo();
  const sello = () => ({ updatedAt: window.serverTimestamp(), updatedBy: uid() });
  const ref = (col, id) => window.doc(window.db, col, id);
  const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');
  const sinPermiso = e => !!e && (e.code === 'permission-denied' || /insufficient permissions/i.test(e.message || ''));
  const mensajeError = (e, col) => (sinPermiso(e) ? 'Firebase no deja guardar en "' + col + '" (falta darle acceso en las reglas de Firestore)' : ((e && e.message) || String(e)));
  const comoFecha = f => { if (!f) return null; const d = f.toDate ? f.toDate() : new Date(f); return isNaN(d) ? null : d; };
  const fechaCorta = f => { const d = comoFecha(f); return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''; };

  // ── Armado de la vista ──
  const viejo = $('.table-card', mod);
  const raiz = document.createElement('div');
  raiz.className = 'inv';
  raiz.innerHTML = `
    <section class="inv-resumen" aria-live="polite"></section>
    <div class="inv-barra">
      <div class="inv-buscar">
        <input type="search" class="search-box" id="inv-q" autocomplete="off" placeholder="Pieza, código, auto o año…" aria-label="Buscar pieza">
      </div>
      <div class="inv-botones">
        <button type="button" class="btn btn-primary" data-accion="nueva" id="inv-nueva" onclick="mayaInventario.nueva('modal-producto')">${icono('plus', 18)}<span>Agregar pieza</span></button>
        <button type="button" class="btn btn-secondary" data-accion="filtros" aria-expanded="false" aria-controls="inv-filtros">${icono('filter', 17)}<span>Filtros</span><b class="inv-cuenta-filtros" hidden></b></button>
        <div class="inv-vistas" role="group" aria-label="Cómo ver las piezas">
          <button type="button" data-vista="tarjetas" title="Tarjetas con foto" aria-label="Ver tarjetas">${icono('layout-grid', 18)}</button>
          <button type="button" data-vista="lista" title="Lista" aria-label="Ver lista">${icono('list-checks', 18)}</button>
        </div>
      </div>
    </div>
    <div class="inv-filtros" id="inv-filtros" hidden>
      <label>Marca de la pieza<select data-filtro="marca"></select></label>
      <label>Auto<select data-filtro="auto"></select></label>
      <label>Modelo<select data-filtro="modelo"></select></label>
      <label>Año<input type="number" data-filtro="anio" inputmode="numeric" min="1950" max="2100" placeholder="2020"></label>
      <label>Ordenar por<select data-filtro="orden">
        <option value="recientes">Las más nuevas</option><option value="nombre">Descripción (A-Z)</option><option value="codigo">Código</option>
        <option value="menos">Menos existencias</option><option value="caras">Precio mayor</option><option value="ubicacion">Ubicación</option>
      </select></label>
      <button type="button" class="btn btn-secondary btn-sm" data-accion="limpiar">Quitar filtros</button>
    </div>
    <div class="inv-chips" role="group" aria-label="Filtros rápidos"></div>
    <div class="inv-linea">
      <span class="inv-contador"></span>
      <div class="inv-herramientas">
        <button type="button" class="btn btn-secondary btn-sm" data-accion="exportar">${icono('file-down', 16)}<span>Excel</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-accion="importar">${icono('upload', 16)}<span>Importar</span></button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="sincronizarInventarioML()">${icono('refresh-cw', 16)}<span>Mercado Libre</span></button>
      </div>
    </div>
    <div class="inv-ml"></div>
    <div class="inv-grid"></div>
    <div class="inv-vacio" hidden></div>
    <div class="inv-mas" hidden><button type="button" class="btn btn-secondary" data-accion="mas">Mostrar más</button></div>`;
  mod.appendChild(raiz);
  // El aviso de sincronización de Mercado Libre se muestra dentro de la vista nueva
  const ml = $('#ml-sync-status', mod);
  if (ml) $('.inv-ml', raiz).appendChild(ml);
  if (viejo) viejo.classList.add('inv-viejo');
  const rejilla = $('.inv-grid', raiz);

  // ── Fotos: se piden solo cuando la tarjeta se asoma, de 4 en 4, y se guardan en memoria ──
  const fotos = new Map();
  const cola = [];
  let activas = 0;
  // La portada cambia de contenido (por eso lleva fotoEn); las demás nunca se reescriben
  const claveFoto = (p, docId) => (docId === p.id ? p.id + '|' + (p.fotoEn || '') : 'x|' + docId);
  const recordarFoto = (clave, datos) => fotos.set(clave, { url: datos.foto, datos, promesa: Promise.resolve(datos.foto) });
  // Lo que se guarda en cada documento (Firestore no acepta campos undefined)
  const soloFoto = d => Object.assign({ foto: d.foto }, d.ancho ? { ancho: d.ancho } : {}, d.alto ? { alto: d.alto } : {});
  async function leerFoto(docId) {
    const snap = await window.getDoc(ref(COL_FOTOS, docId));
    const d = snap.exists() ? snap.data() : null;
    return d && /^data:image\//.test(d.foto || '') ? soloFoto(d) : null;
  }
  function pedirFoto(p, docId) {
    const clave = claveFoto(p, docId);
    let f = fotos.get(clave);
    if (f) return f.promesa;
    f = { url: null, datos: null };
    f.promesa = new Promise((resolver, fallar) => {
      cola.push(async () => {
        try {
          f.datos = await leerFoto(docId);
          f.url = f.datos ? f.datos.foto : null;
          resolver(f.url);
        } catch (e) { fotos.delete(clave); fallar(e); }
      });
    });
    fotos.set(clave, f);
    avanzarCola();
    return f.promesa;
  }
  function avanzarCola() {
    while (activas < 4 && cola.length) {
      activas++;
      cola.shift()().finally(() => { activas--; avanzarCola(); });
    }
  }
  function ponerImagen(caja, url, alt) {
    if (!url) return;
    let img = $('img', caja);
    if (!img) { img = document.createElement('img'); img.decoding = 'async'; img.draggable = false; caja.prepend(img); }
    img.alt = alt || '';
    img.src = url;
    caja.classList.add('con-foto');
  }
  // Portada de una tarjeta
  function mostrarFoto(caja, p) {
    const docId = fotosDe(p)[0];
    if (!docId) return;
    const f = fotos.get(claveFoto(p, docId));
    if (f && f.url) return ponerImagen(caja, f.url, p.descripcion);
    caja.classList.add('cargando');
    pedirFoto(p, docId).then(url => ponerImagen(caja, url, p.descripcion), e => console.warn('Foto:', e.message))
      .finally(() => caja.classList.remove('cargando'));
  }
  const vigiaFotos = 'IntersectionObserver' in window ? new IntersectionObserver(entradas => {
    entradas.forEach(en => {
      if (!en.isIntersecting) return;
      vigiaFotos.unobserve(en.target);
      const p = porId(en.target.dataset.foto);
      if (p) mostrarFoto(en.target, p);
    });
  }, { rootMargin: '250px' }) : null;

  // ── Tarjetas ──
  function etiqueta(p) {
    if (p.archivado) return ['gris', 'Archivada'];
    if (tipoDe(p) === 'bajo_pedido') return ['azul', 'Bajo pedido'];
    if (num(p.stock) <= 0) return ['rojo', 'Agotada'];
    if (pocoStock(p)) return ['ambar', 'Poco stock'];
    return ['verde', 'Disponible'];
  }
  const autosDe = p => textoAplicaciones(aplicacionesDe(p)) || texto(p.compatibilidad);
  function htmlTarjeta(p) {
    const [color, nombre] = etiqueta(p);
    const autos = autosDe(p);
    const editar = puedeEditar() && !p.archivado;
    const n = fotosDe(p).length;
    return `
      <div class="inv-foto" ${n ? 'data-foto="' + esc(p.id) + '"' : ''}>
        <span class="inv-sin">${icono(n ? 'camera' : 'package', 34)}</span>
        <span class="inv-chip ${color}">${nombre}</span>
        ${n > 1 ? '<span class="inv-nfotos" title="' + n + ' fotos" aria-label="' + n + ' fotos">' + icono('camera', 13) + n + '</span>' : ''}
      </div>
      <div class="inv-cuerpo">
        <div class="inv-meta">${p.codigo ? '<code>' + esc(p.codigo) + '</code>' : '<code class="vacio">Sin código</code>'}${p.marca ? '<span>' + esc(p.marca) + '</span>' : ''}</div>
        <h3><button type="button" data-ficha>${esc(p.descripcion || 'Sin descripción')}</button></h3>
        <p class="inv-autos">${esc(autos) || '&nbsp;'}</p>
        <p class="inv-donde">${p.ubicacion ? icono('map-pin', 14) + esc(p.ubicacion) : ''}${p.lado ? '<span>' + esc(p.lado) + '</span>' : ''}</p>
        <div class="inv-pie">
          <strong>${dinero(p.precio)}</strong>
          <div class="inv-stock ${color}">
            ${editar ? '<button type="button" data-salida aria-label="Sacar piezas">−</button>' : ''}
            <b title="Existencias">${num(p.stock).toLocaleString('es-MX')}</b><small>pza</small>
            ${editar ? '<button type="button" data-entrada aria-label="Agregar piezas">+</button>' : ''}
          </div>
        </div>
      </div>`;
  }
  const firma = p => JSON.stringify([p.codigo, p.descripcion, p.marca, p.compatibilidad, p.aplicaciones, p.ubicacion, p.lado, p.precio, p.stock, p.stockMin, p.tipo, p.archivado, p.tieneFoto, p.fotoEn, p.fotosExtra, puedeEditar()]);
  const tarjetas = new Map(); // id → { el, firma }: lo que no cambió no se vuelve a dibujar
  function tarjetaDe(p, orden) {
    const f = firma(p);
    let t = tarjetas.get(p.id);
    if (t && t.firma === f) return t.el;
    const el = document.createElement('article');
    el.className = 'inv-item' + (p.archivado ? ' archivada' : '') + (t ? ' cambio' : ' entra');
    el.style.setProperty('--i', Math.min(orden, 12));
    el.dataset.id = p.id;
    el.innerHTML = htmlTarjeta(p);
    el.addEventListener('animationend', () => el.classList.remove('entra', 'cambio'), { once: true });
    const caja = $('[data-foto]', el);
    if (caja) {
      const c = fotos.get(claveFoto(p, fotosDe(p)[0]));
      if (c && c.url) ponerImagen(caja, c.url, p.descripcion);
      else if (vigiaFotos) vigiaFotos.observe(caja);
      else mostrarFoto(caja, p);
    }
    tarjetas.set(p.id, { el, firma: f });
    return el;
  }

  // ── Filtrado y pintado ──
  const ORDEN = {
    nombre: (a, b) => texto(a.descripcion).localeCompare(texto(b.descripcion), 'es'),
    codigo: (a, b) => texto(a.codigo).localeCompare(texto(b.codigo), 'es', { numeric: true }),
    menos: (a, b) => num(a.stock) - num(b.stock),
    caras: (a, b) => num(b.precio) - num(a.precio),
    ubicacion: (a, b) => (texto(a.ubicacion) || '￿').localeCompare(texto(b.ubicacion) || '￿', 'es', { numeric: true })
  };
  const sinFiltroRapido = () => productos().filter(p => (!estado.marca || norm(texto(p.marca)) === estado.marca) &&
    paraAuto(p, estado.auto, estado.modelo, estado.anio) && coincide(p, estado.q));
  function filtradas(base) {
    const f = FILTROS.find(x => x.id === estado.filtro) || FILTROS[0];
    const lista = (base || sinFiltroRapido()).filter(f.pasa);
    return ORDEN[estado.orden] ? lista.sort(ORDEN[estado.orden]) : lista;
  }

  // Opciones sin repetir por mayúsculas o acentos
  function unicos(valores) {
    const m = new Map();
    valores.map(texto).filter(Boolean).forEach(v => { if (!m.has(norm(v))) m.set(norm(v), v); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }
  function llenarSelect(clave, pares, todas) {
    const sel = $('[data-filtro="' + clave + '"]', raiz);
    if (estado[clave] && !pares.some(p => p[0] === estado[clave])) estado[clave] = '';
    const html = '<option value="">' + todas + '</option>' + pares.map(([v, n]) => '<option value="' + esc(v) + '">' + esc(n) + '</option>').join('');
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
    sel.value = estado[clave];
    sel.closest('label').hidden = !pares.length;
  }
  function pintarSelects() {
    const lista = productos();
    const apps = lista.flatMap(aplicacionesDe);
    llenarSelect('marca', unicos(lista.map(p => p.marca)), 'Todas');
    llenarSelect('auto', unicos(apps.map(a => a.marca)), 'Todos');
    llenarSelect('modelo', unicos(apps.filter(a => !estado.auto || norm(a.marca) === estado.auto).map(a => a.modelo)), 'Todos');
    $('[data-filtro="orden"]', raiz).value = estado.orden;
    const activos = ['marca', 'auto', 'modelo', 'anio'].filter(k => estado[k]).length;
    const b = $('.inv-cuenta-filtros', raiz);
    b.hidden = !activos;
    b.textContent = activos;
  }

  function pintarResumen() {
    const r = resumen(productos());
    const dato = (titulo, valor, nota, extra) => `<div class="inv-dato ${extra || ''}"><span>${titulo}</span><strong>${valor}</strong><small>${nota}</small></div>`;
    $('.inv-resumen', raiz).innerHTML =
      dato('Piezas en existencia', r.piezas.toLocaleString('es-MX'), cuantos(r.referencias, 'artículo', 'artículos') + ' en catálogo') +
      dato('Valor a precio de venta', dinero(r.valorPrecio), 'de lo que hay en existencia') +
      (esAdmin() ? dato('Valor a costo', dinero(r.valorCosto), r.sinCosto ? cuantos(r.sinCosto, 'artículo sin costo', 'artículos sin costo') : 'costo de referencia') : '') +
      `<button type="button" class="inv-dato inv-alerta ${r.poco ? 'hay' : ''}" data-accion="ver-poco"><span>Poco stock</span><strong>${r.poco.toLocaleString('es-MX')}</strong><small>${r.poco ? 'Toca para verlas' : 'Todo en orden'}</small></button>`;
    $('.inv-resumen', raiz).classList.toggle('con-costo', esAdmin());
  }

  function vacio(tipo) {
    const caja = $('.inv-vacio', raiz);
    caja.hidden = !tipo;
    if (!tipo) return;
    const arte = '<div class="inv-vacio-icono">' + icono(tipo === 'nuevo' ? 'package' : 'search', 40) + '</div>';
    if (tipo === 'nuevo') {
      caja.innerHTML = arte + '<h3>Tu inventario está listo para empezar</h3><p>Agrega tu primera pieza con foto, o trae tu lista desde Excel.</p>' +
        (puedeEditar() ? '<div><button type="button" class="btn btn-primary" data-accion="nueva">Agregar mi primera pieza</button><button type="button" class="btn btn-secondary" data-accion="importar">Importar desde Excel</button></div>' : '');
      return;
    }
    const f = FILTROS.find(x => x.id === estado.filtro);
    const buscando = estado.q || estado.marca || estado.auto || estado.modelo || estado.anio;
    const titulos = { poco: 'Nada con poco stock', sinfoto: 'Todas tienen foto', archivadas: 'No hay piezas archivadas', pedido: 'No hay piezas bajo pedido', disponibles: 'No hay piezas disponibles' };
    caja.innerHTML = arte + '<h3>' + (buscando ? 'No encontré piezas' : (titulos[f.id] || 'No hay piezas aquí')) + '</h3>' +
      '<p>' + (buscando ? 'Prueba con menos palabras, otro código o quita los filtros.' : 'Cambia de filtro para ver las demás.') + '</p>' +
      '<div><button type="button" class="btn btn-secondary" data-accion="limpiar">Ver todas</button>' +
      (buscando && puedeEditar() ? '<button type="button" class="btn btn-primary" data-accion="nueva">Agregar pieza</button>' : '') + '</div>';
  }

  function pintar() {
    const editar = puedeEditar();
    $$('[data-accion="nueva"], [data-accion="importar"]', $('.inv-barra', raiz)).forEach(b => { b.hidden = !editar; });
    $('.inv-herramientas [data-accion="importar"]', raiz).hidden = !editar;
    $$('[data-vista]', raiz).forEach(b => b.setAttribute('aria-pressed', b.dataset.vista === estado.vista));
    rejilla.classList.toggle('inv-lista', estado.vista === 'lista');
    if (!estado.cargado && !productos().length) {
      rejilla.innerHTML = Array.from({ length: 8 }, () => '<div class="inv-item inv-esq" aria-hidden="true"><div class="inv-foto"></div><div class="inv-cuerpo"><i></i><i></i><i></i></div></div>').join('');
      $('.inv-resumen', raiz).innerHTML = '';
      $('.inv-contador', raiz).textContent = 'Cargando inventario…';
      $('.inv-chips', raiz).innerHTML = '';
      $('.inv-mas', raiz).hidden = true;
      return vacio(null);
    }
    pintarResumen();
    pintarSelects();
    const base = sinFiltroRapido();
    $('.inv-chips', raiz).innerHTML = FILTROS.map(f => `<button type="button" data-chip="${f.id}" aria-pressed="${f.id === estado.filtro}">${f.nombre}<b>${base.filter(f.pasa).length.toLocaleString('es-MX')}</b></button>`).join('');
    const lista = filtradas(base);
    const visibles = lista.slice(0, estado.limite);
    // Se acomodan los nodos sin vaciar la rejilla: no parpadea ni se pierde el lugar
    const nodos = visibles.map((p, i) => tarjetaDe(p, i % POR_PAGINA));
    nodos.forEach((el, i) => { if (rejilla.children[i] !== el) rejilla.insertBefore(el, rejilla.children[i] || null); });
    while (rejilla.children.length > nodos.length) rejilla.lastChild.remove();
    $('.inv-contador', raiz).textContent = lista.length > visibles.length
      ? 'Viendo ' + visibles.length.toLocaleString('es-MX') + ' de ' + cuantos(lista.length, 'artículo', 'artículos')
      : cuantos(lista.length, 'artículo', 'artículos');
    $('.inv-mas', raiz).hidden = lista.length <= visibles.length;
    vacio(lista.length ? null : (productos().length ? 'filtro' : 'nuevo'));
  }

  // Llegaron datos: solo se dibuja si el módulo está a la vista
  let pendiente = 0;
  function refrescar() {
    estado.cargado = true;
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      if (mod.classList.contains('active')) pintar();
      refrescarFicha();
    }, 60);
  }
  const cuerpoViejo = document.getElementById('inv-body');
  const datosListos = () => productos().length > 0 || !(cuerpoViejo && cuerpoViejo.querySelector('.m-esq, .empty-desc'));
  if (productos().length) estado.cargado = true;
  if (cuerpoViejo) new MutationObserver(() => { if (datosListos()) refrescar(); }).observe(cuerpoViejo, { childList: true });
  // Al entrar al módulo se vuelve a pintar con los datos y el rol actuales (lo que no cambió no se redibuja)
  new MutationObserver(() => { if (mod.classList.contains('active')) pintar(); }).observe(mod, { attributes: true, attributeFilter: ['class'] });

  const reiniciar = () => { estado.limite = POR_PAGINA; pintar(); };
  function limpiar() {
    Object.assign(estado, { q: '', filtro: 'todas', marca: '', auto: '', modelo: '', anio: '' });
    $('#inv-q', raiz).value = '';
    $('[data-filtro="anio"]', raiz).value = '';
    reiniciar();
  }
  const masPiezas = () => { estado.limite += POR_PAGINA; pintar(); };
  if ('IntersectionObserver' in window) {
    const fin = $('.inv-mas', raiz);
    new IntersectionObserver(e => { if (e[0].isIntersecting && !fin.hidden && mod.classList.contains('active')) masPiezas(); }, { rootMargin: '300px' }).observe(fin);
  }
  let espera = 0;
  $('#inv-q', raiz).addEventListener('input', e => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.q = e.target.value; reiniciar(); }, 140);
  });
  $('.inv-filtros', raiz).addEventListener('input', e => {
    const k = e.target.dataset.filtro;
    if (!k) return;
    if (k === 'anio' && e.target.value && e.target.value.length < 4) return;
    estado[k] = e.target.value;
    if (k === 'auto') estado.modelo = '';
    if (k === 'orden') recordar();
    reiniciar();
  });
  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-accion], [data-chip], [data-vista], [data-entrada], [data-salida]');
    const item = e.target.closest('.inv-item');
    if (item && item.dataset.id) {
      if (b && b.hasAttribute('data-entrada')) return abrirAjuste(item.dataset.id, 'entrada');
      if (b && b.hasAttribute('data-salida')) return abrirAjuste(item.dataset.id, 'salida');
      // Si la persona está seleccionando texto no se abre la ficha
      if (!String(window.getSelection())) abrirFicha(item.dataset.id);
      return;
    }
    if (!b) return;
    if (b.dataset.chip) { estado.filtro = b.dataset.chip; return reiniciar(); }
    if (b.dataset.vista) { estado.vista = b.dataset.vista; recordar(); return pintar(); }
    switch (b.dataset.accion) {
      case 'nueva': if (b.id !== 'inv-nueva') abrirForm(); break; // el botón principal ya llama desde su onclick
      case 'filtros': { const p = $('#inv-filtros', raiz); p.hidden = !p.hidden; b.setAttribute('aria-expanded', !p.hidden); break; }
      case 'limpiar': limpiar(); break;
      case 'mas': masPiezas(); break;
      case 'ver-poco': estado.filtro = 'poco'; reiniciar(); break;
      case 'exportar': exportar(b); break;
      case 'importar': abrirImportar(); break;
    }
  });

  // ── Ventanas ──
  function crearVentana(id, titulo, ancho) {
    const v = document.createElement('div');
    v.className = 'modal-overlay inv-ventana';
    v.id = id;
    v.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}-t" style="max-width:${ancho}px">
      <div class="modal-head"><h3 id="${id}-t">${titulo}</h3><button type="button" class="modal-close" aria-label="Cerrar">×</button></div>
      <div class="modal-body"></div><div class="modal-footer"></div></div>`;
    document.body.appendChild(v);
    // interaccion.js intercepta antes el clic cuando hay capturas sin guardar
    v.addEventListener('click', e => { if (e.target === v || e.target.closest('.modal-close, [data-cerrar]')) cerrar(id); });
    return { v, id, titulo: $('h3', v), cuerpo: $('.modal-body', v), pie: $('.modal-footer', v) };
  }
  const abrir = id => { window.openModal(id); };
  const cerrar = id => { window.closeModal(id); };
  const vFicha = crearVentana('inv-m-ficha', 'Ficha de pieza', 640);
  const vForm = crearVentana('inv-m-form', 'Pieza', 660);
  const vAjuste = crearVentana('inv-m-ajuste', 'Ajustar existencias', 440);
  const vImportar = crearVentana('inv-m-importar', 'Importar desde Excel', 720);
  const vZoom = crearVentana('inv-m-zoom', 'Foto', 900);
  document.addEventListener('keydown', e => {
    const flecha = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (e.key !== 'Escape' && !flecha) return;
    const abiertas = $$('.modal-overlay.open');
    const arriba = abiertas[abiertas.length - 1];
    if (!arriba || !arriba.classList.contains('inv-ventana')) return;
    if (!flecha) return $('.modal-close', arriba).click();
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const g = arriba === vZoom.v ? galZoom : arriba === vFicha.v ? galFicha : null;
    if (g && g.total > 1) { e.preventDefault(); g.mover(flecha); }
  });

  // Evita el doble envío y avisa si no hay conexión
  async function conBoton(boton, textoOcupado, tarea) {
    if (boton.disabled) return;
    const antes = boton.innerHTML;
    boton.disabled = true;
    boton.textContent = textoOcupado;
    const lento = setTimeout(() => avisar('Sin respuesta todavía. Revisa tu internet y no lo captures otra vez.', 'info'), 9000);
    try { await tarea(); }
    catch (e) { console.error('Inventario:', e); avisar(mensajeError(e, COL), 'error'); }
    // Si la ventana ya se está cerrando, el botón queda apagado: otro toque repetiría el guardado
    finally { clearTimeout(lento); boton.disabled = !!boton.closest('.m-cerrando'); boton.innerHTML = antes; }
  }

  // ── Existencias ──
  const errorNegocio = m => Object.assign(new Error(m), { esNegocio: true });
  const movimiento = (p, tipo, antes, despues, motivo, nota) => ({
    productoId: p.id, codigo: texto(p.codigo), descripcion: texto(p.descripcion), tipo, cantidad: despues - antes,
    stockAntes: antes, stockDespues: despues, motivo, nota: nota || '', por: uid(), porNombre: miNombre(), createdAt: window.serverTimestamp()
  });
  // cambio = { delta } (sumar o restar) o { fijar } (conteo físico)
  const calcular = (antes, cambio) => {
    const despues = cambio.fijar !== undefined ? cambio.fijar : antes + cambio.delta;
    // (a un registro viejo en negativo sí se le puede sumar)
    if (despues < 0 && !(despues > antes)) throw errorNegocio('No alcanza: solo hay ' + antes + '. Las existencias no pueden quedar en negativo.');
    return despues;
  };
  // Con transacción si el SDK real es el mismo que usa la app; si no, lectura y escritura normales
  async function transaccion() {
    try {
      const fs = await import(URL_FIRESTORE);
      return fs.doc === window.doc && typeof fs.runTransaction === 'function' ? fs.runTransaction : null;
    } catch (e) { return null; }
  }
  async function ajustar(id, cambio, motivo, nota) {
    const runTransaction = await transaccion();
    if (runTransaction) {
      try {
        return await runTransaction(window.db, async t => {
          const snap = await t.get(ref(COL, id));
          if (!snap.exists()) throw errorNegocio('Esa pieza ya no existe');
          const p = Object.assign({}, snap.data(), { id });
          const antes = num(p.stock), despues = calcular(antes, cambio);
          t.update(ref(COL, id), Object.assign({ stock: despues }, sello()));
          if (despues !== antes) t.set(ref(COL_MOV, nuevoId()), movimiento(p, 'ajuste', antes, despues, motivo, nota));
          return { antes, despues, historial: true };
        });
      } catch (e) {
        if (!sinPermiso(e)) throw e; // si lo negado es el historial, se guarda al menos la existencia
      }
    }
    const snap = await window.getDoc(ref(COL, id));
    if (!snap.exists()) throw errorNegocio('Esa pieza ya no existe');
    const p = Object.assign({}, snap.data(), { id });
    const antes = num(p.stock), despues = calcular(antes, cambio);
    await window.updateDoc(ref(COL, id), Object.assign({ stock: despues }, sello()));
    let historial = true;
    if (despues !== antes) historial = await anotar(movimiento(p, 'ajuste', antes, despues, motivo, nota));
    return { antes, despues, historial };
  }
  async function anotar(mov) {
    try { await window.addDoc(window.collection(window.db, COL_MOV), mov); return true; }
    catch (e) { console.warn('Movimiento no guardado:', e); return false; }
  }

  const MOTIVOS = {
    entrada: ['Llegó mercancía (compra)', 'Devolución de cliente', 'Apareció en conteo', 'Otro'],
    salida: ['Se vendió', 'Se entregó a un taller', 'Dañada o merma', 'Devolución a proveedor', 'Faltante en conteo', 'Otro'],
    conteo: ['Conteo físico', 'Corrección de captura', 'Otro']
  };
  let turnoAjuste = 0;
  function abrirAjuste(id, modo) {
    const p = porId(id);
    if (!p || !puedeEditar()) return;
    const mio = ++turnoAjuste;
    let actual = modo || 'entrada';
    vAjuste.cuerpo.innerHTML = `
      <p class="inv-aj-pieza"><b>${esc(p.descripcion || 'Sin descripción')}</b><span>${esc(p.codigo || 'Sin código')}</span></p>
      <div class="inv-segmento" role="group" aria-label="Tipo de ajuste">
        <button type="button" data-modo="entrada">Entrada (+)</button><button type="button" data-modo="salida">Salida (−)</button><button type="button" data-modo="conteo">Conteo</button>
      </div>
      <label class="inv-aj-etiqueta" for="inv-aj-cant"></label>
      <div class="inv-paso"><button type="button" data-paso="-1" aria-label="Uno menos">−</button><input id="inv-aj-cant" type="number" inputmode="numeric" min="0" step="1"><button type="button" data-paso="1" aria-label="Uno más">+</button></div>
      <p class="inv-aj-queda" aria-live="polite"></p>
      <div class="form-group"><label for="inv-aj-motivo">Motivo</label><select id="inv-aj-motivo"></select></div>
      <div class="form-group"><label for="inv-aj-nota">Nota (obligatoria si es otro motivo)</label><input id="inv-aj-nota" type="text" maxlength="200" placeholder="Ej. factura 123, cliente, taller…"></div>`;
    vAjuste.pie.innerHTML = '<button type="button" class="btn btn-secondary" data-cerrar>Cancelar</button><button type="button" class="btn btn-primary" id="inv-aj-ok">Guardar ajuste</button>';
    const cant = $('#inv-aj-cant', vAjuste.v), queda = $('.inv-aj-queda', vAjuste.v), ok = $('#inv-aj-ok', vAjuste.v);
    const leer = () => (cant.value === '' ? NaN : Number(cant.value));
    function revisar() {
      const hay = num((porId(id) || p).stock), n = leer();
      const valido = Number.isInteger(n) && n >= (actual === 'conteo' ? 0 : 1);
      const despues = !valido ? hay : actual === 'conteo' ? n : hay + (actual === 'entrada' ? n : -n);
      queda.innerHTML = 'Hay <b>' + hay + '</b> → ' + (valido ? 'quedarán <b>' + despues + '</b>' : 'escribe una cantidad entera');
      const mal = despues < 0 && !(despues > hay);
      queda.classList.toggle('mal', mal);
      if (mal) queda.innerHTML = 'Solo hay <b>' + hay + '</b>: no puede quedar en negativo';
      ok.disabled = !valido || mal;
    }
    function ponerModo(m) {
      actual = m;
      $$('[data-modo]', vAjuste.v).forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === m));
      $('.inv-aj-etiqueta', vAjuste.v).textContent = { entrada: '¿Cuántas entran?', salida: '¿Cuántas salen?', conteo: '¿Cuántas hay en realidad?' }[m];
      $('#inv-aj-motivo', vAjuste.v).innerHTML = '<option value="">Elige un motivo…</option>' + MOTIVOS[m].map(x => '<option>' + x + '</option>').join('');
      cant.value = m === 'conteo' ? num((porId(id) || p).stock) : 1;
      revisar();
    }
    $$('[data-modo]', vAjuste.v).forEach(b => { b.onclick = () => ponerModo(b.dataset.modo); });
    $$('[data-paso]', vAjuste.v).forEach(b => { b.onclick = () => { cant.value = Math.max(0, (Math.trunc(leer()) || 0) + Number(b.dataset.paso)); revisar(); }; });
    cant.oninput = revisar;
    ok.onclick = () => {
      const motivo = $('#inv-aj-motivo', vAjuste.v).value, nota = $('#inv-aj-nota', vAjuste.v).value.trim(), n = leer();
      if (!motivo) return avisar('Elige el motivo', 'error');
      if (motivo === 'Otro' && !nota) return avisar('Escribe en la nota cuál es el motivo', 'error');
      conBoton(ok, 'Guardando…', async () => {
        const r = await ajustar(id, actual === 'conteo' ? { fijar: n } : { delta: actual === 'entrada' ? n : -n }, motivo, nota);
        if (mio === turnoAjuste) cerrar(vAjuste.id); // con internet lento pudo abrir otro ajuste
        if (fichaId === id && vFicha.v.classList.contains('open')) cargarHistorial(id);
        avisar('Existencias: ' + r.antes + ' → ' + r.despues, 'success');
        if (!r.historial) avisar('Se cambió la existencia, pero no se pudo guardar el historial (revisa las reglas de "movimientos").', 'error');
      });
    };
    ponerModo(actual);
    abrir(vAjuste.id);
  }

  // ── Ficha ──
  let fichaId = null, fichaFirma = '', fichaFoto = 0, galFicha = null, galZoom = null;
  const firmaFicha = p => JSON.stringify(camposDe(p)) + p.archivado + firmaFotos(p);

  // Galería: se desliza con el dedo, con las flechas o tocando una miniatura. Las fotos se piden al abrirla.
  function galeria(caja, p, op) {
    const ids = fotosDe(p);
    const total = ids.length;
    const varias = total > 1;
    const hoja = (docId, k) => `<button type="button" class="inv-foto inv-gal-hoja" data-k="${k}" ${op.zoom ? 'tabindex="-1"' : 'aria-label="Ver en grande la foto ' + (k + 1) + '"'}>
      <span class="inv-sin">${icono('camera', 46)}<small>Cargando foto…</small></span></button>`;
    caja.innerHTML = `<div class="inv-gal${op.zoom ? ' zoom' : ''}">
      <div class="inv-gal-marco">
        <div class="inv-gal-pista">${total ? ids.map(hoja).join('') : '<div class="inv-foto inv-gal-hoja vacia"><span class="inv-sin">' + icono('package', 46) + '<small>Sin foto</small></span></div>'}</div>
        ${op.chip || ''}
        ${varias ? '<button type="button" class="inv-gal-flecha antes" data-gal="-1" aria-label="Foto anterior">' + icono('arrow-left', 22) + '</button>' +
          '<button type="button" class="inv-gal-flecha despues" data-gal="1" aria-label="Foto siguiente">' + icono('arrow-right', 22) + '</button>' +
          '<span class="inv-gal-cuenta" aria-live="polite"></span>' : ''}
      </div>
      ${varias ? '<div class="inv-gal-minis">' + ids.map((docId, k) => '<button type="button" class="inv-foto" data-mini="' + k + '" aria-label="Foto ' + (k + 1) + ' de ' + total + (k ? '' : ' (portada)') + '"><span class="inv-sin">' + icono('camera', 20) + '</span></button>').join('') + '</div>' : ''}
    </div>`;
    const pista = $('.inv-gal-pista', caja);
    const hojas = $$('.inv-gal-hoja', pista);
    const minis = $$('[data-mini]', caja);
    let actual = Math.max(0, Math.min(op.inicio || 0, total - 1));
    let destino = null; // mientras avanza sola, el desplazamiento no cambia la foto elegida
    function marcar() {
      const cuenta = $('.inv-gal-cuenta', caja);
      if (cuenta) cuenta.textContent = (actual + 1) + ' de ' + total;
      $$('[data-gal]', caja).forEach(b => { b.disabled = Number(b.dataset.gal) < 0 ? actual === 0 : actual === total - 1; });
      minis.forEach((m, k) => m.setAttribute('aria-current', k === actual));
      if (op.alCambiar) op.alCambiar(actual);
    }
    function ir(k, suave) {
      actual = Math.max(0, Math.min(k, total - 1));
      const x = actual * pista.clientWidth;
      const animar = suave && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      destino = animar && Math.abs(pista.scrollLeft - x) > 1 ? actual : null;
      pista.scrollTo({ left: x, behavior: animar ? 'smooth' : 'instant' });
      marcar();
    }
    function cargar(k) {
      const cajas = [hojas[k], minis[k]].filter(Boolean);
      const decir = t => { const s = $('small', hojas[k]); if (s) s.textContent = t; };
      cajas.forEach(c => c.classList.add('cargando'));
      delete hojas[k].dataset.fallo;
      decir('Cargando foto…');
      pedirFoto(p, ids[k]).then(url => {
        if (url) cajas.forEach(c => ponerImagen(c, url, (p.descripcion || 'Pieza') + ' · foto ' + (k + 1)));
        else decir('No se encontró la foto');
      }, e => { hojas[k].dataset.fallo = '1'; decir('No se pudo cargar. Toca para intentar de nuevo'); console.warn('Foto:', e.message); })
        .finally(() => cajas.forEach(c => c.classList.remove('cargando')));
    }
    caja.onclick = e => {
      const flecha = e.target.closest('[data-gal]');
      if (flecha) return ir(actual + Number(flecha.dataset.gal), true);
      const mini = e.target.closest('[data-mini]');
      if (mini) return ir(Number(mini.dataset.mini), true);
      const h = e.target.closest('[data-k]');
      if (!h) return;
      const k = Number(h.dataset.k);
      if (h.dataset.fallo) return cargar(k);
      if (op.alTocar && h.classList.contains('con-foto')) op.alTocar(k);
    };
    if (total) {
      // primero la que se está viendo
      ids.map((x, k) => k).sort((a, b) => Math.abs(a - actual) - Math.abs(b - actual)).forEach(cargar);
      pista.addEventListener('scroll', () => {
        const w = pista.clientWidth;
        if (!w) return;
        if (destino !== null) { if (Math.abs(pista.scrollLeft - destino * w) < 2) destino = null; return; }
        const k = Math.max(0, Math.min(total - 1, Math.round(pista.scrollLeft / w)));
        if (k !== actual) { actual = k; marcar(); }
      }, { passive: true });
      ['pointerdown', 'touchstart', 'wheel'].forEach(t => pista.addEventListener(t, () => { destino = null; }, { passive: true }));
      // Al abrir la ventana o girar el teléfono, se queda en la misma foto
      if (window.ResizeObserver) new ResizeObserver(() => { if (pista.clientWidth) { destino = null; pista.scrollLeft = actual * pista.clientWidth; } }).observe(pista);
    }
    marcar();
    return { total, ir, mover: n => ir(actual + n, true) };
  }
  function verEnGrande(p, k) {
    galZoom = null;
    vZoom.cuerpo.innerHTML = '<div class="inv-zoom-caja"></div>';
    vZoom.pie.innerHTML = '<button type="button" class="btn btn-secondary" data-cerrar>Cerrar</button>';
    abrir(vZoom.id);
    const total = fotosDe(p).length;
    galZoom = galeria(vZoom.cuerpo.firstChild, p, {
      zoom: true, inicio: k,
      alCambiar: i => {
        vZoom.titulo.textContent = total > 1 ? 'Foto ' + (i + 1) + ' de ' + total : 'Foto';
        // La ficha de atrás se queda en la misma foto
        if (galFicha && i !== fichaFoto) galFicha.ir(i);
      }
    });
  }
  function abrirFicha(id) {
    if (!porId(id)) return;
    fichaId = id;
    fichaFoto = 0;
    pintarFicha();
    abrir(vFicha.id);
    cargarHistorial(id);
  }
  function refrescarFicha() {
    if (!fichaId || !vFicha.v.classList.contains('open')) return;
    const p = porId(fichaId);
    if (!p) return cerrar(vFicha.id);
    if (firmaFicha(p) === fichaFirma) return;
    pintarFicha();
    cargarHistorial(fichaId);
  }
  function pintarFicha() {
    const p = porId(fichaId);
    const d = camposDe(p);
    fichaFirma = firmaFicha(p);
    const [color, nombre] = etiqueta(p);
    const editar = puedeEditar();
    const fila = (t, v) => (v ? '<div><dt>' + t + '</dt><dd>' + esc(v) + '</dd></div>' : '');
    const autos = d.aplicaciones.map(a => '<li>' + esc([a.marca, a.modelo].filter(Boolean).join(' ') || 'Auto') + (rangoTexto(a) ? '<span>' + esc(rangoTexto(a)) + '</span>' : '') + '</li>').join('');
    const margen = d.costoRef && d.precio ? dinero(d.precio - d.costoRef) + ' (' + Math.round((d.precio - d.costoRef) / d.precio * 100) + '% del precio)' : '';
    vFicha.titulo.textContent = 'Ficha de pieza';
    vFicha.cuerpo.innerHTML = `
      <div class="inv-ficha-fotos"></div>
      <div class="inv-meta">${p.codigo ? '<code>' + esc(p.codigo) + '</code>' : ''}${p.marca ? '<span>' + esc(p.marca) + '</span>' : ''}</div>
      <h2>${esc(p.descripcion || 'Sin descripción')}</h2>
      <div class="inv-cifras">
        <div><span>Precio</span><strong>${dinero(d.precio)}</strong></div>
        <div class="${color}"><span>Existencias</span><strong>${d.stock.toLocaleString('es-MX')}</strong>${d.stockMin ? '<small>mínimo ' + d.stockMin + '</small>' : ''}</div>
        ${esAdmin() ? '<div><span>Costo de referencia</span><strong>' + (d.costoRef ? dinero(d.costoRef) : '—') + '</strong>' + (margen ? '<small>ganancia ' + margen + '</small>' : '') + '</div>' : ''}
      </div>
      ${editar && !p.archivado ? '<div class="inv-ajuste-rapido"><button type="button" class="btn btn-secondary" data-f="salida">− Salida</button><button type="button" class="btn btn-secondary" data-f="entrada">+ Entrada</button></div>' : ''}
      <dl class="inv-datos">
        ${fila('Ubicación', d.ubicacion)}${fila('Lado', d.lado)}${fila('Condición', d.condicion)}
        ${fila('Tipo', d.tipo === 'bajo_pedido' ? 'Bajo pedido' : 'En existencia')}${fila('Proveedor', d.proveedor)}${fila('Clase', d.clase)}
      </dl>
      ${d.oem.length ? '<h4>Códigos alternos</h4><div class="inv-oem">' + d.oem.map(c => '<button type="button" data-copiar="' + esc(c) + '" title="Copiar">' + esc(c) + '</button>').join('') + '</div>' : ''}
      ${autos ? '<h4>Le queda a</h4><ul class="inv-aplica">' + autos + '</ul>' : ''}
      ${d.compatibilidad && d.compatibilidad !== textoAplicaciones(d.aplicaciones) ? '<h4>Compatibilidad</h4><p class="inv-compat">' + esc(d.compatibilidad) + '</p>' : ''}
      <h4>Movimientos</h4><div class="inv-historial"><p class="inv-suave">Cargando…</p></div>
      <p class="inv-suave">${p.updatedAt ? 'Último cambio: ' + esc(fechaCorta(p.updatedAt)) + (nombreDe(p.updatedBy) ? ' por ' + esc(nombreDe(p.updatedBy)) : '') : (p.createdAt ? 'Registrada: ' + esc(fechaCorta(p.createdAt)) : '')}</p>`;
    galFicha = null; // la anterior ya no está en pantalla
    galFicha = galeria($('.inv-ficha-fotos', vFicha.v), p, {
      inicio: fichaFoto, chip: '<span class="inv-chip ' + color + '">' + nombre + '</span>',
      alCambiar: k => { fichaFoto = k; }, alTocar: k => verEnGrande(p, k)
    });
    vFicha.pie.innerHTML = !editar ? '<button type="button" class="btn btn-secondary" data-cerrar>Cerrar</button>' :
      (p.archivado
        ? (esAdmin() ? '<button type="button" class="btn btn-danger" data-f="borrar">Borrar definitivamente</button>' : '') +
          '<button type="button" class="btn btn-secondary" data-f="editar">Editar</button><button type="button" class="btn btn-primary" data-f="restaurar">Restaurar</button>'
        : '<button type="button" class="btn btn-secondary" data-f="archivar">Archivar</button><button type="button" class="btn btn-primary" data-f="editar">Editar pieza</button>');
  }
  async function cargarHistorial(id) {
    let html;
    try {
      const snap = await window.getDocs(window.query(window.collection(window.db, COL_MOV), window.where('productoId', '==', id)));
      const lista = snap.docs.map(d => d.data()).sort((a, b) => (comoFecha(b.createdAt) || Date.now()) - (comoFecha(a.createdAt) || Date.now())).slice(0, 15);
      html = lista.length ? '<ul>' + lista.map(m => `<li><b class="${num(m.cantidad) < 0 ? 'menos' : 'mas'}">${num(m.cantidad) > 0 ? '+' : ''}${num(m.cantidad)}</b>
        <div><span>${esc(m.motivo || m.tipo || 'Movimiento')}${m.nota ? ' · ' + esc(m.nota) : ''}</span><small>${esc(fechaCorta(m.createdAt))}${m.porNombre ? ' · ' + esc(m.porNombre) : ''} · quedó en ${num(m.stockDespues)}</small></div></li>`).join('') + '</ul>'
        : '<p class="inv-suave">Aún no hay movimientos registrados.</p>';
    } catch (e) {
      console.warn('Historial:', e);
      html = '<p class="inv-suave">No se pudo cargar el historial.</p>';
    }
    const caja = $('.inv-historial', vFicha.v);
    if (caja && fichaId === id) caja.innerHTML = html;
  }
  vFicha.v.addEventListener('click', e => {
    const copiar = e.target.closest('[data-copiar]');
    if (copiar && navigator.clipboard) return navigator.clipboard.writeText(copiar.dataset.copiar).then(() => avisar('Código copiado', 'success'), () => {});
    const b = e.target.closest('[data-f]');
    const p = porId(fichaId);
    if (!b || !p) return;
    const accion = b.dataset.f;
    if (accion === 'entrada' || accion === 'salida') return abrirAjuste(p.id, accion);
    if (accion === 'editar') { cerrar(vFicha.id); return abrirForm(p.id); }
    if (accion === 'archivar' || accion === 'restaurar') return archivar(b, p, accion === 'archivar');
    if (accion === 'borrar') return borrar(b, p);
  });

  function archivar(boton, p, si) {
    const nombre = p.descripcion || p.codigo || 'esta pieza';
    if (si && !window.confirm('¿Archivar "' + nombre + '"?\n\nDeja de salir en el inventario, pero no se borra: la encuentras en el filtro Archivadas.' + (num(p.stock) ? '\n\nOjo: todavía tiene ' + num(p.stock) + ' en existencia.' : ''))) return;
    conBoton(boton, 'Guardando…', async () => {
      await window.updateDoc(ref(COL, p.id), Object.assign({ archivado: si }, sello()));
      if (fichaId === p.id) cerrar(vFicha.id);
      avisar(si ? 'Pieza archivada' : 'Pieza restaurada', 'success');
    });
  }
  const borrarFotos = ids => Promise.all(ids.map(x => window.deleteDoc(ref(COL_FOTOS, x)).catch(e => console.warn('No se pudo borrar una foto:', e))));
  // Solo Dirección y solo piezas ya archivadas; antes se guarda copia en "papelera" (como hace Pepito)
  function borrar(boton, p) {
    if (!esAdmin() || !p.archivado) return;
    const n = fotosDe(p).length;
    if (!window.confirm('¿Borrar definitivamente "' + (p.descripcion || p.codigo || 'esta pieza') + '"?\n\nSe borra la pieza y ' + (n > 1 ? 'sus ' + n + ' fotos' : 'su foto') + '. No se puede deshacer desde la app.')) return;
    conBoton(boton, 'Borrando…', async () => {
      const datos = Object.assign({}, p);
      delete datos.id;
      try {
        await window.setDoc(ref('papelera', COL + '_' + p.id + '_' + Date.now()), {
          coleccion: COL, idOriginal: p.id, datos, eliminadoPor: correo(), eliminadoPorNombre: miNombre(), eliminadoEn: new Date().toISOString(), origen: 'app'
        });
      } catch (e) {
        if (!window.confirm('No se pudo guardar la copia de respaldo.\n\n¿Borrar de todos modos?')) return;
      }
      // Todas sus fotos: la portada, las de la lista y las que hayan quedado sueltas de un guardado a medias
      const suyas = new Set([p.id].concat(extrasDe(porId(p.id) || p)));
      try {
        const sueltas = await window.getDocs(window.query(window.collection(window.db, COL_FOTOS), window.where('productoId', '==', p.id)));
        sueltas.docs.forEach(x => suyas.add(x.id));
      } catch (e) { console.warn('No se pudieron buscar más fotos:', e); }
      await window.deleteDoc(ref(COL, p.id));
      await borrarFotos(Array.from(suyas));
      cerrar(vFicha.id);
      avisar('Pieza borrada', 'success');
    });
  }

  // ── Fotos: reducir antes de guardar (como en Visita de Talleres, con HEIC) ──
  function cargarScript(src, listoYa) {
    if (listoYa()) return Promise.resolve();
    return new Promise((resolver, fallar) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (listoYa() ? resolver() : fallar(new Error('Librería no disponible')));
      s.onerror = () => { s.remove(); fallar(new Error('No se pudo descargar la librería (revisa tu internet)')); };
      document.head.appendChild(s);
    });
  }
  async function decodificar(blob, reducir) {
    if (window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(blob, reducir ? { resizeWidth: 1600, resizeQuality: 'medium', imageOrientation: 'from-image' } : { imageOrientation: 'from-image' });
        return { fuente: bmp, w: bmp.width, h: bmp.height, liberar: () => bmp.close() };
      } catch (e) { /* se intenta con <img> */ }
    }
    return new Promise((resolver, fallar) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolver({ fuente: img, w: img.naturalWidth, h: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) });
      img.onerror = () => { URL.revokeObjectURL(url); fallar(new Error('formato no compatible')); };
      img.src = url;
    });
  }
  function dibujar(dec, maxLado, calidad) {
    if (!dec.w || !dec.h) throw new Error('Imagen inválida');
    const k = Math.min(1, maxLado / Math.max(dec.w, dec.h));
    const w = Math.max(1, Math.round(dec.w * k)), h = Math.max(1, Math.round(dec.h * k));
    const lienzo = document.createElement('canvas');
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(dec.fuente, 0, 0, w, h);
    // En celulares con fotos enormes el lienzo puede quedar en blanco
    let blanco = true;
    for (let i = 0; i < 12 && blanco; i++) {
      for (let j = 0; j < 12 && blanco; j++) {
        const px = ctx.getImageData(Math.floor((i + 0.5) * w / 12), Math.floor((j + 0.5) * h / 12), 1, 1).data;
        if (px[0] < 250 || px[1] < 250 || px[2] < 250) blanco = false;
      }
    }
    let q = calidad, url = lienzo.toDataURL('image/jpeg', q);
    while (url.length > 300000 && q > 0.35) { q -= 0.1; url = lienzo.toDataURL('image/jpeg', q); }
    return { foto: url, ancho: w, alto: h, blanco };
  }
  async function comprimir(archivo) {
    if (archivo.size > 40 * 1024 * 1024) throw new Error('La foto pesa demasiado (máximo 40 MB)');
    const heic = /hei[cf]/i.test(archivo.type || '') || /\.hei[cf]$/i.test(archivo.name || '');
    let origen = archivo, dec;
    try { dec = await decodificar(origen); }
    catch (e) {
      if (archivo.type && !heic) throw new Error('Formato no compatible. Usa una foto JPG o PNG.');
      avisar('Convirtiendo foto de iPhone (HEIC)…', 'info');
      try {
        await cargarScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', () => !!window.heic2any);
        const r = await window.heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.85 });
        origen = Array.isArray(r) ? r[0] : r;
        dec = await decodificar(origen);
      } catch (e2) {
        console.error(e2);
        throw new Error('No se pudo leer la foto. Súbela como JPG o PNG (en iPhone: Ajustes > Cámara > Formatos > Más compatible).');
      }
    }
    let res;
    try { res = dibujar(dec, 1000, 0.75); } finally { dec.liberar(); }
    if (res.blanco) {
      const chica = await decodificar(origen, true);
      try { res = dibujar(chica, 1000, 0.75); } finally { chica.liberar(); }
    }
    return { foto: res.foto, ancho: res.ancho, alto: res.alto };
  }

  // ── Alta y edición ──
  const opciones = (lista, actual) => '<option value="">—</option>' + (actual && !lista.includes(actual) ? lista.concat(actual) : lista)
    .map(x => '<option value="' + esc(x) + '"' + (x === actual ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
  const datalist = (id, valores) => '<datalist id="' + id + '">' + unicos(valores).map(v => '<option value="' + esc(v[1]) + '"></option>').join('') + '</datalist>';
  const filaAplicacion = a => `<div class="inv-app">
    <input data-app="marca" list="inv-dl-auto" placeholder="Marca (Nissan)" aria-label="Marca del auto" value="${esc(a.marca || '')}">
    <input data-app="modelo" list="inv-dl-modelo" placeholder="Modelo (Versa)" aria-label="Modelo" value="${esc(a.modelo || '')}">
    <input data-app="anioDesde" type="number" inputmode="numeric" placeholder="Desde" aria-label="Año desde" value="${esc(a.anioDesde || '')}">
    <input data-app="anioHasta" type="number" inputmode="numeric" placeholder="Hasta" aria-label="Año hasta" value="${esc(a.anioHasta || '')}">
    <button type="button" data-quitar-app aria-label="Quitar este auto">×</button></div>`;

  let turnoForm = 0, alCerrarForm = null;
  // Al cerrar la captura se borran las fotos que se alcanzaron a subir pero ninguna pieza usa
  new MutationObserver(() => { if (!vForm.v.classList.contains('open') && alCerrarForm) alCerrarForm(); })
    .observe(vForm.v, { attributes: true, attributeFilter: ['class'] });
  function abrirForm(id, copiaDe) {
    if (!puedeEditar()) return avisar('No tienes permiso para cambiar el inventario', 'error');
    const original = id ? porId(id) : null;
    if (id && !original) return;
    const antes = camposDe(original || copiaDe || {});
    const d = original ? antes : copiaDe ? Object.assign({}, antes, { codigo: '', stock: 0 }) : Object.assign(camposDe({}), { precio: '', stock: '', stockMin: '', costoRef: '' });
    const mio = ++turnoForm; // lo que quede pendiente de una ventana anterior no toca la nueva
    if (alCerrarForm) alCerrarForm();
    let preparando = Promise.resolve(), pendientes = 0, guardando = false, terminado = false;
    const lista = productos();
    const apps = lista.flatMap(aplicacionesDe);
    const v = x => esc(x === 0 && !original ? '' : x);
    const campo = (cid, etiquetaTxt, valor, extra) => `<div class="form-group"><label for="${cid}">${etiquetaTxt}</label><input id="${cid}" value="${v(valor)}" ${extra || ''}></div>`;
    vForm.titulo.textContent = original ? 'Editar pieza' : 'Agregar pieza';
    vForm.cuerpo.innerHTML = `
      <section class="inv-fotos" aria-labelledby="inv-f-fotos-t">
        <div class="inv-fotos-cab"><h4 id="inv-f-fotos-t">Fotos</h4><b id="inv-f-cuenta" aria-live="polite"></b></div>
        <ul class="inv-fotos-lista" id="inv-f-lista"></ul>
        <div class="inv-fotos-botones">
          <label class="btn btn-secondary inv-solo-tacto">${icono('camera', 18)}<span>Tomar foto</span><input type="file" id="inv-f-camara" accept="image/*" capture="environment" hidden></label>
          <label class="btn btn-secondary">${icono('folder-open', 18)}<span>Elegir fotos</span><input type="file" id="inv-f-foto" accept="image/*,.heic,.heif" multiple hidden></label>
        </div>
        <p class="inv-suave" id="inv-f-estado" role="status"></p>
        <div class="inv-fotos-error" id="inv-f-errores" role="alert" hidden></div>
      </section>
      ${campo('inv-f-descripcion', 'Descripción *', d.descripcion, 'type="text" maxlength="200" placeholder="Ej. Faro delantero izquierdo"')}
      <div class="inv-dos">
        ${campo('inv-f-codigo', 'Código / SKU', d.codigo, 'type="text" maxlength="60" autocapitalize="characters" placeholder="Ej. FAR-VER-IZQ"')}
        ${campo('inv-f-marca', 'Marca de la pieza', d.marca, 'type="text" list="inv-dl-marca" placeholder="Depo, TYC…"')}
      </div>
      <div class="inv-repetido" id="inv-f-repetido" hidden></div>
      <div class="inv-segmento" role="group" aria-label="Tipo de pieza">
        <button type="button" data-tipo="existencia">En existencia</button><button type="button" data-tipo="bajo_pedido">Bajo pedido</button>
      </div>
      <div class="inv-tres">
        ${campo('inv-f-precio', 'Precio de venta ($)', d.precio, 'type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"')}
        ${campo('inv-f-stock', 'Existencias', d.stock, 'type="number" inputmode="numeric" min="0" step="1" placeholder="0"')}
        ${campo('inv-f-stockMin', 'Mínimo para avisar', d.stockMin, 'type="number" inputmode="numeric" min="0" step="1" placeholder="0"')}
      </div>
      ${original ? '<p class="inv-suave">Si cambias las existencias aquí, queda anotado en los movimientos.</p>' : ''}
      <h4>Para encontrarla</h4>
      <div class="inv-dos">
        ${campo('inv-f-ubicacion', 'Ubicación en bodega', d.ubicacion, 'type="text" list="inv-dl-ubicacion" placeholder="Ej. Anaquel B-3"')}
        ${campo('inv-f-oem', 'Códigos alternos / OEM', d.oem.join(', '), 'type="text" placeholder="Separados por coma"')}
      </div>
      <div class="form-group"><label>Autos a los que les queda</label><div id="inv-f-apps">${(d.aplicaciones.length ? d.aplicaciones : [{}]).map(filaAplicacion).join('')}</div>
        <button type="button" class="btn btn-secondary btn-sm" id="inv-f-otro-auto">+ Otro auto</button></div>
      <div class="form-group"><label for="inv-f-compatibilidad">Compatibilidad (texto libre)</label><input id="inv-f-compatibilidad" type="text" value="${esc(d.compatibilidad)}" placeholder="Si lo dejas vacío se llena con los autos de arriba"></div>
      <h4>Detalles</h4>
      <div class="inv-dos">
        <div class="form-group"><label for="inv-f-lado">Lado</label><select id="inv-f-lado">${opciones(LADOS, d.lado)}</select></div>
        <div class="form-group"><label for="inv-f-condicion">Condición</label><select id="inv-f-condicion">${opciones(CONDICIONES, d.condicion)}</select></div>
        ${campo('inv-f-proveedor', 'Proveedor', d.proveedor, 'type="text" list="inv-dl-proveedor"')}
        <div class="form-group"><label for="inv-f-clase">Clasificación</label><select id="inv-f-clase">
          <option value="A">A — Alto costo</option><option value="B">B — Intermedio</option><option value="C">C — Bajo costo</option></select></div>
        ${esAdmin() ? campo('inv-f-costoRef', 'Costo de referencia ($) · solo Dirección', d.costoRef || '', 'type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"') : ''}
      </div>
      ${datalist('inv-dl-marca', lista.map(p => p.marca))}${datalist('inv-dl-ubicacion', lista.map(p => p.ubicacion))}
      ${datalist('inv-dl-auto', apps.map(a => a.marca))}${datalist('inv-dl-modelo', apps.map(a => a.modelo))}
      ${datalist('inv-dl-proveedor', (window.data.proveedores || []).map(p => p.nombre).concat(lista.map(p => p.proveedor)))}`;
    vForm.pie.innerHTML = '<button type="button" class="btn btn-secondary" data-cerrar>Cancelar</button>' +
      (original ? '<button type="button" class="btn btn-secondary" id="inv-f-copiar" title="Crear otra pieza con estos mismos datos">Duplicar</button>' : '<button type="button" class="btn btn-secondary" id="inv-f-otra">Guardar y agregar otra</button>') +
      '<button type="button" class="btn btn-primary" id="inv-f-guardar">Guardar</button>';
    const c = n => $('#inv-f-' + n, vForm.v);
    // Una clasificación antigua distinta de A, B o C se conserva
    if (!['A', 'B', 'C'].includes(d.clase)) c('clase').add(new Option(d.clase, d.clase));
    c('clase').value = d.clase;
    let tipo = d.tipo;
    const ponerTipo = t => { tipo = t; $$('[data-tipo]', vForm.v).forEach(b => b.setAttribute('aria-pressed', b.dataset.tipo === t)); };
    $$('[data-tipo]', vForm.v).forEach(b => { b.onclick = () => ponerTipo(b.dataset.tipo); });
    ponerTipo(tipo);

    // ── Fotos: se arman aquí; lo guardado no se toca hasta "Guardar" ──
    const vivo = () => mio === turnoForm && vForm.v.classList.contains('open');
    // Falso desde que se toca "Cancelar" o la X, aunque la ventana todavía se esté cerrando
    const abierta = () => vivo() && !vForm.v.classList.contains('m-cerrando');
    const seccionFotos = $('.inv-fotos', vForm.v);
    let serie = 0;
    // Cada foto: guardada (docId) o nueva (datos). "subida" = documento ya enviado que todavía no usa ninguna pieza
    const nuevaFoto = o => Object.assign({ k: ++serie, docId: null, datos: null, subida: null, estado: 'lista' }, o);
    let items = original ? fotosDe(original).map(docId => nuevaFoto({ docId, estado: 'cargando' })) : [];
    const claves = () => items.map(i => i.docId || 'n' + i.k).join();
    let inicial = claves();
    let base = original ? firmaFotos(original) : '';
    let anteriores = original ? extrasDe(original) : [];
    const subidas = new Set();
    const limpiarSubidas = () => { if (!subidas.size) return; const ids = Array.from(subidas); subidas.clear(); items.forEach(i => { i.subida = null; }); borrarFotos(ids); };
    alCerrarForm = () => { if (!guardando) limpiarSubidas(); };

    const estadoFotos = t => { c('estado').textContent = t || (items.length > 1 ? 'La primera es la portada: es la que sale en el inventario.' : 'Puedes poner hasta ' + MAX_FOTOS + ' fotos de la pieza.'); };
    function errorFotos(lineas) {
      c('errores').hidden = !lineas.length;
      c('errores').innerHTML = lineas.map(t => '<p>' + esc(t) + '</p>').join('');
    }
    const TEXTO_FOTO = { cargando: 'Cargando…', error: 'No cargó. Toca para reintentar', falta: 'No se encontró', lista: '' };
    function pintarFotos() {
      if (mio !== turnoForm) return;
      const n = items.length;
      const mover = (k, paso) => '<button type="button" class="inv-ft-mover ' + (paso < 0 ? 'antes' : 'despues') + '" data-mover="' + paso + '" aria-label="Mover ' + (paso < 0 ? 'antes' : 'después') + ' la foto ' + (k + 1) + '">' + icono(paso < 0 ? 'arrow-left' : 'arrow-right', 20) + '</button>';
      c('cuenta').textContent = n + ' de ' + MAX_FOTOS;
      c('lista').innerHTML = items.map((it, k) => `<li class="inv-ft${k ? '' : ' portada'}${it.fallo ? ' fallo' : ''}" data-k="${it.k}">
        <div class="inv-ft-marco">
          <div class="inv-foto${it.estado === 'cargando' ? ' cargando' : ''}" ${it.estado === 'error' ? 'data-reintentar role="button" tabindex="0"' : ''}><span class="inv-sin">${icono('camera', 28)}<small>${TEXTO_FOTO[it.estado]}</small></span></div>
          <button type="button" class="inv-ft-quitar" data-quitar aria-label="Quitar la foto ${k + 1}">${icono('x', 20)}</button>
          ${k ? mover(k, -1) : ''}${k < n - 1 ? mover(k, 1) : ''}
          ${it.fallo ? '<span class="inv-ft-aviso">No se subió</span>' : ''}
        </div>
        ${k ? '<button type="button" class="inv-ft-portada" data-portada>Usar de portada</button>' : '<span class="inv-ft-portada es">' + icono('check', 16) + 'Portada</span>'}
      </li>`).join('') + (pendientes ? '<li class="inv-ft preparando"><div class="inv-ft-marco"><div class="inv-foto cargando"><span class="inv-sin">' + icono('camera', 28) + '<small>Preparando…</small></span></div></div></li>' : '');
      $$('.inv-ft[data-k]', c('lista')).forEach((li, k) => { if (items[k].datos) ponerImagen($('.inv-foto', li), items[k].datos.foto, 'Foto ' + (k + 1)); });
      const lleno = n >= MAX_FOTOS;
      ['foto', 'camara'].forEach(x => { c(x).disabled = lleno; c(x).closest('label').classList.toggle('apagado', lleno); });
    }
    function cargarGuardada(it) {
      it.estado = 'cargando';
      pedirFoto(original, it.docId).then(url => {
        const f = fotos.get(claveFoto(original, it.docId));
        it.datos = url && f ? f.datos : null;
        it.estado = it.datos ? 'lista' : 'falta';
      }, e => { it.estado = 'error'; console.warn('Foto:', e.message); }).finally(pintarFotos);
    }
    items.forEach(cargarGuardada);
    pintarFotos();
    estadoFotos();

    const ocupar = si => { c('guardar').disabled = si; if (c('otra')) c('otra').disabled = si; };
    let tanda = null; // lo elegido que todavía se está preparando
    let ultimoQuitar = -1000;
    function agregar(entrada) {
      const archivos = Array.from(entrada.files || []);
      entrada.value = '';
      if (!archivos.length || guardando) return;
      if (!tanda) { tanda = { total: 0, van: 0, bien: 0, sobran: 0, fallas: [] }; errorFotos([]); }
      const esta = tanda;
      esta.total += archivos.length;
      pendientes += archivos.length;
      ocupar(true);
      pintarFotos();
      archivos.forEach(archivo => {
        preparando = preparando.then(async () => {
          try {
            if (!vivo()) return;
            esta.van++;
            // El lugar se cuenta al llegar su turno: una foto que falla no le quita el lugar a otra
            if (items.length >= MAX_FOTOS) { esta.sobran++; return; }
            estadoFotos('Preparando foto ' + esta.van + ' de ' + esta.total + '…');
            const datos = await comprimir(archivo);
            if (!vivo()) return;
            items.push(nuevaFoto({ datos }));
            esta.bien++;
          } catch (e) {
            console.warn('Foto:', e);
            esta.fallas.push('No se agregó "' + (archivo.name || 'foto') + '": ' + e.message);
          } finally {
            pendientes--;
            if (!pendientes) tanda = null;
            if (mio === turnoForm) {
              pintarFotos();
              if (!pendientes) {
                ocupar(false);
                if (esta.sobran) esta.fallas.push('Solo caben ' + MAX_FOTOS + ' fotos: ' + cuantos(esta.sobran, 'no se agregó', 'no se agregaron') + '.');
                errorFotos(esta.fallas);
                estadoFotos(esta.bien ? cuantos(esta.bien, 'foto lista', 'fotos listas') + '. Toca "Guardar" para conservar los cambios.' : '');
                if (esta.fallas.length) avisar(esta.fallas[esta.fallas.length - 1], 'error');
              }
            }
          }
        });
      });
    }
    c('foto').onchange = () => agregar(c('foto'));
    c('camara').onchange = () => agregar(c('camara'));
    c('lista').onclick = e => {
      const li = e.target.closest('.inv-ft[data-k]');
      const boton = e.target.closest('[data-quitar], [data-mover], [data-portada], [data-reintentar]');
      if (!li || !boton || guardando) return;
      const k = items.findIndex(i => i.k === Number(li.dataset.k));
      if (k < 0) return;
      const it = items[k];
      if (boton.hasAttribute('data-reintentar')) { cargarGuardada(it); return pintarFotos(); }
      let hecho;
      if (boton.hasAttribute('data-quitar')) {
        // Un doble toque no se lleva también la foto que se recorre a ese lugar
        if (e.timeStamp - ultimoQuitar < 350) return;
        ultimoQuitar = e.timeStamp;
        items.splice(k, 1);
        hecho = 'Foto quitada.';
      } else if (boton.hasAttribute('data-portada')) {
        items.splice(k, 1);
        items.unshift(it);
        hecho = 'Portada cambiada.';
      } else {
        const j = k + Number(boton.dataset.mover);
        if (j < 0 || j >= items.length) return;
        items.splice(k, 1);
        items.splice(j, 0, it);
        hecho = 'Orden cambiado.';
      }
      errorFotos([]);
      pintarFotos();
      estadoFotos(hecho + ' Se aplica al tocar "Guardar".');
    };
    c('lista').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-reintentar]')) { e.preventDefault(); e.target.click(); } };

    // Autos
    c('otro-auto').onclick = () => { c('apps').insertAdjacentHTML('beforeend', filaAplicacion({})); $('.inv-app:last-child input', c('apps')).focus(); };
    c('apps').onclick = e => {
      const b = e.target.closest('[data-quitar-app]');
      if (!b) return;
      b.closest('.inv-app').remove();
      if (!c('apps').children.length) c('apps').innerHTML = filaAplicacion({});
    };

    // Código repetido
    function revisarCodigo() {
      const codigo = c('codigo').value;
      const caja = c('repetido');
      const otra = original && compacto(codigo) === compacto(antes.codigo) ? null : repetidos(productos(), codigo, id)[0];
      caja.hidden = !otra;
      if (!otra) return;
      caja.innerHTML = icono('triangle-alert', 18) + '<div>Ya existe una pieza con ese código: <b>' + esc(otra.descripcion || otra.codigo) + '</b>' + (otra.archivado ? ' (archivada)' : '') +
        '.</div><button type="button" class="btn btn-secondary btn-sm">Ver esa pieza</button>';
      $('button', caja).onclick = () => {
        if (!window.confirm('¿Salir sin guardar para ver la otra pieza?')) return;
        cerrar(vForm.id);
        abrirFicha(otra.id);
      };
    }
    c('codigo').oninput = revisarCodigo;
    revisarCodigo();

    function leer() {
      const errores = [];
      const numero = (n, nombre, entero) => {
        const el = c(n);
        if (!el) return antes[n];
        if (el.validity && el.validity.badInput) { errores.push(nombre + ': escribe solo números'); return 0; }
        const x = el.value === '' ? 0 : Number(el.value);
        if (original && x === antes[n]) return x; // lo que no se tocó no estorba para guardar
        if (!Number.isFinite(x) || x < 0) errores.push(nombre + ' no puede ser negativo');
        else if (entero && !Number.isInteger(x)) errores.push(nombre + ' debe ser un número entero');
        return entero ? x : Math.round(x * 100) / 100;
      };
      const aplicaciones = [];
      $$('.inv-app', vForm.v).forEach(f => {
        const a = {};
        $$('[data-app]', f).forEach(i => { a[i.dataset.app] = i.value.trim(); });
        if (!a.marca && !a.modelo && !a.anioDesde && !a.anioHasta) return;
        let desde = anio(a.anioDesde), hasta = anio(a.anioHasta);
        if ((a.anioDesde && !desde) || (a.anioHasta && !hasta)) errores.push('Revisa los años del auto (4 dígitos)');
        if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
        aplicaciones.push({ marca: a.marca, modelo: a.modelo, anioDesde: desde, anioHasta: hasta });
      });
      let compatibilidad = c('compatibilidad').value.trim();
      // Si la compatibilidad era la armada automáticamente (o está vacía), sigue a la lista de autos
      if (!compatibilidad || (compatibilidad === antes.compatibilidad && compatibilidad === textoAplicaciones(antes.aplicaciones))) compatibilidad = textoAplicaciones(aplicaciones);
      const datos = {
        codigo: c('codigo').value.trim(), descripcion: c('descripcion').value.trim(), marca: c('marca').value.trim(), compatibilidad,
        precio: numero('precio', 'El precio'), stock: numero('stock', 'Las existencias', true), stockMin: numero('stockMin', 'El mínimo', true),
        clase: c('clase').value, tipo, ubicacion: c('ubicacion').value.trim(), oem: listaOem(c('oem').value), aplicaciones,
        lado: c('lado').value, condicion: c('condicion').value, costoRef: numero('costoRef', 'El costo'), proveedor: c('proveedor').value.trim()
      };
      if (!datos.descripcion) errores.unshift('Escribe la descripción');
      return { datos, errores };
    }

    async function datosDe(it) {
      if (!it.datos) it.datos = await leerFoto(it.docId);
      if (!it.datos) throw errorNegocio('Una de las fotos guardadas ya no existe. Quítala y vuelve a guardar.');
      return it.datos;
    }
    // Paso 1: las fotos adicionales se suben a documentos nuevos. Todavía ninguna pieza apunta a ellos.
    async function subirFotos(pid, avance) {
      const lista = items.filter(i => i.estado !== 'falta');
      lista.forEach(i => { i.fallo = false; });
      const porSubir = lista.slice(1).filter(i => (!i.docId || i.docId === pid) && !i.subida);
      const fallidas = [];
      let motivoFalla = '';
      for (let n = 0; n < porSubir.length; n++) {
        if (!abierta()) return null; // cancelaron: no se sube nada más
        const it = porSubir[n];
        avance('Subiendo foto ' + (n + 1) + ' de ' + porSubir.length + '…');
        const datos = await datosDe(it);
        const docId = pid + '_' + nuevoId();
        // Se anota antes de enviar: si la red falla a medias, la limpieza también lo alcanza
        subidas.add(docId);
        for (let intento = 1; ; intento++) {
          try {
            await window.setDoc(ref(COL_FOTOS, docId), Object.assign({ productoId: pid }, datos, sello()));
            it.subida = docId;
            break;
          } catch (e) {
            console.warn('Foto:', e);
            if (intento < 2 && !sinPermiso(e)) continue;
            // Una foto que ya estaba guardada nunca se deja fuera: se detiene todo
            if (it.docId) throw e;
            it.fallo = true;
            fallidas.push(it);
            motivoFalla = mensajeError(e, COL_FOTOS);
            break;
          }
        }
      }
      const quedan = lista.filter(i => !fallidas.includes(i));
      const portada = quedan[0];
      // La portada solo se reescribe si cambió
      const datosPortada = portada && portada.docId !== pid ? await datosDe(portada) : null;
      if (!abierta()) return null;
      return { quedan, datosPortada, extras: quedan.slice(1).map(i => (i.docId && i.docId !== pid ? i.docId : i.subida)), fallidas, motivoFalla };
    }
    // Paso 2: la portada y la lista de la pieza se escriben juntas (o no se escribe nada)
    async function aplicarFotos(pid, plan, productoNuevo) {
      if (!productoNuevo) {
        const snap = await window.getDoc(ref(COL, pid));
        if (!snap.exists()) throw errorNegocio('Esa pieza ya no existe');
        if (firmaFotos(Object.assign({}, snap.data(), { id: pid })) !== base) throw errorNegocio('Las fotos de esta pieza cambiaron mientras la editabas. Cierra y vuelve a abrirla.');
        if (!abierta()) throw errorNegocio('Se canceló');
      }
      const marca = Date.now();
      const campos = { tieneFoto: plan.quedan.length > 0, fotoEn: marca, fotosExtra: plan.extras };
      // Se dejan en memoria para que la tarjeta no las vuelva a descargar
      const portada = plan.quedan[0] && plan.quedan[0].datos;
      if (portada) recordarFoto(pid + '|' + marca, portada);
      plan.extras.forEach((docId, n) => { const d = plan.quedan[n + 1].datos; if (d) recordarFoto('x|' + docId, d); });
      const pasos = [];
      if (plan.datosPortada) pasos.push(['set', ref(COL_FOTOS, pid), Object.assign({ productoId: pid }, plan.datosPortada, sello())]);
      pasos.push(productoNuevo ? ['set', ref(COL, pid), Object.assign({}, productoNuevo, campos)] : ['update', ref(COL, pid), Object.assign({}, campos, sello())]);
      if (!campos.tieneFoto) pasos.push(['delete', ref(COL_FOTOS, pid)]);
      if (window.writeBatch) {
        const lote = window.writeBatch(window.db);
        pasos.forEach(([que, r, datos]) => (que === 'delete' ? lote.delete(r) : lote[que](r, datos)));
        await lote.commit();
      } else {
        for (const [que, r, datos] of pasos) await (que === 'set' ? window.setDoc(r, datos) : que === 'update' ? window.updateDoc(r, datos) : window.deleteDoc(r));
      }
      // Ya quedó guardado: lo que ya no usa la pieza se borra
      plan.extras.forEach(x => subidas.delete(x));
      anteriores.filter(x => !plan.extras.includes(x)).forEach(x => subidas.add(x));
      items = plan.quedan.map((it, n) => Object.assign(it, { docId: n ? plan.extras[n - 1] : pid, subida: null, estado: 'lista' }));
      limpiarSubidas();
      anteriores = plan.extras.slice();
      inicial = claves();
      base = firmaFotos(Object.assign({ id: pid }, campos));
    }
    // Si las fotos no se pueden guardar, la persona decide; lo capturado no se pierde
    function sinFotos(e) {
      console.warn('Fotos:', e);
      const por = mensajeError(e, COL_FOTOS);
      errorFotos(['No se pudieron guardar las fotos: ' + por]);
      estadoFotos('');
      return window.confirm('No se pudieron guardar las fotos:\n' + por + '\n\n¿Guardar los demás datos sin cambiar las fotos?\n\nCancelar = quedarte aquí para intentar de nuevo.');
    }

    // Si cierran la captura mientras se suben las fotos, no se guarda nada
    const cancelado = () => avisar('Cancelaste mientras se subían las fotos: no se guardó ningún cambio', 'info');

    let idCreado = null;
    // Un solo guardado a la vez, aunque haya dos botones ("Guardar" y "Guardar y agregar otra"), y ninguno después de guardar
    async function guardar(boton, otra) {
      if (guardando || terminado) return;
      guardando = true;
      seccionFotos.classList.add('ocupada');
      try { await guardarAhora(boton, otra); }
      finally {
        guardando = false;
        seccionFotos.classList.remove('ocupada');
        if (!vivo()) limpiarSubidas(); // cerró la ventana mientras se guardaba
      }
    }
    async function guardarAhora(boton, otra) {
      await preparando;
      if (!abierta()) return;
      const { datos, errores } = leer();
      if (errores.length) return avisar(errores[0], 'error');
      const cambioCodigo = !original || compacto(datos.codigo) !== compacto(antes.codigo);
      const igualA = cambioCodigo && repetidos(productos(), datos.codigo, id || idCreado)[0];
      if (igualA && !window.confirm('Ya existe una pieza con el código ' + datos.codigo + ':\n' + (igualA.descripcion || '') + (igualA.archivado ? ' (archivada)' : '') + '\n\n¿Guardar de todos modos y dejar el código repetido?')) return;
      await conBoton(boton, 'Guardando…', async () => {
        const pid = original ? id : (idCreado = idCreado || nuevoId());
        let plan = null;
        if (claves() !== inicial) {
          errorFotos([]);
          try { plan = await subirFotos(pid, t => { boton.textContent = t; estadoFotos(t); }); }
          catch (e) { if (!abierta()) return cancelado(); if (!sinFotos(e)) return; }
          if (!abierta()) return cancelado();
          if (plan && plan.fallidas.length) {
            const cuantas = cuantos(plan.fallidas.length, 'foto', 'fotos');
            pintarFotos();
            errorFotos(['No se pudo subir ' + cuantas + ': ' + plan.motivoFalla, 'Toca "Guardar" para intentar de nuevo. Las demás no se pierden.']);
            estadoFotos('');
            if (!window.confirm('No se pudo subir ' + cuantas + ' (marcada en rojo).\n\n¿Guardar la pieza solo con las demás?\n\nCancelar = quedarte aquí para intentar de nuevo.')) return;
          }
          boton.textContent = 'Guardando…';
        }
        if (original) {
          // Primero las fotos: si fallan y se prefiere reintentar, no se ha cambiado nada
          if (plan) {
            try { await aplicarFotos(pid, plan); }
            catch (e) { if (!abierta()) return cancelado(); if (!sinFotos(e)) return; }
          }
          // Solo se escriben los campos que cambiaron, para no pisar cambios de otra persona
          const cambios = {};
          Object.keys(datos).forEach(k => { if (k !== 'stock' && !igual(datos[k], antes[k])) cambios[k] = datos[k]; });
          if (Object.keys(cambios).length) await window.updateDoc(ref(COL, id), Object.assign(cambios, sello()));
          if (datos.stock !== antes.stock) {
            const r = await ajustar(id, { delta: datos.stock - antes.stock }, 'Corrección al editar', '');
            if (!r.historial) avisar('No se pudo guardar el historial de existencias', 'error');
          }
        } else {
          const nuevo = Object.assign({}, datos, { createdAt: window.serverTimestamp() }, sello());
          let creada = false;
          if (plan) {
            try { await aplicarFotos(pid, plan, nuevo); creada = true; }
            catch (e) { if (!abierta()) return cancelado(); if (!sinFotos(e)) return; }
          }
          if (!creada) await window.setDoc(ref(COL, pid), nuevo);
          if (datos.stock > 0) await anotar(movimiento(Object.assign({ id: pid }, datos), 'alta', 0, datos.stock, 'Alta de la pieza', ''));
        }
        terminado = true;
        avisar(original ? 'Cambios guardados' : 'Pieza agregada al inventario', 'success');
        // Si con internet lento ya cerró o abrió otra captura, no se le toca
        if (mio !== turnoForm || !vForm.v.classList.contains('open')) return;
        cerrar(vForm.id);
        if (otra) setTimeout(() => abrirForm(), 260);
        else if (original) abrirFicha(id);
      });
    }
    c('guardar').onclick = e => guardar(e.currentTarget, false);
    if (c('otra')) c('otra').onclick = e => guardar(e.currentTarget, true);
    if (c('copiar')) c('copiar').onclick = () => {
      if (!window.confirm('Se abrirá una pieza nueva con estos datos. Los cambios sin guardar de esta no se aplican. ¿Continuar?')) return;
      cerrar(vForm.id);
      setTimeout(() => { abrirForm(null, original); avisar('Escribe el código de la pieza nueva', 'info'); }, 260);
    };
    abrir(vForm.id);
    vForm.cuerpo.scrollTop = 0;
    $('.modal', vForm.v).scrollTop = 0;
    // En celular no se abre el teclado solo
    if (!original && window.matchMedia('(pointer: fine)').matches) setTimeout(() => c('descripcion').focus(), 80);
  }

  // ── Exportar a Excel ──
  function columnasExcel() {
    const cols = [
      ['Código', 16, d => d.codigo], ['Descripción', 40, d => d.descripcion], ['Marca', 16, d => d.marca],
      ['Tipo', 15, d => (d.tipo === 'bajo_pedido' ? 'Bajo pedido' : 'En existencia')],
      ['Existencias', 12, d => d.stock, '#,##0'], ['Mínimo', 10, d => d.stockMin, '#,##0'], ['Precio', 13, d => d.precio, '"$"#,##0.00']
    ];
    if (esAdmin()) cols.push(['Costo de referencia', 18, d => d.costoRef || '', '"$"#,##0.00']);
    return cols.concat([
      ['Ubicación', 16, d => d.ubicacion], ['Códigos alternos', 24, d => d.oem.join(', ')], ['Aplicaciones', 38, d => textoAplicaciones(d.aplicaciones)],
      ['Compatibilidad', 32, d => d.compatibilidad], ['Lado', 16, d => d.lado], ['Condición', 16, d => d.condicion], ['Proveedor', 20, d => d.proveedor], ['Clase', 8, d => d.clase]
    ]);
  }
  function descargar(contenido, nombre) {
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function generarExcel(lista, nombre) {
    const cols = columnasExcel();
    const filas = lista.map(p => { const d = camposDe(p); return cols.map(c => c[2](d)); });
    try {
      const ExcelJS = await window.cargarExcelJS();
      const libro = new ExcelJS.Workbook();
      const hoja = libro.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
      hoja.columns = cols.map(c => ({ header: c[0], width: c[1], style: c[3] ? { numFmt: c[3] } : {} }));
      filas.forEach(f => hoja.addRow(f));
      hoja.getRow(1).eachCell(celda => {
        celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2035' } };
        celda.alignment = { vertical: 'middle' };
      });
      hoja.getRow(1).height = 22;
      hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      descargar(await libro.xlsx.writeBuffer(), nombre);
    } catch (e) {
      if (!window.XLSX) throw e;
      console.warn('ExcelJS falló; se usa el formato básico:', e);
      const hoja = window.XLSX.utils.aoa_to_sheet([cols.map(c => c[0])].concat(filas));
      hoja['!cols'] = cols.map(c => ({ wch: c[1] }));
      const libro = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(libro, hoja, 'Inventario');
      descargar(window.XLSX.write(libro, { type: 'array', bookType: 'xlsx' }), nombre);
    }
  }
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function exportar(boton) {
    const lista = filtradas();
    if (!lista.length) return avisar('No hay piezas que exportar con este filtro', 'info');
    conBoton(boton, 'Generando…', async () => {
      await generarExcel(lista, 'Inventario_Maya_' + hoy() + '.xlsx');
      avisar('Excel generado con ' + cuantos(lista.length, 'artículo', 'artículos'), 'success');
    });
  }

  // ── Importar desde Excel ──
  let importando = false;
  function abrirImportar() {
    if (!puedeEditar()) return;
    // Dos importaciones a la vez duplicarían piezas
    if (importando) return avisar('Todavía se está guardando la importación anterior', 'info');
    let leidas = null;
    vImportar.cuerpo.innerHTML = `
      <p>Sube un Excel con una fila por pieza. Se reconocen columnas como <b>Código, Descripción, Marca, Existencias, Mínimo, Precio, Ubicación, Códigos alternos, Aplicaciones</b>. Antes de guardar verás qué va a pasar.</p>
      <div class="inv-imp-botones">
        <label class="btn btn-primary">${icono('file-spreadsheet', 18)}<span>Elegir archivo</span><input type="file" id="inv-i-archivo" accept=".xlsx,.xls,.csv" hidden></label>
        <button type="button" class="btn btn-secondary" id="inv-i-plantilla">Descargar plantilla</button>
      </div>
      <div class="inv-imp-opciones" hidden>
        <label><input type="checkbox" id="inv-i-actualizar" checked> Actualizar las piezas que ya existen (mismo código)</label>
        <label><input type="checkbox" id="inv-i-existencias"> También cambiar sus existencias por las del archivo</label>
      </div>
      <div class="inv-imp-vista" aria-live="polite"></div>`;
    vImportar.pie.innerHTML = '<button type="button" class="btn btn-secondary" data-cerrar>Cancelar</button><button type="button" class="btn btn-primary" id="inv-i-ok" disabled>Importar</button>';
    const c = n => $('#inv-i-' + n, vImportar.v);
    const vista = $('.inv-imp-vista', vImportar.v);
    const plan = () => planImportacion(leidas, productos(), { actualizar: c('actualizar').checked, existencias: c('existencias').checked });
    const NOMBRES = { nueva: 'Nueva', actualizar: 'Se actualiza', igual: 'Sin cambios', omitida: 'Se omite', error: 'Con error' };
    const CAMPOS = { descripcion: 'descripción', marca: 'marca', tipo: 'tipo', stock: 'existencias', stockMin: 'mínimo', precio: 'precio', costoRef: 'costo', ubicacion: 'ubicación', oem: 'códigos alternos', aplicaciones: 'aplicaciones', compatibilidad: 'compatibilidad', lado: 'lado', condicion: 'condición', proveedor: 'proveedor', clase: 'clase' };
    function previa() {
      const p = plan();
      const n = a => p.filter(x => x.accion === a).length;
      const hacer = n('nueva') + n('actualizar');
      // Primero lo que necesita atención
      const peso = { error: 0, omitida: 1, nueva: 2, actualizar: 3, igual: 4 };
      const muestra = p.slice().sort((a, b) => peso[a.accion] - peso[b.accion] || a.fila - b.fila).slice(0, 80);
      vista.innerHTML = '<div class="inv-imp-cuentas">' + Object.keys(NOMBRES).map(a => '<span class="' + a + '"><b>' + n(a) + '</b>' + NOMBRES[a] + '</span>').join('') + '</div>' +
        '<ul class="inv-imp-lista">' + muestra.map(x => {
          const d = Object.assign({}, x.actual, x.datos);
          const detalle = x.motivo || (x.accion === 'actualizar' ? 'Cambia: ' + Object.keys(x.cambios).map(k => k === 'precio' ? 'precio ' + dinero(x.actual.precio) + ' → ' + dinero(x.cambios.precio) : k === 'stock' ? 'existencias ' + num(x.actual.stock) + ' → ' + x.cambios.stock : CAMPOS[k] || k).join(', ') : '');
          return '<li class="' + x.accion + '"><span>' + NOMBRES[x.accion] + '</span><div><b>' + esc(d.codigo || 'Sin código') + '</b> ' + esc(d.descripcion || '') + '<small>Fila ' + x.fila + (detalle ? ' · ' + esc(detalle) : '') + '</small></div></li>';
        }).join('') + '</ul>' + (p.length > muestra.length ? '<p class="inv-suave">Se muestran 80 de ' + p.length + ' filas.</p>' : '');
      c('ok').disabled = !hacer;
      c('ok').textContent = hacer ? 'Importar ' + cuantos(hacer, 'pieza', 'piezas') : 'Nada que importar';
    }
    c('plantilla').onclick = e => conBoton(e.currentTarget, 'Generando…', () => generarExcel([], 'Plantilla_inventario_Maya.xlsx'));
    c('actualizar').onchange = () => { c('existencias').disabled = !c('actualizar').checked; if (leidas) previa(); };
    c('existencias').onchange = () => { if (leidas) previa(); };
    c('archivo').onchange = async () => {
      const archivo = c('archivo').files && c('archivo').files[0];
      if (!archivo) return;
      leidas = null;
      c('ok').disabled = true;
      vista.innerHTML = '<p class="inv-suave">Leyendo archivo…</p>';
      try {
        for (let i = 0; i < 100 && !window.XLSX; i++) await new Promise(r => setTimeout(r, 100));
        if (!window.XLSX) throw new Error('No se pudo cargar el lector de Excel (revisa tu internet)');
        const bytes = await archivo.arrayBuffer();
        // Los CSV se leen como texto para no romper los acentos
        const libro = /\.csv$/i.test(archivo.name) ? window.XLSX.read(textoCsv(bytes), { type: 'string', raw: true }) : window.XLSX.read(bytes, { type: 'array' });
        const filas = window.XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '', blankrows: true });
        const r = leerFilasImportacion(filas, esAdmin());
        if (r.error) throw new Error(r.error);
        if (!r.filas.length) throw new Error('El archivo no tiene piezas debajo de los títulos');
        if (r.filas.length > 5000) throw new Error('El archivo tiene más de 5,000 filas. Divídelo en partes.');
        leidas = r.filas;
        $('.inv-imp-opciones', vImportar.v).hidden = false;
        previa();
      } catch (e) {
        console.error(e);
        vista.innerHTML = '<p class="inv-imp-error">' + esc(e.message) + '</p>';
        c('ok').textContent = 'Importar';
      } finally { c('archivo').value = ''; }
    };
    c('ok').onclick = () => {
      if (!leidas || importando) return;
      const p = plan(); // se recalcula con lo que haya en este momento
      const trabajo = p.filter(x => x.accion === 'nueva' || x.accion === 'actualizar');
      if (!trabajo.length) return previa();
      const nuevas = trabajo.filter(x => x.accion === 'nueva').length;
      if (!window.confirm('Se van a agregar ' + nuevas + ' y actualizar ' + (trabajo.length - nuevas) + '. ¿Importar?')) return;
      conBoton(c('ok'), 'Importando…', async () => {
        let hecho;
        importando = true;
        try { hecho = await importar(trabajo, n => { c('ok').textContent = 'Importando ' + n + ' de ' + trabajo.length + '…'; }); }
        finally { importando = false; }
        cerrar(vImportar.id);
        avisar('Importación lista: ' + cuantos(hecho.total, 'pieza', 'piezas'), 'success');
        if (!hecho.historial) avisar('No se pudo guardar el historial de existencias (revisa las reglas de "movimientos")', 'error');
      });
    };
    abrir(vImportar.id);
  }
  // Excel en Windows suele guardar el CSV sin UTF-8
  function textoCsv(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  async function importar(trabajo, avance) {
    let total = 0, historial = true;
    for (let i = 0; i < trabajo.length; i += 150) {
      const grupo = trabajo.slice(i, i + 150).map(x => {
        if (x.accion === 'nueva') {
          const pid = nuevoId();
          const datos = Object.assign(camposDe(x.datos), { compatibilidad: x.datos.compatibilidad || textoAplicaciones(x.datos.aplicaciones) });
          return { pid, nueva: true, datos: Object.assign(datos, { createdAt: window.serverTimestamp() }, sello()), mov: datos.stock > 0 ? movimiento(Object.assign({ id: pid }, datos), 'importacion', 0, datos.stock, 'Importación de Excel', '') : null };
        }
        const antes = num(x.actual.stock);
        const cambiaStock = x.cambios.stock !== undefined;
        return { pid: x.id, datos: Object.assign({}, x.cambios, sello()), mov: cambiaStock ? movimiento(x.actual, 'importacion', antes, x.cambios.stock, 'Importación de Excel', '') : null };
      });
      const escribir = async conHistorial => {
        const lote = window.writeBatch ? window.writeBatch(window.db) : null;
        for (const g of grupo) {
          if (lote) {
            if (g.nueva) lote.set(ref(COL, g.pid), g.datos); else lote.update(ref(COL, g.pid), g.datos);
            if (conHistorial && g.mov) lote.set(ref(COL_MOV, nuevoId()), g.mov);
          } else {
            if (g.nueva) await window.setDoc(ref(COL, g.pid), g.datos); else await window.updateDoc(ref(COL, g.pid), g.datos);
            if (conHistorial && g.mov) await window.setDoc(ref(COL_MOV, nuevoId()), g.mov);
          }
        }
        if (lote) await lote.commit();
      };
      try {
        try { await escribir(historial); }
        catch (e) {
          if (!historial || !sinPermiso(e)) throw e;
          historial = false;
          await escribir(false);
        }
      } catch (e) {
        throw new Error('Se guardaron ' + total + ' y se detuvo: ' + mensajeError(e, COL) + '. Puedes volver a importar el archivo: no se duplican.');
      }
      total += grupo.length;
      avance(total);
    }
    return { total, historial };
  }

  // Para otros módulos y para renderProductos()
  window.mayaInventario = {
    refrescar,
    nueva: () => abrirForm(),
    abrir: abrirFicha,
    ajustar: abrirAjuste,
    buscar(q) { estado.q = String(q || ''); $('#inv-q', raiz).value = estado.q; estado.filtro = 'todas'; reiniciar(); }
  };
  pintar();
  // Si los datos ya habían llegado vacíos antes de cargar este archivo
  if (!estado.cargado && datosListos()) refrescar();
}
