'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import {
  Zap, ArrowRight, CheckCircle2, Star,
  TrendingUp, Rocket, Sparkles, BarChart3,
  Building2, MapPin, ChevronDown, Target,
  X, Wifi, AlertCircle,
} from 'lucide-react';

/* ── Animation helpers ───────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};
const stagger = { show: { transition: { staggerChildren: 0.09 } } };

/* ── Demo data ───────────────────────────────────────────────── */
const DEMO_TIER1 = [
  {
    rank: 1, score: 91, title: 'Frontend Engineer', company: 'Razorpay',
    location: 'Bangalore', work_mode: 'hybrid', salary: '18–26 LPA',
    matched: ['React', 'TypeScript', 'Next.js', 'REST APIs'],
    verdict: 'Apply today. You\'re ready.',
    verdictColor: '#34d399',
  },
  {
    rank: 2, score: 82, title: 'UI Engineer', company: 'Meesho',
    location: 'Bangalore', work_mode: 'remote', salary: '14–20 LPA',
    matched: ['React', 'Tailwind CSS', 'TypeScript', 'Git'],
    verdict: 'Apply today. Strong fit.',
    verdictColor: '#34d399',
  },
  {
    rank: 3, score: 78, title: 'SDE-2 (React)', company: 'Swiggy',
    location: 'Bangalore', work_mode: 'hybrid', salary: '16–22 LPA',
    matched: ['React', 'Next.js', 'Node.js', 'Tailwind CSS'],
    verdict: 'Apply in 2 weeks. Add Jest first.',
    verdictColor: '#fbbf24',
  },
];

const DEMO_TIER2 = [
  { rank: 4, score: 72, title: 'React Developer',     company: 'CRED',    work_mode: 'hybrid' },
  { rank: 5, score: 65, title: 'Full Stack Developer', company: 'Zepto',   work_mode: 'remote' },
  { rank: 6, score: 61, title: 'Frontend Engineer',   company: 'Groww',   work_mode: 'remote' },
];

const TESTIMONIALS = [
  {
    name: 'Priya S.',
    role: 'SDE Fresher → Swiggy',
    quote: 'Got 3 interview calls in a week. It told me exactly which jobs to apply to and what to fix first. I stopped shotgunning resumes.',
    avatar: 'P',
  },
  {
    name: 'Arjun M.',
    role: 'Career switcher → Razorpay',
    quote: 'The skill gap analysis showed I was missing Jest. I learned it in 4 days and got shortlisted. I would\'ve never figured that out on my own.',
    avatar: 'A',
  },
  {
    name: 'Sneha R.',
    role: 'MBA grad → Product role',
    quote: 'The Apply Strategy was frighteningly accurate. It told me exactly what was blocking me. Fixed it. Got the offer. Took 11 days.',
    avatar: 'S',
  },
];

/* ── Score ring ──────────────────────────────────────────────── */
function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#34d399' : score >= 65 ? '#60a5fa' : '#f59e0b';
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}/>
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-sm font-black leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] font-bold" style={{ color: color + '90' }}>%</span>
      </div>
    </div>
  );
}

