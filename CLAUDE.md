# shopping-list

PWA personal de lista de la compra: una sola lista que se filtra por supermercado según las preferencias de cada producto habitual, con precios, historial y estadísticas. Proyecto **nuevo**, contexto **personal**. Se instala en el iPhone desde GitHub Pages (sin App Store) y se lanza en el PC desde My Tools. Mismo estilo y patrón que `task-reminder`.

## Stack y comandos
- JS plano modular (ES modules), **sin build ni dependencias**. Node 22 solo para tests, servidor local y e2e.
- `npm test` (unitarios, `node --test`) · `node tests/e2e/e2e.mjs [--shots=carpeta]` (Edge/Chrome headless por CDP) · `npm run icons` · `npm run version:sync`.
- Servidor local: `node serve.mjs [puerto]` (8096). My Tools lo arranca con `abrir-shopping-list.ps1` (`-Parar`, `-SoloComprobar`).

## Reglas de diseño (decisiones en `docs/adr/`, requisitos en `docs/requisitos.md`)
- Una sola lista (`items`, un elemento por producto) sobre un catálogo de **productos habituales** (`products`); crear un producto desde Compra lo añade a Habituales.
- Preferencia por súper: `p` preferido · `n` no válido · sin marcar = **válido**. Con un súper elegido, los pendientes «no válido» se ocultan (línea desplegable «N ocultos»).
- Iconos de súper entre nombre y precio (`list.iconStores`): en «Todos», los súpers preferidos; en un súper concreto, solo los OTROS preferidos y solo si ese súper no es el preferido del producto. Sin preferidos, sin iconos. No hay colores de «válido».
- Precio por **unidad de medida** (ud, kg, g, l); cantidades decimales. Sin precio manual se usa la **media de las últimas 5 compras con precio** (`≈`). Caro/barato: precio manual vs. esa media, ±`thresholdPct` (15 %), con ≥2 compras con precio.
- Finalizar: comprados → historial (fecha, súper, cantidad, precio si lo hay, `pid` de la compra) y salen de la lista; no disponibles → pendiente; pendientes se quedan. Se puede deshacer desde el aviso.
- Círculo de progreso: `(comprados + no disponibles) / total` de lo visible; verde comprados, rojo no disponibles.
- `js/format.js`, `stores.js`, `products.js`, `list.js`, `stats.js` y `migrations.js` son **puros** (sin DOM ni reloj): reciben «hoy» como clave `YYYY-MM-DD`. La interfaz vive solo en `js/app.js`.
- Persistencia: un único documento JSON (`js/store.js`) en IndexedDB. **Prohibido cambiar la forma de los datos sin migración + fixture + test** (`docs/datos-y-migraciones.md`).
- Sin push, sin backend, sin telemetría. Datos solo en el dispositivo; export/import JSON + copias automáticas. iPhone y PC **no se sincronizan** (fuera de v1).
- Los iconos de súper son círculos con siglas, no logotipos (derechos de marca).
- Tema claro/oscuro con tokens CSS (los de task-reminder); texto de interfaz en castellano; código en inglés.
- `?hoy=AAAA-MM-DD` y `window.__setToday`/`__store` solo funcionan en `localhost` (pruebas).
- El origen `localhost` es el de My Tools (datos del PC); usar siempre `localhost`, no `127.0.0.1`.

## Release (regla general del usuario; cada cambio)
1. Subir `version` en `package.json` y `npm run version:sync` (actualiza `js/version.js` y la caché del `sw.js`).
2. Tests + e2e en verde.
3. Cerrar solo la instancia en marcha (`abrir-shopping-list.ps1 -Parar`); My Tools la lanza de nuevo con lo último.
4. Publicar: `git push` a `main` (GitHub Pages; repo `hector-yago/shopping-list`). Subir a Pages requiere autorización expresa del usuario.
5. En el iPhone, la PWA se actualiza al abrirla con conexión (service worker red-primero).

## Pendiente conocido
- Repositorio remoto y GitHub Pages aún sin crear/publicar; commit inicial pendiente de autorización.
- Instalación y persistencia en iPhone real: prueba manual (`docs/pruebas.md`).
- Sincronización iPhone↔PC / compartir lista; categorías por pasillo; logotipos reales: fuera de v1 (ADR 0001).
