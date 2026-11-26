import {
  Activity,
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Layers,
  Lock,
  Megaphone,
  Search,
  Shield,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ADMIN_TITLE_OPTIONS,
  formatFullDateTime,
  formatRelativeTime,
  parseAndValidateClubSlugs,
} from '../lib/validation.ts';
import { logActivity, subscribeToActivityLogs } from '../services/activityService.ts';
import { assignMemberRole, lookupProfileByUid } from '../services/userService.ts';
import type {
  ActivityLog,
  AssignedAdminTitle,
  Club,
  MemberProfile,
  NavSection,
  UserRole,
} from '../types/campus.ts';

interface AdminConsoleViewProps {
  members: MemberProfile[];
  isLoading: boolean;
  clubs: Club[];
  onNavigate: (section: NavSection) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

type AdminTab = 'roles' | 'activity';

export function AdminConsoleView({
  members,
  isLoading,
  clubs,
  onNavigate,
  onNotify,
}: AdminConsoleViewProps) {
  const { firebaseUser, profile, isAdmin, verifiedAdminTitle } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('roles');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [lookedUpMember, setLookedUpMember] = useState<MemberProfile | null>(null);
  const [uidSearchInput, setUidSearchInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [nextRole, setNextRole] = useState<UserRole>('student');
  const [nextAdminTitle, setNextAdminTitle] = useState<AssignedAdminTitle>('Head CR');
  const [clubSlugsInput, setClubSlugsInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Department Audit Log state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !firebaseUser) return;
    setIsLogsLoading(true);
    const unsub = subscribeToActivityLogs(
      { isAdmin: true, userId: firebaseUser.uid },
      (items) => {
        setActivityLogs(items);
        setIsLogsLoading(false);
        setLogsError(null);
      },
      (err) => {
        setIsLogsLoading(false);
        setLogsError(err.message);
      }
    );
    return () => unsub();
  }, [isAdmin, firebaseUser]);

  const selectedMember = useMemo(() => {
    if (!selectedUid) return null;
    const fromDirectory = members.find((m) => m.uid === selectedUid);
    if (fromDirectory) return fromDirectory;
    if (lookedUpMember && lookedUpMember.uid === selectedUid) return lookedUpMember;
    return null;
  }, [members, selectedUid, lookedUpMember]);

  const stats = useMemo(() => {
    const admins = members.filter((m) => m.role === 'admin').length;
    const moderators = members.filter((m) => m.role === 'moderator').length;
    const students = members.filter((m) => m.role === 'student').length;
    return { total: members.length, admins, moderators, students };
  }, [members]);

  const activeClubSlugs = useMemo(
    () => clubs.filter((c) => c.status === 'active').map((c) => c.clubId),
    [clubs]
  );

