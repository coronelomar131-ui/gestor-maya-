# Permisos de Firebase (reglas de la base de datos)

Las **reglas** son el candado de la base de datos. Hoy el gestor oculta botones según el rol, pero quien tenga sesión
podría saltarse la pantalla. Las reglas lo impiden desde Firebase.

Hay dos niveles:

| | Nivel 1 | Nivel 2 |
|---|---|---|
| Cuándo | Hoy, sin preparar nada | Después de publicar el gestor actualizado y "Preparar permisos" |
| Dónde están | archivo `firestore.rules` | en este documento, más abajo |
| Exige sesión | Sí | Sí, y además tener perfil con rol |
| Tokens de Mercado Libre y de Claude cerrados al navegador | Sí | Sí |
| Nadie se cambia su rol | Sí al editar su perfil (ver "Lo que Nivel 1 no cubre") | Sí |
| Cada rol solo hace lo suyo | No | Sí |

Pepito, Claude (MCP), WhatsApp y las tareas programadas trabajan desde el servidor y **no les afectan las reglas**.

Estas reglas **no se han probado en un emulador** (en la computadora donde se escribieron no están instalados ni
Firebase ni Java). Por eso hay que probarlas como se indica abajo y tener a la mano la copia para regresar.

---

## 1. Guardar copia de las reglas actuales (obligatorio, 2 minutos)

1. Entra a <https://console.firebase.google.com> y abre el proyecto **mayav3-f9d9b**.
2. Menú izquierdo: **Firestore Database** → pestaña **Reglas** (Rules).
3. Haz clic dentro del cuadro de texto, selecciona todo (Ctrl+A) y copia (Ctrl+C).
4. Pégalo en el Bloc de notas y guárdalo como `reglas-anteriores-AAAA-MM-DD.txt`. No lo borres.

Firebase también guarda un historial de versiones en esa misma pestaña, pero ten tu copia de todos modos.

## 2. Revisar dos cosas antes de pegar

1. **Mercado Libre.** En **Firestore Database** → pestaña **Datos**, abre `config` → `ml_global`.
   Debe existir, con `mlUserId` (un número) y `activo` en `true`.
   Si no existe: abre la colección `ml_tokens`, copia el **nombre (ID)** del documento y crea `config/ml_global` con
   `mlUserId` (tipo texto, ese número) y `activo` (tipo booleano, `true`). Con las reglas nuevas el navegador ya no
   puede leer `ml_tokens`, así que sin `ml_global` la pantalla diría que Mercado Libre no está conectado.
2. **Registro público apagado** (recomendado). En **Authentication** → **Settings** → **User actions**, desmarca
   "Enable create (sign-up)". Las altas desde el gestor siguen funcionando porque las hace el servidor.
   Con Nivel 1, cualquiera que pueda crearse una cuenta por su lado podría leer la base.

## 3. Pegar las reglas

Hazlo en un horario tranquilo, con una computadora a la mano.

1. **Firestore Database** → **Reglas**.
2. Borra todo el cuadro.
3. Pega **todo** el contenido del archivo `firestore.rules` (Nivel 1).
4. Clic en **Publicar** (Publish). Si marca un error en rojo, no publica nada: revisa que hayas copiado completo.
5. Los cambios tardan hasta 1 o 2 minutos. Después recarga el gestor.

## 4. Probar

Con la cuenta de Dirección y, si se puede, con un vendedor y alguien de almacén:

- [ ] Entrar al gestor (y cerrar sesión y volver a entrar).
- [ ] Ver Ventas, Notas, Clientes, Inventario, Cotizaciones, Entregas, Envíos y Visitas con sus datos.
- [ ] Crear una nota de entrega de prueba (al terminar las pruebas, cancelarla).
- [ ] Cambiar la etapa de una venta en Seguimiento.
- [ ] Inventario: ajustar la existencia de una pieza y regresarla; ver su historial.
- [ ] Mercado Libre: abre, muestra publicaciones y "Sincronizar" no marca error.
- [ ] Facturación y Cobranza abren (quien factura: registrar y anular un pago de prueba solo si es seguro).
- [ ] Compras y Finanzas abren.
- [ ] Usuarios: cambiar el número de WhatsApp o el rol de alguien (y regresarlo).
- [ ] Campana de avisos y sus preferencias; Pepito contesta.
- [ ] Configuración: los datos fiscales aparecen y "Descargar respaldo" dice completo (solo Dirección).
- [ ] Cancelar y reactivar una nota de prueba; con Dirección, borrar definitivamente una cancelada de prueba.

