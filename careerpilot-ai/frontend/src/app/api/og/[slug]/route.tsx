import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const BACKEND_URL  = 'https://backend-brown-pi-75.vercel.app';

interface ProfileCard {
  name: string;
  target_role: string;
  experience_years: number;
  skills: string[];
  top_match: { title: string; company: string; match_score: number } | null;
  resume_score: number | null;
}

function toTitleCase(str: string): string {
  return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function cleanRole(role: string, topMatch: ProfileCard['top_match']): string {
  if (!role || role.trim().length <= 3) return topMatch?.title || role || 'Developer';
  return role;
}

function scoreColor(score: number) {
  if (score >= 80) return '#34d399';
  if (score >= 65) return '#60a5fa';
  return '#f59e0b';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/share/${params.slug}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return new Response('Not found', { status: 404 });

    const card: ProfileCard = await res.json();
    const name  = toTitleCase(card.name);
    const role  = cleanRole(card.target_role, card.top_match);
    const score = card.resume_score;
    const match = card.top_match;
    const skills = (card.skills || []).slice(0, 5);
    const sc    = score ? scoreColor(score) : '#818cf8';
    const mc    = match ? scoreColor(match.match_score) : '#818cf8';

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            background: '#0f1117',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background glow */}
          <div style={{
            position: 'absolute',
            top: '-120px', left: '-80px',
            width: '600px', height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
            display: 'flex',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-100px', right: '-80px',
            width: '500px', height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 70%)',
            display: 'flex',
          }} />

          {/* Card */}
          <div style={{
            margin: '48px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#13151f',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '24px',
            overflow: 'hidden',
          }}>

            {/* Top bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '28px 40px 24px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.16) 0%, rgba(124,58,237,0.08) 100%)',
              borderBottom: '1px solid rgba(99,102,241,0.15)',
            }}>
              {/* Logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>⚡</div>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>HireNext</span>
              </div>

              <div style={{ flex: 1, display: 'flex' }} />

              {/* AI Analysed badge */}
              <div style={{
                fontSize: '13px', fontWeight: 700,
                padding: '5px 14px', borderRadius: '8px',
                background: 'rgba(52,211,153,0.12)',
                color: '#34d399',
                border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex',
              }}>
                ✓ AI Analysed
              </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, padding: '36px 40px', gap: '40px' }}>

              {/* Left: name + role + skills */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '42px', fontWeight: 900, color: '#f1f5f9', lineHeight: 1.1 }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      fontSize: '16px', fontWeight: 700,
                      padding: '5px 14px', borderRadius: '999px',
                      background: 'rgba(99,102,241,0.18)',
                      color: '#a5b4fc',
                      border: '1px solid rgba(99,102,241,0.3)',
                      display: 'flex',
                    }}>
                      {role}
                    </div>
                    {card.experience_years != null && (
                      <span style={{ fontSize: '15px', color: '#94a3b8' }}>
                        {card.experience_years} yrs exp
                      </span>
                    )}
                  </div>
                </div>

                {/* Skills */}
                {skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {skills.map((s) => (
                      <div key={s} style={{
                        fontSize: '13px', fontWeight: 600,
                        padding: '5px 12px', borderRadius: '999px',
                        background: 'rgba(99,102,241,0.1)',
                        color: '#818cf8',
                        border: '1px solid rgba(99,102,241,0.2)',
                        display: 'flex',
                      }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}

                {/* Match */}
                {match && (
                  <div style={{
                    marginTop: 'auto',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                    padding: '16px 20px', borderRadius: '14px',
                    background: `${mc}0d`,
                    border: `1px solid ${mc}25`,
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', display: 'flex' }}>
                      TOP MATCH
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '28px', fontWeight: 900, color: mc }}>{match.match_score}%</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{match.company}</span>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{match.title}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: score ring */}
              {score != null && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '12px',
                  padding: '28px 32px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  minWidth: '180px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', display: 'flex' }}>
                    RESUME SCORE
                  </div>
                  {/* Score circle */}
                  <div style={{
                    width: '100px', height: '100px',
                    borderRadius: '50%',
                    background: `conic-gradient(${sc} ${score}%, rgba(255,255,255,0.06) 0%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 24px ${sc}40`,
                  }}>
                    <div style={{
                      width: '76px', height: '76px',
                      borderRadius: '50%',
                      background: '#13151f',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '28px', fontWeight: 900, color: sc, lineHeight: 1 }}>{score}</span>
                      <span style={{ fontSize: '12px', color: sc + '99', fontWeight: 700 }}>/100</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: sc + 'cc' }}>
                    {score >= 80 ? 'Strong' : score >= 65 ? 'Good' : 'Needs work'}
                  </span>
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '14px 40px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(99,102,241,0.04)',
            }}>
              <span style={{ fontSize: '14px', color: '#475569' }}>
                hirenext.org · AI-ranked from 5,000+ live jobs · Free forever
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch {
    // Fallback OG image
    return new ImageResponse(
      (
        <div style={{
          width: '1200px', height: '630px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0f1117',
          fontFamily: '-apple-system, sans-serif',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '48px' }}>⚡</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f1f5f9' }}>HireNext</div>
            <div style={{ fontSize: '18px', color: '#818cf8' }}>AI-ranked job matches for your resume</div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
