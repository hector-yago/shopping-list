# Lista de la compra

PWA personal para el iPhone (sin App Store): una única lista de la compra que se adapta al supermercado donde estás, con precios, historial y estadísticas. Los datos se guardan solo en tu dispositivo.

## Uso
- **Compra**: elige el súper arriba (o «Todos»), añade productos con el buscador (autocompleta tus habituales) o con ⭐, toca la bolita para marcar como comprado, «⋯» para no disponible, toca el precio para cambiar cantidad y precio, y «Finalizar compra».
- **Habituales**: tus productos con súper preferido / válido / no válido por producto e historial de precios.
- **Estadísticas**: gasto de los últimos 30 días, últimas compras y evolución del precio de cada producto.
- **Súpers**: activar/ocultar supermercados, crear otros, umbral de caro/barato, tema y copias.

## Desarrollo
```
npm test                 # unitarios
node tests/e2e/e2e.mjs   # extremo a extremo en Edge/Chrome headless
node serve.mjs           # http://localhost:8096/
```
Detalle de reglas y decisiones: `CLAUDE.md` y `docs/`.

## Instalar en el iPhone
Safari → abrir la URL de la app → Compartir → «Añadir a pantalla de inicio». Ábrela siempre desde ese icono.