Si algo dice **"No tienes permiso"** y antes funcionaba, regresa las reglas (paso 5) y anota qué pantalla, qué rol y a
qué hora.

En la misma pestaña de Reglas, el **Área de pruebas de reglas** (Rules Playground) permite simular una lectura o
escritura sin tocar datos.

## 5. Regresar atrás

1. **Firestore Database** → **Reglas**.
2. Borra todo, pega el contenido de `reglas-anteriores-AAAA-MM-DD.txt` y **Publica**.
3. Recarga el gestor.

Cambiar reglas **nunca borra ni modifica datos**; solo permite o niega. Se puede ir y venir las veces que haga falta.

### Lo que Nivel 1 no cubre

Las reglas no pueden buscar en la lista de usuarios para saber quién es administrador. Por eso, en Nivel 1 alguien con
sesión y conocimientos técnicos todavía podría:

- cambiar el rol o el WhatsApp de **otra** persona (o el WhatsApp propio);
- crearse un **segundo** perfil de Dirección (la app necesita crear perfiles para cuentas antiguas que no lo tenían).
  Quien ya tiene su copia en la colección `roles` (se crea al entrar con el gestor actualizado) ya no puede hacerlo.
  Si algún día borras a mano el perfil de alguien en la consola, borra también su documento en `roles`.
  Para cerrarlo del todo: primero comprueba que cada correo de **Authentication** aparece en el módulo **Usuarios** del gestor;
  si todos aparecen, en `match /usuarios/{id}` cambia la condición completa de `allow create` por
  `allow create: if false;` y publica.

El Nivel 2 cierra todo esto.

---

## Nivel 2: permisos por rol

### Cómo sabe Firebase el rol de cada quien

Los perfiles de `usuarios` tienen un identificador al azar, no el de la cuenta, y las reglas no pueden buscar. Por eso
el servidor guarda una copia en `roles/{uid}` (uid = identificador de la cuenta) con el rol que dice `usuarios`.

- La **fuente** sigue siendo `usuarios`; no se cambia ni se borra ningún dato.
- Solo el servidor escribe `roles` (el navegador no puede).
- La copia se actualiza sola: al dar de alta o de baja, cuando cada persona entra al gestor, y cuando Dirección tiene
  el gestor abierto y cambia la lista de usuarios.

Se eligió esto y no "custom claims" porque el cambio aplica al momento (las claims tardan hasta una hora) y se puede ver
y corregir en la consola. Cuesta como máximo una lectura extra por consulta o guardado.

Si cambias un rol **a mano en la consola**, pide a Dirección que abra el gestor (o a esa persona que vuelva a entrar).

### Pasos (en este orden)

1. **Publicar el gestor actualizado** (`api/usuarios.js`, `public/diseno/permisos.js` y el cambio de `index.html` que
   carga `permisos.js`). Con Nivel 1 puesto no cambia nada en pantalla.
2. Dirección entra → **Usuarios** → al final, **Permisos de la base de datos** → **Preparar permisos**.
3. Si pregunta por **cuentas antiguas sin perfil**: son personas que hoy entran como Dirección sin estar en la lista.
   Si las conoces, acepta (se les crea el perfil y luego les cambias el rol). Si no las conoces, cancela, deshabilítalas
   en Firebase → Authentication, y vuelve a tocar Preparar.
4. Revisa el informe hasta ver **"✅ Listo para activar las reglas por rol"**. Revisa también los repetidos y que el
   número de administradores sea el correcto. **Sin el ✅ no sigas.**
