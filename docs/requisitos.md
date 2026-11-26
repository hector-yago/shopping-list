# Requisitos (v1)

Origen: petición del usuario (2026-11-23), redefinida y validada con una maqueta navegable. Trazabilidad: cada requisito indica dónde se verifica.

| Id | Requisito | Verificación |
|---|---|---|
| R1 | Una sola lista de la compra; el supermercado elegido filtra y marca qué productos salen. | `list.test` (lista), e2e |
| R2 | Catálogo de súpers de España precargado; crear otros; ocultar (desactivar) los que no interesan. Solo los activos salen en Compra y en las fichas. | `list.test` (súpers), `store.test`, e2e |
| R3 | Lista de **habituales** con alta, edición y baja. | e2e (Habituales) |
| R3b | En Habituales se puede **ocultar/mostrar** un producto, **filtrar** (Visibles · Ocultos · Todos) y **ordenar** (A–Z · última compra); se recuerda la elección. Los ocultos reaparecen al finalizar la compra. Los que ya están en la lista llevan la etiqueta verde «En la lista». | unitarios (`list.test`, `store.test`) y e2e (Habituales) |
| R4 | Por habitual: nivel por súper (preferido / válido / no válido); sin marcar = válido. | `list.test`, `store.test` (saneado) |
| R5 | Por habitual: historial de compras con fecha, súper, cantidad y precio (si lo hay); se puede añadir/borrar a mano. | e2e, `stats.test` |
| R6 | Pestaña **Compra**: añadir (nuevo o habitual), eliminar, marcar comprado, marcar no disponible, desmarcar, finalizar. | e2e |
| R7 | No disponible: sale de pendientes durante la compra y vuelve a pendiente al finalizar. | `list.test` (finalizar), e2e |
| R8 | Ver lo llevado y lo que falta: círculo `(comprados + no disponibles)/total` (verde/rojo/resto) e importes Llevo/Faltan. | e2e |
| R9 | Orden alfabético por defecto; alternativa por fecha de última compra ascendente y descendente. | `list.test` (orden), e2e |
| R10 | Iconos de súper entre nombre y precio: «Todos» → preferidos; en un súper → otros preferidos si este no lo es; sin preferido, nada. Pendiente «no válido» en el súper elegido: oculto. | `list.test` (iconos, ocultos), e2e |
| R11 | Precio y unidades editables al tocar la fila; cantidades decimales (0,5 kg); por defecto el precio medio histórico. | `list.test`, e2e |
| R12 | Aviso ⬆ caro / ⬇ barato frente al historial propio del producto. | `list.test` (precio caro/barato) |
| R13 | Pocos toques: buscador con autocompletado, selección múltiple de habituales, bolita de un toque. | e2e |
| R14 | Pestaña **Estadísticas**: precios de las últimas compras, gasto 30 días, evolución por producto. | `stats.test`, e2e |
| R15 | Datos entre versiones sin pérdida; export/import JSON y copias automáticas. | `store.test`, `docs/datos-y-migraciones.md` |

## Supuestos (aprobados por el usuario al aprobar el diseño)
- El historial guarda solo el precio escrito a mano; sin precio queda «sin precio» y no contamina la media.
- La media usa las últimas 5 compras con precio; caro/barato exige ≥2 y usa ±15 % (ajustable 10–25 %).
- Los productos nuevos creados en Compra pasan a Habituales.
- El círculo cuenta productos (no unidades) y solo los visibles (no los ocultos por «no válido»).
- Al finalizar con «Todos» se pregunta el súper (por defecto, el último usado).

## Fuera de v1
Sincronización iPhone↔PC o compartir la lista, categorías por pasillo, logotipos oficiales, notificaciones.
