# Lo que falta configurar (para el martes en la oficina)

Todo lo de abajo ya está programado y publicado en gestor-maya.vercel.app. Solo faltan accesos y configuraciones que se hacen desde cuentas de la empresa.

## 1. Vercel (proyecto gestor-maya)
- `CRON_SECRET`: contraseña larga inventada (Production) + Redeploy. Sin esto no salen alarmas, resumen de la mañana ni la importación automática de Mercado Libre.
- `ML_SECRET_KEY` ya debe estar (la usa Inventario). Si la importación de ventas de ML dice "no se puede renovar el token", falta esta variable.

## 2. cron-job.org (gratis)
- Cronjob cada 5 minutos a `https://gestor-maya.vercel.app/api/avisos?tarea=tick`
- Header `Authorization: Bearer <CRON_SECRET>`
- Ese tick manda alarmas, el resumen diario (8:00) y trae las ventas pagadas de Mercado Libre.

## 3. Mercado Libre (developers.mercadolibre.com.mx → la app del gestor)
- Opcional, para que las ventas entren al instante y no cada 5 min: en la app poner **URL de notificaciones** `https://gestor-maya.vercel.app/api/ml` y activar el tema **orders_v2**.
- Si al importar sale 403: la app necesita el permiso de lectura de órdenes (se vuelve a autorizar desde Inventario → Conectar ML).

## 4. Paquete Express / Skydrops (rastreo automático)
- Hoy la guía y el estatus se capturan en Seguimiento o con Pepito ("la NE-245 ya salió por Paquete Express, guía 123").
- Para que el gestor consulte solo si ya llegó, hace falta el acceso a API de cada paquetería:
  - Paquete Express: usuario de empresa en su portal y pedir credenciales de API (web service de rastreo). Traer: usuario, contraseña/token y número de cliente.
  - Skydrops: API key de la cuenta.
- Con eso se agrega el rastreo al mismo tick de 5 minutos.

## 5. Meta / WhatsApp
- Plantillas para que el bot escriba primero (fuera de 24 h): `aviso_equipo` y `reporte_diario` (ver docs/GUIA_API_WHATSAPP.md, sección 6). Luego poner sus nombres en Vercel: `WHATSAPP_PLANTILLA_AVISO`, `WHATSAPP_PLANTILLA_REPORTE`.
- Cuenta oficial verificada (OBA) para un grupo real de WhatsApp: Business Manager → verificar negocio (constancia fiscal, comprobante de domicilio) → WhatsApp Manager → número → "Cuenta oficial". Mientras, el grupo "Entregas y cobranza" funciona por medio de Pepito.

## 6. En el gestor (5 minutos)
- Usuarios: registrar el WhatsApp de cada persona del equipo.
- Campanita → Grupo → elegir a los 4 del grupo Entregas y cobranza.
- Facturación: poner los días para facturar de cada cliente (Jake 6, FLEC 3…). Si no, se usan 6.
- Clientes: marcar a Jeic como "Nota sin precio".

## Qué quedó listo esta semana
- Geraldine Bot: factura de CONTPAQi por WhatsApp (XML o PDF), ligada por siniestro; orden directa (FLEC) como venta facturada.
- Días para facturar por cliente, estados (en espera, vence mañana, lista, vencida, sin movimiento) en Facturación, Seguimiento, resumen diario y Pepito (`seguimiento_facturacion`).
- Cancelar nota con motivo obligatorio (Seguimiento y Pepito `cancelar_nota`), con aviso al vendedor y a facturación.
- Ventas de Mercado Libre al gestor solas (tick, botón y notificaciones).
- Envíos por paquetería en la nota: tipo, paquetería, guía, estatus; mueve la etapa y avisa; alertas de guía pendiente y 3 días sin movimiento; Pepito `guardar_guia` y `envios_seguimiento`.
- Grupo "Entregas y cobranza" por medio de Pepito; clientes repetidos bloqueados; Pepito lee fotos.