  if (!isAdmin) {
    return (
      <div className="max-w-xl rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-red-700 dark:text-red-400 mt-0.5 shrink-0" />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Administrator Access Required
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Role governance is restricted to verified Department Admins (Head CR, Head GR, and
              HOD) and enforced directly by Cloud Firestore security rules.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectMember = (member: MemberProfile) => {
    setSelectedUid(member.uid);
    setNextRole(member.role);
    setNextAdminTitle(member.adminTitle === 'none' ? 'Head CR' : member.adminTitle);
    setClubSlugsInput(member.assignedClubIds.join(', '));
    setFeedback(null);
  };

  const handleLookupByUid = async (e: FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    if (!uidSearchInput.trim()) return;
    setIsLookingUp(true);
    try {
      const found = await lookupProfileByUid(uidSearchInput);
      if (!found) {
        setLookupError('No CS profile document found for that UID.');
        return;
      }
      setLookedUpMember(found);
      handleSelectMember(found);
      setUidSearchInput('');
      onNotify(
        'info',
        `Loaded profile for ${found.displayName}${found.isDirectoryVisible ? '' : ' (hidden from directory)'}.`
      );
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Unable to look up UID.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleCommitRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedMember) return;

    setFeedback(null);

    if (selectedMember.uid === firebaseUser.uid && nextRole !== 'admin') {
      setFeedback({
        type: 'error',
        text: 'You cannot demote your own administrator account.',
      });
      return;
    }

    let slugs: string[] = [];
    if (nextRole === 'moderator') {
      const parsed = parseAndValidateClubSlugs(clubSlugsInput);
      if (!parsed.valid) {
        setFeedback({ type: 'error', text: parsed.error ?? 'Invalid club slugs.' });
        return;
      }
      slugs = parsed.slugs;
    }

    setIsUpdating(true);
    try {
      await assignMemberRole({
        adminUid: firebaseUser.uid,
        targetUid: selectedMember.uid,
        nextRole,
        nextAdminTitle,
        nextAssignedClubIds: slugs,
      });

      if (lookedUpMember && lookedUpMember.uid === selectedMember.uid) {
        setLookedUpMember({
          ...lookedUpMember,
          role: nextRole,
          adminTitle: nextRole === 'admin' ? nextAdminTitle : 'none',
          assignedClubIds: nextRole === 'moderator' ? slugs : [],
        });
      }

      if (profile) {
        await logActivity({
          actorId: profile.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          action: 'role_updated',
          entityType: 'role',
          entityId: selectedMember.uid,
          summary: `Assigned ${selectedMember.displayName} role "${nextRole}"${
            nextRole === 'admin'
              ? ` (${nextAdminTitle})`
              : nextRole === 'moderator'
                ? ` (${slugs.length} clubs)`
                : ''
          }`,
        });
      }

      setFeedback({
        type: 'success',
        text: `Updated ${selectedMember.displayName}'s role atomically in Cloud Firestore.`,
      });
      onNotify('success', `Updated ${selectedMember.displayName}'s role.`);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to update member role.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
            Department Governance · {verifiedAdminTitle}
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Admin Console &amp; Governance
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Assign Head CR, Head GR, HOD, or club-scoped Moderator privileges, inspect hidden
            profiles by UID, and audit department activity.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 px-3.5 py-1.5 text-xs font-semibold text-[#0F4C2E] dark:text-emerald-300 shrink-0 self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
          <span>Verified Admin Session</span>
        </div>
      </div>

      {/* Role Distribution Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[22px] bg-emerald-hero p-5 text-white shadow-sm">
          <p className="text-xs font-medium text-emerald-100/85">Total Visible Members</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {isLoading ? '—' : stats.total}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Department Admins</p>
          <p className="mt-2 font-display text-3xl font-bold text-[#157347] dark:text-emerald-400 tabular-nums">
            {isLoading ? '—' : stats.admins}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Club Moderators</p>
          <p className="mt-2 font-display text-3xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
            {isLoading ? '—' : stats.moderators}
          </p>
        </div>
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active CS Clubs</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {activeClubSlugs.length}
          </p>
        </div>
      </div>

      {/* Department Management Quick Links */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Clubs & Proposals',
            sub: 'Create clubs, approve requests & assign moderators',
            icon: <Layers className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />,
            section: 'clubs' as NavSection,
          },
          {
            label: 'Official Announcements',
            sub: 'Publish, pin, edit & archive CS notices',
            icon: <Megaphone className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />,
            section: 'announcements' as NavSection,
          },
          {
            label: 'Event Calendar',
            sub: 'Schedule seminars, hackathons & deadlines',
            icon: <Calendar className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />,
            section: 'calendar' as NavSection,
          },
          {
            label: 'Moderation Queue',
            sub: 'Inspect reported posts & comments',
            icon: <Shield className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />,
            section: 'moderator' as NavSection,
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => onNavigate(card.section)}
            className="flex flex-col justify-between rounded-[20px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-4 text-left hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors cursor-pointer group shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50/80 dark:bg-emerald-950/60">
                {card.icon}
              </div>
              <ArrowRight
                className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#157347] dark:group-hover:text-emerald-400 transition-colors"
                aria-hidden="true"
              />
            </div>
            <div className="mt-3">
              <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {card.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{card.sub}</p>
            </div>
          </button>
        ))}
      </section>

      {/* Console Sub-Navigation */}
      <div className="inline-flex rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-semibold transition-colors cursor-pointer ${
            activeTab === 'roles'
              ? 'bg-[#0F4C2E] text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Role Assignment</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-semibold transition-colors cursor-pointer ${
            activeTab === 'activity'
              ? 'bg-[#0F4C2E] text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Department Audit Log ({activityLogs.length})</span>
        </button>
      </div>

      {activeTab === 'roles' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Members Role Table + Hidden UID Lookup */}
          <div className="lg:col-span-7 space-y-4">
            {/* Hidden Profile UID Lookup */}
            <form
              onSubmit={handleLookupByUid}
              className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <label
                htmlFor="uidLookup"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Direct UID Lookup (Includes Hidden Profiles)
              </label>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="uidLookup"
                    type="text"
                    value={uidSearchInput}
                    onChange={(e) => setUidSearchInput(e.target.value)}
                    placeholder="Paste Firebase user UID…"
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] pl-9 pr-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLookingUp || !uidSearchInput.trim()}
                  className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isLookingUp ? 'Looking up…' : 'Load Profile'}
                </button>
              </div>
              {lookupError && (
                <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
                  {lookupError}
                </p>
              )}
            </form>

