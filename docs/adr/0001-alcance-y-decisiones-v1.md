# ADR 0001 — Alcance y decisiones de la v1

Fecha: 2026-11-23 · Estado: aceptada (aprobada por el usuario tras revisar una maqueta navegable en tres iteraciones).

## Contexto
Lista de la compra personal para iPhone sin App Store, con el estilo y la arquitectura de `task-reminder`. El usuario quería una sola lista cuyo contenido dependa del supermercado y de preferencias por producto.

## Decisiones
1. **PWA en JS plano sin build**, publicada en GitHub Pages y lanzada en el PC desde My Tools (igual que task-reminder). Alternativa descartada: app nativa/App Store (el usuario no la quiere).
2. **Datos locales** (IndexedDB) con export/import y copias automáticas; sin backend ni sincronización. Coste: iPhone y PC tienen datos independientes.
3. **Una lista, un catálogo**: `items` referencia `products`; un producto solo puede estar una vez en la lista; crear uno desde Compra lo añade a Habituales (evita dos conceptos paralelos).
4. **Preferencias** `p`/`n` y «válido» implícito: menos toques y estados inconsistentes que un tercer valor explícito.
5. **Señal visual por iconos de súper**, no por colores azul/verde (el usuario rechazó el azul de «válido»). En un súper concreto solo se muestran los *otros* preferidos y solo si ese súper no es el preferido. Iconos = siglas de color, no logotipos (derechos de marca).
6. **Precio por unidad de medida** con cantidades decimales y unidad por producto (ud, kg, g, l). Total = precio × cantidad.
7. **Media de las últimas 5 compras con precio** como precio por defecto y referencia de caro/barato (±15 %, ajustable, ≥2 compras). Se compara contra el historial propio del producto (decisión del usuario), no entre súpers.
8. **Historial solo con precio explícito**: lo no tecleado se guarda sin precio para no sesgar la media.
9. **Finalizar**: comprados al historial, no disponibles vuelven a pendiente, pendientes se quedan (decisión del usuario); con deshacer.
10. **Estadísticas** derivadas del historial de productos (agrupado por `pid` de compra); sin tabla de compras aparte, para tener una única fuente de verdad.

## Consecuencias
- Borrar un producto borra su historial y sus líneas en estadísticas (se avisa al confirmar).
- Cambiar la unidad de un producto no convierte precios antiguos (la media mezclaría €/kg y €/ud): el usuario debe fijar la unidad al crearlo.
- Fuera de v1: sincronización/compartir lista, categorías por pasillo, logotipos reales, notificaciones.
