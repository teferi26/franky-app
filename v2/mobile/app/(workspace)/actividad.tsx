import React from 'react';
import { WorkspaceMembers, WorkspaceResources } from '@/components/WorkspaceScreens';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { secondaryResource } from '@/lib/workspaces';
import { ProfessionalTab } from '@/components/card/ProfessionalWorkspace';
export default function Activity() { const { active } = useWorkspace(); return active?.kind === 'leisure' ? <ProfessionalTab index={2} /> : active ? active.kind === 'community' ? <WorkspaceMembers /> : <WorkspaceResources type={secondaryResource(active.kind)} /> : null; }
