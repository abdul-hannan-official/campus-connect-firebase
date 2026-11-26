import type {
  AnnouncementCategory,
  AssignedAdminTitle,
  ClubCategory,
  CSTrack,
  EventCategory,
  ReportReason,
  SemesterOption,
} from '../types/campus.ts';

/**
 * Validation constants synchronized verbatim with firebase-blueprint.json and firestore.rules.
 */
export const SCHEMA_LIMITS = {
  UID_MIN: 1,
  UID_MAX: 128,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 80,
  PHOTO_URL_MAX: 512,
  BIO_MAX: 280,
  STUDENT_ID_MAX: 32,
  EMAIL_MIN: 3,
  EMAIL_MAX: 254,
  ASSIGNED_CLUBS_MAX: 10,
  CLUB_SLUG_MIN: 2,
  CLUB_SLUG_MAX: 64,
  CLUB_NAME_MIN: 2,
  CLUB_NAME_MAX: 80,
  CLUB_DESC_MIN: 10,
  CLUB_DESC_MAX: 800,
  CLUB_JUSTIFICATION_MIN: 10,
  CLUB_JUSTIFICATION_MAX: 500,
  POST_TITLE_MIN: 4,
  POST_TITLE_MAX: 180,
  POST_BODY_MIN: 1,
  POST_BODY_MAX: 8000,
  COMMENT_BODY_MIN: 1,
  COMMENT_BODY_MAX: 3000,
  URL_MAX: 512,
  ATTACHMENT_NAME_MAX: 120,
  ANNOUNCEMENT_TITLE_MIN: 4,
  ANNOUNCEMENT_TITLE_MAX: 180,
  ANNOUNCEMENT_BODY_MIN: 10,
  ANNOUNCEMENT_BODY_MAX: 8000,
  EVENT_TITLE_MIN: 4,
  EVENT_TITLE_MAX: 160,
  EVENT_DESC_MIN: 10,
  EVENT_DESC_MAX: 3000,
  EVENT_VENUE_MIN: 2,
  EVENT_VENUE_MAX: 160,
  REPORT_DETAILS_MAX: 500,
  REVIEW_NOTE_MAX: 400,
} as const;

export const SCHEMA_PATTERNS = {
  UID: /^[a-zA-Z0-9_-]+$/,
  STUDENT_ID: /^[a-zA-Z0-9-]*$/,
  CLUB_SLUG: /^[a-z0-9-]+$/,
  HTTPS_URL: /^$|^https:\/\/.*$/,
  EVENT_DATE: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  EVENT_TIME: /^[0-9]{2}:[0-9]{2}$/,
} as const;

export const SEMESTER_OPTIONS: SemesterOption[] = [
  'Semester 1',
  'Semester 2',
  'Semester 3',
  'Semester 4',
  'Semester 5',
  'Semester 6',
  'Semester 7',
  'Semester 8',
  'Faculty',
];

export const CS_TRACK_OPTIONS: CSTrack[] = [
  'General CS',
  'Systems & Architecture',
  'AI & Machine Learning',
  'Cybersecurity',
  'Software Engineering',
  'Data Science',
  'Department Faculty',
];

export const ADMIN_TITLE_OPTIONS: AssignedAdminTitle[] = ['Head CR', 'Head GR', 'HOD'];

export const CLUB_CATEGORIES: ClubCategory[] = [
  'AI & Data',
  'Systems & Cloud',
  'Cybersecurity',
  'Software & Web',
  'Competitive Programming',
  'Robotics & IoT',
  'Research & Open Source',
];

export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = [
  'Academic',
  'Examination',
  'Club Notice',
  'Placement & Career',
  'General',
];

export const EVENT_CATEGORIES: EventCategory[] = [
  'Seminar',
  'Workshop',
  'Hackathon',
  'Club Meetup',
  'Academic Deadline',
  'Department Townhall',
];

export const REPORT_REASONS: ReportReason[] = [
  'Spam or Self-Promotion',
  'Harassment or Disrespect',
  'Off-Topic for Club',
  'Academic Integrity Violation',
  'Misinformation or Unsafe Link',
];

export const BOOTSTRAP_ADMIN_EMAIL = 'apexorasolution@gmail.com';

export interface BootstrapAdminSpec {
  email: string;
  adminTitle: AssignedAdminTitle;
  defaultDisplayName: string;
  defaultSemester: SemesterOption;
  defaultTrack: CSTrack;
  requiresEmailVerified: boolean;
}

