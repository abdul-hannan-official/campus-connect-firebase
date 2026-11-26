import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Info,
  Layers,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { subscribeToUserNotifications } from '../services/activityService.ts';
import { subscribeToClubs, subscribeToUserMemberships } from '../services/clubService.ts';
import {
  subscribeToAnnouncements,
  subscribeToEvents,
} from '../services/departmentContentService.ts';
import { subscribeToDepartmentDirectory } from '../services/userService.ts';
import type {
  Announcement,
  AppNotification,
  Club,
  ClubMembership,
  DepartmentConfig,
  DepartmentEvent,
  MemberProfile,
  NavSection,
  ToastNotice,
} from '../types/campus.ts';
import { AdminConsoleView } from './AdminConsoleView.tsx';
import { AnnouncementsView } from './AnnouncementsView.tsx';
import { BrandLogo } from './BrandLogo.tsx';
import { CalendarView } from './CalendarView.tsx';
import { ClubsView } from './ClubsView.tsx';
import { DirectoryView } from './DirectoryView.tsx';
import { DiscussionsView } from './DiscussionsView.tsx';
import { ModeratorConsoleView } from './ModeratorConsoleView.tsx';
import { NotificationsView } from './NotificationsView.tsx';
import { OverviewView } from './OverviewView.tsx';
import { ProfileSettingsView } from './ProfileSettingsView.tsx';

interface DashboardShellProps {
  isDark: boolean;
  onToggleTheme: () => void;
  departmentConfig: DepartmentConfig | null;
}

interface NavItem {
  id: NavSection;
  label: string;
  icon: ReactNode;
  group: 'menu' | 'community' | 'governance';
  count?: number;
}

