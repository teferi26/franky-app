/**
 * Bloque de datos estructurados (JSON-LD).
 *
 * A proposito NO lleva `nonce`, y eso no es un descuido: un
 * `<script type="application/ld+json">` es un bloque de DATOS, no de codigo.
 * El navegador nunca lo "prepara" como script, asi que la comprobacion de
 * `script-src` de la CSP no llega a ejecutarse sobre el. Ponerle nonce obligaba
 * a leer `headers()` en la pagina, y eso la marcaba como dinamica: fue justo lo
 * que impedia prerenderizar las fichas de catalogo, que son las paginas donde
 * mas importa.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Se escapa '<' siempre: buena parte de estos datos sale de texto libre
      // (Wikipedia, Wikidata, descripciones de usuario) y un '</script>'
      // incrustado cerraria la etiqueta e inyectaria markup. Sigue siendo
      // JSON-LD valido para Google (< es un escape JSON legitimo).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
