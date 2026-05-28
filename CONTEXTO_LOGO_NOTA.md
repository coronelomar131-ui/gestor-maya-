# 🎯 CONTEXTO: Logo en PDF de Notas - MAYA AUTOPARTES

## 📋 PROBLEMA
El logo SVG de MAYA AUTOPARTES **no aparece en el PDF** cuando se descarga una nota, aunque el código intenta cargarlo vía fetch.

## 🔍 LO QUE HICIMOS
1. Creamos una función `descargarNota()` async en `public/index.html`
2. Convertimos el logo JPEG a SVG vectorial
3. Guardamos el SVG en `public/maya-logo.svg`
4. Intentamos cargar el SVG vía fetch y convertirlo a data URI para incrustarlo en el PDF

## ❌ POR QUÉ NO FUNCIONA
- El fetch de `/maya-logo.svg` puede estar fallando
- jsPDF podría no soportar bien SVG como data URI
- Problema de CORS o rutas relativas en el contexto del PDF
- El SVG podría no estar en la ruta correcta cuando jsPDF intenta cargarlo

## 📁 ARCHIVOS INVOLUCRADOS
- `public/index.html` - Línea ~6188: Función `window.descargarNota`
- `public/maya-logo.svg` - El logo en formato vectorial

## 💻 CÓDIGO ACTUAL (Lo que NO funciona)

```javascript
window.descargarNota = async function(venta) {
  // ... código previo ...

  try {
    const svgResponse = await fetch('/maya-logo.svg');
    const svgText = await svgResponse.text();
    const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    doc.addImage(svgDataUri, 'SVG', M, y - 5, 80, 40);
  } catch(e) {
    console.warn('Logo SVG no disponible:', e);
  }

  y += 40;
  // ... resto del código ...
}
```

## ✅ LO QUE NECESITAMOS
Una solución para que el logo **DEFINITIVAMENTE APAREZCA** en el PDF. Opciones:

### Opción A: Usar JPEG Base64 embebido
- Convertir el JPEG a base64 completo
- Embebberlo directamente en la función (sin fetch)
- Garantiza que funcione 100%

### Opción B: Simplificar a formas PDF
- Dibujar el logo usando rectángulos, líneas y texto PDF
- No depende de archivos externos
- Funciona siempre

### Opción C: Arreglar el SVG
- Debuggear por qué el fetch no funciona
- Verificar rutas, CORS, etc.

## 📊 LOGO ORIGINAL
El logo es profesional:
- Símbolo "M" (blanco y rojo)
- Auto estilizado blanco
- Texto "MAYA" blanco + "AUTOPARTES" rojo
- Tagline: "La parte que necesitas"

## 🎯 OBJETIVO FINAL
Que al descargar una nota PDF, **EL LOGO MAYA APAREZCA EN LA PARTE SUPERIOR** grande y profesional.

---

**¿Gemi, puedes ayudarnos a resolver esto?**
