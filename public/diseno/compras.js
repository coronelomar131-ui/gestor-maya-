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
const fechaVisible = valor => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return '—';
  const [anio, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${anio}`;
};

function mostrarResumen() {
  const total = registros.reduce((resumen, compra) => {
    const cantidad = Number(compra.cantidadComprada) || 0;
    const costo = Number(compra.costoUnitario) || 0;
    const vendidas = Number(compra.cantidadVendida) || 0;
    const ingresos = Number(compra.ingresosVenta) || 0;
    resumen.invertido += cantidad * costo;
    resumen.ingresos += ingresos;
    resumen.utilidad += ingresos - vendidas * costo;
    resumen.pendientes += Math.max(0, cantidad - vendidas);
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
  const lista = registros.filter(compra =>
    `${compra.pieza || ''} ${compra.proveedor || ''} ${compra.fecha || ''}`.toLocaleLowerCase('es-MX').includes(busqueda)
  );

  if (!lista.length) {
    const sinRegistros = registros.length === 0;
    cuerpo.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">${sinRegistros ? 'Aún no hay compras' : 'No hay resultados'}</div><div class="empty-desc">${sinRegistros ? 'Registra un lote para empezar a medir su costo y utilidad.' : 'Prueba con otra pieza o proveedor.'}</div></div></td></tr>`;
    return;
  }

  cuerpo.innerHTML = lista.map(compra => {
    const compradas = Number(compra.cantidadComprada) || 0;
    const costo = Number(compra.costoUnitario) || 0;
    const vendidas = Number(compra.cantidadVendida) || 0;
    const ingresos = Number(compra.ingresosVenta) || 0;
    const utilidad = redondear(ingresos - vendidas * costo);
    const claseUtilidad = utilidad > 0 ? 'm-compras-ganancia' : utilidad < 0 ? 'm-compras-perdida' : '';
    return `<tr>
      <td data-label="Fecha">${escapar(fechaVisible(compra.fecha))}</td>
      <td data-label="Pieza" class="m-principal m-compras-pieza">${escapar(compra.pieza || '—')}</td>
      <td data-label="Proveedor">${escapar(compra.proveedor || '—')}</td>
      <td data-label="Compradas">${compradas.toLocaleString('es-MX')}</td>
      <td data-label="Costo unitario">${dinero(costo)}</td>
      <td data-label="Vendidas">${vendidas.toLocaleString('es-MX')} / ${compradas.toLocaleString('es-MX')}</td>
      <td data-label="Ingresos">${dinero(ingresos)}</td>
      <td data-label="Utilidad" class="${claseUtilidad}">${dinero(utilidad)}</td>
      <td data-label="" class="m-acciones">
        <button class="btn btn-primary btn-sm" type="button" data-compra-accion="venta" data-compra-id="${escapar(compra.id)}">Registrar venta</button>
        <button class="btn btn-secondary btn-sm" type="button" data-compra-accion="editar" data-compra-id="${escapar(compra.id)}" aria-label="Editar ${escapar(compra.pieza || 'compra')}">Editar</button>
        <button class="btn btn-danger btn-sm" type="button" data-compra-accion="eliminar" data-compra-id="${escapar(compra.id)}" aria-label="Eliminar ${escapar(compra.pieza || 'compra')}">Eliminar</button>
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

function limpiarFormulario() {
  editandoId = null;
  $('compras-modal-titulo').textContent = 'Registrar compra';
  $('compras-btn-guardar').textContent = 'Guardar compra';
  $('compra-fecha').value = hoyLocal();
  $('compra-proveedor').value = '';
  $('compra-pieza').value = '';
  $('compra-cantidad').value = '1';
  $('compra-costo').value = '';
  $('compra-vendido').value = '0';
  $('compra-ingresos').value = '0';
  $('compra-notas').value = '';
}

window.comprasNueva = function() {
  if (!permitido()) return window.toast('Solo administración y almacén pueden registrar compras.', 'error');
  limpiarFormulario();
  window.openModal('modal-compra');
};

window.comprasEditar = function(id, registrarVenta = false) {
  if (!permitido()) return window.toast('No tienes permiso para editar compras.', 'error');
  const compra = registros.find(registro => registro.id === id);
  if (!compra) return window.toast('No se encontró ese registro de compra.', 'error');
  editandoId = id;
  $('compras-modal-titulo').textContent = registrarVenta ? 'Registrar venta del lote' : 'Editar compra';
  $('compras-btn-guardar').textContent = registrarVenta ? 'Guardar venta' : 'Guardar cambios';
  $('compra-fecha').value = compra.fecha || hoyLocal();
  $('compra-proveedor').value = compra.proveedor || '';
  $('compra-pieza').value = compra.pieza || '';
  $('compra-cantidad').value = compra.cantidadComprada ?? 1;
  $('compra-costo').value = compra.costoUnitario ?? '';
  $('compra-vendido').value = compra.cantidadVendida ?? 0;
  $('compra-ingresos').value = compra.ingresosVenta ?? 0;
  $('compra-notas').value = compra.notas || '';
  window.openModal('modal-compra');
  if (registrarVenta) setTimeout(() => $('compra-vendido').focus(), 0);
};

window.comprasFiltrar = function() {
  renderizar();
};

window.comprasGuardar = async function() {
  if (!permitido()) return window.toast('No tienes permiso para guardar compras.', 'error');
  const pieza = $('compra-pieza').value.trim();
  const fecha = $('compra-fecha').value;
  const proveedor = $('compra-proveedor').value.trim();
  const cantidadComprada = Number($('compra-cantidad').value);
  const costoUnitario = Number($('compra-costo').value);
  const cantidadVendida = Number($('compra-vendido').value);
  const ingresosVenta = Number($('compra-ingresos').value);
  const notas = $('compra-notas').value.trim();

  if (!pieza || !fecha) return window.toast('Indica la pieza y la fecha de compra.', 'error');
  if (!Number.isInteger(cantidadComprada) || cantidadComprada < 1) return window.toast('La cantidad comprada debe ser un número entero mayor a cero.', 'error');
  if (!Number.isInteger(cantidadVendida) || cantidadVendida < 0 || cantidadVendida > cantidadComprada) {
    return window.toast('La cantidad vendida debe estar entre cero y las piezas compradas.', 'error');
  }
  if (!$('compra-costo').value.trim() || !$('compra-ingresos').value.trim()
    || !Number.isFinite(costoUnitario) || costoUnitario < 0 || !Number.isFinite(ingresosVenta) || ingresosVenta < 0) {
    return window.toast('Revisa el costo y el importe de venta; deben ser cantidades válidas y no negativas.', 'error');
  }
  if ((cantidadVendida === 0 && ingresosVenta !== 0) || (cantidadVendida > 0 && ingresosVenta <= 0)) {
    return window.toast('Registra un importe mayor a cero cuando haya piezas vendidas, y cero si aún no vendes.', 'error');
  }
  if (!window.auth?.currentUser) return window.toast('Tu sesión terminó. Inicia sesión de nuevo para guardar.', 'error');

  const compra = {
    fecha,
    pieza,
    proveedor,
    cantidadComprada,
    costoUnitario: redondear(costoUnitario),
    cantidadVendida,
    ingresosVenta: redondear(ingresosVenta),
    notas
  };
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

const cuerpo = $('compras-body');
cuerpo?.addEventListener('click', async evento => {
  const boton = evento.target.closest('button[data-compra-accion]');
  if (!boton) return;
  const id = boton.dataset.compraId;
  const accion = boton.dataset.compraAccion;
  if (accion === 'venta') return window.comprasEditar(id, true);
  if (accion === 'editar') return window.comprasEditar(id);
  if (accion !== 'eliminar' || !permitido()) return;
  if (!window.confirm('¿Eliminar este registro de compra y sus datos de venta?')) return;
  try {
    await window.deleteDoc(window.doc(window.db, 'compras', id));
    window.toast('Registro de compra eliminado.', 'success');
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
