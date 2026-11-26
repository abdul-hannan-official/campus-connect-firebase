import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Layers,
  Megaphone,
  MessageSquare,
  Pin,
  Shield,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { formatRelativeTime } from '../lib/validation.ts';
import type {
  Announcement,
  Club,
  ClubMembership,
  DepartmentConfig,
  DepartmentEvent,
  MemberProfile,
  NavSection,
} from '../types/campus.ts';

interface OverviewViewProps {
  directoryMembers: MemberProfile[];
  isDirectoryLoading: boolean;
  departmentConfig: DepartmentConfig | null;
  clubs: Club[];
  memberships: ClubMembership[];
  announcements: Announcement[];
  events: DepartmentEvent[];
  unreadNotificationCount: number;
  onNavigate: (section: NavSection) => void;
  onOpenClub: (clubId: string) => void;
  onOpenAnnouncement: (announcementId: string) => void;
  onOpenEvent: (eventId: string) => void;
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function OverviewView({
  directoryMembers,
  isDirectoryLoading,
  departmentConfig,
  clubs,
  memberships,
  announcements,
  events,
  unreadNotificationCount,
  onNavigate,
  onOpenClub,
  onOpenAnnouncement,
  onOpenEvent,
}: OverviewViewProps) {
  const { profile, verifiedRole, verifiedAdminTitle, isAdmin, isModerator } = useAuth();

  const roleDisplay =
    verifiedRole === 'admin'
      ? `Admin · ${verifiedAdminTitle}`
      : verifiedRole === 'moderator'
        ? 'Club Moderator'
        : 'CS Student';

  const activeClubs = useMemo(
    () =>
      clubs
        .filter((c) => c.status === 'active')
        .sort((a, b) => b.memberCount - a.memberCount),
    [clubs]
  );

  const publishedAnnouncements = useMemo(
    () => announcements.filter((a) => a.status === 'published'),
    [announcements]
  );

  const pinnedAnnouncementsCount = useMemo(
    () => publishedAnnouncements.filter((a) => a.isPinned).length,
    [publishedAnnouncements]
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    return events.filter((ev) => ev.status === 'scheduled' && ev.eventDate >= todayIso);
  }, [events]);

