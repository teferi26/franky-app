"use client";
import { useEffect, useRef } from 'react';
import { trackAcademicConsultation } from '@/lib/academic-analytics';

/** Records only a rendered academic detail, after optional analytics consent. */
export default function AcademicConsultation({ kind, entityId }: { kind: 'university' | 'career' | 'cutoff'; entityId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void trackAcademicConsultation(kind, entityId); }
    });
    observer.observe(element); return () => observer.disconnect();
  }, [kind, entityId]);
  return <span ref={ref} aria-hidden="true" className="block h-px w-px" />;
}
