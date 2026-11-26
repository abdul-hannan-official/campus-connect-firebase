import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  Edit3,
  Layers,
  Plus,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { CLUB_CATEGORIES, formatRelativeTime, slugifyClubName } from '../lib/validation.ts';
import {
  createClub,
  joinClub,
  leaveClub,
  reviewClubRequest,
  submitClubRequest,
  subscribeToClubMembers,
  subscribeToClubRequests,
  updateClub,
  updateClubModeratorAssignment,
} from '../services/clubService.ts';
import type {
  Club,
  ClubCategory,
  ClubMembership,
  ClubRequest,
  MemberProfile,
} from '../types/campus.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface ClubsViewProps {
  clubs: Club[];
  isLoading: boolean;
  memberships: ClubMembership[];
  directoryMembers: MemberProfile[];
  initialClubId: string | null;
  onClearInitialClub: () => void;
  onOpenClubFeed: (clubId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

type ClubTab = 'directory' | 'joined' | 'requests' | 'archived';

export function ClubsView({
  clubs,
  isLoading,
  memberships,
  directoryMembers,
  initialClubId,
  onClearInitialClub,
  onOpenClubFeed,
  onNotify,
}: ClubsViewProps) {
  const { profile, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<ClubTab>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ClubCategory>('all');
  const [selectedClubId, setSelectedClubId] = useState<string | null>(initialClubId);

  // Live club members when viewing a specific club detail page
  const [clubMembers, setClubMembers] = useState<ClubMembership[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  // Live club requests (own requests for students; all CS requests for Admins)
  const [clubRequests, setClubRequests] = useState<ClubRequest[]>([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);

  // Create / Edit Club modal drawer state (Admin)
  const [showClubForm, setShowClubForm] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [clubName, setClubName] = useState('');
  const [clubSlug, setClubSlug] = useState('');
  const [clubCategory, setClubCategory] = useState<ClubCategory>('AI & Data');
  const [clubDesc, setClubDesc] = useState('');
  const [clubLogoUrl, setClubLogoUrl] = useState('');
  const [isSavingClub, setIsSavingClub] = useState(false);

  // Club Request form state (Student)
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqCategory, setReqCategory] = useState<ClubCategory>('Software & Web');
  const [reqDesc, setReqDesc] = useState('');
  const [reqJustification, setReqJustification] = useState('');
  const [reqLogoUrl, setReqLogoUrl] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Review request note per requestId
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Moderator assignment dropdown
  const [selectedModUid, setSelectedModUid] = useState('');

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (initialClubId) {
      setSelectedClubId(initialClubId);
      onClearInitialClub();
    }
  }, [initialClubId, onClearInitialClub]);

  useEffect(() => {
    if (!profile) return;
    setIsRequestsLoading(true);
    const unsub = subscribeToClubRequests(
      { isAdmin, userId: profile.uid },
      (list) => {
        setClubRequests(list);
        setIsRequestsLoading(false);
      },
      (err) => {
        setIsRequestsLoading(false);
        onNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [profile, isAdmin, onNotify]);

  useEffect(() => {
    if (!selectedClubId) {
      setClubMembers([]);
      return;
    }
    setIsMembersLoading(true);
    const unsub = subscribeToClubMembers(
      selectedClubId,
      (list) => {
        setClubMembers(list);
        setIsMembersLoading(false);
      },
      (err) => {
        setIsMembersLoading(false);
        onNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [selectedClubId, onNotify]);

  const joinedClubIds = useMemo(
    () => new Set(memberships.map((m) => m.clubId)),
    [memberships]
  );

  const selectedClub = useMemo(
    () => clubs.find((c) => c.clubId === selectedClubId) ?? null,
    [clubs, selectedClubId]
  );

  const filteredClubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clubs.filter((club) => {
      if (activeTab === 'archived') {
        if (club.status !== 'archived') return false;
      } else if (activeTab === 'joined') {
        if (!joinedClubIds.has(club.clubId)) return false;
      } else {
        if (club.status !== 'active') return false;
      }

      if (categoryFilter !== 'all' && club.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        club.name.toLowerCase().includes(q) ||
        club.description.toLowerCase().includes(q) ||
        club.category.toLowerCase().includes(q) ||
        club.clubId.toLowerCase().includes(q)
      );
    });
  }, [clubs, activeTab, joinedClubIds, categoryFilter, searchQuery]);

  const pendingRequestCount = useMemo(
    () => clubRequests.filter((r) => r.status === 'pending').length,
    [clubRequests]
  );

  const openCreateClubModal = () => {
    setEditingClub(null);
    setClubName('');
    setClubSlug('');
    setClubCategory('AI & Data');
    setClubDesc('');
    setClubLogoUrl('');
    setShowClubForm(true);
  };

  const openEditClubModal = (club: Club) => {
    setEditingClub(club);
    setClubName(club.name);
    setClubSlug(club.clubId);
    setClubCategory(club.category);
    setClubDesc(club.description);
    setClubLogoUrl(club.logoUrl);
    setShowClubForm(true);
  };

  const handleSaveClub = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSavingClub(true);
    try {
      if (editingClub) {
        await updateClub(profile, editingClub.clubId, {
          name: clubName,
          description: clubDesc,
          category: clubCategory,
          logoUrl: clubLogoUrl,
          status: editingClub.status,
        });
        onNotify('success', `Updated club "${clubName.trim()}".`);
      } else {
        const createdSlug = await createClub(profile, {
          clubId: clubSlug || slugifyClubName(clubName),
          name: clubName,
          description: clubDesc,
          category: clubCategory,
          logoUrl: clubLogoUrl,
        });
        onNotify('success', `Created club "${clubName.trim()}" (${createdSlug}).`);
      }
      setShowClubForm(false);
      setEditingClub(null);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to save club.');
    } finally {
      setIsSavingClub(false);
    }
  };

  const handleToggleJoin = async (club: Club) => {
    if (!profile) return;
    const isMember = joinedClubIds.has(club.clubId);
    setBusyActionId(club.clubId);
    try {
      if (isMember) {
        await leaveClub(profile, club);
        onNotify('info', `Left ${club.name}.`);
      } else {
        await joinClub(profile, club);
        onNotify('success', `Joined ${club.name}. You can now post and comment in its feed.`);
      }
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Membership action failed.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleToggleArchive = (club: Club) => {
    if (!profile) return;
    const nextStatus = club.status === 'active' ? 'archived' : 'active';
    setConfirmState({
      open: true,
      title: nextStatus === 'archived' ? `Archive ${club.name}?` : `Reactivate ${club.name}?`,
      description:
        nextStatus === 'archived'
          ? 'Archived clubs are hidden from the active directory and stop accepting new members or posts until reactivated.'
          : 'Reactivating this club restores it to the active CS directory and re-enables member discussions.',
      confirmLabel: nextStatus === 'archived' ? 'Archive Club' : 'Reactivate Club',
      onConfirm: async () => {
        setBusyActionId(club.clubId);
        try {
          await updateClub(profile, club.clubId, {
            name: club.name,
            description: club.description,
            category: club.category,
            logoUrl: club.logoUrl,
            status: nextStatus,
          });
          onNotify(
            'success',
            nextStatus === 'archived' ? `${club.name} archived.` : `${club.name} reactivated.`
          );
        } catch (error) {
          onNotify('error', error instanceof Error ? error.message : 'Failed to update status.');
        } finally {
          setBusyActionId(null);
          setConfirmState(null);
        }
      },
    });
  };

  const handleSubmitClubRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSubmittingReq(true);
    try {
      await submitClubRequest(profile, {
        name: reqName,
        category: reqCategory,
        description: reqDesc,
        justification: reqJustification,
        logoUrl: reqLogoUrl,
      });
      onNotify('success', 'Club proposal submitted for Department Admin review.');
      setReqName('');
      setReqDesc('');
      setReqJustification('');
      setReqLogoUrl('');
      setShowRequestForm(false);
      setActiveTab('requests');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to submit proposal.');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleReviewRequest = async (req: ClubRequest, decision: 'approved' | 'rejected') => {
    if (!profile) return;
    setBusyActionId(req.requestId);
    try {
      await reviewClubRequest({
        admin: profile,
        request: req,
        decision,
        reviewNote: reviewNotes[req.requestId] ?? '',
      });
      onNotify(
        'success',
        decision === 'approved'
          ? `Approved "${req.name}" and published it to the CS Club Directory.`
          : `Rejected club request "${req.name}".`
      );
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Failed to process review.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleAssignModerator = async (club: Club) => {
    if (!profile || !selectedModUid) return;
    const target = directoryMembers.find((m) => m.uid === selectedModUid);
    if (!target) return;
    setBusyActionId(`mod-${target.uid}`);
    try {
      await updateClubModeratorAssignment({
        admin: profile,
        club,
        targetProfile: target,
        action: 'assign',
      });
      setSelectedModUid('');
      onNotify('success', `Assigned ${target.displayName} as moderator for ${club.name}.`);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Failed to assign moderator.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleRemoveModerator = async (club: Club, targetUid: string) => {
    if (!profile) return;
    const target =
      directoryMembers.find((m) => m.uid === targetUid) ??
      ({
        uid: targetUid,
        displayName: 'CS Member',
      } as MemberProfile);

    setBusyActionId(`mod-${targetUid}`);
    try {
      await updateClubModeratorAssignment({
        admin: profile,
        club,
        targetProfile: target,
        action: 'remove',
      });
      onNotify('info', `Removed ${target.displayName} from ${club.name} moderators.`);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Failed to remove moderator.');
    } finally {
      setBusyActionId(null);
    }
  };

  // ============================================================================
  // Club Detail View
  // ============================================================================
  if (selectedClub) {
    const isMember = joinedClubIds.has(selectedClub.clubId);
    const assignedModerators = selectedClub.moderatorIds.map((uid) => ({
      uid,
      profile: directoryMembers.find((m) => m.uid === uid) ?? null,
    }));
    const assignableMembers = directoryMembers.filter(
      (m) => !selectedClub.moderatorIds.includes(m.uid)
    );

    return (
      <div className="space-y-8">
        <div>
          <button
            type="button"
            onClick={() => setSelectedClubId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Club Directory</span>
          </button>
        </div>

        {/* Club Header */}
        <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              {selectedClub.logoUrl ? (
                <img
                  src={selectedClub.logoUrl}
                  alt={selectedClub.name}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-2xl object-cover border border-slate-200 dark:border-emerald-900/60 shrink-0"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 font-display text-lg font-bold text-[#0F4C2E] dark:text-emerald-300">
                  {selectedClub.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{selectedClub.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{selectedClub.clubId}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      selectedClub.status === 'active'
                        ? 'text-[#157347] dark:text-emerald-400 font-semibold'
                        : 'text-amber-700 dark:text-amber-400 font-semibold'
                    }
                  >
                    {selectedClub.status === 'active' ? 'Active Club' : 'Archived'}
                  </span>
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {selectedClub.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {selectedClub.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenClubFeed(selectedClub.clubId)}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <span>Open Discussion Feed</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {selectedClub.status === 'active' || isMember ? (
                <button
                  type="button"
                  disabled={busyActionId === selectedClub.clubId}
                  onClick={() => void handleToggleJoin(selectedClub)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    isMember
                      ? 'border border-slate-200 dark:border-emerald-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40'
                      : 'border border-[#157347] text-[#157347] dark:text-emerald-400 dark:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  {isMember ? (
                    <>
                      <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Leave Club</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Join Club</span>
                    </>
                  )}
                </button>
              ) : null}

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditClubModal(selectedClub)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleArchive(selectedClub)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{selectedClub.status === 'active' ? 'Archive' : 'Reactivate'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Two-column Member Roster & Moderator Governance */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Members List */}
          <section className="lg:col-span-7 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 px-6 py-4">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Club Members
              </h2>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedClub.memberCount} enrolled
              </span>
            </div>

            {isMembersLoading ? (
              <div className="p-6 space-y-3">
                <div className="h-4 w-44 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
                <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
              </div>
            ) : clubMembers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No students have joined this club yet. Be the first to enroll.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-emerald-950/60">
                {clubMembers.map((m) => (
                  <li
                    key={m.membershipId}
                    className="flex items-center justify-between px-6 py-3.5 text-sm"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {m.memberName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Joined {formatRelativeTime(m.joinedAt?.toDate() ?? null)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Club Moderators Panel */}
          <section className="lg:col-span-5 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assigned Club Moderators
              </h2>
            </div>

            {assignedModerators.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No moderators assigned to this club yet. Department Admins manage oversight until
                moderators are assigned.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-emerald-950/60">
                {assignedModerators.map(({ uid, profile: modProfile }) => (
                  <li key={uid} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {modProfile?.displayName ?? uid}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {modProfile ? `${modProfile.semester} · ${modProfile.track}` : 'Verified Moderator'}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={busyActionId === `mod-${uid}`}
                        onClick={() => void handleRemoveModerator(selectedClub, uid)}
                        className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isAdmin && (
              <div className="border-t border-slate-100 dark:border-emerald-950/60 pt-4 space-y-3">
                <label
                  htmlFor="assignModSelect"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Assign Moderator to {selectedClub.name}
                </label>
                <div className="flex gap-2">
                  <select
                    id="assignModSelect"
                    value={selectedModUid}
                    onChange={(e) => setSelectedModUid(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                  >
                    <option value="">Select CS member…</option>
                    {assignableMembers.map((member) => (
                      <option key={member.uid} value={member.uid}>
                        {member.displayName} ({member.semester})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedModUid || busyActionId?.startsWith('mod-')}
                    onClick={() => void handleAssignModerator(selectedClub)}
                    className="rounded-full bg-emerald-btn px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Modals inside detail view */}
        {showClubForm && (
          <ClubEditorModal
            isEdit={Boolean(editingClub)}
            clubName={clubName}
            clubSlug={clubSlug}
            clubCategory={clubCategory}
            clubDesc={clubDesc}
            clubLogoUrl={clubLogoUrl}
            isSaving={isSavingClub}
            onChangeName={setClubName}
            onChangeSlug={setClubSlug}
            onChangeCategory={setClubCategory}
            onChangeDesc={setClubDesc}
            onChangeLogoUrl={setClubLogoUrl}
            onSubmit={handleSaveClub}
            onClose={() => setShowClubForm(false)}
          />
        )}

        {confirmState && (
          <ConfirmDialog
            open={confirmState.open}
            title={confirmState.title}
            description={confirmState.description}
            confirmLabel={confirmState.confirmLabel}
            isBusy={busyActionId !== null}
            onConfirm={() => void confirmState.onConfirm()}
            onCancel={() => setConfirmState(null)}
          />
        )}
      </div>
    );
  }

  // ============================================================================
  // Main Club Directory & Proposals View
  // ============================================================================
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            CS Department Clubs
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Explore student-run Computer Science clubs, enroll in communities, or propose a new
            technical club.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setShowRequestForm(true)}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Request New Club</span>
            </button>
          )}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-emerald-900/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Submit Proposal</span>
              </button>
              <button
                type="button"
                onClick={openCreateClubModal}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Club</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Club sections"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1 self-start"
        >
          {(
            [
              { id: 'directory', label: 'Active Clubs' },
              { id: 'joined', label: `Joined (${memberships.length})` },
              {
                id: 'requests',
                label: isAdmin
                  ? `Club Requests (${pendingRequestCount})`
                  : `My Requests (${clubRequests.length})`,
              },
              ...(isAdmin ? [{ id: 'archived' as const, label: 'Archived' }] : []),
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'requests' && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-64">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clubs…"
                className="block w-full rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] py-2 pl-10 pr-4 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <select
              aria-label="Filter by club category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | ClubCategory)}
              className="rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
            >
              <option value="all">All Categories</option>
              {CLUB_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'requests' ? (
        <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="border-b border-slate-100 dark:border-emerald-950/60 px-6 py-4">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isAdmin ? 'Student Club Creation Requests' : 'Your Club Proposals'}
            </h2>
          </div>

          {isRequestsLoading ? (
            <div className="p-6 space-y-3">
              <div className="h-5 w-52 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
              <div className="h-4 w-72 animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
            </div>
          ) : clubRequests.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Layers className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                No club proposals yet
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Submit a proposal to start a new CS club and track approval status here.
              </p>
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="mt-4 rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 transition-all cursor-pointer"
              >
                Request New Club
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-950/60">
              {clubRequests.map((req) => (
                <div key={req.requestId} className="p-6 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>{req.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{req.proposedSlug}</span>
                        <span aria-hidden="true">·</span>
                        <span>Proposed by {req.requesterName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(req.createdAt?.toDate() ?? null)}</span>
                      </div>
                      <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        {req.name}
                      </h3>
                    </div>

                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        req.status === 'approved'
                          ? 'text-[#157347] dark:text-emerald-400'
                          : req.status === 'rejected'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {req.status === 'approved'
                        ? 'Approved'
                        : req.status === 'rejected'
                          ? 'Rejected'
                          : 'Pending Review'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300">{req.description}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Justification:
                    </span>{' '}
                    {req.justification}
                  </p>

                  {req.reviewNote && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-emerald-950/60 pt-2">
                      <span className="font-semibold">Admin Note:</span> {req.reviewNote}
                    </p>
                  )}

                  {isAdmin && req.status === 'pending' && (
                    <div className="flex flex-col gap-2.5 border-t border-slate-100 dark:border-emerald-950/60 pt-3 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={reviewNotes[req.requestId] ?? ''}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                        }
                        maxLength={400}
                        placeholder="Optional review note for the student…"
                        className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyActionId === req.requestId}
                          onClick={() => void handleReviewRequest(req, 'approved')}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-btn px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Approve &amp; Create</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyActionId === req.requestId}
                          onClick={() => void handleReviewRequest(req, 'rejected')}
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-300 dark:border-red-900 px-3.5 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-3"
            >
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
            </div>
          ))}
        </div>
      ) : filteredClubs.length === 0 ? (
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-6 py-16 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {activeTab === 'joined'
              ? 'You have not joined any clubs yet'
              : activeTab === 'archived'
                ? 'No archived clubs'
                : 'No clubs found'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {activeTab === 'joined'
              ? 'Browse the active CS Club Directory to join technical communities.'
              : isAdmin
                ? 'Create the first Computer Science department club to kick off discussions.'
                : 'Try adjusting your search filter or submit a new club proposal.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {activeTab === 'joined' ? (
              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
              >
                Browse Active Clubs
              </button>
            ) : isAdmin ? (
              <button
                type="button"
                onClick={openCreateClubModal}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
              >
                Create First Club
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
              >
                Request New Club
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredClubs.map((club) => {
            const isMember = joinedClubIds.has(club.clubId);
            return (
              <article
                key={club.clubId}
                className="flex flex-col justify-between rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-emerald-300/80 dark:hover:border-emerald-800/70 transition-colors"
              >
                <div>
                  <div className="flex items-start gap-3.5">
                    {club.logoUrl ? (
                      <img
                        src={club.logoUrl}
                        alt={club.name}
                        referrerPolicy="no-referrer"
                        className="h-12 w-12 rounded-2xl object-cover border border-slate-200 dark:border-emerald-900/60 shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 font-display text-sm font-bold text-[#0F4C2E] dark:text-emerald-300">
                        {club.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{club.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{club.memberCount} members</span>
                        {isMember && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#157347] dark:text-emerald-400">
                              Joined
                            </span>
                          </>
                        )}
                      </div>
                      <h2 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {club.name}
                      </h2>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-3">
                    {club.description}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-emerald-950/60 pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedClubId(club.clubId)}
                      className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenClubFeed(club.clubId)}
                      className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Feed
                    </button>
                  </div>

                  {club.status === 'active' || isMember ? (
                    <button
                      type="button"
                      disabled={busyActionId === club.clubId}
                      onClick={() => void handleToggleJoin(club)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                        isMember
                          ? 'border border-slate-200 dark:border-emerald-900/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-emerald-950/40'
                          : 'bg-emerald-btn text-white hover:brightness-110'
                      }`}
                    >
                      {busyActionId === club.clubId
                        ? 'Updating…'
                        : isMember
                          ? 'Leave'
                          : 'Join Club'}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Admin Create / Edit Club Modal */}
      {showClubForm && (
        <ClubEditorModal
          isEdit={Boolean(editingClub)}
          clubName={clubName}
          clubSlug={clubSlug}
          clubCategory={clubCategory}
          clubDesc={clubDesc}
          clubLogoUrl={clubLogoUrl}
          isSaving={isSavingClub}
          onChangeName={setClubName}
          onChangeSlug={setClubSlug}
          onChangeCategory={setClubCategory}
          onChangeDesc={setClubDesc}
          onChangeLogoUrl={setClubLogoUrl}
          onSubmit={handleSaveClub}
          onClose={() => setShowClubForm(false)}
        />
      )}

      {/* Student Request Club Modal */}
      {showRequestForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-club-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            aria-hidden="true"
            onClick={() => !isSubmittingReq && setShowRequestForm(false)}
          />
          <form
            onSubmit={handleSubmitClubRequest}
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[24px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-3">
              <h2
                id="request-club-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Request a New CS Club
              </h2>
              <button
                type="button"
                onClick={() => setShowRequestForm(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label htmlFor="reqName" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Proposed Club Name
              </label>
              <input
                id="reqName"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
                placeholder="e.g., Distributed Systems Guild"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
              {reqName.trim() && (
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  Slug: {slugifyClubName(reqName)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reqCategory" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Category
              </label>
              <select
                id="reqCategory"
                value={reqCategory}
                onChange={(e) => setReqCategory(e.target.value as ClubCategory)}
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              >
                {CLUB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reqDesc" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Club Description
              </label>
              <textarea
                id="reqDesc"
                required
                minLength={10}
                maxLength={800}
                rows={3}
                value={reqDesc}
                onChange={(e) => setReqDesc(e.target.value)}
                placeholder="Describe the club's technical focus, workshops, and project goals."
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div>
              <label htmlFor="reqJustification" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Department Justification
              </label>
              <textarea
                id="reqJustification"
                required
                minLength={10}
                maxLength={500}
                rows={2}
                value={reqJustification}
                onChange={(e) => setReqJustification(e.target.value)}
                placeholder="Why should the CS Department approve this club?"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div>
              <label htmlFor="reqLogo" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Optional Logo URL (https://)
              </label>
              <input
                id="reqLogo"
                type="url"
                maxLength={512}
                value={reqLogoUrl}
                onChange={(e) => setReqLogoUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestForm(false)}
                className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReq}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer"
              >
                {isSubmittingReq ? 'Submitting…' : 'Submit Proposal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          isBusy={busyActionId !== null}
          onConfirm={() => void confirmState.onConfirm()}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

interface ClubEditorModalProps {
  isEdit: boolean;
  clubName: string;
  clubSlug: string;
  clubCategory: ClubCategory;
  clubDesc: string;
  clubLogoUrl: string;
  isSaving: boolean;
  onChangeName: (v: string) => void;
  onChangeSlug: (v: string) => void;
  onChangeCategory: (v: ClubCategory) => void;
  onChangeDesc: (v: string) => void;
  onChangeLogoUrl: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

function ClubEditorModal({
  isEdit,
  clubName,
  clubSlug,
  clubCategory,
  clubDesc,
  clubLogoUrl,
  isSaving,
  onChangeName,
  onChangeSlug,
  onChangeCategory,
  onChangeDesc,
  onChangeLogoUrl,
  onSubmit,
  onClose,
}: ClubEditorModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="club-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-slate-950/55"
        aria-hidden="true"
        onClick={() => !isSaving && onClose()}
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[24px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-3">
          <h2
            id="club-editor-title"
            className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {isEdit ? 'Edit Club Details' : 'Create Official CS Club'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label htmlFor="clubName" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Club Name
          </label>
          <input
            id="clubName"
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={clubName}
            onChange={(e) => {
              onChangeName(e.target.value);
              if (!isEdit) onChangeSlug(slugifyClubName(e.target.value));
            }}
            placeholder="e.g., AI & Machine Learning Society"
            className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>

        {!isEdit && (
          <div>
            <label htmlFor="clubSlug" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Club Slug Identifier
            </label>
            <input
              id="clubSlug"
              type="text"
              required
              minLength={2}
              maxLength={64}
              value={clubSlug}
              onChange={(e) => onChangeSlug(slugifyClubName(e.target.value))}
              placeholder="ai-ml-society"
              className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
            />
          </div>
        )}

        <div>
          <label htmlFor="clubCategory" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Category
          </label>
          <select
            id="clubCategory"
            value={clubCategory}
            onChange={(e) => onChangeCategory(e.target.value as ClubCategory)}
            className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
          >
            {CLUB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="clubDesc" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Description
          </label>
          <textarea
            id="clubDesc"
            required
            minLength={10}
            maxLength={800}
            rows={4}
            value={clubDesc}
            onChange={(e) => onChangeDesc(e.target.value)}
            placeholder="Describe the club's mission, weekly activities, and prerequisites."
            className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>

        <div>
          <label htmlFor="clubLogo" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Optional Logo Image URL (https://)
          </label>
          <input
            id="clubLogo"
            type="url"
            maxLength={512}
            value={clubLogoUrl}
            onChange={(e) => onChangeLogoUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Club'}
          </button>
        </div>
      </form>
    </div>
  );
}
