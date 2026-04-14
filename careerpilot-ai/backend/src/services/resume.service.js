const pdfParse = require('pdf-parse');
const { openai, MODEL } = require('../config/openai');
const { DUMMY_PROFILE }  = require('../utils/dummy');
const prompts            = require('../utils/prompts');
const { normalizeSkills, extractSkillsFromText } = require('../utils/skillNormalizer');
const logger             = require('../utils/logger');

const USE_AI = process.env.USE_AI !== 'false';

/**
 * Extract raw text from a PDF buffer using pdf-parse.
 */
exports.extractText = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    const text = data.text?.trim();
    if (!text || text.length < 50) {
      throw new Error('PDF appears to be empty or image-only. Please use a text-based PDF.');
    }
    logger.info(`PDF parsed — ${text.length} characters extracted`);
    return text;
  } catch (err) {
    if (err.message.includes('PDF')) throw err;
    throw new Error('Could not read the PDF file. Make sure it is not encrypted or corrupted.');
  }
};

// ── Seniority inference ────────────────────────────────────────────

const SENIORITY_KEYWORDS = {
  principal: ['principal', 'distinguished', 'fellow', 'vp of engineering'],
  lead:      ['lead', 'staff', 'architect', 'head of', 'engineering manager', 'tech lead'],
  senior:    ['senior', 'sr.', 'sr ', 'iii', 'level 5', 'level 6'],
  mid:       ['mid', 'ii', 'level 3', 'level 4', 'software engineer ii', 'sde ii'],
  junior:    ['junior', 'jr.', 'jr ', 'associate', 'entry', 'i ', ' i,', 'intern', 'trainee', 'level 1', 'level 2'],
};

function inferSeniority(resumeText, experienceYears) {
  const lower = resumeText.toLowerCase();

  // Check for explicit seniority keywords in job titles
  for (const [level, keywords] of Object.entries(SENIORITY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return level;
  }

  // Fall back to years of experience
  if (experienceYears >= 10) return 'principal';
  if (experienceYears >= 7)  return 'lead';
  if (experienceYears >= 4)  return 'senior';
  if (experienceYears >= 2)  return 'mid';
  return 'junior';
}

// ── Domain inference ───────────────────────────────────────────────

const DOMAIN_SIGNALS = {
  'fintech':    ['fintech', 'banking', 'payments', 'trading', 'insurance', 'wealth', 'stripe', 'razorpay', 'zerodha', 'paytm', 'paypal'],
  'AI/ML':      ['machine learning', 'deep learning', 'nlp', 'computer vision', 'data science', 'llm', 'openai', 'hugging face'],
  'SaaS':       ['saas', 'b2b', 'enterprise software', 'crm', 'erp', 'salesforce'],
  'e-commerce': ['ecommerce', 'e-commerce', 'shopify', 'marketplace', 'retail', 'amazon', 'flipkart'],
  'healthcare': ['health', 'medtech', 'clinical', 'ehr', 'hospital', 'pharma'],
  'edtech':     ['edtech', 'education', 'learning', 'lms', 'course', 'byju', 'coursera', 'udemy'],
  'gaming':     ['gaming', 'game', 'unity', 'unreal', 'mobile game'],
  'devtools':   ['developer tools', 'devtools', 'open source', 'sdk', 'api platform', 'github', 'gitlab'],
  'infra':      ['infrastructure', 'cloud', 'devops', 'platform engineering', 'sre'],
  'security':   ['security', 'cybersecurity', 'infosec', 'penetration', 'soc'],
};

function inferDomain(resumeText) {
  const lower = resumeText.toLowerCase();
  const scores = {};

  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS)) {
    scores[domain] = signals.filter(s => lower.includes(s)).length;
  }

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : null;
}

// ── Work preference ────────────────────────────────────────────────

function inferWorkPreference(resumeText) {
  const lower = resumeText.toLowerCase();
  if (/\bremote\b.*\bonly\b|\bfully remote\b|\bwork from home\b/.test(lower)) return 'remote';
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/\bon.?site\b|\bin.?office\b/.test(lower)) return 'onsite';
  return null;
}

// ── Skill extraction ───────────────────────────────────────────────

function extractSkills(resumeText) {
  return extractSkillsFromText(resumeText);
}

// ── Experience extraction ──────────────────────────────────────────

function extractExperience(resumeText) {
  const expPatterns = [
    /(\d+)\+?\s*years?\s+of\s+(professional\s+)?experience/i,
    /(\d+)\+?\s*yrs?\s+of\s+experience/i,
    /experience\s*[:\-]?\s*(\d+)\+?\s*years?/i,
    /(\d+)\+?\s*years?\s+experience/i,
  ];
  for (const pat of expPatterns) {
    const m = resumeText.match(pat);
    if (m) return parseInt(m[1], 10);
  }
  // Fallback: career span from year mentions
  const yearMatches = resumeText.match(/\b(19|20)\d{2}\b/g);
  if (yearMatches) {
    const years = yearMatches.map(Number);
    const span = Math.max(...years) - Math.min(...years);
    return Math.min(span, 30);
  }
  return 0;
}

// ── Resume validator ──────────────────────────────────────────────

