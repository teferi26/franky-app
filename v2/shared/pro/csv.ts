/** Los datos de clientes se exportan como texto, nunca como fórmulas. */
export function proCsvCell(value: string): string {
  const text = /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}
