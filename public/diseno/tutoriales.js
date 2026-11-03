// Recorridos guiados de cada módulo. Se muestran la primera vez que alguien entra y se repiten con el botón "?".
// Cada paso: el (selector del elemento a señalar; una lista toma el primero visible), junto (otro selector: se señala el
// contenedor de los dos), titulo y texto (HTML corto). Sin "el", el paso aparece al centro.
// Para editar un texto basta con cambiarlo aquí; si un botón cambia de lugar, el paso lo sigue encontrando por lo que hace.

export const BIENVENIDA = {
  titulo: 'Bienvenida',
  pasos: [
    {
      titulo: 'Bienvenido al nuevo Maya',
      texto: 'Reacomodamos todo para que encuentres lo que necesitas más rápido, en el teléfono y en la computadora. Te enseño lo básico en cuatro pasos.'
    },
    {
      el: ['#m-tabbar', '.m-nav'],
      titulo: 'Así cambias de módulo',
      texto: 'Aquí están tus módulos. Arriba (o en la barra de abajo, en el teléfono) quedan tus <b>fijados</b>: los que más usas. En <b>Más</b> está todo lo demás.'
    },
    {
      el: '#m-accesos',
      titulo: 'Fija lo que más usas',
      texto: 'Toca <b>Editar</b> para ordenar tus accesos arrastrándolos, quitar los que no usas o agregar otros. Se guarda en tu cuenta.'
    },
    {
      el: '[data-accion="ayuda"]',
      titulo: '¿Dudas en un módulo?',
      texto: 'Este botón te explica el módulo en el que estás, paso a paso. Úsalo cuando quieras.'
    },
    {
      titulo: 'Listo',
      texto: 'Eso es todo. Cuando alguien nuevo entre al equipo, verá este recorrido la primera vez.'
    }
  ]
};

