import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { toneClasses } from '../utils/format.js';

const ICONS = {
  Bajo: ShieldCheck,
  Medio: ShieldAlert,
  Alto: ShieldX,
};

/** Badge dinámico de Nivel de Riesgo ("Bajo" | "Medio" | "Alto"). */
export default function RiskBadge({ risk }) {
  if (!risk) return null;
  const Icon = ICONS[risk.level] ?? ShieldAlert;
  return (
    <span
      className={`chip border ${toneClasses[risk.tone]}`}
      title={`Índice de riesgo: ${risk.score}`}
    >
      <Icon size={13} strokeWidth={2.4} />
      Riesgo {risk.level}
    </span>
  );
}