export function DashboardShell({
  isDark,
  onToggleTheme,
  departmentConfig,
}: DashboardShellProps) {
  const {
    firebaseUser,
    profile,
    verifiedRole,
    verifiedAdminTitle,
    isAdmin,
    isModerator,
    signOutUser,
  } = useAuth();

  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Quick Search (Ctrl+K)
  const [quickQuery, setQuickQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Live Firestore collections shared across modules
  const [directoryMembers, setDirectoryMembers] = useState<MemberProfile[]>([]);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(true);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isClubsLoading, setIsClubsLoading] = useState(true);
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isAnnouncementsLoading, setIsAnnouncementsLoading] = useState(true);
  const [events, setEvents] = useState<DepartmentEvent[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(true);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Deep-link cross-module targets
  const [targetClubId, setTargetClubId] = useState<string | null>(null);
  const [targetFeedClubId, setTargetFeedClubId] = useState<string | null>(null);
  const [targetPostId, setTargetPostId] = useState<string | null>(null);
  const [targetAnnouncementId, setTargetAnnouncementId] = useState<string | null>(null);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Ctrl+K / Cmd+K focuses global search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setIsDirectoryLoading(true);
    const unsub = subscribeToDepartmentDirectory(
      (members) => {
        setDirectoryMembers(members);
        setIsDirectoryLoading(false);
      },
      (err) => {
        setIsDirectoryLoading(false);
        setFatalError(err);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsClubsLoading(true);
    const unsub = subscribeToClubs(
      (items) => {
        setClubs(items);
        setIsClubsLoading(false);
      },
      (err) => {
        setIsClubsLoading(false);
        handleNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [handleNotify]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = subscribeToUserMemberships(
      firebaseUser.uid,
      (items) => setMemberships(items),
      (err) => handleNotify('error', err.message)
    );
    return () => unsub();
  }, [firebaseUser, handleNotify]);

  useEffect(() => {
    setIsAnnouncementsLoading(true);
    const unsub = subscribeToAnnouncements(
      (items) => {
        setAnnouncements(items);
        setIsAnnouncementsLoading(false);
      },
      (err) => {
        setIsAnnouncementsLoading(false);
        handleNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [handleNotify]);

  useEffect(() => {
    setIsEventsLoading(true);
    const unsub = subscribeToEvents(
      (items) => {
        setEvents(items);
        setIsEventsLoading(false);
      },
      (err) => {
        setIsEventsLoading(false);
        handleNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [handleNotify]);

  useEffect(() => {
    if (!firebaseUser) return;
    setIsNotificationsLoading(true);
    const unsub = subscribeToUserNotifications(
      firebaseUser.uid,
      (items) => {
        setNotifications(items);
        setIsNotificationsLoading(false);
      },
      (err) => {
        setIsNotificationsLoading(false);
        handleNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [firebaseUser, handleNotify]);

  if (fatalError) {
    throw fatalError;
  }

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const activeClubsCount = useMemo(
    () => clubs.filter((c) => c.status === 'active').length,
    [clubs]
  );

  // Live instant search matches across clubs, announcements, events, and members
  const quickSearchResults = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{
      id: string;
      kind: 'Club' | 'Announcement' | 'Event' | 'Member';
      title: string;
      subtitle: string;
      onSelect: () => void;
    }> = [];

    for (const c of clubs) {
      if (c.status === 'active' && (c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))) {
        results.push({
          id: `club-${c.clubId}`,
          kind: 'Club',
          title: c.name,
          subtitle: `${c.category} · ${c.memberCount} members`,
          onSelect: () => {
            setTargetClubId(c.clubId);
            setActiveSection('clubs');
            setQuickQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 4) break;
    }

    for (const a of announcements) {
      if (a.status === 'published' && (a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))) {
        results.push({
          id: `ann-${a.announcementId}`,
          kind: 'Announcement',
          title: a.title,
          subtitle: `${a.category} · ${a.authorTitle}`,
          onSelect: () => {
            setTargetAnnouncementId(a.announcementId);
            setActiveSection('announcements');
            setQuickQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 7) break;
    }

    for (const ev of events) {
      if (ev.status !== 'archived' && (ev.title.toLowerCase().includes(q) || ev.venue.toLowerCase().includes(q))) {
        results.push({
          id: `evt-${ev.eventId}`,
          kind: 'Event',
          title: ev.title,
          subtitle: `${ev.eventDate} · ${ev.venue}`,
          onSelect: () => {
            setTargetEventId(ev.eventId);
            setActiveSection('calendar');
            setQuickQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 10) break;
    }

    return results.slice(0, 8);
  }, [quickQuery, clubs, announcements, events]);

  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: <LayoutGrid className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
    },
    {
      id: 'clubs',
      label: 'Clubs',
      icon: <Layers className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
      count: activeClubsCount,
    },
    {
      id: 'discussions',
      label: 'Discussions',
      icon: <MessageSquare className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
    },
    {
      id: 'announcements',
      label: 'Announcements',
      icon: <Megaphone className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
    },
    {
      id: 'calendar',
      label: 'Event Calendar',
      icon: <CalendarDays className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'menu',
      count: unreadNotificationCount,
    },
    {
      id: 'directory',
      label: 'CS Directory',
      icon: <Users className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'community',
    },
    {
      id: 'profile',
      label: 'Settings',
      icon: <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'community',
    },
  ];

  if (isModerator || isAdmin) {
    navItems.push({
      id: 'moderator',
      label: 'Moderator Console',
      icon: <Shield className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'governance',
    });
  }

  if (isAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin Console',
      icon: <ShieldCheck className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />,
      group: 'governance',
    });
  }

  const handleNavigate = useCallback((section: NavSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }, []);

  const handleOpenClubDetail = useCallback((clubId: string) => {
    setTargetClubId(clubId);
    setActiveSection('clubs');
    setMobileMenuOpen(false);
  }, []);

  const handleOpenClubFeed = useCallback((clubId: string) => {
    setTargetFeedClubId(clubId);
    setTargetPostId(null);
    setActiveSection('discussions');
    setMobileMenuOpen(false);
  }, []);

  const handleOpenPost = useCallback((postId: string) => {
    setTargetPostId(postId);
    setTargetFeedClubId(null);
    setActiveSection('discussions');
    setMobileMenuOpen(false);
  }, []);

  const handleOpenAnnouncement = useCallback((announcementId: string) => {
    setTargetAnnouncementId(announcementId);
    setActiveSection('announcements');
    setMobileMenuOpen(false);
  }, []);

  const handleOpenEvent = useCallback((eventId: string) => {
    setTargetEventId(eventId);
    setActiveSection('calendar');
    setMobileMenuOpen(false);
  }, []);

  const handleOpenNotificationTarget = useCallback(
    (item: AppNotification) => {
      if (item.targetSection === 'discussions' && item.targetId) {
        handleOpenPost(item.targetId);
      } else if (item.targetSection === 'clubs' && item.targetId) {
        handleOpenClubDetail(item.targetId);
      } else if (item.targetSection === 'announcements' && item.targetId) {
        handleOpenAnnouncement(item.targetId);
      } else if (item.targetSection === 'calendar' && item.targetId) {
        handleOpenEvent(item.targetId);
      } else {
        handleNavigate(item.targetSection);
      }
    },
    [
      handleNavigate,
      handleOpenAnnouncement,
      handleOpenClubDetail,
      handleOpenEvent,
      handleOpenPost,
    ]
  );

  const clearInitialClub = useCallback(() => setTargetClubId(null), []);
  const clearInitialDiscussion = useCallback(() => {
    setTargetFeedClubId(null);
    setTargetPostId(null);
  }, []);
  const clearInitialAnnouncement = useCallback(() => setTargetAnnouncementId(null), []);
  const clearInitialEvent = useCallback(() => setTargetEventId(null), []);

  const roleSummary =
    verifiedRole === 'admin'
      ? `Admin · ${verifiedAdminTitle}`
      : verifiedRole === 'moderator'
        ? 'Club Moderator'
        : 'CS Student';

  const initials = (profile?.displayName ?? 'CS')
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-white dark:bg-[#0F1713]">
      {/* Brand Lockup */}
      <div className="flex h-[72px] items-center justify-between px-6">
        <button
          type="button"
          onClick={() => handleNavigate('overview')}
          className="cursor-pointer focus:outline-none"
        >
          <BrandLogo size="sm" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-950/60 lg:hidden cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Grouped Navigation */}
      <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
        {(
          [
            { key: 'menu', label: 'MENU' },
            { key: 'community', label: 'GENERAL' },
            { key: 'governance', label: 'GOVERNANCE' },
          ] as const
        ).map((group) => {
          const items = navItems.filter((item) => item.group === group.key);
          if (items.length === 0) return null;

          return (
            <div key={group.key}>
              <p className="px-3 text-[11px] font-semibold tracking-[0.08em] text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <ul className="mt-2 space-y-1">
                {items.map((item) => {
                  const active = activeSection === item.id;
                  return (
                    <li key={item.id} className="relative">
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-4 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-[#157347] dark:bg-emerald-400"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleNavigate(item.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'font-semibold text-slate-900 dark:text-white bg-emerald-50/70 dark:bg-emerald-950/50'
                            : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-emerald-950/30 dark:hover:text-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span
                            className={
                              active
                                ? 'text-[#157347] dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }
                          >
                            {item.icon}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {typeof item.count === 'number' && item.count > 0 && (
                          <span className="inline-flex min-w-[24px] items-center justify-center rounded-md bg-[#0F4C2E] dark:bg-emerald-600 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                            {item.count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/* Log out quick link inside General section */}
        <div className="pt-1 border-t border-slate-100 dark:border-emerald-950/60">
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </nav>

      {/* Compact Forest-Emerald Department Card (Mirrors Screenshot 1 Bottom Card) */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-2xl bg-emerald-hero p-4 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -bottom-8 h-28 w-28 rounded-full border-[14px] border-white/10"
          />
          <p className="font-display text-sm font-bold leading-snug">
            UOS Computer Science
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-100/85">
            {departmentConfig?.academicYear ?? '2026–2027'} · Verified department workspace.
          </p>
          <button
            type="button"
            onClick={() => handleNavigate(isAdmin ? 'admin' : 'clubs')}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>{isAdmin ? 'Admin Console' : 'Explore Clubs'}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F5] text-slate-900 dark:bg-[#090F0C] dark:text-slate-100 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:block lg:w-[258px] lg:border-r lg:border-slate-200/80 lg:dark:border-emerald-950/60">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
            aria-hidden="true"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] border-r border-slate-200 dark:border-emerald-950/60 shadow-2xl">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[258px]">
        {/* Floating Rounded Workspace Top Header (Inspired by Screenshots 1 & 3) */}
        <header className="sticky top-0 z-20 px-4 pt-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 max-w-[1220px] items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-emerald-950/60 bg-white/95 dark:bg-[#0F1713]/95 backdrop-blur-sm px-3.5 sm:px-5 shadow-[0_2px_12px_-4px_rgba(9,44,27,0.06)]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-emerald-950/50 lg:hidden cursor-pointer shrink-0"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Global Quick Search Bar with Ctrl K */}
              <div className="relative w-full max-w-md">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={quickQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => setQuickQuery(e.target.value)}
                  placeholder="Search clubs, notices, or events…"
                  className="w-full rounded-full border border-slate-200 dark:border-emerald-900/60 bg-[#F7F9F8] dark:bg-[#0A110D] pl-10 pr-16 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:bg-white dark:focus:bg-[#101814] focus:outline-none focus:ring-2 focus:ring-[#157347]/15 transition-colors"
                />
                <kbd className="pointer-events-none hidden sm:inline-flex items-center rounded-md border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#131F19] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2">
                  Ctrl K
                </kbd>

                {/* Live Search Dropdown */}
                {searchFocused && quickQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#101814] p-2 shadow-xl">
                    {quickSearchResults.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        No matching clubs, notices, or events found.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-emerald-950/60">
                        {quickSearchResults.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                item.onSelect();
                              }}
                              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {item.title}
                                </p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {item.subtitle}
                                </p>
                              </div>
                              <span className="text-[11px] font-semibold text-[#157347] dark:text-emerald-400 shrink-0">
                                {item.kind}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls: Bell, Theme, User Profile */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleNavigate('notifications')}
                aria-label={`Notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors cursor-pointer shrink-0 ${
                  activeSection === 'notifications'
                    ? 'border-[#157347] bg-emerald-50 text-[#157347] dark:border-emerald-500 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#142019] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/50'
                }`}
              >
                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#142019] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer shrink-0"
              >
                {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="flex items-center gap-2.5 rounded-full pl-1 pr-2.5 py-1 hover:bg-slate-100/80 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer text-left shrink-0"
              >
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-emerald-900/70 shrink-0"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100/90 dark:bg-emerald-900/70 text-xs font-bold text-amber-900 dark:text-emerald-200">
                    {initials || 'CS'}
                  </div>
                )}
                <div className="hidden md:block min-w-0 max-w-[165px]">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                    {profile?.displayName ?? 'CS Member'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                    {roleSummary}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="mx-auto w-full max-w-[1220px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {activeSection === 'overview' && (
            <OverviewView
              directoryMembers={directoryMembers}
              isDirectoryLoading={isDirectoryLoading}
              departmentConfig={departmentConfig}
              clubs={clubs}
              memberships={memberships}
              announcements={announcements}
              events={events}
              unreadNotificationCount={unreadNotificationCount}
              onNavigate={handleNavigate}
              onOpenClub={handleOpenClubDetail}
              onOpenAnnouncement={handleOpenAnnouncement}
              onOpenEvent={handleOpenEvent}
            />
          )}
          {activeSection === 'profile' && <ProfileSettingsView />}
          {activeSection === 'directory' && (
            <DirectoryView members={directoryMembers} isLoading={isDirectoryLoading} />
          )}
          {activeSection === 'clubs' && (
            <ClubsView
              clubs={clubs}
              isLoading={isClubsLoading}
              memberships={memberships}
              directoryMembers={directoryMembers}
              initialClubId={targetClubId}
              onClearInitialClub={clearInitialClub}
              onOpenClubFeed={handleOpenClubFeed}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'discussions' && (
            <DiscussionsView
              clubs={clubs}
              memberships={memberships}
              initialClubId={targetFeedClubId}
              initialPostId={targetPostId}
              onClearInitialSelection={clearInitialDiscussion}
              onOpenClub={handleOpenClubDetail}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'announcements' && (
            <AnnouncementsView
              announcements={announcements}
              isLoading={isAnnouncementsLoading}
              initialAnnouncementId={targetAnnouncementId}
              onClearInitialAnnouncement={clearInitialAnnouncement}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'calendar' && (
            <CalendarView
              events={events}
              clubs={clubs}
              isLoading={isEventsLoading}
              initialEventId={targetEventId}
              onClearInitialEvent={clearInitialEvent}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              isLoading={isNotificationsLoading}
              onOpenNotificationTarget={handleOpenNotificationTarget}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'moderator' && (
            <ModeratorConsoleView
              clubs={clubs}
              onNavigate={handleNavigate}
              onOpenClubFeed={handleOpenClubFeed}
              onOpenPost={handleOpenPost}
              onNotify={handleNotify}
            />
          )}
          {activeSection === 'admin' && (
            <AdminConsoleView
              members={directoryMembers}
              isLoading={isDirectoryLoading}
              clubs={clubs}
              onNavigate={handleNavigate}
              onNotify={handleNotify}
            />
          )}
        </main>
      </div>

      {/* Accessible Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 pointer-events-none"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-xs shadow-lg ${
                toast.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950 dark:text-red-200'
                  : toast.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950 dark:text-emerald-100'
                    : 'border-slate-200 bg-white text-slate-900 dark:border-emerald-900/70 dark:bg-[#101814] dark:text-slate-100'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {toast.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                ) : toast.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
                )}
                <span className="leading-relaxed">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
