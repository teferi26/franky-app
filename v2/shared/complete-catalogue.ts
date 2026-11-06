/** Only return a catalogue after every page has succeeded. Callers must use a stable order. */
export async function completeCatalogue<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
  maxPages = 100,
): Promise<T[]> {
  const catalogue: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await fetchPage(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data) throw new Error('No se pudo cargar el catálogo completo. Inténtalo de nuevo.');
    catalogue.push(...data);
    if (data.length < pageSize) return catalogue;
  }
  throw new Error('El catálogo supera el límite de carga. Inténtalo de nuevo más tarde.');
}
