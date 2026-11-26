import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flag,
  Lock,
  Shield,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { formatRelativeTime } from '../lib/validation.ts';
import { resolveContentReport, subscribeToReports } from '../services/discussionService.ts';
import type { Club, ContentReport, NavSection } from '../types/campus.ts';

interface ModeratorConsoleViewProps {
  clubs: Club[];
  onNavigate: (section: NavSection) => void;
  onOpenClubFeed: (clubId: string) => void;
  onOpenPost: (postId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function ModeratorConsoleView({
  clubs,
  onNavigate,
  onOpenClubFeed,
  onOpenPost,
  onNotify,
}: ModeratorConsoleViewProps) {
  const { profile, isAdmin, isModerator, moderatorRecord, verifiedAdminTitle } = useAuth();

  const [reports, setReports] = useState<ContentReport[]>([]);
  const [isReportsLoading, setIsReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const assignedClubIds = useMemo(
    () => moderatorRecord?.assignedClubIds ?? [],
    [moderatorRecord]
  );

  useEffect(() => {
    if (!profile || (!isAdmin && !isModerator)) return;
    setIsReportsLoading(true);
    const unsub = subscribeToReports(
      {
        isAdmin,
        assignedClubIds,
        userId: profile.uid,
      },
      (items) => {
        setReports(items);
        setIsReportsLoading(false);
        setReportsError(null);
      },
      (err) => {
        setIsReportsLoading(false);
        setReportsError(err.message);
      }
    );
    return () => unsub();
  }, [profile, isAdmin, isModerator, assignedClubIds]);

  const managedClubs = useMemo(() => {
    if (isAdmin) return clubs.filter((c) => c.status === 'active');
    return clubs.filter((c) => assignedClubIds.includes(c.clubId));
  }, [clubs, isAdmin, assignedClubIds]);

  const filteredReports = useMemo(
    () => reports.filter((r) => r.status === statusFilter),
    [reports, statusFilter]
  );

  const openCount = useMemo(() => reports.filter((r) => r.status === 'open').length, [reports]);
  const resolvedCount = useMemo(
    () => reports.filter((r) => r.status === 'resolved').length,
    [reports]
  );
  const dismissedCount = useMemo(
    () => reports.filter((r) => r.status === 'dismissed').length,
    [reports]
  );

  if (!isAdmin && !isModerator) {
    return (
      <div className="max-w-xl rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-red-700 dark:text-red-400 mt-0.5 shrink-0" />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Moderator Assignment Required
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Only members assigned to a Computer Science club by a Department Admin can access the
              Moderator Console.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleResolveReport = async (
    report: ContentReport,
    decision: 'resolved' | 'dismissed'
  ) => {
    if (!profile) return;
    setBusyReportId(report.reportId);
    try {
      await resolveContentReport({
        moderator: profile,
        report,
        status: decision,
        resolutionNote: resolutionNotes[report.reportId] ?? '',
      });
      onNotify(
        'success',
        decision === 'resolved'
          ? 'Report marked as resolved and reporter notified.'
          : 'Report dismissed.'
      );
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update report.');
    } finally {
      setBusyReportId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
            Club Governance &amp; Moderation Workspace
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Moderator Console
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isAdmin
              ? `Signed in as Department Admin (${verifiedAdminTitle}) with moderation oversight across all CS clubs.`
              : 'Your moderation privileges are enforced in Cloud Firestore strictly for your assigned clubs.'}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 dark:border-emerald-900/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Manage Moderator Assignments</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Assigned Clubs Section */}
      <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {isAdmin ? `All Active CS Clubs (${managedClubs.length})` : `Assigned Clubs (${assignedClubIds.length})`}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('clubs')}
            className="text-xs font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
          >
            Open Club Directory
          </button>
        </div>

        {managedClubs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {isAdmin
              ? 'No active CS clubs exist yet. Create the first club in the Clubs module.'
              : assignedClubIds.length === 0
                ? 'Your moderator record is active, and no clubs have been assigned yet. Ask Head CR, Head GR, or HOD to assign your club.'
                : `Assigned club slugs (${assignedClubIds.join(', ')}) have not been created as active clubs yet.`}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
            {managedClubs.map((club) => (
              <div
                key={club.clubId}
                className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {club.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{club.clubId}</span> · {club.category} ·{' '}
                    <span className="font-mono tabular-nums">{club.memberCount}</span> members
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenClubFeed(club.clubId)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Moderate Discussion Feed</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reported Content Queue */}
      <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-emerald-950/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400">
              <Flag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Reported Content Queue
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect flagged posts or comments, open the discussion to remove or pin content,
                then resolve or dismiss the report.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-slate-50 dark:bg-[#0B120E] p-1 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                statusFilter === 'open'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Open ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                statusFilter === 'resolved'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('dismissed')}
              className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                statusFilter === 'dismissed'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Dismissed ({dismissedCount})
            </button>
          </div>
        </div>

        {reportsError ? (
          <p className="p-6 text-sm text-red-700 dark:text-red-400">{reportsError}</p>
        ) : isReportsLoading ? (
          <div className="p-6 space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-emerald-950/50"
              />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No {statusFilter} reports in your moderation scope.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-emerald-950/60">
            {filteredReports.map((report) => (
              <div key={report.reportId} className="p-5 sm:p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-red-700 dark:text-red-400">
                      {report.reason}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="uppercase font-mono text-[11px]">{report.targetType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{report.clubId}</span>
                    <span aria-hidden="true">·</span>
                    <span>Reported by {report.reporterName}</span>
                    <span aria-hidden="true">·</span>
                    <time className="font-mono tabular-nums">
                      {formatRelativeTime(report.createdAt?.toDate() ?? null)}
                    </time>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenPost(report.postId)}
                    className="inline-flex items-center gap-1 font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
                  >
                    <span>Inspect Thread</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E]/60 px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-300">
                  &ldquo;{report.targetExcerpt}&rdquo;
                </div>

                {report.details && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Reporter note: {report.details}
                  </p>
                )}

                {report.status === 'open' ? (
                  <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      maxLength={400}
                      value={resolutionNotes[report.reportId] ?? ''}
                      onChange={(e) =>
                        setResolutionNotes((prev) => ({
                          ...prev,
                          [report.reportId]: e.target.value,
                        }))
                      }
                      placeholder="Optional resolution note (visible to reporter)…"
                      className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyReportId === report.reportId}
                        onClick={() => void handleResolveReport(report, 'resolved')}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-btn px-3.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Mark Resolved</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyReportId === report.reportId}
                        onClick={() => void handleResolveReport(report, 'dismissed')}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Dismiss</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Decision: <span className="font-medium capitalize">{report.status}</span>
                    {report.resolutionNote ? ` — ${report.resolutionNote}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
