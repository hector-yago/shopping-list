# Datos entre versiones

Los datos no se pierden al actualizar la app. Mecanismo (igual que task-reminder):

1. **Documento versionado**: `schemaVersion` (actual: `CURRENT_SCHEMA` en `js/migrations.js`). Todo se guarda como un único documento en IndexedDB (`js/store.js`, base `shopping-list`), escrito de forma atómica.
2. **Forma del documento (v1)**: `stores[]` (súpers de la base + personalizados, con `active`), `products[]` (`name`, `unit`, `defaultQty`, `prefs{storeId: 'p'|'n'}`, `history[]` con `date/storeId/storeName/qty/price/pid`), `items[]` (la lista: `productId`, `qty`, `price|null`, `status`), `settings`, `meta`.
3. **Migraciones**: un paso por versión (`N → N+1`), puro e idempotente, que no elimina datos. Un paso publicado **nunca se edita**; se añade otro.
4. **Copia previa**: antes de migrar se guarda un snapshot del documento original (últimas 7). También antes de importar o restaurar; y una copia automática al día.
5. **Datos de una versión más nueva**: error visible y **no se toca nada**.
6. **Saneado** (al migrar, importar y en cada cambio): descarta solo lo irrecuperable (productos sin nombre, líneas con fecha inválida, elementos huérfanos o duplicados) y completa los súpers de la base si faltan.
7. **Copias manuales**: Súpers → Exportar (fichero `.json`, vía «Compartir» en iOS) e Importar (fusionar o reemplazar). Aviso tras 14 días sin exportar.
8. **Almacenamiento**: se pide `navigator.storage.persist()`; en iOS, la PWA instalada no se purga por inactividad (Safari en pestaña sí puede).

## Cómo cambiar el esquema
1. Subir `CURRENT_SCHEMA` y añadir `steps[N]` en `migrations.js`.
2. Guardar el fixture de la versión anterior en `tests/fixtures/vN.json` (el de la v1 ya existe).
3. Añadir un test que lo migre a la actual sin perder nada (`tests/store.test.mjs`).
4. Anotarlo aquí y subir la versión de la app.
