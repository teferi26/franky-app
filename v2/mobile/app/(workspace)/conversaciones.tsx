import React from 'react';
import { WorkspaceResources } from '@/components/WorkspaceScreens';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { ProfessionalTab } from '@/components/card/ProfessionalWorkspace';
export default function Conversations() { const { active } = useWorkspace(); return active?.kind === 'leisure' ? <ProfessionalTab index={3} /> : active ? <WorkspaceResources type={active.kind === 'university' ? 'moderation' : 'conversation'} alternate={active.kind === 'university' ? ['post'] : undefined} /> : null; }