const RESUME_SECTIONS = [
  'experience', 'work experience', 'professional experience', 'employment history',
  'education', 'academic background', 'qualifications',
  'skills', 'technical skills', 'core competencies', 'key skills',
  'projects', 'personal projects', 'academic projects',
  'certifications', 'achievements', 'awards', 'accomplishments',
  'summary', 'objective', 'career objective', 'profile', 'about me',
  'internship', 'volunteer', 'extracurricular',
];

exports.validateResume = function (text) {
  const lower = text.toLowerCase();
  let score = 0;

  // Section headers must appear as standalone headings (own line or word boundary)
  // Prevents "product experience" or "matched skills" from matching
  const foundSections = RESUME_SECTIONS.filter(h => {
    const pattern = new RegExp(`(^|\\n)\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\n|$|:)`, 'i');
    return pattern.test(text);
  });
  score += Math.min(foundSections.length * 15, 60); // cap at 60

  // Contact info — resumes always have at least one
  const hasEmail    = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/.test(text);
  const hasPhone    = /(\+?\d[\d\s\-().]{7,}\d)/.test(text);
  const hasLinkedIn = /linkedin\.com/i.test(text);

  if (hasEmail)    score += 25;
  if (hasPhone)    score += 12;
  if (hasLinkedIn) score += 8;

  // Career / education dates (at least 2 year mentions)
  const years = (text.match(/\b(19|20)\d{2}\b/g) || []).length;
  if (years >= 2) score += 12;

  // Tech / professional skill keywords
  const detectedSkills = extractSkillsFromText(text);
  if (detectedSkills.length >= 3) score += 15;
  if (detectedSkills.length >= 8) score += 10;

  // Name-like line near the top (Title Case, 2+ words, short)
  const topLines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6);
  const hasName  = topLines.some(l => l.length > 3 && l.length < 55 && /^[A-Z][a-z]+([\s.][A-Z][a-z]+)+$/.test(l));
  if (hasName) score += 8;

  // Hard gate: a resume without any contact info is almost certainly not a resume
  const hasContactInfo = hasEmail || hasPhone || hasLinkedIn;

  // Penalise docs that look like invoices, articles, or product docs
  const nonResumeSignals = ['abstract', 'introduction', 'conclusion', 'references', 'bibliography',
    'invoice', 'receipt', 'total amount', 'chapter ', 'figure ', 'table of contents',
    'roadmap', 'product roadmap', 'phase 1', 'phase 2', 'shipped', 'pending'];
  const nonResumeHits = nonResumeSignals.filter(s => lower.includes(s)).length;
  score -= nonResumeHits * 8;

  const isValid = hasContactInfo && score >= 40;
  return { isValid, score, foundSections };
};

// ── Basic parser (no AI) ───────────────────────────────────────────

function parseProfileBasic(resumeText, targetRole) {
  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);

  // Name
  let name = 'Candidate';
  for (const line of lines.slice(0, 8)) {
    if (
      line.length > 2 && line.length < 60 &&
      !line.includes('@') && !line.includes('http') &&
      !/^\d/.test(line) && /^[A-Za-z]/.test(line) &&
      !/resume|curriculum|vitae|profile|summary|objective|contact/i.test(line)
    ) {
      name = line;
      break;
    }
  }

  // Email
  const emailMatch = resumeText.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Skills (normalized)
  const rawSkills = extractSkills(resumeText);
  const skills    = normalizeSkills(rawSkills);

  // Experience
  const experience_years = extractExperience(resumeText);

  // Education
  const degreeRx = /\b(B\.?Tech|B\.?E\.?|B\.?Sc|M\.?Tech|M\.?Sc|M\.?S\.?|B\.?A\.?|M\.?B\.?A|Ph\.?D|Bachelor|Master|Diploma|Engineering|Computer Science|Information Technology)\b/i;
  let education = '';
  for (const line of lines) {
    if (degreeRx.test(line) && line.length < 120) {
      education = line;
      break;
    }
  }

  // Enhanced signals
  const seniority       = inferSeniority(resumeText, experience_years);
  const domain          = inferDomain(resumeText);
  const work_preference = inferWorkPreference(resumeText);

  logger.info(`parseProfile (basic) → name="${name}", skills=${skills.length}, exp=${experience_years}yrs, seniority=${seniority}, domain=${domain}`);

  return {
    name,
    email,
    skills,
    experience_years,
    education,
    target_role:    targetRole,
    seniority,
    domain,
    work_preference,
  };
}

// ── AI parser ─────────────────────────────────────────────────────

exports.parseProfile = async (resumeText, targetRole) => {
  if (!USE_AI) {
    return parseProfileBasic(resumeText, targetRole);
  }

  logger.info('parseProfile → calling OpenAI');

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: prompts.RESUME_PARSER_SYSTEM },
      { role: 'user',   content: prompts.resumeParserUser(resumeText, targetRole) },
    ],
  });

  const profile = JSON.parse(completion.choices[0].message.content);
  const experience_years = Number(profile.experience_years) || 0;
  const rawSkills        = Array.isArray(profile.skills) ? profile.skills : [];

  return {
    name:             profile.name             || 'Candidate',
    email:            profile.email            || '',
    skills:           normalizeSkills(rawSkills),
    experience_years,
    education:        profile.education        || '',
    target_role:      profile.target_role      || targetRole,
    seniority:        profile.seniority        || inferSeniority(resumeText, experience_years),
    domain:           profile.domain           || inferDomain(resumeText),
    work_preference:  profile.work_preference  || inferWorkPreference(resumeText),
  };
};
