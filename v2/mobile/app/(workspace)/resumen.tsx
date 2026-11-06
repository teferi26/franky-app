import React from 'react';
import { WorkspaceHome } from '@/components/WorkspaceScreens';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { ProfessionalTab } from '@/components/card/ProfessionalWorkspace';
export default function Summary() { const { active } = useWorkspace(); return active?.kind === 'leisure' ? <ProfessionalTab index={0} /> : <WorkspaceHome />; }
