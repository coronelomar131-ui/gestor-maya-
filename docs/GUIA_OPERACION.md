# Guía de operación: oficina virtual, seguimiento, facturación y cobranza

Esta guía explica cómo usar los módulos nuevos del gestor (https://gestor-maya.vercel.app) y qué tiene que hacer cada quien.

## 1. Preparación (una sola vez, la hace un admin)

1. **Recargar el gestor** en todas las computadoras y teléfonos (Ctrl+Shift+R en PC; cerrar y abrir en el teléfono).
2. **Dar de alta a quien factura** (por ejemplo Geraldine): *Usuarios → + Nuevo usuario → Rol: "Facturación y cobranza"*.
   Ese rol ve: Resumen, Oficina, Pepito, Seguimiento, Facturación, Cobranza, Notas, Ventas, Clientes y Documentos.
   Si ya tiene cuenta, un admin puede cambiarle el rol en Usuarios.
3. **Poner los días de crédito de cada cliente**: se piden la primera vez que subes una factura de ese cliente
   (campo "Días de crédito") o en *Cobranza → "Poner días de crédito"* junto al nombre del cliente. 0 = contado.
4. **Apagar el registro abierto en Firebase** (si no se ha hecho): consola de Firebase → Authentication → Settings →
   User actions → desmarcar "Enable create (sign-up)". Las cuentas nuevas se crean desde el gestor.

## 2. El flujo de una pieza

```
Registrada → En preparación → En tránsito → Entregada → Facturada → Pagada
   (venta o nota)      (Seguimiento de piezas)          (Facturación)  (Cobranza)
```

- **Registrada**: al capturar la nota de entrega o la venta, como siempre.
- **En preparación / En tránsito / Entregada**: en *Seguimiento de piezas*, toca la pieza y elige la etapa.
  Puedes poner una nota (guía, quién recibió). Queda la fecha y quién la movió.
- **Facturada**: se pone sola cuando se sube el XML de su factura en *Facturación*.
- **Pagada**: se pone sola cuando la factura queda en saldo cero en *Cobranza*.

## 3. Facturación con CONTPAQi

El gestor **no timbra**: se sigue timbrando en CONTPAQi como siempre. El gestor se entera de cada factura con su XML.

1. Entra a **Facturación → Pendientes de facturar**. Ahí están las notas con importe que no tienen factura,
   agrupadas por cliente (las de $0 sin precio a propósito no aparecen).
2. Selecciona las que vas a facturar y toca **"Copiar datos para CONTPAQi"**: se copian cliente, piezas, siniestros
   e importes para capturarlos en CONTPAQi.
3. **Timbra en CONTPAQi.**
4. **Consigue el XML** de esa factura. CONTPAQi lo genera al timbrar; según cómo esté configurado, queda en la
   carpeta de documentos digitales de la empresa o se manda por correo junto con el PDF. Si no sabes dónde queda,
   pregúntale a quien instaló CONTPAQi la ruta de la carpeta de XML de la empresa.
5. En el gestor toca **"Subir XML de CONTPAQi"** y elige el archivo (puedes subir varios a la vez). El gestor:
   - lee el UUID, serie y folio, fecha, cliente (RFC), conceptos, subtotal, IVA y total;
   - rechaza archivos que no son factura timbrada y facturas que ya se habían subido;
   - **sugiere las notas que cubre**: las que seleccionaste, las que tienen un siniestro que aparece en los conceptos
     o la que cuadra con el total. Revisa la suma ("cuadra" o "diferencia");
   - si la factura es PUE marca "Ya está pagada" (desmárcalo si en realidad es a crédito).
6. Guarda. Las notas quedan **Facturadas** y la factura pasa a **Cobranza** con su vencimiento.

Si cancelas una factura en CONTPAQi, un admin la marca como cancelada en *Facturación → Facturas → ✕*: sus notas
regresan a pendientes y sale de Cobranza.

> **Más adelante (opcional):** que el gestor mande la factura a CONTPAQi y la timbre solo. Eso necesita un programa
> pequeño instalado en la computadora donde corre CONTPAQi (usa el SDK de CONTPAQi Comercial) y confirmar con su
> distribuidor que su licencia lo permite. Se hace cuando esto ya funcione bien.

## 4. Cobranza

- Arriba: **por cobrar**, **vencido** y **vence esta semana**.
- Por cliente: cada factura con saldo, fecha de vencimiento y días de atraso (en rojo si ya venció).
- **Registrar pago**: monto (completo o parcial), fecha, forma y referencia. Con saldo cero la factura queda pagada.
- Si la factura es PPD, recuerda emitir el complemento de pago en CONTPAQi.

## 5. Oficina virtual

*Oficina virtual* es la misma Oficina 3D de tu proyecto en claude.ai (Dirección, Entregas, Taller, Facturación,
Cobranza y Reportes, con Pepito Junior y sus agentes), ahora dentro del gestor y movida con los datos reales:
cuando un área tiene trabajo nuevo, sus agentes se juntan y lo atienden, y el agente de esa área dice "Te necesita".
Toca a un agente para abrir su módulo; en PC arrastra para girar la oficina. Debajo de la escena está el número de
pendientes de cada área:

| Oficina | Qué cuenta | Abre |
|---|---|---|
| Pepito Junior | Pedidos esperando en el buzón | Pepito |
| Entregas | Piezas en preparación o en tránsito | Seguimiento de piezas |
| Facturación | Piezas entregadas que faltan por facturar | Facturación |
| Cobranza | Facturas vencidas (en rojo) o saldo por cobrar | Cobranza |
| Reportes | Notas de hoy y su importe | Reportes (solo admin) |

Cada quien ve solo las áreas de su rol. No necesita cuenta de Claude (el artifact de claude.ai sí la pide).

## 6. Compras y utilidad

El módulo **Compras** es un registro separado, disponible para administración y almacén. No aumenta ni descuenta
existencias del módulo Inventario y tampoco agrega datos a Ventas, notas o facturas.

1. Entra a **Compras → Registrar compra** y captura fecha y proveedor. Agrega todos los artículos que vengan en esa
   compra; para cada uno captura cantidad, precio de compra por pieza y, cuando corresponda, cantidad vendida y precio
   de venta por pieza. Los totales y la utilidad se actualizan mientras escribes.
2. Para corregir una compra después, toca **Editar compra**. Puedes cambiar sus artículos, precios, cantidades y datos
   generales, agregar más artículos o quitar los que ya no correspondan.
3. La utilidad bruta se calcula por artículo como **piezas vendidas × (precio de venta por pieza − precio de compra por
   pieza)**. No incluye gastos
   adicionales, impuestos ni comisiones.

Los indicadores resumen todas las compras guardadas. Las piezas pendientes son solo las de este registro, no una copia
del inventario general. Los registros anteriores de un solo artículo siguen apareciendo y se pueden editar.

Pepito también puede consultar los datos con **“¿Cuánto invertimos en compras y cuál es la utilidad?”** o buscar por
artículo, proveedor y fechas. La herramienta **Consultar compras y utilidad** es de solo lectura y solo está disponible
para los roles de administración y almacén. El agente usa los costos e ingresos capturados en Compras; no toma precios
de Ventas, notas ni Inventario. Los cambios recientes pueden tardar hasta 5 minutos en aparecer en la consulta del agente.
También puede proponer una compra nueva con sus artículos y precios, o eliminar una compra existente. Antes de guardar
o borrar, Pepito presenta los datos y espera tu confirmación; al borrar, el registro queda respaldado en la papelera.

## 7. Pepito

Mientras no haya presupuesto para la API, Pepito contesta por el buzón (*módulo Pepito*): alguien con acceso admin
a Claude lo pone a revisar (por ejemplo `/loop 1m revisa el buzón de Pepito y contesta los pendientes`).
Con el MCP ya puede responder, además de ventas y notas:

- "¿Qué tengo pendiente de facturar de LATAM?" (`pendientes_facturar`)
- "¿Quién nos debe y qué está vencido?" (`cobranza`)

Para guardar algo, Pepito primero dice qué va a guardar y espera confirmación.

## 8. Dónde se guarda cada cosa (Firebase)

| Dato | Dónde |
|---|---|
| Lotes de compra, costo unitario e ingresos de venta | colección `compras` (independiente de `ventas`, `notasEntrega` y `productos`) |
| Etapa e historial de una pieza | `etapa` y `seguimiento` en la nota (`notasEntrega`) o venta (`ventas`) |
| Facturas (datos del XML, notas ligadas, pagos, saldo) | colección `facturas` |
| Factura ligada a una nota | `facturaId`, `facturaFolio`, `facturaUUID` en la nota o venta |
| Días de crédito del cliente | `diasCredito` en `clientes` |
| Pedidos a Pepito | colección `buzon_pepito` |
