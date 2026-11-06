/** Versioned public workspace contract. Membership, not this UI model, authorizes operations. */
export const WORKSPACE_KINDS = ['housing', 'community', 'leisure', 'university'] as const;
export type WorkspaceKind = typeof WORKSPACE_KINDS[number];
export const WORKSPACE_ROLES = ['owner', 'admin', 'editor', 'moderator', 'analyst', 'finance', 'checkin', 'member'] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];
export const WORKSPACE_PERMISSIONS = ['resource.read', 'content.manage', 'members.read', 'members.manage', 'finance.read', 'finance.manage', 'moderation.manage', 'analytics.read', 'attendees.manage', 'settings.manage'] as const;
export type WorkspacePermission = typeof WORKSPACE_PERMISSIONS[number];
export type Workspace = {
  id: string; kind: WorkspaceKind; subtype: string | null; name: string; slug: string;
  city: string | null; verification_status: 'unverified' | 'pending' | 'verified';
  role: WorkspaceRole; permissions: WorkspacePermission[]; demo_cohort_id: string | null;
  status: 'active' | 'suspended' | 'archived';
};
export type WorkspaceResourceType = 'housing' | 'visit' | 'community' | 'event' | 'venue' | 'post' | 'academic' | 'conversation' | 'moderation';
export type WorkspaceResource = {
  id: string; type: WorkspaceResourceType; title: string; subtitle: string | null;
  status: string; starts_at?: string | null; image_url?: string | null;
  data: Record<string, unknown>; updated_at?: string;
  published_data?: Record<string, unknown> | null; source_revision?: number; draft_source_revision?: number | null;
  has_unpublished_changes?: boolean; source_changed_since_draft?: boolean;
};
export type WorkspaceResourcePage = { items: WorkspaceResource[]; next_cursor: string | null };
export type WorkspaceMetric = { key: string; label: string; value: number | null; unit?: string; suppressed?: boolean; period_label?: string; source?: string };
export type WorkspaceDashboard = { organization: Workspace; metrics: WorkspaceMetric[]; notes?: string[]; activity: { id: string; action: string; created_at: string }[]; resources: WorkspaceResource[] };
export type WorkspaceMember = { user_id: string; display_name: string; role: WorkspaceRole; status: string; joined_at: string };
export const WORKSPACE_LABELS: Record<WorkspaceKind, string> = { housing: 'Propietario / Inmobiliaria', community: 'Comunidad / Organizador', leisure: 'Ocio / Negocio', university: 'Universidad' };
export const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: 'Propietario del espacio', admin: 'Administrador', editor: 'Editor', moderator: 'Moderador', analyst: 'Analista', finance: 'Finanzas', checkin: 'Control de acceso', member: 'Miembro' };
export function canUseWorkspace(workspace: Pick<Workspace, 'status' | 'permissions'>, permission: WorkspacePermission): boolean {
  return workspace.status === 'active' && workspace.permissions.includes(permission);
}
export function workspaceResourceTypes(kind: WorkspaceKind): WorkspaceResourceType[] {
  if (kind === 'housing') return ['housing', 'visit', 'conversation'];
  if (kind === 'community') return ['community', 'event', 'post', 'conversation'];
  if (kind === 'leisure') return ['venue', 'event', 'post', 'conversation'];
  return ['academic', 'event', 'post', 'moderation'];
}
