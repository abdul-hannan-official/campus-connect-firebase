import {
  Bell,
  Calendar,
  CheckCheck,
  Layers,
  Megaphone,
  MessageSquare,
  Shield,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatFullDateTime, formatRelativeTime } from '../lib/validation.ts';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/activityService.ts';
import type { AppNotification, NotificationType } from '../types/campus.ts';

interface NotificationsViewProps {
  notifications: AppNotification[];
  isLoading: boolean;
  onOpenNotificationTarget: (item: AppNotification) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'announcement':
      return <Megaphone className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />;
    case 'event':
      return <Calendar className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />;
    case 'club_request':
    case 'club_activity':
      return <Layers className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />;
    case 'moderation':
      return <Shield className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />;
    case 'post_comment':
    case 'comment_reply':
    default:
      return <MessageSquare className="h-4 w-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />;
  }
}

function getNotificationLabel(type: NotificationType): string {
  switch (type) {
    case 'announcement':
      return 'Official Announcement';
    case 'event':
      return 'Department Event';
    case 'club_request':
      return 'Club Proposal';
    case 'club_activity':
      return 'Club Activity';
    case 'moderation':
      return 'Moderation';
    case 'post_comment':
      return 'Post Comment';
    case 'comment_reply':
      return 'Comment Reply';
  }
}

export function NotificationsView({
  notifications,
  isLoading,
  onOpenNotificationTarget,
  onNotify,
}: NotificationsViewProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const visibleNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, filter]
  );

  const handleOpen = async (item: AppNotification) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.notificationId);
      } catch {
        // Still navigate to the target even if mark-read hits a transient error
      }
    }
    onOpenNotificationTarget(item);
  };

  const handleMarkRead = async (item: AppNotification) => {
    if (item.isRead) return;
    try {
      await markNotificationRead(item.notificationId);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to mark as read.');
    }
  };

  const handleMarkAll = async () => {
    if (unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await markAllNotificationsRead(notifications);
      onNotify('success', 'All notifications marked as read.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to mark all as read.');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      onNotify('info', 'Notification dismissed.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to delete notification.');
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
            Real-Time Activity Inbox
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Club request decisions, official CS notices, upcoming events, discussion replies, and
            moderation updates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleMarkAll()}
          disabled={unreadCount === 0 || isMarkingAll}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 dark:border-emerald-900/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <CheckCheck className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
          <span>{isMarkingAll ? 'Marking…' : `Mark All Read (${unreadCount})`}</span>
        </button>
      </section>

      <div className="inline-flex rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1 text-xs">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#0F4C2E] text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-[#0F4C2E] text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814]"
            />
          ))}
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-6 py-12 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <Bell className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filter === 'unread'
              ? 'Every notification in your inbox has been read.'
              : 'Official announcements, upcoming events, and discussion replies will appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-emerald-950/60 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          {visibleNotifications.map((item) => (
            <div
              key={item.notificationId}
              className={`flex items-start justify-between gap-4 p-4 sm:p-5 transition-colors ${
                item.isRead
                  ? 'bg-white dark:bg-[#101814]'
                  : 'bg-emerald-50/45 dark:bg-emerald-950/30'
              }`}
            >
              <button
                type="button"
                onClick={() => void handleOpen(item)}
                className="flex min-w-0 flex-1 items-start gap-3.5 text-left cursor-pointer group"
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/60">
                  {getNotificationIcon(item.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {getNotificationLabel(item.type)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.actorName}</span>
                    <span aria-hidden="true">·</span>
                    <time
                      className="font-mono tabular-nums"
                      title={formatFullDateTime(item.createdAt?.toDate() ?? null)}
                    >
                      {formatRelativeTime(item.createdAt?.toDate() ?? null)}
                    </time>
                    {!item.isRead && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#157347] dark:text-emerald-400">
                          Unread
                        </span>
                      </>
                    )}
                  </div>

                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#157347] dark:group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {item.message}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                {!item.isRead && (
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(item)}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#157347] hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/60 cursor-pointer whitespace-nowrap"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(item.notificationId)}
                  aria-label="Dismiss notification"
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-emerald-950/60 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
