import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Coins,
  EyeOff,
  FileCheck2,
  Gauge,
  Link2,
  ListChecks,
  Lock,
  MailCheck,
  MessageCircle,
  Network,
  PlayCircle,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { BAND_STYLES, BandBadge, Button, CONTENT_ICONS, SCENARIO_COLORS } from '../components/ui';
import { applyFix, buildPlan, prioritizeActions } from '../engine/actions';
import { cccsStatuses, type ControlStatus } from '../engine/controls';
import { actions, demoPersona, profileQuestions, prompts, questions, scenarios, templates } from '../engine/data';
import { assess } from '../engine/scoring';
import { useAppStore } from '../store/appStore';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATUS_ORDER: ControlStatus[] = ['Met', 'Partially met', 'Not yet met', 'Not assessed'];
const STATUS_STYLES: Record<ControlStatus, string> = {
  Met: 'bg-emerald-50 text-emerald-700',
  'Partially met': 'bg-amber-50 text-amber-800',
  'Not yet met': 'bg-slate-100 text-slate-600',
  'Not assessed': 'bg-slate-50 text-slate-400',
};

/** The demo company's real results, from the same engine the report uses. */
function useDemoPreview() {
  return useMemo(() => {
    const { profile, answers } = demoPersona;
    const before = assess(profile, answers);
    const top = buildPlan(prioritizeActions(profile, answers)).top;
    const after = assess(profile, top.reduce((a, r) => applyFix(a, r.action.questionIds), answers));
    const controls = cccsStatuses(profile, answers)
      .filter((c) => c.status !== 'Not assessed')
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    return { before, after, top, controls, cut: (before.totalRisk - after.totalRisk) / before.totalRisk };
  }, []);
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-sm font-semibold uppercase tracking-wider text-brand-600">{children}</div>;
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-lg leading-relaxed text-slate-600">{sub}</p>}
    </div>
  );
}

