"use client";

import type { StudentProfile } from "../types";
import { RIASEC_KEYS } from "../types";

interface ProfileRadarProps {
  profile: StudentProfile;
}

const RIASEC_LABELS: Record<string, string> = {
  R: "Realista", I: "Investigador", A: "Artístico",
  S: "Social", E: "Emprendedor", C: "Convencional",
};

// Radar RIASEC dibujado con los tokens del sistema (variables CSS, sin hex
// sueltos): retícula hairline, área violeta translúcida y puntos violeta con
// halo del color de fondo. Cambia solo con el modo oscuro.
export default function ProfileRadar({ profile }: ProfileRadarProps) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const values = RIASEC_KEYS.map((k) => profile.riasec[k] || 0);
  const maxVal = Math.max(...values, 1);
  const levels = 4;

  const getPoint = (index: number, value: number): [number, number] => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
    const r = (value / maxVal) * (size / 2 - 35);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const gridPolygons = Array.from({ length: levels }, (_, l) => {
    const frac = (l + 1) / levels;
    return RIASEC_KEYS.map((_, i) => getPoint(i, maxVal * frac).join(",")).join(" ");
  });

  const dataPoints = RIASEC_KEYS.map((_, i) => getPoint(i, values[i]));
  const dataPolygon = dataPoints.map((p) => p.join(",")).join(" ");

  // Find top 2
  const sorted = RIASEC_KEYS.map((k) => ({ key: k, val: profile.riasec[k] || 0 }))
    .sort((a, b) => b.val - a.val);
  const top2 = sorted.slice(0, 2);

  return (
    <div>
      <svg role="img" aria-label="Perfil de intereses RIASEC" viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[280px]">
        {/* Retícula */}
        {gridPolygons.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke="var(--color-border)" strokeWidth="1" />
        ))}
        {/* Ejes */}
        {RIASEC_KEYS.map((_, i) => {
          const [x, y] = getPoint(i, maxVal);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1" />;
        })}
        {/* Área de datos */}
        <polygon
          points={dataPolygon}
          fill="color-mix(in srgb, var(--color-violet) 14%, transparent)"
          stroke="var(--color-violet)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Puntos */}
        {dataPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4.5" fill="var(--color-violet)" stroke="var(--color-bg-primary)" strokeWidth="2" />
        ))}
        {/* Etiquetas */}
        {RIASEC_KEYS.map((c, i) => {
          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          const labelR = size / 2 - 12;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const highlighted = top2.some((t) => t.key === c);
          return (
            <text
              key={c}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-heading text-[12px] font-bold"
              style={{ fill: highlighted ? 'var(--color-violet)' : 'var(--color-text-muted)' }}
            >
              {c}
            </text>
          );
        })}
      </svg>

      {/* Dominantes */}
      <p className="mt-4 text-center text-sm text-text-secondary">
        Tu perfil dominante:{" "}
        <strong className="font-semibold text-violet">{RIASEC_LABELS[top2[0].key]}</strong>
        {" + "}
        <strong className="font-semibold text-violet">{RIASEC_LABELS[top2[1].key]}</strong>
      </p>
    </div>
  );
}