            <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="border-b border-slate-100 dark:border-emerald-950/60 px-5 py-4">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Registered CS Department Accounts
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E]/70 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <th className="px-5 py-3 font-semibold">Member</th>
                      <th className="px-5 py-3 font-semibold">Current Role</th>
                      <th className="px-5 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-emerald-950/60 text-sm">
                    {members.map((member) => {
                      const isSelected = member.uid === selectedUid;
                      return (
                        <tr
                          key={member.uid}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/35'
                              : 'hover:bg-slate-50/70 dark:hover:bg-emerald-950/20'
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {member.displayName}
                              {member.uid === firebaseUser?.uid && (
                                <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                                  (You)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {member.semester} · {member.track}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-semibold whitespace-nowrap">
                            {member.role === 'admin' ? (
                              <span className="text-[#157347] dark:text-emerald-400">
                                Admin · {member.adminTitle}
                              </span>
                            ) : member.role === 'moderator' ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                Moderator ({member.assignedClubIds.length} clubs)
                              </span>
                            ) : (
                              <span className="text-slate-600 dark:text-slate-400">Student</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSelectMember(member)}
                              className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {isSelected ? 'Editing' : 'Manage Role'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Role Assignment Inspector Panel */}
          <div className="lg:col-span-5 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            {!selectedMember ? (
              <div className="py-10 text-center">
                <UserCog className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                <h2 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Select a member to manage permissions
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Choose any CS Department member from the table or load a hidden profile by UID to
                  assign or revoke Admin (Head CR, Head GR, HOD) or Club Moderator privileges.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCommitRole} className="space-y-5">
                <div className="border-b border-slate-100 dark:border-emerald-950/60 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      {selectedMember.displayName}
                    </h2>
                    {!selectedMember.isDirectoryVisible && (
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Hidden Profile
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                    UID: {selectedMember.uid}
                  </p>
                </div>

                {feedback && (
                  <div
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${
                      feedback.type === 'error'
                        ? 'border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
                        : 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {feedback.type === 'error' ? (
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>{feedback.text}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="roleSelect"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Platform Role
                  </label>
                  <select
                    id="roleSelect"
                    value={nextRole}
                    onChange={(e) => setNextRole(e.target.value as UserRole)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                  >
                    <option value="student" disabled={selectedMember.uid === firebaseUser?.uid}>
                      Student (Standard Member)
                    </option>
                    <option value="moderator" disabled={selectedMember.uid === firebaseUser?.uid}>
                      Moderator (Assigned Clubs Only)
                    </option>
                    <option value="admin">Admin (Head CR / Head GR / HOD)</option>
                  </select>
                </div>

                {nextRole === 'admin' && (
                  <div>
                    <label
                      htmlFor="adminTitleSelect"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      Official Department Title
                    </label>
                    <select
                      id="adminTitleSelect"
                      value={nextAdminTitle}
                      onChange={(e) => setNextAdminTitle(e.target.value as AssignedAdminTitle)}
                      className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                    >
                      {ADMIN_TITLE_OPTIONS.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {nextRole === 'moderator' && (
                  <div>
                    <label
                      htmlFor="assignedClubs"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      Assigned Club Slugs (Max 10)
                    </label>
                    <input
                      id="assignedClubs"
                      type="text"
                      value={clubSlugsInput}
                      onChange={(e) => setClubSlugsInput(e.target.value)}
                      placeholder="e.g., ai-research, systems-lab"
                      className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                    />
                    {activeClubSlugs.length > 0 && (
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        Active club slugs:{' '}
                        <span className="font-mono">{activeClubSlugs.join(', ')}</span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Tip: You can also assign moderators directly from each club&apos;s detail page
                      so the club&apos;s moderator list stays synchronized.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUid(null);
                      setFeedback(null);
                    }}
                    className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 transition-all cursor-pointer whitespace-nowrap"
                  >
                    {isUpdating ? 'Committing…' : 'Save Role Assignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="border-b border-slate-100 dark:border-emerald-950/60 px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Immutable Department Governance &amp; Moderation Log
            </h2>
          </div>

          {logsError ? (
            <p className="p-6 text-sm text-red-700 dark:text-red-400">{logsError}</p>
          ) : isLogsLoading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-emerald-950/50"
                />
              ))}
            </div>
          ) : activityLogs.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No department governance actions have been logged yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-950/60">
              {activityLogs.map((entry) => (
                <div
                  key={entry.logId}
                  className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100">{entry.summary}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {entry.actorName}
                      </span>{' '}
                      ({entry.actorRole}) ·{' '}
                      <span className="font-mono">{entry.action}</span> ·{' '}
                      <span className="font-mono">{entry.entityId}</span>
                    </p>
                  </div>
                  <time
                    className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0"
                    title={formatFullDateTime(entry.createdAt?.toDate() ?? null)}
                  >
                    {formatRelativeTime(entry.createdAt?.toDate() ?? null)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
