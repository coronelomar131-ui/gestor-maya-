# 🛠️ Guía Técnica de Maya Autopartes

## El archivo principal

`public/index.html` tiene aprox. 4900+ líneas y dentro tiene 3 cosas:
1. **HTML** — lo que ves en pantalla (la "fachada")
2. **CSS** — los colores y diseño (la "pintura")
3. **JavaScript** — lo que pasa cuando le picas a un botón (el "cerebro")

## Cómo se organiza el archivo (mapa)

| Líneas | Qué hay |
|---|---|
| 1-880 | Estilos (CSS) — colores, fuentes, botones |
| 880-1650 | El HTML — los módulos visibles |
| 1650-1950 | Inicialización — conectar con Firebase |
| 1950-2150 | Funciones base — login, modales, avisos |
| 2150-2400 | Sincronización con Firestore |
| 2400-2600 | Dashboard — los números grandes |
| 2600-2800 | Clientes |
| 2800-3100 | Ventas |
| 3100-3400 | Almacén |
| 3400-3700 | Documentos |
| 3900-4150 | Envíos |
| 4150-4350 | Finanzas |
| 4350-4550 | Usuarios |
| 4550-4900 | Utilidades |

## Variables globales

Piensa en estas como "cajas grandes" que todos pueden ver:

- `currentUser` — quién está dentro del sistema ahorita
- `currentRole` — qué tipo de usuario es (admin/vendedor/almacen)
- `allEnvios` — la lista de TODOS los envíos
- `allVentas` — la lista de TODAS las ventas
- `allClientes` — la lista de TODOS los clientes
- `allAlmacen` — la lista de TODOS los productos
- `currentEnvioId` — qué envío estás editando (nada si estás creando uno nuevo)

## Funciones críticas (NO BORRAR)

Estos son los "pilares" del sistema. Si los borras, todo se cae:

- `cargarEnvios()` — trae los envíos de Firebase
- `saveEnvio()` — guarda un envío (nuevo o editado)
- `deleteEnvio(id)` — borra un envío
- `cambiarEstadoEnvio(id, nuevoEstado)` — cambia el estado rápido
- `updateDashboard()` — refresca los números del dashboard
- `updateEnviosKPIs()` — actualiza los números pequeños del módulo Envíos

## Cómo agregar una feature nueva

1. **¿Necesitas guardar algo nuevo en Firebase?** Agrega el campo al objeto que se guarda en `saveXxx()`
2. **¿Necesitas mostrarlo en la pantalla?** Agrega HTML al módulo y actualiza `renderXxx()`
3. **Si es un campo nuevo en una tabla:** Agrega la columna al `<thead>` y al mapeo de filas
4. **Al final:** Llama a `cargarXxx()` para refrescar

## Listener real-time vs cargar manual

- **Listener real-time** (`startEnviosListener()`) — trae datos automáticamente cuando alguien los cambia en otro navegador
- **Cargar manual** (`cargarEnvios()`) — trae datos solo cuando lo pides (botón 🔄 o al guardar)

Ambos se usan JUNTOS para máxima velocidad y seguridad.

## El ciclo de vida de un envío

1. **Crear:** Admin abre modal → llena formulario → `saveEnvio()` guarda en Firestore
2. **Ver en tabla:** `cargarEnvios()` trae todos → `renderEnvios()` los muestra
3. **Cambiar estado:** Click en select de Estado → `cambiarEstadoEnvio()` actualiza Firestore
4. **Ver cambio:** Listener real-time recibe el cambio → tabla se refresca automáticamente
5. **Eliminar:** Admin clica 🗑 → `deleteEnvio()` lo borra

## KPIs del módulo Envíos

Los 4 números de arriba (Pendientes, Tránsito, Entregados, Monto):
- Se calculan desde `updateEnviosKPIs()` que filtra `allEnvios`
- Se actualizan cada vez que se carga o filtra la tabla
- Son solo números, no toques Firestore con ellos

## El avance del sistema

En Firestore, documento `config/sistema_avance` guarda:
- `porcentaje` — número 0-100
- `modulosCompletos` — array con nombres
- `modulosEnDesarrollo` — array con nombres
- `pendientes` — array con nombres

En Dashboard se muestra como una card bonita, y en Configuración se edita.

## Mercado Libre (ZONA PROHIBIDA)

⛔ **NO TOQUES:**
- Funciones: `cargarProductosML()`, `syncML()`, `setupMLListener()`
- Variables: `mlUserId`, `mlConnected`
- Referencias dispersas en el código

**Por qué:** Si rompes esto, pierdes la sincronización con la cuenta de Mercado Libre del cliente. Los productos dejan de sincronizarse.

**Cómo sé que no lo toqué:** Busca "mercado" en tu editor y ve si hiciste cambios. Si no aparece en la lista de cambios de `git`, estás seguro.

## Firebase (la base de datos)

Colecciones principales:
- `usuarios` — quiénes pueden entrar
- `clientes` — clientes registrados
- `ventas` — registro de todo vendido
- `productos` — inventario
- `envios` — envíos registrados
- `config` — configuración del sistema

**Importante:** NO modifiques la estructura de las colecciones desde Firebase console a mano. Siempre través del código de la app.

## Debugging (cómo encontrar errores)

1. Abre el navegador y presiona F12 (Herramientas de Desarrollador)
2. Ve a la pestaña "Console"
3. Si hay un error rojo, léelo — te dice qué línea (o cerca) está el problema
4. Si es un error de Firebase, probablemente falten permisos en la base de datos

## Estilo de código

El archivo usa:
- **Template literals:** `` `Hola ${nombre}` `` (cómodo para HTML)
- **Arrow functions:** `(x) => x * 2` (funciones cortas)
- **ES6 const/let:** no uses `var`, anticuado
- **IDs con prefijos:** `env-fecha`, `cli-nombre` (para saber a qué módulo pertenecen)

## Checklist antes de publicar

- [ ] Ejecuta `git status` y ve que solo cambiaste lo que querías
- [ ] Ejecuta `node --check public/index.html` (debería decir "OK")
- [ ] Prueba en el navegador (F12 Console debe estar limpia de errores)
- [ ] Mercado Libre sigue funcionando (si lo tocaste, verifica)
- [ ] Haz commit con mensaje claro
- [ ] Haz git push
- [ ] Entra a vercel.com y ve que el deploy pasó ✅

---

**Última actualización:** 2025-05-16
