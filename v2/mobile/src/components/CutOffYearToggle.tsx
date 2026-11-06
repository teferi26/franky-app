import React from 'react';
import { History } from 'lucide-react-native';
import { Chip } from '@/components/ui';
import { cutOffViewLabel, type CutOffView } from '@/lib/cut-off-year';

/**
 * Único conmutador entre las notas del curso vigente y las del anterior
 * (paridad con la web). Por defecto se ve el vigente; el chip ofrece siempre
 * el otro curso y queda marcado mientras se ven las notas antiguas.
 */
export function CutOffYearToggle({ view, onChange }: { view: CutOffView; onChange: (next: CutOffView) => void }) {
  const other: CutOffView = view === 'current' ? 'previous' : 'current';
  return (
    <Chip
      icon={History}
      label={`Ver notas ${cutOffViewLabel(other)}`}
      active={view === 'previous'}
      onPress={() => onChange(other)}
      accessibilityHint={`Ahora ves las notas ${cutOffViewLabel(view)}`}
    />
  );
}
