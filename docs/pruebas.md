# Pruebas

## Automáticas (ejecutadas)
- `npm test`: 27 unitarios (formato, súpers, iconos, ocultos, precios/media, orden, finalizar, estadísticas, migración con fixture v1, saneado, import/export, copias).
- `node tests/e2e/e2e.mjs [--shots=carpeta]`: recorrido completo en Edge headless (390×844): lista vacía, semilla, chips de súpers, iconos por súper, ocultos por «no válido», comprado/no disponible y círculo, cantidad decimal y precio, buscador (habitual y nuevo), finalizar, estadísticas y gráfico, ficha de habitual, súpers (desactivar/crear), persistencia tras recargar, orden, tema oscuro, exportación, service worker y manifiesto.

## Manual en iPhone (pendiente; no automatizable aquí)
1. Abrir la URL de Pages en Safari → Compartir → Añadir a pantalla de inicio; abrir desde el icono.
2. Crear 3–4 productos con preferencias distintas y comprobar iconos/ocultos al cambiar de súper.
3. Poner cantidad decimal y precio (teclado decimal: coma o punto), marcar comprado y finalizar; ver la compra en Estadísticas.
4. Cerrar del todo la app y reabrirla: los datos siguen.
5. Modo avión: abre y funciona sin conexión.
6. Exportar (hoja Compartir) y guardar en Archivos; probar Importar.
7. Comprobar con el tema oscuro y con texto grande del sistema.
