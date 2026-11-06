/**
 * Hojas del motor de vivienda. En la web viven en un único drawers.tsx; aquí
 * se reparten por tema para que se lean mejor y este archivo las reúne con
 * los mismos nombres que importa cada pantalla.
 */
export { SlotPicker, RentPill, DepositPill, INCIDENT_STATUS, IncidentPill, PRIORITY_LABEL, PriorityDot } from "./drawer-common";
export { LeadDrawer, NewLeadDrawer } from "./drawer-lead";
export { VisitDrawer, NewVisitDrawer } from "./drawer-visit";
export { TenantDrawer } from "./drawer-tenant";
export { IncidentDrawer } from "./drawer-incident";
export { PropertyDrawer, NewPropertyDrawer } from "./drawer-property";