  // Real 7-day Monday–Sunday activity counts computed from live Firestore announcements & events
  const weeklyActivity = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay(); // 0=Sun..6=Sat
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun

    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - todayIndex);

    const dayIsoStrings: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayIsoStrings.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`
      );
    }

    const counts = Array(7).fill(0) as number[];

    for (const ann of publishedAnnouncements) {
      const dt = ann.createdAt?.toDate();
      if (!dt) continue;
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
        dt.getDate()
      ).padStart(2, '0')}`;
      const idx = dayIsoStrings.indexOf(iso);
      if (idx !== -1) counts[idx] += 1;
    }

    for (const ev of events) {
      if (ev.status === 'archived') continue;
      const idx = dayIsoStrings.indexOf(ev.eventDate);
      if (idx !== -1) counts[idx] += 1;
    }

    const maxVal = Math.max(1, ...counts);
    const totalThisWeek = counts.reduce((sum, n) => sum + n, 0);

    return {
      todayIndex,
      counts,
      maxVal,
      totalThisWeek,
    };
  }, [publishedAnnouncements, events]);

  const spotlightNotice = publishedAnnouncements[0] ?? null;

  const permissionMatrix = [
    {
      module: 'Academic Profile & Private ID',
      access: 'Read & Edit Own Record',
      enforcement: 'Owner-scoped Firestore rule; PII isolated in /users/{uid}',
    },
    {
      module: 'Clubs & Discussion Feeds',
      access: isAdmin
        ? 'Create Clubs, Approve Requests & Global Moderation'
        : isModerator
          ? `Moderate Assigned Clubs (${profile?.assignedClubIds.length ?? 0}) & Participate`
          : 'Join Clubs, Request New Clubs, Post & Comment',
      enforcement: 'Atomic membership, vote & club-moderator Firestore rules',
    },
    {
      module: 'Official Announcements & Calendar',
      access: isAdmin ? 'Publish, Pin, Edit & Manage Official Items' : 'Read Official Notices & Schedule',
      enforcement: 'Write access strictly restricted to Head CR, Head GR & HOD',
    },
    {
      module: 'Role & Governance Console',
      access: isAdmin ? 'Assign Admin & Moderator Roles' : 'Restricted to Department Admins',
      enforcement: 'Atomic Firestore writeBatch verified against /admins/{uid}',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header Row (Mirrors Screenshot 1) */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {departmentConfig?.departmentName ?? 'Department of Computer Science'} · Welcome back,{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {profile?.displayName ?? 'CS Member'}
            </span>{' '}
            ({roleDisplay})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate(isAdmin ? 'admin' : 'discussions')}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(15,76,46,0.5)] transition-all cursor-pointer whitespace-nowrap"
          >
            {isAdmin ? (
              <Shield className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isAdmin ? 'Admin Console' : 'Open Discussions'}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('clubs')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#101814] px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Layers className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
            <span>Browse Clubs</span>
          </button>
        </div>
      </section>

      {/* 4-Card Bento KPI Strip (Hero Forest-Emerald Card + 3 Crisp White Cards) */}
      <section aria-label="Department KPIs" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1 — Featured Deep Forest-Emerald Card */}
        <button
          type="button"
          onClick={() => onNavigate('clubs')}
          className="group relative overflow-hidden rounded-[22px] bg-emerald-hero p-6 text-left text-white shadow-[0_12px_30px_-14px_rgba(9,44,27,0.55)] transition-transform hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-emerald-100/90">Active CS Clubs</span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0F4C2E] transition-transform group-hover:scale-105 shrink-0">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 font-display text-5xl font-bold tracking-tight tabular-nums">
            {activeClubs.length}
          </p>
          <p className="mt-4 text-xs text-emerald-100/85">
            <span className="font-mono font-semibold tabular-nums">{memberships.length}</span> joined
            by you
          </p>
        </button>

        {/* Card 2 — Department Members */}
        <button
          type="button"
          onClick={() => onNavigate('directory')}
          className="group rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 text-left shadow-[0_1px_3px_rgba(11,59,36,0.04)] transition-transform hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Department Members
            </span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/70 text-slate-700 dark:text-slate-200 group-hover:border-[#157347] group-hover:text-[#157347] transition-colors shrink-0">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 font-display text-5xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {isDirectoryLoading ? '—' : directoryMembers.length}
          </p>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Verified CS directory accounts
          </p>
        </button>

        {/* Card 3 — Official Notices */}
        <button
          type="button"
          onClick={() => onNavigate('announcements')}
          className="group rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 text-left shadow-[0_1px_3px_rgba(11,59,36,0.04)] transition-transform hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Official Notices
            </span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/70 text-slate-700 dark:text-slate-200 group-hover:border-[#157347] group-hover:text-[#157347] transition-colors shrink-0">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 font-display text-5xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {publishedAnnouncements.length}
          </p>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono font-semibold text-[#157347] dark:text-emerald-400 tabular-nums">
              {pinnedAnnouncementsCount}
            </span>{' '}
            pinned official notices
          </p>
        </button>

        {/* Card 4 — Upcoming Events / Unread Inbox */}
        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="group rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 text-left shadow-[0_1px_3px_rgba(11,59,36,0.04)] transition-transform hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Upcoming Events
            </span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/70 text-slate-700 dark:text-slate-200 group-hover:border-[#157347] group-hover:text-[#157347] transition-colors shrink-0">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 font-display text-5xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {upcomingEvents.length}
          </p>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {unreadNotificationCount > 0 ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                {unreadNotificationCount} unread notifications
              </span>
            ) : (
              'All notifications read'
            )}
          </p>
        </button>
      </section>

      {/* Second Row — 3-Column Bento Analytics, Spotlight & Active Clubs (Mirrors Screenshot 1) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-stretch">
        {/* Weekly Department Activity Bar Chart */}
        <div className="lg:col-span-5 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Department activity this week
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {weeklyActivity.totalThisWeek}
                </span>{' '}
                notices &amp; scheduled events Mon–Sun
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">7d</span>
          </div>

          <div className="mt-8 grid grid-cols-7 gap-2.5 sm:gap-3 items-end h-44">
            {WEEKDAY_LABELS.map((label, idx) => {
              const count = weeklyActivity.counts[idx];
              const isFuture = idx > weeklyActivity.todayIndex;
              const isToday = idx === weeklyActivity.todayIndex;
              const heightPct = isFuture
                ? 72
                : Math.max(18, Math.round((count / weeklyActivity.maxVal) * 100));

              return (
                <div key={`${label}-${idx}`} className="flex flex-col items-center gap-2.5 h-full justify-end">
                  {isToday && (
                    <span className="rounded-md border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#16221C] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-emerald-300 tabular-nums">
                      {count}
                    </span>
                  )}
                  <div
                    title={`${label}: ${count} items`}
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[42px] rounded-full transition-all ${
                      isFuture
                        ? 'bg-hatched-emerald'
                        : isToday
                          ? 'bg-emerald-500/75 dark:bg-emerald-400/80'
                          : 'bg-[#157347] dark:bg-emerald-600'
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isToday
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Spotlight Card ("Needs attention" / Latest Official Notice) */}
        <div className="lg:col-span-4 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          {profile && !profile.onboardingCompleted ? (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Needs attention
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-[#0F4C2E] dark:text-emerald-300 leading-snug">
                  Complete your CS academic profile
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Add your semester, specialization track, and private student ID so department
                  clubs and peers can collaborate with you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-btn px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(15,76,46,0.5)] cursor-pointer"
              >
                <span>Complete profile setup</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : spotlightNotice ? (
            <>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {spotlightNotice.isPinned ? 'Pinned official notice' : 'Latest announcement'}
                  </p>
                  {spotlightNotice.isPinned && (
                    <Pin className="h-3.5 w-3.5 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
                  )}
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-[#0F4C2E] dark:text-emerald-300 leading-snug line-clamp-2">
                  {spotlightNotice.title}
                </h2>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {spotlightNotice.category} · {spotlightNotice.authorTitle} ·{' '}
                  <time className="font-mono tabular-nums">
                    {formatRelativeTime(spotlightNotice.createdAt?.toDate() ?? null)}
                  </time>
                </p>
                <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3">
                  {spotlightNotice.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAnnouncement(spotlightNotice.announcementId)}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-btn px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(15,76,46,0.5)] cursor-pointer"
              >
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                <span>Read official notice</span>
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Official bulletin
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-slate-900 dark:text-white leading-snug">
                  No official notices yet
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {isAdmin
                    ? 'Publish the first official CS Department announcement for students and moderators.'
                    : 'Announcements from HOD, Head CR, and Head GR will be highlighted right here.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('announcements')}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-btn px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(15,76,46,0.5)] cursor-pointer"
              >
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                <span>{isAdmin ? 'Publish announcement' : 'Open announcements'}</span>
              </button>
            </>
          )}
        </div>

        {/* Right List Card: Active CS Clubs (Mirrors Screenshot 1 "Most reported") */}
        <div className="lg:col-span-3 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 flex flex-col justify-between shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Top CS clubs
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('clubs')}
                aria-label="View all clubs"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/70 text-slate-600 dark:text-slate-300 hover:border-[#157347] hover:text-[#157347] transition-colors cursor-pointer"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {activeClubs.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                No active clubs created yet. {isAdmin ? 'Create the first CS club in Clubs.' : ''}
              </p>
            ) : (
              <ul className="mt-5 space-y-3.5">
                {activeClubs.slice(0, 3).map((club) => (
                  <li key={club.clubId}>
                    <button
                      type="button"
                      onClick={() => onOpenClub(club.clubId)}
                      className="flex w-full items-center gap-3 rounded-xl p-1.5 -mx-1.5 text-left hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer group"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-[#157347] dark:text-emerald-400">
                        <Layers className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#157347] dark:group-hover:text-emerald-400 transition-colors">
                          {club.name}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">{club.memberCount}</span> members ·{' '}
                          {club.category}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('clubs')}
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
          >
            <span>View all clubs</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Third Row — Upcoming Events & Active Permission Boundaries */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        <div className="lg:col-span-5 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-emerald-950/60">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Upcoming CS calendar
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
            >
              Full calendar
            </button>
          </div>

          {upcomingEvents.length === 0 ? (
            <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
              No upcoming CS department events scheduled yet.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-emerald-950/60">
              {upcomingEvents.slice(0, 3).map((ev) => (
                <button
                  key={ev.eventId}
                  type="button"
                  onClick={() => onOpenEvent(ev.eventId)}
                  className="block w-full py-3.5 text-left first:pt-1 last:pb-0 cursor-pointer group"
                >
                  <p className="font-mono text-xs font-medium text-[#157347] dark:text-emerald-400 tabular-nums">
                    {ev.eventDate} · {ev.startTime}–{ev.endTime} · {ev.category}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#157347] dark:group-hover:text-emerald-400 transition-colors">
                    {ev.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{ev.venue}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          <div className="flex flex-col gap-1 border-b border-slate-100 dark:border-emerald-950/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Active permission boundaries
              </h2>
            </div>
            <span className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
              {roleDisplay}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="px-6 py-3 font-medium">Module</th>
                  <th className="px-6 py-3 font-medium">Your access</th>
                  <th className="px-6 py-3 font-medium">Enforcement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-950/60 text-sm">
                {permissionMatrix.map((row) => (
                  <tr
                    key={row.module}
                    className="hover:bg-slate-50/80 dark:hover:bg-emerald-950/20 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.module}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {row.access}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {row.enforcement}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