5. En la consola, **Datos** → colección `roles`: debe haber un documento por persona, y el tuyo con `rol: admin`.
6. Guarda copia de las reglas actuales (paso 1), pega las de abajo y publica.
7. Repite las pruebas del paso 4 **con cada rol**.

Si alguien se queda sin ver datos: que recargue la página. Si sigue igual, Dirección toca "Preparar permisos". Si
tampoco, regresa a las reglas de Nivel 1 (sirven con o sin el Nivel 2).

Si Dirección se quedara fuera: en la consola crea `roles/<tu uid>` (el uid está en Authentication) con el campo
`rol` = `admin`, o regresa las reglas.

### Reglas de Nivel 2 (copiar desde `rules_version` hasta la última llave)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function sesion() {
      return request.auth != null;
    }
    // El rol sale de roles/{uid}, que solo escribe el servidor. Sin ese documento no hay acceso.
    function es(lista) {
      return sesion()
        && exists(/databases/$(database)/documents/roles/$(request.auth.uid))
        && get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.rol in lista;
    }
    // Las listas siguen a public/diseno/roles.js: si allá cambia un rol, cambiarlo aquí
    function equipo()     { return es(['admin', 'vendedor', 'almacen', 'entregas', 'facturacion']); }
    function direccion()  { return es(['admin']); }
    function factura()    { return es(['admin', 'facturacion']); }
    function inventario() { return es(['admin', 'almacen', 'facturacion']); }  // inventario, compras, proveedores, Mercado Libre
    function ventasDoc()  { return es(['admin', 'vendedor', 'facturacion']); } // cotizaciones
    function visitas()    { return es(['admin', 'vendedor', 'almacen', 'facturacion']); }
    function borraAlmacen() { return es(['admin', 'almacen']); }

    function mio(uid) {
      return sesion() && request.auth.uid == uid;
    }
    function cambios() {
      return request.resource.data.diff(resource.data).affectedKeys();
    }

    match /roles/{uid} {
      allow read: if mio(uid) || direccion();
      allow write: if false;
    }

    match /usuarios/{id} {
      // Cada quien puede leer su perfil aunque todavía no tenga la copia del rol
      allow read: if equipo() || (sesion() && resource.data.uid == request.auth.uid);
      allow create: if direccion();
      allow update: if (direccion()
          && !cambios().hasAny(['uid', 'bajaEn'])
          && (resource.data.get('uid', '') != request.auth.uid || !cambios().hasAny(['rol'])))
        || (equipo() && resource.data.uid == request.auth.uid && cambios().hasOnly(['avisos']));
      allow delete: if false;
    }

    // ── Ventas y su seguimiento ──
    // Todos actualizan: seguimiento, correcciones y la numeración automática de la pantalla
    match /ventas/{id} {
      allow read, create, update: if equipo();
      allow delete: if direccion();
    }
    match /notasEntrega/{id} {
      allow read, create, update: if equipo();
      allow delete: if direccion();
    }
    match /clientes/{id} {
      allow read, create, update: if equipo();
      allow delete: if direccion();
    }
    match /cotizaciones/{id} {
      allow read: if equipo();
      allow create, update, delete: if ventasDoc(); // al convertir a venta se borra
    }
    match /entregas/{id} {
      allow read, create, update: if equipo();
      allow delete: if borraAlmacen();
    }
    match /envios/{id} {
      allow read, write: if equipo();
    }
    match /visitasTalleres/{id} {
      allow read: if equipo();
      allow create, update: if visitas();
      allow delete: if direccion();
    }
    match /visitasTalleresFotos/{id} {
      allow read: if equipo();
      allow write: if visitas(); // al editar una visita se puede quitar la foto
    }

    // ── Almacén ──
    match /productos/{id} {
      allow read: if equipo();
      allow create, update: if inventario();
      allow delete: if borraAlmacen();
    }
    match /productosFotos/{id} {
      allow read: if equipo();
      allow write: if inventario();
    }
    // Historial de existencias: se agrega, no se corrige
    match /movimientos/{id} {
      allow read: if equipo();
      allow create: if inventario();
    }
    match /proveedores/{id} {
      allow read: if equipo();
      allow create, update: if inventario();
      allow delete: if borraAlmacen();
    }
    match /compras/{id} {
      allow read, create, update: if inventario();
      allow delete: if borraAlmacen();
    }
    match /ml_productos/{id} {
      allow read: if equipo();
      allow write: if inventario();
    }
    match /inventario/{id} {
      allow read, write: if inventario();
    }

    // ── Dinero ──
    match /facturas/{id} {
      allow read: if equipo();
      allow create, update: if factura();
    }
    match /finanzas_prestamos/{id} {
      allow read, create: if factura();
      allow update, delete: if direccion();
    }
    match /finanzas_pagos/{id} {
      allow read, create: if factura();
      allow update, delete: if direccion();
    }

    // ── Configuración ──
    // Dirección lee toda (Respaldos); los demás, solo lo que usa su pantalla
    match /config/{id} {
      allow read: if direccion()
        || (equipo() && id in ['ml_global', 'ml_firmas', 'ml_ultima_sync', 'datos_fiscales', 'geraldine', 'pepito_actividad', 'buzon_pepito']);
      allow write: if (inventario() && id in ['ml_global', 'ml_firmas', 'ml_ultima_sync'])
        || (direccion() && id in ['datos_fiscales', 'respaldo']);
    }

    // ── Cosas de cada persona ──
    match /preferencias/{uid} {
      allow read: if (mio(uid) && equipo()) || direccion();
      allow write: if mio(uid) && equipo();
    }
    match /presencia/{uid} {
      allow read: if direccion();
      allow write: if mio(uid) && equipo();
    }
    // Los avisos los escribe el servidor; la persona solo marca hasta dónde vio
    match /avisos_usuario/{uid} {
      allow read: if (mio(uid) && equipo()) || direccion();
      allow create: if mio(uid) && equipo() && request.resource.data.keys().hasOnly(['visto']);
      allow update: if mio(uid) && equipo() && cambios().hasOnly(['visto']);
    }
    match /pepito_conversacion/{uid} {
      allow read: if (mio(uid) && equipo()) || direccion();
    }
    // La oficina cuenta los pendientes de todos; las respuestas las escribe el servidor
    match /buzon_pepito/{id} {
      allow read: if equipo();
      allow create: if equipo() && request.resource.data.uid == request.auth.uid;
    }
    match /papelera/{id} {
      allow read: if direccion();
      allow create: if direccion();
    }
    // Solo del servidor; Dirección las lee para el respaldo
    match /ordenes/{id}            { allow read: if direccion(); }
    match /recordatorios/{id}      { allow read: if direccion(); }
    match /pepito_uso/{id}         { allow read: if direccion(); }
    match /whatsapp_vistos/{id}    { allow read: if direccion(); }
    match /whatsapp_enviados/{id}  { allow read: if direccion(); }
    match /whatsapp_pendientes/{id} { allow read: if direccion(); }

    // Todo lo que no aparece aquí (ml_tokens, mcp_* y cualquier colección nueva) queda cerrado
  }
}
```

---

## Inventario: qué hace el navegador en cada colección

"Todos" = admin, vendedor, almacen, entregas y facturacion. "Inv." = admin, almacen y facturacion.

| Colección | Lee | Crea / cambia | Borra | De dónde sale |
|---|---|---|---|---|
| usuarios | Todos (lista al entrar) | Admin: rol y WhatsApp. Cada quien: sus avisos. Cuenta antigua: crea su perfil | Solo servidor | index.html, pepito-chat.js, avisos.js |
| ventas | Todos | Todos (notas, seguimiento, correcciones, cancelar, factura PDF, numeración automática) | Admin | index.html, operacion.js, edicion.js, interaccion.js, cancelar.js |
| notasEntrega | Todos | Todos | Admin | index.html, operacion.js, edicion.js, cancelar.js |
| clientes | Todos | Admin, vendedor, facturacion en pantalla; Nivel 2 lo deja a Todos | Admin | index.html, edicion.js, operacion.js |
| cotizaciones | Todos | Admin, vendedor, facturacion | Los mismos (al convertir) | index.html, edicion.js |
| entregas | Todos | Todos | Admin, almacen | index.html, edicion.js |
| envios | Todos | Todos | Todos (así está la pantalla) | index.html |
| visitasTalleres / Fotos | Todos | Admin, vendedor, almacen, facturacion | Admin (la foto, quien edita) | index.html |
| productos / Fotos | Todos | Inv. | Admin, almacen | inventario.js, index.html |
| movimientos | Todos | Inv. (solo agrega) | Nadie | inventario.js |
| proveedores | Todos | Inv. | Admin, almacen | index.html, edicion.js |
| compras | Inv. (pantalla: admin y almacen) | Inv. | Admin, almacen | compras.js |
| ml_productos / inventario | Todos / Inv. | Inv. (sincronización) | Inv. | index.html, seguridad.js |
| facturas | Todos | Admin, facturacion | Nadie | operacion.js |
| finanzas_prestamos / pagos | Admin, facturacion | Admin, facturacion | Admin | index.html |
| config/ml_global, ml_firmas, ml_ultima_sync | Todos | Inv. | Nadie | index.html, seguridad.js |
| config/datos_fiscales | Todos | Admin | Nadie | index.html |
| config/respaldo | Admin | Admin | Nadie | respaldos.js |
| config/geraldine, pepito_actividad, buzon_pepito | Todos | Solo servidor | Nadie | operacion.js, buzon.js |
| preferencias/{uid} | La propia (Admin todas, al respaldar) | La propia | Nadie | maya.js |
| presencia/{uid} | Admin | La propia | Nadie | presencia.js |
| avisos_usuario/{uid} | La propia | Solo el campo "visto" | Nadie | avisos.js |
| pepito_conversacion/{uid} | La propia | Solo servidor | Nadie | pepito-chat.js |
| buzon_pepito | Todos | Cada quien crea los suyos | Nadie | buzon.js, operacion.js |
| papelera | Admin (respaldo) | Admin (al borrar) | Nadie | inventario.js, cancelar.js |
| ordenes, recordatorios, pepito_uso, whatsapp_* | Admin (respaldo) | Solo servidor | Solo servidor | respaldos.js |
| ml_tokens, mcp_* | Solo servidor | Solo servidor | Solo servidor | api/, mcp/ |

La pantalla de **Respaldos** (Dirección) lee casi todas las colecciones; en Nivel 2 también puede leer las "propias"
de cada persona. En Nivel 1, esas colecciones del servidor y la configuración las puede leer cualquiera con sesión
(no se pueden cambiar, salvo los documentos de configuración que usa la pantalla).

**Fotos de piezas (hasta 6 por pieza):** cada foto es un documento de `productosFotos`. La portada es
`productosFotos/{idDeLaPieza}` (como las de antes) y las demás son `productosFotos/{idDeLaPieza}_{clave}`; la pieza
guarda su orden en `fotosExtra`. Las reglas de arriba ya las cubren y salen en el respaldo con fotos: no hay que cambiar nada.

**Si se agrega una colección o un documento de `config` nuevo que use la pantalla, hay que agregarlo a las reglas**
(en Nivel 2 todo lo no listado está cerrado; en Nivel 1 solo hace falta si es un documento de `config` que la
pantalla guarda). Si es una colección nueva, agrégala también en `public/diseno/respaldos.js`.

Límites conocidos del Nivel 2: no revisa campo por campo (por ejemplo, un vendedor técnico podría cambiar cualquier
campo de una venta); "solo corrijo mis ventas" lo sigue cuidando la pantalla. Todo el equipo puede leer ventas,
clientes y el buzón, porque las pantallas actuales los cargan para todos.