export const DEPARTMENT_ADMIN_ACCOUNTS: readonly BootstrapAdminSpec[] = [
  {
    email: 'hodcs@uos.edu.pk',
    adminTitle: 'HOD',
    defaultDisplayName: 'Head of Department (CS)',
    defaultSemester: 'Faculty',
    defaultTrack: 'Department Faculty',
    requiresEmailVerified: false,
  },
  {
    email: 'csheadcr@uos.edu.pk',
    adminTitle: 'Head CR',
    defaultDisplayName: 'Head CR — CS Department',
    defaultSemester: 'Semester 8',
    defaultTrack: 'Software Engineering',
    requiresEmailVerified: false,
  },
  {
    email: 'csheadgr@uos.edu.pk',
    adminTitle: 'Head GR',
    defaultDisplayName: 'Head GR — CS Department',
    defaultSemester: 'Semester 8',
    defaultTrack: 'Software Engineering',
    requiresEmailVerified: false,
  },
  {
    email: BOOTSTRAP_ADMIN_EMAIL,
    adminTitle: 'HOD',
    defaultDisplayName: 'Department Admin (HOD)',
    defaultSemester: 'Faculty',
    defaultTrack: 'Department Faculty',
    requiresEmailVerified: true,
  },
] as const;

export function getBootstrapAdminSpec(
  email: string | null | undefined,
  emailVerified: boolean
): BootstrapAdminSpec | null {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const spec = DEPARTMENT_ADMIN_ACCOUNTS.find((a) => a.email === normalized) ?? null;
  if (!spec) return null;
  if (spec.requiresEmailVerified && !emailVerified) return null;
  return spec;
}

export function sanitizeDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < SCHEMA_LIMITS.DISPLAY_NAME_MIN) {
    return 'CS Member';
  }
  return trimmed.slice(0, SCHEMA_LIMITS.DISPLAY_NAME_MAX);
}

export function sanitizePhotoURL(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= SCHEMA_LIMITS.PHOTO_URL_MAX &&
    SCHEMA_PATTERNS.HTTPS_URL.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

export function validateHttpsUrl(raw: string): { valid: boolean; value: string; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, value: '', error: null };
  }
  if (trimmed.length > SCHEMA_LIMITS.URL_MAX) {
    return { valid: false, value: '', error: `URL must be ${SCHEMA_LIMITS.URL_MAX} characters or fewer.` };
  }
  if (!trimmed.startsWith('https://')) {
    return { valid: false, value: '', error: 'Links and attachments must start with https://' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, value: '', error: 'Only secure https:// URLs are permitted.' };
    }
    return { valid: true, value: trimmed, error: null };
  } catch {
    return { valid: false, value: '', error: 'Please enter a valid https:// URL.' };
  }
}

export function slugifyClubName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SCHEMA_LIMITS.CLUB_SLUG_MAX);
}

export function sanitizeStudentId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, SCHEMA_LIMITS.STUDENT_ID_MAX);
}

export function sanitizeBio(raw: string): string {
  return raw.trim().slice(0, SCHEMA_LIMITS.BIO_MAX);
}

export function parseAndValidateClubSlugs(rawInput: string): {
  valid: boolean;
  slugs: string[];
  error: string | null;
} {
  const parts = rawInput
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const unique = Array.from(new Set(parts));

  if (unique.length > SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX) {
    return {
      valid: false,
      slugs: [],
      error: `A moderator can be assigned at most ${SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX} clubs.`,
    };
  }

  for (const slug of unique) {
    if (
      slug.length < SCHEMA_LIMITS.CLUB_SLUG_MIN ||
      slug.length > SCHEMA_LIMITS.CLUB_SLUG_MAX ||
      !SCHEMA_PATTERNS.CLUB_SLUG.test(slug)
    ) {
      return {
        valid: false,
        slugs: [],
        error: `Invalid club slug "${slug}". Use 2–64 lowercase letters, numbers, or hyphens (e.g., ai-research).`,
      };
    }
  }

  return { valid: true, slugs: unique, error: null };
}

export function formatRelativeTime(dateInput: Date | null): string {
  if (!dateInput) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - dateInput.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return dateInput.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatFullDateTime(dateInput: Date | null): string {
  if (!dateInput) return 'Pending timestamp';
  return dateInput.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
