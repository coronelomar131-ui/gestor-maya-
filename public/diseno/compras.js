// Registro independiente de compras; no lee ni modifica ventas, notas o inventario.
const $ = id => document.getElementById(id);
let registros = [];
let unsubscribe = null;
let editandoId = null;

const escapar = valor => String(valor == null ? '' : valor).replace(/[&<>"']/g, caracter => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[caracter]));
const dinero = valor => '$' + (Number(valor) || 0).toLocaleString('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const redondear = valor => Math.round((valor + Number.EPSILON) * 100) / 100;
const permitido = () => ['admin', 'almacen'].includes(window.currentRole);
const hoyLocal = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};
const numero = valor => Number(valor) || 0;
const vacioArticulo = () => ({ pieza: '', cantidadComprada: 1, costoUnitario: '', cantidadVendida: 0, precioVenta: '' });
const fechaVisible = valor => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return '—';
  const [anio, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${anio}`;
};

function articulosDe(compra) {
  if (Array.isArray(compra.articulos) && compra.articulos.length) {
    return compra.articulos.map(articulo => ({
      pieza: articulo.pieza || '',
      cantidadComprada: numero(articulo.cantidadComprada),
      costoUnitario: numero(articulo.costoUnitario),
      cantidadVendida: numero(articulo.cantidadVendida),
      precioVenta: numero(articulo.precioVenta)
    }));
  }
  const vendidas = numero(compra.cantidadVendida);
  return [{
    pieza: compra.pieza || '',
    cantidadComprada: numero(compra.cantidadComprada),
    costoUnitario: numero(compra.costoUnitario),
    cantidadVendida: vendidas,
    precioVenta: vendidas ? numero(compra.ingresosVenta) / vendidas : 0
  }];
}

function totalesArticulo(articulo) {
  const compradas = numero(articulo.cantidadComprada);
  const costo = numero(articulo.costoUnitario);
  const vendidas = numero(articulo.cantidadVendida);
  const precioVenta = numero(articulo.precioVenta);
  return {
    costo: compradas * costo,
    ingresos: vendidas * precioVenta,
    utilidad: vendidas * (precioVenta - costo),
    pendientes: Math.max(0, compradas - vendidas)
  };
}

function totalesCompra(compra) {
  return articulosDe(compra).reduce((total, articulo) => {
    const linea = totalesArticulo(articulo);
    total.costo += linea.costo;
    total.ingresos += linea.ingresos;
    total.utilidad += linea.utilidad;
    total.pendientes += linea.pendientes;
    total.compradas += numero(articulo.cantidadComprada);
    return total;
  }, { costo: 0, ingresos: 0, utilidad: 0, pendientes: 0, compradas: 0 });
}

function mostrarResumen() {
  const total = registros.reduce((resumen, compra) => {
    const partida = totalesCompra(compra);
    resumen.invertido += partida.costo;
    resumen.ingresos += partida.ingresos;
    resumen.utilidad += partida.utilidad;
    resumen.pendientes += partida.pendientes;
    return resumen;
  }, { invertido: 0, ingresos: 0, utilidad: 0, pendientes: 0 });

  $('compras-total-invertido').textContent = dinero(redondear(total.invertido));
  $('compras-total-ventas').textContent = dinero(redondear(total.ingresos));
  $('compras-total-utilidad').textContent = dinero(redondear(total.utilidad));
  $('compras-piezas-pendientes').textContent = total.pendientes.toLocaleString('es-MX');
}

function renderizar() {
  const cuerpo = $('compras-body');
  if (!cuerpo) return;
  mostrarResumen();
  const busqueda = ($('compras-busqueda')?.value || '').trim().toLocaleLowerCase('es-MX');
  const lista = registros.filter(compra => {
    const nombres = articulosDe(compra).map(articulo => articulo.pieza).join(' ');
    return `${nombres} ${compra.proveedor || ''} ${compra.fecha || ''} ${fechaVisible(compra.fecha)} ${compra.notas || ''}`.toLocaleLowerCase('es-MX').includes(busqueda);
  });

  if (!lista.length) {
    const sinRegistros = registros.length === 0;
    $('compras-body').innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">${sinRegistros ? 'Aún no hay compras' : 'No hay resultados'}</div><div class="empty-desc">${sinRegistros ? 'Registra una compra para empezar a medir costos y utilidad.' : 'Prueba con otro artículo o proveedor.'}</div></div></td></tr>`;
    return;
  }

  cuerpo.innerHTML = lista.map(compra => {
    const articulos = articulosDe(compra);
    const totales = totalesCompra(compra);
    const claseUtilidad = totales.utilidad > 0 ? 'm-compras-ganancia' : totales.utilidad < 0 ? 'm-compras-perdida' : '';
    const detalle = articulos.map(articulo =>
      `<div class="m-compras-resumen-articulo"><strong>${escapar(articulo.pieza || 'Artículo sin nombre')}</strong><span>${numero(articulo.cantidadComprada)} × ${dinero(articulo.costoUnitario)}${numero(articulo.cantidadVendida) ? ` · Vendidas ${numero(articulo.cantidadVendida)} a ${dinero(articulo.precioVenta)}` : ''}</span></div>`
    ).join('');
    return `<tr>
      <td data-label="Fecha">${escapar(fechaVisible(compra.fecha))}</td>
      <td data-label="Artículos" class="m-principal">${detalle}</td>
      <td data-label="Proveedor">${escapar(compra.proveedor || '—')}</td>
      <td data-label="Piezas">${totales.compradas.toLocaleString('es-MX')}${totales.pendientes ? `<small class="m-compras-sin-vender">${totales.pendientes.toLocaleString('es-MX')} sin vender</small>` : '<small class="m-compras-sin-vender listo">todo vendido</small>'}</td>
      <td data-label="Total de compra">${dinero(redondear(totales.costo))}</td>
      <td data-label="Ingresos por venta">${dinero(redondear(totales.ingresos))}</td>
      <td data-label="Utilidad" class="${claseUtilidad}">${dinero(redondear(totales.utilidad))}</td>
      <td data-label="" class="m-acciones">
        <button class="btn btn-secondary btn-sm" type="button" data-compra-accion="editar" data-compra-id="${escapar(compra.id)}" aria-label="Editar compra">Editar compra</button>
        <button class="btn btn-danger btn-sm" type="button" data-compra-accion="eliminar" data-compra-id="${escapar(compra.id)}" aria-label="Eliminar compra">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

function iniciar() {
  if (!permitido() || unsubscribe) return;
  const { db, collection, onSnapshot } = window;
  if (!db || !collection || !onSnapshot) {
    window.toast('No se pudo iniciar Compras: falta la conexión con Firebase.', 'error');
    return;
  }
  unsubscribe = onSnapshot(collection(db, 'compras'), snapshot => {
    registros = snapshot.docs.map(documento => {
      const datos = documento.data() || {};
      const registro = { id: documento.id };
      Object.keys(datos).forEach(clave => { registro[clave] = datos[clave]; });
      return registro;
    }).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    renderizar();
  }, error => {
    unsubscribe = null;
    registros = [];
    renderizar();
    console.error('Error cargando Compras:', error);
    window.toast('No se pudieron cargar las compras: ' + error.message, 'error');
  });
}

window.comprasCerrar = function() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  registros = [];
  renderizar();
  if ($('modal-compra')?.classList.contains('open')) window.closeModal('modal-compra');
};

function actualizarTotalesFormulario() {
  const articulos = Array.from(document.querySelectorAll('.m-compras-articulo')).map(fila => ({
    cantidadComprada: numero(fila.querySelector('[data-campo="cantidadComprada"]').value),
    costoUnitario: numero(fila.querySelector('[data-campo="costoUnitario"]').value),
    cantidadVendida: numero(fila.querySelector('[data-campo="cantidadVendida"]').value),
    precioVenta: numero(fila.querySelector('[data-campo="precioVenta"]').value)
  }));
  const total = articulos.reduce((acumulado, articulo) => {
    const partida = totalesArticulo(articulo);
    acumulado.costo += partida.costo;
    acumulado.ingresos += partida.ingresos;
    acumulado.utilidad += partida.utilidad;
    return acumulado;
  }, { costo: 0, ingresos: 0, utilidad: 0 });
  $('compras-modal-costo').textContent = dinero(redondear(total.costo));
  $('compras-modal-ingresos').textContent = dinero(redondear(total.ingresos));
  $('compras-modal-utilidad').textContent = dinero(redondear(total.utilidad));
}

function filaArticulo(articulo = vacioArticulo(), indice = 0, totalArticulos = 1) {
  return `<fieldset class="m-compras-articulo" data-indice="${indice}">
    <legend>Artículo ${indice + 1}</legend>
    <button class="m-compras-quitar-articulo" type="button" data-articulo-accion="quitar" aria-label="Quitar artículo ${indice + 1}" ${totalArticulos < 2 ? 'disabled' : ''}>Quitar</button>
    <div class="m-compras-articulo-grid">
      <label class="m-compras-articulo-nombre">Pieza o producto
        <input type="text" data-campo="pieza" maxlength="160" placeholder="Ej. Faro delantero derecho" value="${escapar(articulo.pieza)}" required>
      </label>
      <label>Cantidad comprada
        <input type="number" data-campo="cantidadComprada" min="1" step="1" value="${escapar(articulo.cantidadComprada)}" required>
      </label>
      <label>Precio de compra por pieza
        <input type="number" data-campo="costoUnitario" min="0" step="0.01" value="${escapar(articulo.costoUnitario)}" required>
      </label>
      <label>Cantidad vendida
        <input type="number" data-campo="cantidadVendida" min="0" step="1" value="${escapar(articulo.cantidadVendida)}" required>
      </label>
      <label>Precio de venta por pieza
        <input type="number" data-campo="precioVenta" min="0" step="0.01" value="${escapar(articulo.precioVenta)}" placeholder="0.00" required>
      </label>
    </div>
    <div class="m-compras-articulo-utilidad">Utilidad de este artículo: <strong data-articulo-utilidad>${dinero(totalesArticulo(articulo).utilidad)}</strong></div>
  </fieldset>`;
}

function renderizarArticulos(articulos) {
  $('compras-articulos').innerHTML = articulos.map((articulo, indice) => filaArticulo(articulo, indice, articulos.length)).join('');
  actualizarTotalesFormulario();
}

// Sugerencias de proveedor: los de Proveedores y los que ya se usaron en compras
function llenarProveedores() {
  const lista = $('compras-proveedores');
  if (!lista) return;
  const nombres = new Set();
  ((window.data && window.data.proveedores) || []).forEach(p => p && p.nombre && nombres.add(String(p.nombre).trim()));
  registros.forEach(c => c.proveedor && nombres.add(String(c.proveedor).trim()));
  lista.innerHTML = [...nombres].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).map(n => `<option value="${escapar(n)}"></option>`).join('');
}

function limpiarFormulario() {
  editandoId = null;
  $('compras-modal-titulo').textContent = 'Registrar compra';
  $('compras-btn-guardar').textContent = 'Guardar compra';
  $('compra-fecha').value = hoyLocal();
  $('compra-proveedor').value = '';
  $('compra-notas').value = '';
  renderizarArticulos([vacioArticulo()]);
}

window.comprasNueva = function() {
  if (!permitido()) return window.toast('Solo administración y almacén pueden registrar compras.', 'error');
  limpiarFormulario();
  llenarProveedores();
  window.openModal('modal-compra');
};

window.comprasAgregarArticulo = function() {
  const articulos = Array.from(document.querySelectorAll('.m-compras-articulo')).map(leerArticuloFila);
  articulos.push(vacioArticulo());
  renderizarArticulos(articulos);
  const ultimaFila = document.querySelector('.m-compras-articulo:last-child [data-campo="pieza"]');
  ultimaFila?.focus();
};

function leerArticuloFila(fila) {
  return {
    pieza: fila.querySelector('[data-campo="pieza"]').value.trim(),
    cantidadComprada: fila.querySelector('[data-campo="cantidadComprada"]').value,
    costoUnitario: fila.querySelector('[data-campo="costoUnitario"]').value,
    cantidadVendida: fila.querySelector('[data-campo="cantidadVendida"]').value,
    precioVenta: fila.querySelector('[data-campo="precioVenta"]').value
  };
}

window.comprasEditar = function(id) {
  if (!permitido()) return window.toast('No tienes permiso para editar compras.', 'error');
  const compra = registros.find(registro => registro.id === id);
  if (!compra) return window.toast('No se encontró ese registro de compra.', 'error');
  editandoId = id;
  $('compras-modal-titulo').textContent = 'Editar compra';
  $('compras-btn-guardar').textContent = 'Guardar cambios';
  $('compra-fecha').value = compra.fecha || hoyLocal();
  $('compra-proveedor').value = compra.proveedor || '';
  $('compra-notas').value = compra.notas || '';
  renderizarArticulos(articulosDe(compra));
  llenarProveedores();
  window.openModal('modal-compra');
};

window.comprasFiltrar = function() {
  renderizar();
};

window.comprasGuardar = async function() {
  if (!permitido()) return window.toast('No tienes permiso para guardar compras.', 'error');
  const fecha = $('compra-fecha').value;
  const proveedor = $('compra-proveedor').value.trim();
  const notas = $('compra-notas').value.trim();
  const articulos = Array.from(document.querySelectorAll('.m-compras-articulo')).map(leerArticuloFila);
  if (!fecha) return window.toast('Indica la fecha de compra.', 'error');
  if (!articulos.length) return window.toast('Agrega por lo menos un artículo a la compra.', 'error');

  const articulosValidados = [];
  for (let indice = 0; indice < articulos.length; indice += 1) {
    const articulo = articulos[indice];
    const cantidadComprada = Number(articulo.cantidadComprada);
    const costoUnitario = Number(articulo.costoUnitario);
    const cantidadVendida = Number(articulo.cantidadVendida);
    const precioVenta = Number(articulo.precioVenta);
    const numeroArticulo = indice + 1;
    if (!articulo.pieza) return window.toast(`Escribe el nombre del artículo ${numeroArticulo}.`, 'error');
    if (!Number.isInteger(cantidadComprada) || cantidadComprada < 1) {
      return window.toast(`La cantidad comprada del artículo ${numeroArticulo} debe ser mayor a cero.`, 'error');
    }
    if (!Number.isFinite(costoUnitario) || articulo.costoUnitario === '' || costoUnitario < 0) {
      return window.toast(`Revisa el precio de compra del artículo ${numeroArticulo}.`, 'error');
    }
    if (!Number.isInteger(cantidadVendida) || cantidadVendida < 0 || cantidadVendida > cantidadComprada) {
      return window.toast(`La cantidad vendida del artículo ${numeroArticulo} debe estar entre cero y lo comprado.`, 'error');
    }
    if (!Number.isFinite(precioVenta) || articulo.precioVenta === '' || precioVenta < 0
      || (cantidadVendida > 0 && precioVenta <= 0)) {
      return window.toast(`Indica un precio de venta válido para el artículo ${numeroArticulo}.`, 'error');
    }
    articulosValidados.push({
      pieza: articulo.pieza,
      cantidadComprada,
      costoUnitario: redondear(costoUnitario),
      cantidadVendida,
      precioVenta: redondear(precioVenta)
    });
  }
  if (!window.auth?.currentUser) return window.toast('Tu sesión terminó. Inicia sesión de nuevo para guardar.', 'error');

  const compra = { fecha, proveedor, notas, articulos: articulosValidados };
  const boton = $('compras-btn-guardar');
  boton.disabled = true;
  try {
    if (editandoId) {
      await window.updateDoc(window.doc(window.db, 'compras', editandoId), {
        ...compra,
        updatedAt: window.serverTimestamp()
      });
      window.toast('Compra actualizada.', 'success');
    } else {
      await window.addDoc(window.collection(window.db, 'compras'), {
        ...compra,
        createdAt: window.serverTimestamp(),
        createdBy: window.auth.currentUser.uid
      });
      window.toast('Compra registrada.', 'success');
    }
    window.closeModal('modal-compra');
  } catch (error) {
    console.error('Error guardando compra:', error);
    window.toast('No se pudo guardar la compra: ' + error.message, 'error');
  } finally {
    boton.disabled = false;
  }
};

$('compras-articulos')?.addEventListener('input', evento => {
  const fila = evento.target.closest('.m-compras-articulo');
  if (!fila) return;
  actualizarTotalesFormulario();
  const articulo = leerArticuloFila(fila);
  const utilidad = totalesArticulo({
    cantidadComprada: Number(articulo.cantidadComprada),
    costoUnitario: Number(articulo.costoUnitario),
    cantidadVendida: Number(articulo.cantidadVendida),
    precioVenta: Number(articulo.precioVenta)
  }).utilidad;
  fila.querySelector('[data-articulo-utilidad]').textContent = dinero(redondear(utilidad));
});

$('compras-articulos')?.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-articulo-accion="quitar"]');
  if (!boton) return;
  const filas = Array.from(document.querySelectorAll('.m-compras-articulo'));
  if (filas.length <= 1) return window.toast('La compra debe tener al menos un artículo.', 'info');
  const indice = Number(boton.closest('.m-compras-articulo').dataset.indice);
  const articulos = filas.filter((_, posicion) => posicion !== indice).map(leerArticuloFila);
  renderizarArticulos(articulos);
});

$('compras-body')?.addEventListener('click', async evento => {
  const boton = evento.target.closest('button[data-compra-accion]');
  if (!boton) return;
  const id = boton.dataset.compraId;
  if (boton.dataset.compraAccion === 'editar') return window.comprasEditar(id);
  if (boton.dataset.compraAccion !== 'eliminar' || !permitido()) return;
  if (!window.confirm('¿Eliminar esta compra y todos sus artículos?')) return;
  try {
    await window.deleteDoc(window.doc(window.db, 'compras', id));
    window.toast('Compra eliminada.', 'success');
  } catch (error) {
    console.error('Error eliminando compra:', error);
    window.toast('No se pudo eliminar la compra: ' + error.message, 'error');
  }
});

const mostrarModulo = window.showModule;
if (typeof mostrarModulo === 'function') {
  window.showModule = function(nombre) {
    const resultado = mostrarModulo.apply(this, arguments);
    if (nombre === 'compras') iniciar();
    return resultado;
  };
}
