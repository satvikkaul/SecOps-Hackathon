import type { RankedAction } from '../engine/actions';
import { buildRiskRegister, registerCsv } from '../engine/register';
import type { Assessment } from '../engine/scoring';
import type { Answers, Profile } from '../engine/types';
import { Button } from './ui';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function RiskRegisterButton({
  assessment,
  ranked,
  profile,
  answers,
  company,
  className = '',
}: {
  assessment: Assessment;
  ranked: RankedAction[];
  profile: Profile;
  answers: Answers;
  company?: string;
  className?: string;
}) {
  const download = () => {
    const today = new Date();
    const csv = registerCsv(buildRiskRegister(assessment, ranked, profile, answers, today));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = ['risk-register', slug(company ?? ''), today.toISOString().slice(0, 10)].filter(Boolean).join('-') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="secondary" onClick={download} className={className}>
      Download risk register (CSV)
    </Button>
  );
}