export const TUTORIALES = {
  dashboard: {
    titulo: 'Resumen',
    pasos: [
      { el: '.m-saludo', titulo: 'Tu resumen', texto: 'Lo primero que ves al entrar: cómo va el negocio este mes.' },
      { el: '#m-accesos', titulo: 'Tus accesos', texto: 'Atajos a tus módulos favoritos. Toca <b>Editar</b> para ordenarlos o cambiarlos.' },
      { el: '#mod-dashboard .stats-grid', titulo: 'Los números del mes', texto: 'Ventas del mes, piezas en existencia, clientes y entregas pendientes. Se actualizan solos.' },
      { el: '#dash-ventas-list', titulo: 'Últimas ventas', texto: 'Las ventas más recientes con su total. Para ver todas, entra a <b>Ventas</b>.' }
    ]
  },

  'notas-entrega': {
    titulo: 'Notas de entrega',
    pasos: [
      { el: '[onclick*="modal-nota-entrega"]', titulo: 'Nueva nota', texto: 'Eliges al cliente, agregas las piezas con cantidad y precio, y marcas si lleva IVA. Al guardar se descarga el PDF y, si lo dejas marcado, también se registra la venta.' },
      { el: '#ne-filter-tipo', junto: '#ne-filter-hora', titulo: 'Encuentra cualquier nota', texto: 'Filtra por tipo (entrega o venta), cliente, mes, año, día u hora. El total de abajo suma solo lo que estás viendo.' },
      { el: '[onclick*="descargarHistorialNE()"]', titulo: 'Descarga lo que filtraste', texto: 'Con <b>Excel</b> o <b>PDF</b> te llevas exactamente las notas de la lista.' },
      { el: '#ne-table', titulo: 'Tu historial', texto: 'Cada renglón es una nota de entrega (NE) o de venta (NV), de la más nueva a la más vieja.' }
    ]
  },

  ventas: {
    titulo: 'Ventas',
    pasos: [
      { el: '[onclick*="modal-venta"]', titulo: 'Nueva venta', texto: 'Registra una venta con sus partidas, IVA y ajustes. Si ya hiciste la nota de entrega, esa venta se registró sola.' },
      { el: '#mod-ventas .search-box', titulo: 'Buscar', texto: 'Escribe folio, cliente o pieza y la tabla se filtra al instante.' },
      { el: '#ventas-body select', titulo: 'Estatus', texto: 'Cambia el estatus aquí mismo: Pendiente, Conseguir, En proceso, Entregado o Cancelado. Se guarda al momento.' },
      { el: '#notasfacturas-table', titulo: 'Notas y facturas', texto: 'Cada nota con su factura, su siniestro y si ya se entregó.' }
    ]
  },

  cotizaciones: {
    titulo: 'Cotizaciones',
    pasos: [
      { el: '[onclick*="modal-cotizacion"]', titulo: 'Nueva cotización', texto: 'Arma una cotización con piezas, precios e IVA para mandarla al cliente.' },
      { el: '#mod-cotizaciones .search-box', titulo: 'Buscar', texto: 'Encuentra una cotización por folio, cliente o pieza.' },
      { el: '#cot-table', titulo: 'Tus cotizaciones', texto: 'Aquí quedan todas, con su estatus y su fecha.' }
    ]
  },

  clientes: {
    titulo: 'Clientes',
    pasos: [
      { el: '[onclick*="modal-cliente"]', titulo: 'Agregar cliente', texto: 'Da de alta un cliente con su razón social, RFC y dirección para usarlo en notas y ventas.' },
      { el: '#mod-clientes .search-box', titulo: 'Buscar', texto: 'Por nombre, RFC, teléfono o correo.' },
      { el: '#btn-import-excel', titulo: 'Importar y exportar', texto: 'Sube muchos clientes de una vez desde Excel, o descarga el directorio completo.' }
    ]
  },

  inventario: {
    titulo: 'Inventario',
    pasos: [
      { el: '[onclick*="modal-producto"]', titulo: 'Agregar pieza', texto: 'Registra una pieza con código, descripción, marca, precio y existencias.' },
      { el: '#mod-inventario .search-box', titulo: 'Buscar pieza', texto: 'Por código, descripción, marca o el auto con el que es compatible.' },
      { el: '[onclick*="sincronizarInventarioML()"]', titulo: 'Mercado Libre', texto: 'Trae tus publicaciones de Mercado Libre para verlas junto al inventario local.' }
    ]
  },

  proveedores: {
    titulo: 'Proveedores',
    pasos: [
      { el: '[onclick*="modal-proveedor"]', titulo: 'Agregar proveedor', texto: 'Guarda quién te surte, su contacto y qué piezas maneja.' },
      { el: '#mod-proveedores .search-box', titulo: 'Buscar', texto: 'Encuentra un proveedor por nombre, contacto o pieza.' }
    ]
  },

  entregas: {
    titulo: 'Entregas',
    pasos: [
      { el: '[onclick*="modal-entrega"]', titulo: 'Nueva entrega', texto: 'Registra una entrega a domicilio con dirección, monto y forma de pago.' },
      { el: '#mod-entregas .search-box', titulo: 'Buscar', texto: 'Por cliente o dirección.' },
      { el: '#ent-table', titulo: 'Estatus', texto: 'Marca cada entrega como pendiente, entregada o cancelada. Las pendientes salen en tu resumen.' }
    ]
  },

  envios: {
    titulo: 'Envíos',
    pasos: [
      { el: '[onclick*="envios_abrirForm"]', titulo: 'Nuevo envío', texto: 'Registra un paquete con destinatario, paquetería, guía y costo.' },
      { el: '[onclick*="envios_cargar"]', titulo: 'Refrescar', texto: 'Vuelve a cargar la lista para ver los cambios de estado.' }
    ]
  },

  'visitas-talleres': {
    titulo: 'Visitas a talleres',
    pasos: [
      { el: '[onclick*="abrirModalVisitaTaller"]', titulo: 'Nueva visita', texto: 'Registra la visita: taller, contacto, observaciones y una foto.' },
      { el: '#vt-search', junto: '#vt-hasta', titulo: 'Filtros', texto: 'Busca por texto, por colaborador o por rango de fechas.' },
      { el: '[onclick*="exportarVisitasTalleresExcel"]', titulo: 'Exportar', texto: 'Descarga a Excel las visitas que estás viendo.' }
    ]
  },

  reportes: {
    titulo: 'Reportes',
    pasos: [
      { el: '#mod-reportes canvas', titulo: 'Ventas por mes', texto: 'Cómo se mueven las ventas mes con mes.' },
      { el: '#rep-vend-select', junto: '#rep-vend-hasta-ano', titulo: 'Por vendedor', texto: 'Elige vendedor y rango de meses y toca <b>Filtrar</b>.' },
      { el: '[onclick*="exportarVendedorPDF"]', titulo: 'Descargar', texto: 'Llévate el reporte en PDF o en Excel.' }
    ]
  },

  mercadolibre: {
    titulo: 'Mercado Libre',
    pasos: [
      { el: '[onclick*="loginMercadoLibre"]', titulo: 'Conexión', texto: 'Si aparece desconectado, toca <b>Conectar ML</b> e inicia sesión con tu cuenta de vendedor.' },
      { el: '[onclick*="cargarOrdenesML"]', titulo: 'Órdenes', texto: 'Las órdenes de Mercado Libre con cantidad, total y estado.' },
      { el: '[onclick*="cargarProductosML"]', titulo: 'Publicaciones', texto: 'Tus productos publicados, con precio y piezas disponibles.' }
    ]
  },

  documentos: {
    titulo: 'Documentos',
    pasos: [
      { el: '#doc-search-input', titulo: 'Buscar documentos', texto: 'Encuentra notas de venta y facturas por folio o cliente.' }
    ]
  },

  'busqueda-ventas': {
    titulo: 'Buscar ventas',
    pasos: [
      { el: '#busq-siniestro', junto: '#busq-monto-min', titulo: 'Busca como quieras', texto: 'Por número de siniestro, cliente, estado o monto mínimo. Llena solo lo que sepas.' },
      { el: '[onclick*="ejecutarBusquedaVentas"]', titulo: 'Buscar', texto: 'Toca <b>Buscar</b> para ver las ventas que coinciden.' }
    ]
  },

  finanzas: {
    titulo: 'Finanzas',
    pasos: [
      { el: '[onclick*="showFinanzasTab"]', titulo: 'Préstamos, pagos y resumen', texto: 'Cambia de vista con estas pestañas.' },
      { el: '[onclick*="modal-prestamo"]', titulo: 'Nuevo préstamo', texto: 'Registra un préstamo con monto, plazo y fecha.' },
      { el: '[onclick*="modal-pago"]', titulo: 'Nuevo pago', texto: 'Registra un pago o abono.' }
    ]
  },

  usuarios: {
    titulo: 'Usuarios',
    pasos: [
      { el: '[onclick*="modal-usuario"]', titulo: 'Nuevo usuario', texto: 'Da de alta a alguien del equipo con su rol: <b>admin</b>, <b>vendedor</b> o <b>almacén</b>. Cada rol ve solo sus módulos.' },
      { el: '#users-body', titulo: 'Tu equipo', texto: 'Quién tiene acceso y con qué rol.' }
    ]
  },

  configuracion: {
    titulo: 'Configuración',
    pasos: [
      { el: '#config-razonSocial', junto: '#config-cp', titulo: 'Datos fiscales', texto: 'Los datos que salen en tus notas, facturas y PDF.' },
      { el: '[onclick*="guardarDatosFiscales"]', titulo: 'Guardar', texto: 'No olvides guardar cuando cambies algo.' }
    ]
  }
};