function Feature({ icon: Icon, title, children, visual, className = '' }: { icon: LucideIcon; title: string; children: ReactNode; visual?: ReactNode; className?: string }) {
  return (
    <div className={`group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white" aria-hidden>
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </span>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <div className="mt-2 leading-relaxed text-slate-600">{children}</div>
      {visual && <div className="mt-5 flex-1">{visual}</div>}
    </div>
  );
}

function ReportPreview({ preview }: { preview: ReturnType<typeof useDemoPreview> }) {
  const { before, after, top, cut } = preview;
  const first = top[0];
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-200/60 via-sky-100/40 to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-brand-900/10">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-2 truncate text-xs font-medium text-slate-500">Report · {demoPersona.company}</span>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall risk today</div>
              <div className="mt-1.5">
                <BandBadge band={before.posture.band} size="lg" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">After first {top.length} fixes</div>
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <span className="text-sm font-semibold text-emerald-700">−{pct(cut)}</span>
                <BandBadge band={after.posture.band} size="lg" />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {before.scenarios.slice(0, 3).map((s) => (
              <div key={s.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800">{s.name}</span>
                  <span className={`shrink-0 text-xs font-semibold ${BAND_STYLES[s.band].text}`}>{s.band}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.risk / 5) * 100)}%`, background: BAND_STYLES[s.band].hex }} />
                </div>
              </div>
            ))}
          </div>

          {first && (
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <Target className="h-3.5 w-3.5" aria-hidden /> Do this first
              </div>
              <div className="mt-1.5 font-semibold leading-snug text-slate-900">{first.action.title}</div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  <Coins className="h-3.5 w-3.5" aria-hidden /> {first.action.cost}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> {first.action.time}
                </span>
                <span className="ml-auto font-semibold text-emerald-700">Cuts total risk {pct(first.pctReduction)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute -top-5 right-6 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-lg lg:flex">
        <MailCheck className="h-4 w-4 text-brand-600" aria-hidden /> Email domain checked
      </div>
      <div className="absolute -bottom-5 -left-6 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-lg lg:flex">
        <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> Mapped to CCCS and CIS
      </div>
    </div>
  );
}

export default function Landing() {
  const isDemo = useAppStore((s) => s.isDemo);
  const hasProfile = useAppStore((s) => Object.keys(s.profile).length > 0);
  const hasAnswers = useAppStore((s) => Object.keys(s.answers).length > 0);
  const go = useAppStore((s) => s.go);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const reset = useAppStore((s) => s.reset);
  const hasProgress = !isDemo && (hasProfile || hasAnswers);
  const preview = useDemoPreview();
  const sectors = profileQuestions.find((q) => q.id === 'sector')?.options ?? [];

  const start = () => {
    // Starting a real check-up after viewing the demo should not keep the demo answers.
    if (isDemo) reset();
    go(hasProgress ? (hasAnswers ? 'questions' : 'profile') : 'template');
  };
  const startLabel = hasProgress ? 'Continue check-up' : 'Start the free check-up';

  const steps = [
    { title: 'Tell us about your business', body: `${profileQuestions.length} quick questions about what you do and what hurts most when things stop. Add your email domain and we check it for you.` },
    { title: 'Answer in plain language', body: `${prompts.length} short cards, no jargon. "Not sure" is always an option, and it goes on your list of things to check.` },
    { title: 'Get your fix-first plan', body: 'Your biggest risks, the fixes that remove the most risk for the least effort, and a summary to hand your customers.' },
  ];

  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(#cfe3dc_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[32rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
          <div className="fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-semibold text-brand-800 shadow-sm">
              <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
              Cyber risk check-up for the food supply chain
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Find your{' '}
              <span className="bg-gradient-to-r from-brand-600 via-sky-500 to-brand-500 bg-clip-text text-transparent">weakest link</span>{' '}
              before attackers do.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 md:text-xl">
              In about 10 minutes, see where your business is most exposed, what to fix first, and get proof of progress you can hand to the grocers
              and partners you work with.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={start} className="px-6 py-3 text-lg shadow-lg shadow-brand-600/25">
                {startLabel} <ArrowRight className="h-5 w-5" aria-hidden />
              </Button>
              <Button variant="secondary" onClick={loadDemo} className="px-6 py-3 text-lg">
                <PlayCircle className="h-5 w-5 text-brand-600" aria-hidden /> See a sample report
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
              <li className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-brand-600" aria-hidden /> About 10 minutes
              </li>
              <li className="flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-brand-600" aria-hidden /> No account needed
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-brand-600" aria-hidden /> Answers stay in your browser
              </li>
            </ul>
          </div>

          <div className="fade-in">
            <ReportPreview preview={preview} />
            <p className="mt-8 text-center text-sm text-slate-500">
              Real results for our sample company, {demoPersona.company}: {demoPersona.blurb.charAt(0).toLowerCase() + demoPersona.blurb.slice(1)}
            </p>
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 sm:px-6 md:flex-row md:justify-between">
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-slate-500">Built for</span>
          <ul className="flex flex-wrap justify-center gap-2 md:justify-end">
            {sectors.map((o) => {
              const Icon = o.icon ? CONTENT_ICONS[o.icon] : undefined;
              return (
                <li key={o.value} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                  {Icon && <Icon className="h-4 w-4 text-brand-600" aria-hidden />}
                  {o.label}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="How it works" title="Three steps. No consultant." sub="Built for owners and office managers, not security teams." />
        <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-brand-200 via-brand-300 to-brand-200 md:block" aria-hidden />
          {steps.map((s, i) => (
            <li key={s.title} className="relative text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/30 ring-8 ring-[#f6f8f7]">
                {i + 1}
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What we check */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="What we check"
            title={`The ${scenarios.length} ways attacks hit businesses like yours`}
            sub={`Every answer feeds ${questions.length} underlying security questions, scored against real threats to farms, food processors, and freight.`}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {scenarios.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCENARIO_COLORS[s.id] }} aria-hidden />
                  <h3 className="font-semibold leading-snug text-slate-900">{s.name}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="What you get" title="A plan you can act on this week" sub="Not a scary score. Clear next steps, and the proof your customers ask for." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Feature
            icon={ListChecks}
            title="A fix-first list, ranked for you"
            className="md:col-span-2"
            visual={
              <ol className="space-y-2">
                {preview.top.slice(0, 3).map((r, i) => (
                  <li key={r.action.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.action.title}</span>
                    <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-slate-500 sm:inline-flex">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> {r.action.time}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-700">−{pct(r.pctReduction)}</span>
                  </li>
                ))}
              </ol>
            }
          >
            {actions.length} fixes, ranked by how much risk each removes for the effort. Step-by-step instructions for Microsoft 365 or Google Workspace,
            a preview of the effect before you start, and the rest laid out in a 30, 60 and 90-day plan.
          </Feature>

          <Feature
            icon={Target}
            title="Every risk, explained"
            visual={
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    [Gauge, "Why it's likely"],
                    [Scale, 'Why it would hurt'],
                    [ShieldCheck, 'What fixes it'],
                    [Users, 'Who else feels it'],
                  ] as const
                ).map(([Icon, label]) => (
                  <li key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 font-medium text-slate-700">
                    <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {label}
                  </li>
                ))}
              </ul>
            }
          >
            Open any risk to see why it's likely for you, how much it would hurt, which fixes bring it down, and who else it would affect.
          </Feature>

          <Feature icon={MailCheck} title="Email domain check">
            Enter your domain and we look up your email provider and your SPF and DMARC spoofing protection, then fill in those answers for you.
          </Feature>

          <Feature
            icon={FileCheck2}
            title="Proof for your customers"
            className="md:col-span-2"
            visual={
              <div className="flex flex-wrap gap-1.5">
                {preview.controls.slice(0, 8).map((c) => (
                  <span key={c.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[c.status]}`} title={c.name}>
                    {c.id} · {c.status}
                  </span>
                ))}
              </div>
            }
          >
            A one-page Supplier Security Summary with dated commitments, in the format you need: {templates.map((t) => t.name).join(' or ')}. Print it,
            save it as a PDF, download a risk register, or send a read-only link.
          </Feature>

          <Feature icon={Network} title="See the ripple effect">
            A risk flow diagram shows how each gap could spread to your customers: spoiled loads, fraudulent invoices in your name, failed audits.
          </Feature>

          <Feature icon={MessageCircle} title="Ask about your report">
            Ask follow-up questions in plain language and get answers based on your own results, with the wording tailored to your business.
          </Feature>

          <Feature icon={SlidersHorizontal} title="Your level of detail">
            Keep it simple, or switch to technical mode for control names, standards references, and the full scoring math.
          </Feature>
        </div>
      </section>

      {/* Standards + privacy */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <Eyebrow>Built on recognized standards</Eyebrow>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Speaks the language your customers' auditors use</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Every question is mapped to the specific requirements it gives evidence for, so your summary lines up with the questionnaires grocers
              and insurers send.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                ['CCCS Baseline Cyber Security Controls', 'Canadian Centre for Cyber Security, for small and medium organizations'],
                ['CIS Controls v8.1', 'Including the Implementation Group 1 essentials'],
                ['CAN/CIOSC 104:2021', 'The standard behind CyberSecure Canada certification'],
              ].map(([name, sub]) => (
                <li key={name} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                  <div>
                    <div className="font-semibold text-slate-900">{name}</div>
                    <div className="text-sm text-slate-600">{sub}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Eyebrow>Private by design</Eyebrow>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Your answers are yours</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              A security check-up shouldn't create a new security problem. We keep as little as possible, for as short a time as possible.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {(
                [
                  [Lock, 'Scored in your browser', 'Your scores are calculated on your computer, not on our servers.'],
                  [EyeOff, 'Gone when you close the tab', 'Answers live in memory only. Nothing about your business is saved on your device.'],
                  [Sparkles, 'AI never sees who you are', 'Tailored wording uses your answers, never your company name or domain.'],
                  [Link2, 'Sharing is your call', 'Links are only made when you ask, expire after 90 days, and stay out of search engines.'],
                ] as const
              ).map(([Icon, title, body]) => (
                <li key={title} className="rounded-xl border border-slate-200 p-4">
                  <Icon className="h-5 w-5 text-brand-600" aria-hidden />
                  <div className="mt-2 font-semibold text-slate-900">{title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-600">{body}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 px-6 py-14 text-center shadow-xl md:px-12">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:20px_20px]"
            aria-hidden
          />
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Ten minutes now beats a lost load later.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">Get your top risks and a fix-first plan today. Free, and no account needed.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-lg font-semibold text-brand-800 shadow-lg transition hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              >
                {startLabel} <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={loadDemo}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-lg font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              >
                <PlayCircle className="h-5 w-5" aria-hidden /> See a sample report
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
