import {
  Archive,
  Edit3,
  ExternalLink,
  FileText,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ANNOUNCEMENT_CATEGORIES,
  formatFullDateTime,
  formatRelativeTime,
} from '../lib/validation.ts';
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from '../services/departmentContentService.ts';
import type {
  Announcement,
  AnnouncementCategory,
  AssignedAdminTitle,
} from '../types/campus.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface AnnouncementsViewProps {
  announcements: Announcement[];
  isLoading: boolean;
  initialAnnouncementId: string | null;
  onClearInitialAnnouncement: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function AnnouncementsView({
  announcements,
  isLoading,
  initialAnnouncementId,
  onClearInitialAnnouncement,
  onNotify,
}: AnnouncementsViewProps) {
  const { profile, isAdmin, verifiedAdminTitle } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AnnouncementCategory>('all');
  const [viewMode, setViewMode] = useState<'published' | 'archived'>('published');
  const [selectedId, setSelectedId] = useState<string | null>(initialAnnouncementId);

  // Composer / Editor state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('Academic');
  const [externalUrl, setExternalUrl] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    action: 'delete' | 'archive' | 'restore';
    item: Announcement;
  } | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);

  useEffect(() => {
    if (initialAnnouncementId) {
      setSelectedId(initialAnnouncementId);
      onClearInitialAnnouncement();
    }
  }, [initialAnnouncementId, onClearInitialAnnouncement]);

  const effectiveAdminTitle: AssignedAdminTitle =
    verifiedAdminTitle !== 'none' ? verifiedAdminTitle : 'HOD';

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return announcements.filter((item) => {
      if (viewMode === 'published' && item.status !== 'published') return false;
      if (viewMode === 'archived' && item.status !== 'archived') return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        item.authorName.toLowerCase().includes(q) ||
        item.authorTitle.toLowerCase().includes(q)
      );
    });
  }, [announcements, viewMode, selectedCategory, searchQuery]);

  const pinnedItems = useMemo(
    () => filteredAnnouncements.filter((a) => a.isPinned && a.status === 'published'),
    [filteredAnnouncements]
  );

  const regularItems = useMemo(
    () => filteredAnnouncements.filter((a) => !a.isPinned || a.status !== 'published'),
    [filteredAnnouncements]
  );

  const selectedAnnouncement = useMemo(
    () => announcements.find((a) => a.announcementId === selectedId) ?? null,
    [announcements, selectedId]
  );

  const publishedCount = useMemo(
    () => announcements.filter((a) => a.status === 'published').length,
    [announcements]
  );
  const archivedCount = useMemo(
    () => announcements.filter((a) => a.status === 'archived').length,
    [announcements]
  );

  const openCreateForm = () => {
    setEditingItem(null);
    setTitle('');
    setBody('');
    setCategory('Academic');
    setExternalUrl('');
    setAttachmentUrl('');
    setAttachmentName('');
    setIsPinned(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (item: Announcement) => {
    setEditingItem(item);
    setTitle(item.title);
    setBody(item.body);
    setCategory(item.category);
    setExternalUrl(item.externalUrl);
    setAttachmentUrl(item.attachmentUrl);
    setAttachmentName(item.attachmentName);
    setIsPinned(item.isPinned);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !isAdmin) return;
    setFormError(null);
    setIsSaving(true);
    try {
      if (editingItem) {
        await updateAnnouncement(profile, editingItem.announcementId, {
          title,
          body,
          category,
          externalUrl,
          attachmentUrl,
          attachmentName,
          isPinned,
          status: editingItem.status,
        });
        onNotify('success', 'Official announcement updated.');
      } else {
        const newId = await createAnnouncement(profile, effectiveAdminTitle, {
          title,
          body,
          category,
          externalUrl,
          attachmentUrl,
          attachmentName,
          isPinned,
        });
        setSelectedId(newId);
        onNotify('success', 'Official announcement published and department members notified.');
      }
      setIsFormOpen(false);
      setEditingItem(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePin = async (item: Announcement) => {
    if (!profile || !isAdmin) return;
    try {
      await updateAnnouncement(profile, item.announcementId, {
        title: item.title,
        body: item.body,
        category: item.category,
        externalUrl: item.externalUrl,
        attachmentUrl: item.attachmentUrl,
        attachmentName: item.attachmentName,
        isPinned: !item.isPinned,
        status: item.status,
      });
      onNotify(
        'info',
        item.isPinned ? 'Announcement unpinned from top notices.' : 'Announcement pinned to top.'
      );
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update pin state.');
    }
  };

  const handleConfirmedAction = async () => {
    if (!profile || !isAdmin || !confirmTarget) return;
    setIsActionBusy(true);
    try {
      const { action, item } = confirmTarget;
      if (action === 'delete') {
        await deleteAnnouncement(profile, item);
        if (selectedId === item.announcementId) {
          setSelectedId(null);
        }
        onNotify('success', 'Official announcement permanently deleted.');
      } else if (action === 'archive') {
        await updateAnnouncement(profile, item.announcementId, {
          title: item.title,
          body: item.body,
          category: item.category,
          externalUrl: item.externalUrl,
          attachmentUrl: item.attachmentUrl,
          attachmentName: item.attachmentName,
          isPinned: false,
          status: 'archived',
        });
        onNotify('info', 'Announcement archived.');
      } else {
        await updateAnnouncement(profile, item.announcementId, {
          title: item.title,
          body: item.body,
          category: item.category,
          externalUrl: item.externalUrl,
          attachmentUrl: item.attachmentUrl,
          attachmentName: item.attachmentName,
          isPinned: item.isPinned,
          status: 'published',
        });
        onNotify('success', 'Announcement restored to published notices.');
      }
      setConfirmTarget(null);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to complete action.');
    } finally {
      setIsActionBusy(false);
    }
  };

  const renderAnnouncementCard = (item: Announcement, highlightPinned: boolean) => {
    const isSelected = selectedId === item.announcementId;
    return (
      <article
        key={item.announcementId}
        className={`rounded-[22px] border transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${
          highlightPinned
            ? 'border-emerald-300/80 dark:border-emerald-800/70 bg-emerald-50/45 dark:bg-emerald-950/30'
            : 'border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814]'
        } ${isSelected ? 'ring-1 ring-[#157347]/40 dark:ring-emerald-400/40' : ''}`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {item.isPinned && item.status === 'published' && (
                <>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#157347] dark:text-emerald-400">
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    Pinned Official Notice
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="font-medium text-slate-700 dark:text-slate-300">{item.category}</span>
              <span aria-hidden="true">·</span>
              <span>
                {item.authorTitle} ({item.authorName})
              </span>
              <span aria-hidden="true">·</span>
              <time
                className="font-mono tabular-nums"
                title={formatFullDateTime(item.createdAt?.toDate() ?? null)}
              >
                {formatRelativeTime(item.createdAt?.toDate() ?? null)}
              </time>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-1">
                {item.status === 'published' && (
                  <button
                    type="button"
                    onClick={() => void handleTogglePin(item)}
                    title={item.isPinned ? 'Unpin announcement' : 'Pin announcement'}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                  >
                    {item.isPinned ? (
                      <>
                        <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Unpin</span>
                      </>
                    ) : (
                      <>
                        <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Pin</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit</span>
                </button>
                {item.status === 'published' ? (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ action: 'archive', item })}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Archive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ action: 'restore', item })}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Restore</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ action: 'delete', item })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setSelectedId(isSelected ? null : item.announcementId)
            }
            className="mt-2 block w-full text-left cursor-pointer group"
          >
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#157347] dark:group-hover:text-emerald-400 transition-colors">
              {item.title}
            </h2>
            <p
              className={`mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line ${
                isSelected ? '' : 'line-clamp-3'
              }`}
            >
              {item.body}
            </p>
          </button>

          {/* Links, Attachments & Full Details Toggle */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-emerald-950/60 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#157347] hover:underline dark:text-emerald-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>External Link</span>
                </a>
              )}
              {item.attachmentUrl && (
                <a
                  href={item.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#157347] hover:underline dark:text-emerald-400"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{item.attachmentName || 'Official Attachment'}</span>
                </a>
              )}
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                Published {formatFullDateTime(item.createdAt?.toDate() ?? null)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedId(isSelected ? null : item.announcementId)}
              className="font-semibold text-[#157347] hover:text-[#0F4C2E] dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer whitespace-nowrap"
            >
              {isSelected ? 'Collapse Details' : 'Read Full Notice'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
            Department of Computer Science · Official Bulletin
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Official Announcements
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Verified notices published exclusively by Head CR, Head GR, and the Head of Department.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Publish Announcement</span>
          </button>
        )}
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="inline-flex rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('published')}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'published'
                    ? 'bg-[#0F4C2E] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                Published ({publishedCount})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('archived')}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'archived'
                    ? 'bg-[#0F4C2E] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                Archived ({archivedCount})
              </button>
            </div>
          )}

          <select
            aria-label="Filter announcements by category"
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(e.target.value as 'all' | AnnouncementCategory)
            }
            className="rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-[#157347] focus:outline-none"
          >
            <option value="all">All Categories</option>
            {ANNOUNCEMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements…"
            className="w-full rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>
      </section>

      {/* Admin Create / Edit Form */}
      {isAdmin && isFormOpen && (
        <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingItem ? 'Edit Official Announcement' : 'Publish Official Announcement'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Publishing as {effectiveAdminTitle} ({profile?.displayName}).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingItem(null);
              }}
              aria-label="Close form"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="annTitle"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Announcement Title *
                </label>
                <input
                  id="annTitle"
                  type="text"
                  required
                  minLength={4}
                  maxLength={180}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Fall 2026 Mid-Term Examination Schedule Released"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="annCategory"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Category *
                </label>
                <select
                  id="annCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                >
                  {ANNOUNCEMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="annBody"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Full Announcement Details *
              </label>
              <textarea
                id="annBody"
                required
                minLength={10}
                maxLength={8000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the official department instructions, dates, room assignments, or policy details…"
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="annExternalUrl"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  External HTTPS Link (Optional)
                </label>
                <input
                  id="annExternalUrl"
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://cs.university.edu/..."
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="annAttachmentUrl"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Document Attachment URL (HTTPS)
                </label>
                <input
                  id="annAttachmentUrl"
                  type="url"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://.../syllabus.pdf"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="annAttachmentName"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Attachment Label
                </label>
                <input
                  id="annAttachmentName"
                  type="text"
                  maxLength={120}
                  value={attachmentName}
                  onChange={(e) => setAttachmentName(e.target.value)}
                  placeholder="e.g., Exam_Schedule_PDF"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#157347]"
                />
                <span>Pin this announcement to the top of the department bulletin</span>
              </label>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingItem(null);
                  }}
                  className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {isSaving
                    ? 'Saving…'
                    : editingItem
                      ? 'Save Changes'
                      : 'Publish to Department'}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Selected Announcement Banner if deep-linked from archived or notification */}
      {selectedAnnouncement &&
        !filteredAnnouncements.some(
          (a) => a.announcementId === selectedAnnouncement.announcementId
        ) && (
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Selected Announcement</span>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="font-semibold text-[#157347] dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Clear selection
              </button>
            </div>
            {renderAnnouncementCard(selectedAnnouncement, selectedAnnouncement.isPinned)}
          </section>
        )}

      {/* Loading / Empty / Lists */}
      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814]"
            />
          ))}
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-6 py-12 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <Megaphone className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            No {viewMode === 'archived' ? 'archived' : 'published'} announcements found
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchQuery || selectedCategory !== 'all'
              ? 'Try clearing your search query or switching categories.'
              : isAdmin
                ? 'Publish the first official CS Department notice using the button above.'
                : 'Official notices from Head CR, Head GR, and HOD will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pinnedItems.length > 0 && (
            <section aria-label="Pinned official announcements" className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#157347] dark:text-emerald-400">
                Pinned Official Notices ({pinnedItems.length})
              </p>
              <div className="space-y-3">
                {pinnedItems.map((item) => renderAnnouncementCard(item, true))}
              </div>
            </section>
          )}

          {regularItems.length > 0 && (
            <section aria-label="Department announcements" className="space-y-3">
              {pinnedItems.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Recent Notices ({regularItems.length})
                </p>
              )}
              <div className="space-y-3">
                {regularItems.map((item) => renderAnnouncementCard(item, false))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={
          confirmTarget?.action === 'delete'
            ? 'Delete Official Announcement?'
            : confirmTarget?.action === 'archive'
              ? 'Archive Official Announcement?'
              : 'Restore Official Announcement?'
        }
        description={
          confirmTarget?.action === 'delete'
            ? `Permanently delete "${confirmTarget.item.title}"? This cannot be undone.`
            : confirmTarget?.action === 'archive'
              ? `Move "${confirmTarget?.item.title}" out of the active bulletin into the archive?`
              : `Restore "${confirmTarget?.item.title}" to the active department bulletin?`
        }
        confirmLabel={
          confirmTarget?.action === 'delete'
            ? 'Delete Permanently'
            : confirmTarget?.action === 'archive'
              ? 'Archive Notice'
              : 'Restore Notice'
        }
        variant={confirmTarget?.action === 'restore' ? 'primary' : 'danger'}
        isBusy={isActionBusy}
        onConfirm={() => void handleConfirmedAction()}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