/* ── Live Dashboard Preview ──────────────────────────────────── */
function DashboardPreview() {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)' }}>

        {/* Chrome */}
        <div className="flex items-center gap-3 px-4 py-3"
          style={{ background: '#0d0f16', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }}/>
            <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }}/>
            <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }}/>
          </div>
          <div className="flex-1 h-5 rounded-md flex items-center px-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>
            ✦ hirenext.org/dashboard
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full"
            style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"/>
            Live jobs
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4" style={{ background: '#0f1117' }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
              <Sparkles className="w-3 h-3"/>
              AI scanned live jobs · ranked 47 matches for Rahul
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <Star className="w-3 h-3" style={{ color: '#34d399' }}/>
              </div>
              <div>
                <p className="text-xs font-bold text-white">Your Best Shots</p>
                <p className="text-[10px]" style={{ color: '#64748b' }}>Apply to these today</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', border: '1px solid rgba(52,211,153,0.15)' }}>
              3 jobs
            </span>
          </div>

          {DEMO_TIER1.map((job, i) => (
            <motion.div key={job.rank}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.4, ease: [0.16,1,0.3,1] }}
              className="rounded-xl overflow-hidden relative"
              style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.04) 0%, rgba(15,17,23,0.98) 60%)',
                border: '1px solid rgba(52,211,153,0.18)',
              }}>
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ background: 'linear-gradient(180deg, #34d399 0%, #34d39940 100%)' }}/>
              <div className="pl-4 pr-4 py-3 flex items-start gap-3">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: '#475569' }}>#{job.rank}</span>
                  <ScoreRing score={job.score} size={48}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-snug">{job.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] flex-wrap" style={{ color: '#64748b' }}>
                    <span className="flex items-center gap-0.5"><Building2 className="w-2.5 h-2.5"/>{job.company}</span>
                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5"/>{job.location}</span>
                    {job.work_mode === 'remote' && (
                      <span className="flex items-center gap-0.5 font-semibold" style={{ color: '#34d399' }}>
                        <Wifi className="w-2.5 h-2.5"/>Remote
                      </span>
                    )}
                    <span className="font-semibold text-white/50">{job.salary}</span>
                  </div>
                  <p className="text-[10px] font-bold mt-1.5" style={{ color: job.verdictColor }}>→ {job.verdict}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {job.matched.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(52,211,153,0.07)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.12)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          <div className="flex flex-col gap-1.5">
            {DEMO_TIER2.map((job, i) => (
              <motion.div key={job.rank}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + i * 0.07, duration: 0.3, ease: [0.16,1,0.3,1] }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[9px] font-black w-4 shrink-0" style={{ color: '#475569' }}>#{job.rank}</span>
                <div className="w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0"
                  style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)' }}>
                  <span className="text-[11px] font-black leading-none" style={{ color: '#60a5fa' }}>{job.score}</span>
                  <span className="text-[8px]" style={{ color: '#60a5fa70' }}>%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">{job.title}</p>
                  <p className="text-[10px] truncate" style={{ color: '#475569' }}>{job.company} · {job.work_mode}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.18)' }}>
                  Strong Match
                </span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-semibold" style={{ color: '#475569' }}>+ 29 more matches waiting</p>
            <ChevronDown className="w-3.5 h-3.5" style={{ color: '#475569' }}/>
          </motion.div>
        </div>
      </div>
      <div className="h-16 -mt-1 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--surface))' }}/>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--surface)' }}>

      {/* ── Navbar ───────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 inset-x-0 z-50">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 mt-2 sm:mt-3">
          <div className="flex items-center justify-between h-14 px-3 sm:px-5 rounded-2xl"
            style={{ background: 'rgba(20,23,32,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
                <Zap className="w-4 h-4 text-white"/>
              </div>
              <span className="font-bold text-white text-[15px] tracking-[-0.01em]">HireNext</span>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {[
                { label: 'The Problem', href: '#problem' },
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'Reviews', href: '#reviews' },
              ].map(item => (
                <a key={item.label} href={item.href}
                  className="text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                  {item.label}
                </a>
              ))}
            </div>
            <Link href="/upload" className="btn-primary text-sm py-2 px-4 rounded-xl">
              Get My Matches <ArrowRight className="w-3.5 h-3.5"/>
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="hero-gradient noise relative pt-24 sm:pt-32 pb-10 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }}/>

        <motion.div variants={stagger} initial="hidden" animate="show"
          className="max-w-3xl mx-auto text-center mb-12">

          {/* Live proof pill */}
          <motion.div variants={fadeUp}
            className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"/>
            1,000+ live jobs · updated daily
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={fadeUp}
            className="text-[2.2rem] sm:text-[3rem] md:text-[4.8rem] font-black leading-[1.04] tracking-[-0.03em] text-balance mb-5">
            <span className="text-white">Should you apply?</span>
            <br/>
            <span className="gradient-text">We'll tell you.</span>
          </motion.h1>

          {/* Sub */}
          <motion.p variants={fadeUp}
            className="text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-8 text-balance"
            style={{ color: 'var(--text-secondary)' }}>
            Upload your resume. Get a verdict on every job — not a score, an actual answer.
          </motion.p>

          {/* Verdict cards — the product in 3 lines */}
          <motion.div variants={fadeUp}
            className="grid grid-cols-3 gap-2 sm:gap-3 max-w-lg mx-auto mb-8">
            {[
              { emoji: '✅', label: 'Apply Today',        sub: 'You\'re ready now',        bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  text: '#34d399' },
              { emoji: '⏳', label: 'Apply in 2 Weeks',  sub: 'Close one skill gap',      bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  text: '#fbbf24' },
              { emoji: '❌', label: 'Skip',               sub: 'Better matches below',     bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',    text: '#f87171' },
            ].map(v => (
              <div key={v.label}
                className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl"
                style={{ background: v.bg, border: `1px solid ${v.border}` }}>
                <span className="text-lg">{v.emoji}</span>
                <p className="text-[11px] sm:text-xs font-bold leading-snug" style={{ color: v.text }}>{v.label}</p>
                <p className="text-[9px] sm:text-[10px] leading-snug text-center" style={{ color: 'var(--text-muted)' }}>{v.sub}</p>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div variants={fadeUp}
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-6">
            <Link href="/upload"
              className="btn-primary text-[15px] px-7 py-3.5 rounded-xl glow-indigo text-center">
              Get My Verdict
              <ArrowRight className="w-4 h-4"/>
            </Link>
            <a href="#problem"
              className="btn-secondary text-[15px] px-7 py-3.5 rounded-xl text-center">
              Why job search is broken →
            </a>
          </motion.div>

          {/* Trust */}
          <motion.div variants={fadeUp}
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm"
            style={{ color: 'var(--text-muted)' }}>
            {['No signup · ever', 'Free forever', 'Results in 60 seconds'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70"/> {t}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Product preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          <DashboardPreview/>
        </motion.div>
      </section>

      {/* ── COMPANIES STRIP ──────────────────────────────────── */}
      <section className="py-10 px-4 sm:px-6"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
          className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          <motion.p variants={fadeUp}
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: '#334155' }}>
            HireNext users now work at
          </motion.p>
          <motion.div variants={fadeUp}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {[
              { name: 'Razorpay',  color: '#2563eb' },
              { name: 'Swiggy',    color: '#f97316' },
              { name: 'CRED',      color: '#8b5cf6' },
              { name: 'Meesho',    color: '#ec4899' },
              { name: 'Zepto',     color: '#14b8a6' },
              { name: 'Groww',     color: '#22c55e' },
              { name: 'PhonePe',   color: '#6366f1' },
            ].map(c => (
              <span key={c.name}
                className="text-sm font-black tracking-tight"
                style={{ color: c.color + 'aa' }}>
                {c.name}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── THE PROBLEM ──────────────────────────────────────── */}
      <section id="problem" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="text-center mb-14 sm:mb-20">
            <motion.p variants={fadeUp} className="section-label">Why we exist</motion.p>
            <motion.h2 variants={fadeUp}
              className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
              Job search is broken.
              <br/>
              <span className="gradient-text">Nobody's fixing it.</span>
            </motion.h2>
            <motion.p variants={fadeUp}
              className="text-base sm:text-lg max-w-xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}>
              The industry built tools to help you apply more. We built something to help you apply less — but win every time.
            </motion.p>
          </motion.div>

          {/* Problem cards */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="grid sm:grid-cols-3 gap-4 sm:gap-6">

            {[
              {
                stat: '200+',
                statLabel: 'avg applications before an offer',
                title: 'You\'re playing a numbers game you can\'t win.',
                body: 'Job boards taught you to spray and pray. Apply to 200 roles, hear back from 4. It\'s not a strategy. It\'s exhaustion.',
                icon: '📨',
                accent: '#ef4444',
              },
              {
                stat: '7s',
                statLabel: 'time a recruiter spends on your resume',
                title: 'You\'re invisible to the people who matter.',
                body: 'Recruiters see 500 resumes for every opening. Yours is formatted for humans. Their system is built for machines.',
                icon: '👁️',
                accent: '#f59e0b',
              },
              {
                stat: '0',
                statLabel: 'feedback from rejected applications',
                title: 'You never know why you didn\'t get the call.',
                body: 'No response. No reason. No direction. You just guess, update your resume, and try again. Rinse. Repeat. Burn out.',
                icon: '🕳️',
                accent: '#8b5cf6',
              },
            ].map((p, i) => (
              <motion.div key={i} variants={fadeUp}
                className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {/* Accent glow top-left */}
                <div className="absolute top-0 left-0 w-32 h-32 rounded-br-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${p.accent}15 0%, transparent 70%)` }}/>
                <div className="text-3xl">{p.icon}</div>
                <div>
                  <div className="text-4xl font-black" style={{ color: p.accent }}>{p.stat}</div>
                  <div className="text-xs font-semibold mt-1" style={{ color: p.accent + 'aa' }}>{p.statLabel}</div>
                </div>
                <h3 className="text-white font-bold text-base leading-snug">{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.body}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Transition into the fix */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-12 sm:mt-16 text-center">
            <p className="text-xl sm:text-2xl font-black text-white mb-2">
              There's a better way.
            </p>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Don't apply more. Apply <em>right</em>.
            </p>
            <div className="mt-6">
              <a href="#how-it-works"
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: 'var(--brand-light)' }}>
                See how HireNext is different <ArrowRight className="w-4 h-4"/>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── HOW WE'RE DIFFERENT ──────────────────────────────── */}
      <section id="how-it-works"
        className="py-16 sm:py-24 px-4 sm:px-6"
        style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="text-center mb-14">
            <motion.p variants={fadeUp} className="section-label">Why we're different</motion.p>
            <motion.h2 variants={fadeUp}
              className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
              Not a job board.
              <br/>
              <span className="gradient-text">Your unfair advantage.</span>
            </motion.h2>
            <motion.p variants={fadeUp}
              className="text-base sm:text-lg max-w-xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}>
              Every other tool shows you more jobs. We show you the right ones — and tell you exactly why.
            </motion.p>
          </motion.div>

          {/* VS grid */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="grid sm:grid-cols-2 gap-4 mb-14">

            {/* The old way */}
            <motion.div variants={fadeUp}
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.15)' }}>
                  <X className="w-3 h-3 text-red-400"/>
                </div>
                <span className="text-sm font-bold text-red-400">The old way</span>
              </div>
              <div className="flex flex-col gap-4">
                {[
                  'Apply to 100 jobs hoping something sticks',
                  'Get no feedback on why you were rejected',
                  'Guess which skills are holding you back',
                  'Write the same cover letter 50 times',
                  'Wait weeks. Hear nothing.',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#64748b' }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <X className="w-2 h-2 text-red-500"/>
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* The HireNext way */}
            <motion.div variants={fadeUp}
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(52,211,153,0.15)' }}>
                  <Zap className="w-3 h-3 text-emerald-400"/>
                </div>
                <span className="text-sm font-bold text-emerald-400">The HireNext way</span>
              </div>
              <div className="flex flex-col gap-4">
                {[
                  'Get 3 ranked jobs you\'re actually ready for',
                  'Know exactly which skill is blocking each role',
                  'Get a cold email written for your #1 match',
                  'See your resume score + what to fix first',
                  'Apply with confidence. Get the call.',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"/>
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          {/* Steps */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="grid sm:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-8 left-[33%] right-[33%] h-px"
              style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))' }}/>

            {[
              { n: '01', title: 'Drop your resume',   desc: 'PDF only. No account. No email. Nothing. Just your resume and a target role.' },
              { n: '02', title: 'We rank 5,000+ jobs', desc: 'Every real opening scored against your exact skills, title, seniority, and location. In 60 seconds.' },
              { n: '03', title: 'You get your verdict', desc: 'Apply today. Apply after X. Skip. Cold email. Resume fixes. All of it, instantly.' },
            ].map((s, i) => (
              <motion.div key={i} variants={fadeUp} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 font-black text-xl relative z-10"
                  style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--brand-light)', boxShadow: '0 0 24px rgba(99,102,241,0.15)' }}>
                  {s.n}
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mt-14">
            <Link href="/upload" className="btn-primary text-[15px] px-8 py-3.5 rounded-xl inline-flex glow-indigo">
              Get My Matches <ArrowRight className="w-4 h-4"/>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── PROOF NUMBERS ────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
          className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { value: '5,000+', label: 'live jobs indexed',      icon: BarChart3,    color: '#818cf8' },
            { value: '60s',    label: 'from upload to matches', icon: Zap,          color: '#34d399' },
            { value: '3.2×',   label: 'more interviews',        icon: TrendingUp,   color: '#f59e0b' },
            { value: '100%',   label: 'free. no catch.',        icon: CheckCircle2, color: '#60a5fa' },
          ].map((s, i) => (
            <motion.div key={i} variants={fadeUp}
              className="text-center py-6 px-4 rounded-2xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <s.icon className="w-5 h-5 mx-auto mb-3" style={{ color: s.color }}/>
              <p className="text-3xl font-black text-white tracking-tight">{s.value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────── */}
      <section id="reviews" className="py-16 sm:py-24 px-4 sm:px-6"
        style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="text-center mb-14">
            <motion.p variants={fadeUp} className="section-label">Real people. Real results.</motion.p>
            <motion.h2 variants={fadeUp}
              className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
              They stopped guessing.
              <br/>
              <span className="gradient-text">They got hired.</span>
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
            className="grid sm:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={i} variants={fadeUp}
                className="flex flex-col gap-4 p-6 rounded-2xl"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex gap-0.5">
                  {Array(5).fill(0).map((_,j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400"/>)}
                </div>
                <p className="text-sm leading-relaxed flex-1 italic" style={{ color: 'var(--text-secondary)' }}>
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: `linear-gradient(135deg,hsl(${i*80+220},70%,50%),hsl(${i*80+260},60%,45%))` }}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">{t.name}</p>
                    <p className="text-xs font-semibold" style={{ color: '#34d399' }}>{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA — MOVEMENT LEVEL ───────────────────────── */}
      <section className="py-16 sm:py-28 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
          className="max-w-3xl mx-auto text-center rounded-3xl py-14 sm:py-20 px-5 sm:px-8 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.12) 0%,rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>

          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%,rgba(99,102,241,0.18) 0%,transparent 70%)' }}/>

          <div className="relative">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.5)' }}>
              <Rocket className="w-7 h-7 text-white"/>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
              This is your
              <br/>
              <span className="gradient-text">unfair advantage.</span>
            </h2>

            <p className="text-base sm:text-lg mb-3 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Every day you spend blindly applying is a day someone who used HireNext moves ahead.
            </p>
            <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>
              60 seconds. No account. No credit card. No excuses.
            </p>

            <Link href="/upload" className="btn-primary text-base sm:text-[17px] px-8 sm:px-10 py-4 rounded-xl inline-flex glow-indigo">
              Find My Jobs Now — It's Free
              <ArrowRight className="w-5 h-5"/>
            </Link>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>
              {['No signup needed','Free forever','Real jobs, not aggregated noise', '60 seconds'].map(item => (
                <span key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/60"/> {item}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="py-8 px-4 sm:px-6" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-sm"
          style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <Zap className="w-3 h-3 text-white"/>
            </div>
            <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>HireNext</span>
            <span style={{ color: '#1e293b' }}>·</span>
            <span>Built for people who are done guessing.</span>
          </div>
          <p>© 2026 HireNext · Free forever.</p>
        </div>
      </footer>

    </div>
  );
}
