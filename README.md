# Comparador de perfumes

Web app personal que consulta a la vez las tiendas argentinas de perfumes árabes que compro
y muestra precio y stock de todas juntas, ordenadas de la más conveniente a la menos.

Está hecha en **Google Apps Script**: `Code.gs` es el backend y `Index.html` la interfaz.
No hay build, no hay dependencias, no hay servidor propio.

## Qué hace

- Busca en **13 tiendas** al mismo tiempo (una sola búsqueda, un solo resultado ordenado).
- Ordena por **precio por mililitro**, que es la comparación honesta entre frascos de distinto
  tamaño. Cuando el tamaño no figura en el nombre asume 100 ml y lo marca con `~`.
- Contempla el **descuento por transferencia** de cada tienda y ordena con el precio real.
- **Agrupa el mismo perfume** vendido por distintas tiendas en una sola fila, ignorando la
  marca y el tamaño al comparar los nombres.
- **Verifica el stock** contra la ficha real del producto en las tiendas que no lo publican
  de forma confiable en el listado.
- Filtra decants y muestras, que no son comparables con un frasco.
- Guarda favoritos con precio objetivo y avisa por mail cuando alguna tienda baja.
- Arma un carrito propio, con link directo al carrito real en West Import.

## Las tiendas y cómo se leen

Cada tienda usa una plataforma de e-commerce distinta, y cada plataforma se lee diferente:

| Plataforma | Tiendas | Cómo se obtienen los datos |
|---|---|---|
| Shopify | West Import | API pública de sugerencias (`/search/suggest.json`) |
| WooCommerce | Rincón Perfumado | Store API (`/wp-json/wc/store/v1/products`) |
| Tiendanube | Esencias Oasis, Tom's Parfum Club, Ambrosía, Milrah | HTML de la página de búsqueda |
| Pency | Vaphouse | JSON embebido en el HTML |
| Empretienda | Un Koala Perfumado, Imperium Fragans | HTML de la página de búsqueda |
| Pedix | Huelepectacular, Idalium Parfums | JSON embebido en el HTML |
| TiendaNegocio | Bancoperfumes, Klutch Shop | JSON embebido y escapado en el HTML |

Las que se leen del HTML dependen del tema de la tienda y **pueden romperse cuando la tienda
lo cambia**. Si una devuelve cero resultados, es lo primero para mirar.

## El stock no es igual en todas

Cada resultado dice de dónde salió su estado de stock, y la interfaz no muestra como certeza
lo que es una deducción:

- **`dato`** — la tienda lo publica en su propia API. Es firme.
- **`cartel`** — se dedujo de un cartel en el HTML del listado (Tiendanube). Si cambian la
  plantilla, dejamos de verlo.
- **`ficha`** — se confirmó abriendo la página del producto. Aparece con un ✓ en la interfaz.
- **`null`** — la tienda no lo dice. Se muestra como `CONSULTAR`, que no significa "no hay".

Empretienda no publica stock en el listado, así que esos productos arrancan en `CONSULTAR` y
se confirman abriendo la ficha. Shopify queda afuera de esa verificación a propósito: la ficha
de West Import viene dando falsos negativos.

## Cómo instalarlo

1. Crear un proyecto en [script.google.com](https://script.google.com).
2. Pegar `Code.gs` en el archivo de código y `Index.html` en un archivo HTML llamado `Index`
   (sin extensión, así lo nombra Apps Script).
3. Implementar como aplicación web.

**Al actualizar hay que crear una versión nueva** (Implementar → Gestionar implementaciones →
lápiz → Versión: Nueva). Guardar sin crear versión deja la web app sirviendo el código viejo.

## Agregar una tienda

Solo se toca `SITES` en `Code.gs`. El frontend recibe la lista con `listarConfig()`, así que
el panel de tiendas y el contador del subtítulo se actualizan solos. Lo mismo con las marcas:
viven en `MARCAS_CONOCIDAS` y de ahí salen los chips de búsqueda.

Si la tienda usa una plataforma ya soportada, no hace falta escribir ningún scraper.
