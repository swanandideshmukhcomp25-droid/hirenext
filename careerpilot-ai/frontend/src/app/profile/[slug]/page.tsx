import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShareButtons from './ShareButtons';

const BACKEND_URL  = process.env.NEXT_PUBLIC_API_URL || 'https://backend-brown-pi-75.vercel.app';
const FRONTEND_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hirenext.org';

/* ── Data fetcher ──────────────────────────────────────────────── */
interface TopMatch {
  title: string;
  company: string;
  match_score: number;
  all_matches?: { title: string; company: string; match_score: number }[];
}

interface ProfileCard {
  slug: string;
  name: string;
  target_role: string;
  experience_years: number;
  skills: string[];
  top_match: TopMatch | null;
  resume_score: number | null;
  created_at: string;
}

async function getCard(slug: string): Promise<ProfileCard | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/share/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

/** Convert "SWANANDI DESHMUKH" or "swanandi deshmukh" → "Swanandi Deshmukh" */
function toTitleCase(str: string): string {
  return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * If target_role is suspiciously short (e.g. "AI", "ML", "SWE"),
 * fall back to the top match job title so we always display something meaningful.
 */
function cleanRole(role: string, topMatch: TopMatch | null): string {
  if (!role || role.trim().length <= 3) {
    return topMatch?.title || role || 'Developer';
  }
  return role;
}

function scoreColor(score: number) {
  if (score >= 80) return '#34d399';
  if (score >= 65) return '#60a5fa';
  return '#f59e0b';
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Good';
  return 'Needs work';
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const c    = scoreColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${c}80)` }} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 900, color: c, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10, color: c + '99', fontWeight: 700 }}>/ 100</span>
      </div>
    </div>
  );
}

/* ── Metadata ──────────────────────────────────────────────────── */
export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const card = await getCard(params.slug);
  if (!card) return { title: 'Profile not found — HireNext' };

  const displayName = toTitleCase(card.name);
  const displayRole = cleanRole(card.target_role, card.top_match);
  const scoreText   = card.resume_score ? ` · Resume score: ${card.resume_score}/100` : '';
  const matchText   = card.top_match
    ? `Top match: ${card.top_match.company} (${card.top_match.match_score}% fit)`
    : `${card.experience_years} yrs experience`;

  const desc    = `${matchText}${scoreText}. See ${displayName}'s AI-ranked job matches on HireNext.`;
  const pageUrl = `${FRONTEND_URL}/profile/${card.slug}`;
  const ogImage = `${FRONTEND_URL}/api/og/${card.slug}`;

  return {
    title: `${displayName} · ${displayRole} — HireNext`,
    description: desc,
    openGraph: {
      title: `${displayName} · ${displayRole}`,
      description: desc,
      siteName: 'HireNext',
      type: 'profile',
      url: pageUrl,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${displayName} — HireNext profile` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} · ${displayRole} — HireNext`,
      description: desc,
      images: [ogImage],
    },
  };
}

/* ── Page ──────────────────────────────────────────────────────── */
export default async function ProfilePage({ params }: { params: { slug: string } }) {
  const card = await getCard(params.slug);
  if (!card) notFound();

  const displayName = toTitleCase(card.name);
  const displayRole = cleanRole(card.target_role, card.top_match);
  const topSkills   = (card.skills || []).slice(0, 6);
  const profileUrl  = `${FRONTEND_URL}/profile/${card.slug}`;
  const firstName   = displayName.split(' ')[0];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: '#13151f',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(99,102,241,0.05), 0 24px 64px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 20px 18px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(124,58,237,0.07) 100%)',
          borderBottom: '1px solid rgba(99,102,241,0.12)',
        }}>
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13,
            }}>⚡</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>HireNext</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(52,211,153,0.1)',
              color: '#34d399',
              border: '1px solid rgba(52,211,153,0.2)',
            }}>
              AI Analysed
            </span>
          </div>

          {/* Name + role — always title-cased, role always meaningful */}
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
            {displayName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              padding: '3px 10px', borderRadius: 999,
              background: 'rgba(99,102,241,0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99,102,241,0.25)',
            }}>
              {displayRole}
            </span>
            {card.experience_years != null && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {card.experience_years} yr{card.experience_years !== 1 ? 's' : ''} exp
              </span>
            )}
          </div>
        </div>

        {/* Skills */}
        {topSkills.length > 0 && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', marginBottom: 10 }}>
              TOP SKILLS
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topSkills.map(skill => (
                <span key={skill} style={{
                  fontSize: 12, fontWeight: 600,
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(99,102,241,0.1)',
                  color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.2)',
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

          {card.resume_score != null && (
            <div style={{
              padding: '18px 16px',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', margin: 0 }}>
                RESUME SCORE
              </p>
              <ScoreRing score={card.resume_score} size={68} />
              <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(card.resume_score) + 'cc' }}>
                {scoreLabel(card.resume_score)}
              </span>
            </div>
          )}

          {card.top_match && (
            <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', margin: 0 }}>
                TOP MATCH
              </p>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '2px 8px', borderRadius: 6,
                  background: `${scoreColor(card.top_match.match_score)}15`,
                  border: `1px solid ${scoreColor(card.top_match.match_score)}30`,
                  marginBottom: 6,
                }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: scoreColor(card.top_match.match_score) }}>
                    {card.top_match.match_score}%
                  </span>
                  <span style={{ fontSize: 10, color: scoreColor(card.top_match.match_score) + '99', fontWeight: 600 }}>fit</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{card.top_match.company}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{card.top_match.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Top 3 matches (new share flow) */}
        {card.top_match?.all_matches && card.top_match.all_matches.length > 1 && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', marginBottom: 12 }}>
              TOP MATCHES
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {card.top_match.all_matches.map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: scoreColor(m.match_score), minWidth: 36 }}>
                    {m.match_score}%
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.company}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 5,
                    background: `${scoreColor(m.match_score)}15`,
                    color: scoreColor(m.match_score),
                    border: `1px solid ${scoreColor(m.match_score)}25`,
                    flexShrink: 0,
                  }}>#{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Share buttons */}
        <div style={{ paddingTop: 18, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <ShareButtons
            url={profileUrl}
            name={displayName}
            role={displayRole}
            score={card.resume_score}
          />
        </div>

        {/* CTA */}
        <div style={{ padding: '18px 20px', textAlign: 'center' }}>
          <Link href="/upload" style={{
            display: 'block',
            padding: '14px 24px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
            textAlign: 'center',
          }}>
            {card.resume_score
              ? `Can you beat ${firstName}'s ${card.resume_score}/100 score? →`
              : 'Get your AI job matches — it\'s free →'}
          </Link>
          {/* Fixed: was #334155 (near-invisible). Now readable. */}
          <p style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>
            AI-ranked from 5,000+ live jobs · No signup needed · Free forever
          </p>
        </div>
      </div>

      {/* Footer — fixed: was #1e293b (invisible on dark bg) */}
      <p style={{ marginTop: 24, fontSize: 12, color: '#475569' }}>
        Powered by <Link href="/" style={{ color: '#64748b', textDecoration: 'none' }}>HireNext</Link>
      </p>
    </div>
  );
}
