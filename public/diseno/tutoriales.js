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

  compras: {
    titulo: 'Compras',
    pasos: [
      { el: '[onclick*="comprasNueva"]', titulo: 'Registrar una compra', texto: 'Anota cada lote: proveedor, piezas, cuántas compraste y a cuánto. Cuando vendas, pon cuántas y a qué precio.' },
      { el: '.m-compras-metricas', titulo: 'Cuánto llevas', texto: 'Lo invertido, lo que ya recuperaste, la utilidad bruta y las piezas que te quedan por vender.' },
      { el: '#compras-busqueda', titulo: 'Buscar', texto: 'Encuentra una compra por pieza, proveedor o fecha (por ejemplo 07/11/2026).' },
      { el: '#mod-compras .table-card', titulo: 'Editar o vender', texto: 'Con Editar compra registras piezas vendidas. También se lo puedes pedir a Pepito: "vendí 2 faros del lote de Depo a 1,800".' }
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

  oficina: {
    titulo: 'Oficina virtual',
    pasos: [
      { el: '#of-3d', titulo: 'La oficina en 3D', texto: 'Pepito Junior y los agentes de cada área. Cuando llega trabajo se juntan y lo atienden; los que dicen “Te necesita” tienen pendientes. Toca a uno para abrir su área.' },
      { el: '#of-piso', titulo: 'Lo pendiente por área', texto: 'Aquí ves el número de pendientes de cada área; en rojo, lo urgente. Tócala para entrar.' }
    ]
  },

  seguimiento: {
    titulo: 'Seguimiento de piezas',
    pasos: [
      { el: '#seg-buscar', titulo: 'Busca una pieza', texto: 'Por cliente, folio, siniestro o pieza.' },
      { el: '#seg-etapas', titulo: 'Filtra por etapa', texto: 'Registrada, en preparación, en tránsito, entregada, facturada y pagada. “Por entregar” muestra lo que sigue en camino.' },
      { el: '#seg-lista', titulo: 'Mueve la etapa', texto: 'Toca una pieza para ver su línea de tiempo y moverla de etapa. Facturada y Pagada se ponen solas desde Facturación y Cobranza.' }
    ]
  },

  facturacion: {
    titulo: 'Facturación',
    pasos: [
      { el: '#fac-tabs', titulo: 'Pendientes y facturas', texto: 'En Pendientes ves las notas que faltan por facturar, agrupadas por cliente. En Facturas, las que ya subiste.' },
      { el: '#fac-cuerpo', titulo: 'Prepara la factura', texto: 'Selecciona las notas y copia sus datos para capturarlos en CONTPAQi.' },
      { el: '.m-op-subir', titulo: 'Sube el XML', texto: 'Cuando CONTPAQi timbre, sube aquí el XML. El gestor lee el UUID, el folio y el total, te sugiere las notas que cubre y la manda a Cobranza.' }
    ]
  },

  cobranza: {
    titulo: 'Cobranza',
    pasos: [
      { el: '#cob-resumen', titulo: 'Cómo vamos', texto: 'Lo que falta por cobrar, lo vencido y lo que vence esta semana.' },
      { el: '#cob-cuerpo', titulo: 'Por cliente', texto: 'Cada factura con su saldo y vencimiento. Registra pagos completos o parciales; cuando el saldo llega a cero queda pagada.' }
    ]
  },

  pepito: {
    titulo: 'Pepito',
    pasos: [
      { el: '#buzon-texto, #chat-texto', titulo: 'Escribe tu pedido', texto: 'Pregunta lo que necesites o pide una tarea: ventas de un cliente, buscar una nota, preparar una cotización.' },
      { el: '#buzon-enviar, #chat-enviar', titulo: 'Envíalo', texto: 'Pepito revisa el buzón y te contesta aquí mismo; no tienes que recargar.' },
      { el: '#buzon-estado, #chat-estado', titulo: 'Cómo te contesta', texto: 'Aquí ves la última vez que Pepito revisó. Si va a guardar algo, primero te dice qué y espera que confirmes con “Responder”.' }
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
