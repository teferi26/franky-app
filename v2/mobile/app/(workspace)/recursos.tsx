import React from 'react';
import { WorkspaceResources } from '@/components/WorkspaceScreens';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { primaryResource } from '@/lib/workspaces';
import { ProfessionalTab } from '@/components/card/ProfessionalWorkspace';
export default function Resources() { const { active } = useWorkspace(); return active?.kind === 'leisure' ? <ProfessionalTab index={1} /> : active ? <WorkspaceResources type={primaryResource(active.kind)} /> : null; }
