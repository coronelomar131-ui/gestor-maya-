# 🔧 CONTEXTO - Gestor Maya Autopartes

## 📊 Estado del Proyecto
- **App:** Gestor de inventario + notas + facturas para autopartes
- **Tech:** HTML/JS vanilla + Firebase Firestore + Vercel
- **Repo:** https://github.com/coronelomar131-ui/gestor-maya-
- **Archivo principal:** `/public/index.html` (~5000 líneas)
- **Estado general:** 95% completo

## 🔴 PROBLEMA ACTUAL: MÓDULO DOCUMENTOS

### Síntomas
1. **Buscador NO funciona correctamente**
   - Busca "1" → ENCUENTRA documentos ✅
   - Busca "1060" (siniestro) → NO ENCUENTRA NADA ❌

2. **Console logs muestran:**
   - `🔍 Buscando: "1060" en 11 elementos`
   - `✅ Mostrando 0 documentos`

3. **El problema:** Los siniestros NO se están extrayendo/guardando en `notasData`

### Dónde está el código
- **Línea 3906:** `window.cargarDocumentos()` - Carga ventas de Firebase
- **Línea 3942:** `mostrarNotasDocumentos()` - Renderiza lista
- **Línea 3963:** `window.docAbrirPreview()` - Abre modal con preview
- **Línea 4006:** `window.buscarDocumentos()` - Filtra por búsqueda

### Estructura de datos esperada
```javascript
notasData = [
  {
    id: "doc123",
    n: 1,                    // Número de nota
    cli: "Cliente ABC",      // Cliente
    tot: 1200,              // Total
    st: "Pendiente",        // Status
    por: "Vendedor",        // Creador
    sin: "1060",            // <-- SINIESTRO (AQUÍ ESTÁ EL PROBLEMA)
    items: [{...}],         // Items vendidos
    fecha: "25/05/2026"
  }
]
```

### Donde se extraen los siniestros (línea ~3919)
```javascript
let sin = v.siniestros || '';
if (!sin && v.items && v.items.length > 0) {
  sin = v.items.map(it => it.numSiniestro || it.siniestro).filter(Boolean).join(' | ');
}
```

## 🛠️ QUÉ HAY QUE ARREGLAR

1. **Verificar que los siniestros se extraen CORRECTAMENTE**
   - Agregar console.log para debuggear
   - Ver si `v.siniestros` existe o está en `v.items`

2. **La búsqueda no encuentra los siniestros**
   - `buscarDocumentos()` busca en `(n.cli + ' ' + n.sin).toLowerCase()`
   - Pero `n.sin` probablemente está vacío

3. **Posibles causas:**
   - Los siniestros no se guardan en Firebase como `siniestros`
   - Los siniestros están en un campo diferente
   - El filter/map no está extrayendo bien

## 📝 HTML del módulo (línea ~1474)
```html
<div class="module-view" id="mod-documentos">
  <div style="margin-bottom:20px">
    <input type="text" id="doc-search-input" placeholder="Buscar por cliente o siniestro..."
           style="..." oninput="buscarDocumentos()">
  </div>
  <div id="doc-contenedor" style="..."></div>
</div>
```

## 🎯 Lo que se necesita hacer

### 1. DEBUG: Ver qué se está extrayendo
Agregar logs en `cargarDocumentos()` para ver:
```javascript
console.log('Venta:', v.clienteNombre, 'Siniestros:', sin);
console.log('Items encontrados:', v.items);
```

### 2. ARREGLAR: Asegurar que se guarda en notasData
Verificar que `sin` tiene valor antes de agregarlo al objeto

### 3. VERIFICAR: La búsqueda filtre correctamente
Debuggear `buscarDocumentos()` con logs

### 4. LIMPIAR: Caché del navegador
- El usuario ve código viejo en caché
- Necesita hard refresh (Ctrl+Shift+R) o modo incógnito

## 📂 Archivos importantes
- **index.html:** `/public/index.html` - Código principal
- **Firebase collection:** `ventas` - Donde se guardan las ventas

## 🚀 Testing
Para probar:
1. Abrir DevTools (F12)
2. Ir a Console
3. Abrir módulo Documentos
4. Ver los logs de debug
5. Buscar "1060" (siniestro)
6. Ver si aparece en resultados

---
**Última actualización:** 2026-05-26
**Por:** Omar (coronelomar131@gmail.com)
