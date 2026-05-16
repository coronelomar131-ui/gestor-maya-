# 🚗 Maya Autopartes — Sistema de Gestión

## ¿Qué es esto?

Es un programa que vive en internet (en una página web) y le ayuda al negocio de Maya Autopartes a llevar todo organizado: clientes, ventas, productos, envíos, dinero, todo. Antes se anotaba en hojas y Excel. Ahora se hace aquí, y todos lo ven al mismo tiempo desde cualquier compu o celular.

## ¿Quién lo usa?

- **Omar** — el dueño (ve y maneja todo)
- **Israel y Eliza** — los vendedores (crean ventas, registran clientes)
- **El de almacén** — registra inventario y envíos
- **El de entregas** — actualiza estado de paquetes

## ¿Cómo funciona por dentro?

Imagínalo como una libreta gigante guardada en la nube de Google (Firebase). Cuando alguien escribe algo, automáticamente todos los demás ven el cambio. Esa "libreta" se llama **Firestore**.

La parte que tú ves (botones, tablas, formularios) está en UN solo archivo: `public/index.html`.

## ¿Qué hay adentro?

| Módulo | Para qué sirve |
|---|---|
| 🏠 Dashboard | Vista rápida de cómo va el negocio (números importantes) |
| 👥 Clientes | Quién nos compra (nombre, teléfono, dirección) |
| 💰 Ventas | Lo que vendimos, a quién, cuánto, si ya pagó |
| 📦 Inventario | Qué productos tenemos y cuántos quedan |
| 📄 Documentos | Las notas y facturas de cada venta |
| 🚚 Envíos | Paquetes que mandamos, con guía y estado |
| 💸 Finanzas | Préstamos y pagos (solo el dueño los ve) |
| 👤 Usuarios | Quiénes pueden entrar al sistema (solo el dueño) |
| 🛒 Mercado Libre | Productos sincronizados con la cuenta de ML |
| ⚙️ Configuración | Datos de la empresa y avance del sistema |

## ¿Cómo lo arreglo si se rompe?

1. Abre `public/index.html` en VS Code
2. Mira la consola del navegador (F12) para ver el error
3. **NO toques lo de Mercado Libre** (es zona prohibida)
4. **NO toques las funciones que dicen "CRÍTICA" en los comentarios**
5. Si dudas, copia este README a Claude y dile qué pasó

## ¿Cómo lo publico cuando hago cambios?

```bash
node --check public/index.html   # revisa que no haya errores
git add .
git commit -m "qué cambiaste"
git push                          # Vercel lo sube solo a internet
```

Si Vercel marca error rojo, entra a vercel.com y ve el log.

## Colores y estilo

- Azul marino oscuro: `#1E4F7A` (el principal)
- Turquesa: `#3BBCD4` (los acentos)
- Naranja: `#ff8c00` (resaltar)
- Verde: `#10B981` (cosas buenas / entregado)
- Rojo: `#EF4444` (cosas malas / devuelto)
- Amarillo: `#FCD34D` (pendiente / atención)

## Reglas importantes

- ⛔ **NUNCA** tocar Mercado Libre (ya está conectado, si lo rompes pierdes inventario)
- ⛔ **NUNCA** borrar las funciones `saveEnvio`, `deleteEnvio`, `cargarEnvios`
- ⛔ **NO** usar Firebase Storage (el plan es gratis, no tiene Storage)
- ✅ Guardar siempre antes de subir
- ✅ Probar en pantalla antes de avisar al team

## 📚 Documentación técnica

Para entender mejor cómo está estructurado el código, lee [`docs/GUIA_TECNICA.md`](docs/GUIA_TECNICA.md).

## ¿Dudas?

Habla con Omar o pásale este README a Claude (la IA) y pídele ayuda.

---

**Última actualización:** 2025-05-16
