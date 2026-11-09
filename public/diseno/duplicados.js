// Clientes repetidos: lo usan el gestor (alta e importación de Excel) y Pepito/MCP (guardar_cliente).
// Un cliente se considera el mismo si coincide el nombre (sin acentos, puntos, espacios ni "S.A. de C.V."),
// el RFC (salvo los genéricos de público en general / extranjero), el teléfono (10 dígitos) o el correo.
(function (raiz) {
  // Terminaciones de razón social que no cambian quién es el cliente (se comparan sin espacios ni puntos)
  const SUFIJOS = new Set([
    'sadecv', 'sa', 'sdercl', 'sderl', 'sderldecv', 'srl', 'srldecv', 'sapi', 'sapidecv', 'sab', 'sabdecv',
    'sas', 'sasdecv', 'sc', 'scdecv', 'sdecv', 'ac', 'spr', 'sprderl', 'sprderi', 'decv', 'cv'
  ]);
  const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

  const sinAcentos = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

  function claveNombre(nombre) {
    const t = sinAcentos(nombre).toLowerCase().replace(/&/g, ' y ').replace(/[^a-z0-9ñ]+/g, ' ').trim().split(' ').filter(Boolean);
    let quitado = true;
    while (quitado && t.length > 1) {
      quitado = false;
      for (let k = Math.min(7, t.length - 1); k >= 1; k--) {
        if (SUFIJOS.has(t.slice(-k).join(''))) { t.splice(-k); quitado = true; break; }
      }
    }
    return t.join('');
  }
  function claveRfc(rfc) {
    const r = sinAcentos(rfc).toUpperCase().replace(/[^A-Z0-9Ñ&]/g, '');
    // Solo un RFC con forma real (3-4 letras, fecha, homoclave); "xxxxxxxxxxxx" y los genéricos no cuentan
    return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(r) && !RFC_GENERICOS.has(r) ? r : '';
  }
  function claveTelefono(tel) {
    const d = String(tel == null ? '' : tel).replace(/\D/g, '').slice(-10);
    // Números de relleno (5555555555, 0000000000, 1234567890) no cuentan
    return d.length === 10 && !/^(\d)\1{9}$/.test(d) && d !== '1234567890' ? d : '';
  }
  function claveCorreo(correo) {
    const c = String(correo == null ? '' : correo).trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) ? c : '';
  }

  const nombreDe = c => (c && (c.razonSocial || c.nombre)) || '';
  const REGLAS = [
    ['el mismo nombre', c => claveNombre(nombreDe(c))],
    ['el mismo RFC', c => claveRfc(c && c.rfc)],
    ['el mismo teléfono', c => claveTelefono(c && c.telefono)],
    ['el mismo correo', c => claveCorreo(c && c.email)]
  ];

  // El cliente ya registrado que choca con "nuevo" (o null). idPropio: al editar, no se compara consigo mismo.
  function buscarDuplicado(nuevo, existentes, idPropio) {
    for (const [motivo, clave] of REGLAS) {
      const k = clave(nuevo);
      if (!k) continue;
      const otro = (existentes || []).find(c => c && (!idPropio || c.id !== idPropio) && clave(c) === k);
      if (otro) return { cliente: otro, motivo };
    }
    return null;
  }

  // Distancia de edición (para nombres casi iguales: "Sergiho" / "Sergio")
  function distancia(a, b, tope) {
    if (Math.abs(a.length - b.length) > tope) return tope + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let min = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < min) min = cur[j];
      }
      if (min > tope) return tope + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // Un cliente con nombre casi igual (una letra de diferencia; dos si el nombre es largo). No es seguro que sea el mismo:
  // "Mario" y "María" pueden ser personas distintas, así que esto se pregunta en lugar de bloquearse.
  function buscarParecido(nuevo, existentes, idPropio) {
    const k = claveNombre(nombreDe(nuevo));
    if (k.length < 8) return null;
    const tope = k.length >= 16 ? 2 : 1;
    let mejor = null;
    (existentes || []).forEach(c => {
      if (!c || (idPropio && c.id === idPropio)) return;
      const otro = claveNombre(nombreDe(c));
      if (!otro || otro === k) return;
      const d = distancia(k, otro, tope);
      if (d <= tope && (!mejor || d < mejor.distancia)) mejor = { cliente: c, distancia: d };
    });
    return mejor;
  }
  function mensajeParecido(p) {
    const c = p.cliente;
    return 'Se parece mucho a ' + (c.codigoCliente ? c.codigoCliente + ' · ' : '') + nombreDe(c) + '. ¿Seguro que es otro cliente?';
  }

  // Texto para avisarle a la persona
  function mensajeDuplicado(d) {
    const c = d.cliente;
    return 'Ya existe el cliente ' + (c.codigoCliente ? c.codigoCliente + ' · ' : '') + nombreDe(c) + ' con ' + d.motivo + '. Usa ese cliente en lugar de crear otro.';
  }

  // Grupos de clientes que ya están repetidos entre sí (para limpiar lo que ya existe)
  function gruposRepetidos(lista) {
    const padre = new Map();
    const raizDe = id => { while (padre.get(id) !== id) id = padre.get(id); return id; };
    (lista || []).forEach(c => padre.set(c.id, c.id));
    REGLAS.forEach(([, clave]) => {
      const vistos = new Map();
      (lista || []).forEach(c => {
        const k = clave(c);
        if (!k) return;
        if (vistos.has(k)) padre.set(raizDe(c.id), raizDe(vistos.get(k)));
        else vistos.set(k, c.id);
      });
    });
    const grupos = new Map();
    (lista || []).forEach(c => { const r = raizDe(c.id); grupos.set(r, (grupos.get(r) || []).concat(c)); });
    return [...grupos.values()].filter(g => g.length > 1);
  }

  const api = { claveNombre, claveRfc, claveTelefono, claveCorreo, buscarDuplicado, mensajeDuplicado, buscarParecido, mensajeParecido, gruposRepetidos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaDuplicados = api;
})(typeof window !== 'undefined' ? window : globalThis);
