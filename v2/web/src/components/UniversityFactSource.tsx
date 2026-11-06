import { universityCheckedDate, type UniversityEvidence } from '@/lib/university-evidence';

export default function UniversityFactSource({ evidence, period = false }: { evidence: UniversityEvidence | null; period?: boolean }) {
  if (!evidence) return period ? <p className="mt-1 text-xs font-normal text-text-muted">Periodo no documentado</p> : null;
  return <div className="mt-2 space-y-1 text-xs font-normal leading-relaxed text-text-muted">
    {period && <p>{evidence.period ?? 'Periodo no documentado'}</p>}
    {evidence.note && <p>{evidence.note}</p>}
    <p>Comprobado el {universityCheckedDate(evidence.checked_at)}.</p>
    <ul className="space-y-1">{evidence.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-violet underline underline-offset-2">{source.title}</a></li>)}</ul>
  </div>;
}
