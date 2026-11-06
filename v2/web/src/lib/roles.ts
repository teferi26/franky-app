/**
 * Roles de `profiles.role` cuya cuenta NO es de estudiante.
 *
 * Un propietario se da de alta en /negocio/alta: viene a publicar pisos y a
 * gestionar sus visitas, no a estudiar. Pedirle universidad, carrera, curso o
 * preferencias de compañero de piso (o enseñarle becas, notas de corte, test
 * vocacional, RoomieMatch o Crush) es ruido puro, y así nos lo dijo el primer
 * propietario real que se registró.
 *
 * El mismo criterio vale para un gestor de universidad (university_admin):
 * entra a administrar la ficha de su campus, no a buscar piso.
 *
 * Los roles de staff (admin, analyst) NO entran aquí a propósito: son cuentas
 * de personas que además usan Franky como estudiantes.
 */
export const NON_STUDENT_ROLES: ReadonlySet<string> = new Set([
  "propietario",
  "university_admin",
]);

/** ¿Esta cuenta es de las que no deben ver nada de estudiante? */
export function isNonStudentRole(role: string | null | undefined): boolean {
  return !!role && NON_STUDENT_ROLES.has(role);
}

/**
 * Dónde tiene sentido llevar a una cuenta que no es de estudiante cuando la
 * echamos de una pantalla que no le sirve.
 *
 * /uni ya no rebota a "/" cuando la cuenta no gestiona ninguna universidad:
 * explica qué falta y a quién escribir (agosto 2026). Al no haber bucle
 * posible, el gestor puede aterrizar directamente en su panel, igual que el
 * propietario.
 */
export function homeForRole(role: string | null | undefined): string {
  if (role === "propietario") return "/propietario/dashboard";
  if (role === "university_admin") return "/uni";
  return "/";
}
