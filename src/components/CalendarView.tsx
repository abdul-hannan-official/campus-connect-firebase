import {
  Archive,
  Ban,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { EVENT_CATEGORIES } from '../lib/validation.ts';
import {
  createDepartmentEvent,
  deleteDepartmentEvent,
  updateDepartmentEvent,
} from '../services/departmentContentService.ts';
import type { Club, DepartmentEvent, EventCategory } from '../types/campus.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface CalendarViewProps {
  events: DepartmentEvent[];
  clubs: Club[];
  isLoading: boolean;
  initialEventId: string | null;
  onClearInitialEvent: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

type CalendarTab = 'month' | 'upcoming' | 'past' | 'archived';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatReadableDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CalendarView({
  events,
  clubs,
  isLoading,
  initialEventId,
  onClearInitialEvent,
  onNotify,
}: CalendarViewProps) {
  const { profile, isAdmin } = useAuth();

  const todayIso = useMemo(() => getTodayIso(), []);
  const now = useMemo(() => new Date(), []);

  const [activeTab, setActiveTab] = useState<CalendarTab>('month');
  const [monthCursor, setMonthCursor] = useState<{ year: number; month: number }>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | EventCategory>('all');

  // Admin Create/Edit Modal/Panel State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<DepartmentEvent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Seminar');
  const [eventDate, setEventDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [venue, setVenue] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [clubId, setClubId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm Dialog
  const [confirmTarget, setConfirmTarget] = useState<{
    action: 'cancel' | 'restore' | 'archive' | 'delete';
    item: DepartmentEvent;
  } | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);

  useEffect(() => {
    if (!initialEventId) return;
    const match = events.find((ev) => ev.eventId === initialEventId);
    setSelectedEventId(initialEventId);
    if (match) {
      const [y, m] = match.eventDate.split('-').map(Number);
      if (y && m) {
        setMonthCursor({ year: y, month: m - 1 });
        setSelectedDate(match.eventDate);
      }
    }
    onClearInitialEvent();
  }, [initialEventId, events, onClearInitialEvent]);

  const clubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clubs) {
      map.set(c.clubId, c.name);
    }
    return map;
  }, [clubs]);

  const activeEvents = useMemo(
    () => events.filter((ev) => ev.status !== 'archived'),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (activeTab === 'archived') {
        if (ev.status !== 'archived') return false;
      } else {
        if (ev.status === 'archived') return false;
      }
      if (selectedCategory !== 'all' && ev.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.venue.toLowerCase().includes(q) ||
        ev.category.toLowerCase().includes(q)
      );
    });
  }, [events, activeTab, selectedCategory, searchQuery]);

  const upcomingEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.eventDate >= todayIso),
    [filteredEvents, todayIso]
  );

  const pastEvents = useMemo(
    () =>
      filteredEvents
        .filter((ev) => ev.eventDate < todayIso)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    [filteredEvents, todayIso]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DepartmentEvent[]>();
    for (const ev of filteredEvents) {
      const list = map.get(ev.eventDate) ?? [];
      list.push(ev);
      map.set(ev.eventDate, list);
    }
    return map;
  }, [filteredEvents]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(monthCursor.year, monthCursor.month, 1);
    const startWeekday = firstDay.getDay();
    const totalDays = new Date(monthCursor.year, monthCursor.month + 1, 0).getDate();

    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ iso: null, dayNum: null });
    }
    for (let day = 1; day <= totalDays; day++) {
      const m = String(monthCursor.month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      cells.push({ iso: `${monthCursor.year}-${m}-${d}`, dayNum: day });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ iso: null, dayNum: null });
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = useMemo(
    () =>
      new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [monthCursor]
  );

  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDate) ?? [],
    [eventsByDate, selectedDate]
  );

  const selectedEvent = useMemo(
    () => events.find((ev) => ev.eventId === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const archivedCount = useMemo(
    () => events.filter((ev) => ev.status === 'archived').length,
    [events]
  );

  const openCreateForm = (prefillDate?: string) => {
    setEditingEvent(null);
    setTitle('');
    setDescription('');
    setCategory('Seminar');
    setEventDate(prefillDate ?? selectedDate ?? todayIso);
    setStartTime('14:00');
    setEndTime('15:30');
    setVenue('');
    setRegistrationUrl('');
    setClubId('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (item: DepartmentEvent) => {
    setEditingEvent(item);
    setTitle(item.title);
    setDescription(item.description);
    setCategory(item.category);
    setEventDate(item.eventDate);
    setStartTime(item.startTime);
    setEndTime(item.endTime);
    setVenue(item.venue);
    setRegistrationUrl(item.registrationUrl);
    setClubId(item.clubId);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !isAdmin) return;
    setFormError(null);
    setIsSaving(true);
    try {
      if (editingEvent) {
        await updateDepartmentEvent(profile, editingEvent.eventId, {
          title,
          description,
          category,
          eventDate,
          startTime,
          endTime,
          venue,
          registrationUrl,
          clubId,
          status: editingEvent.status,
        });
        onNotify('success', 'Department event updated.');
      } else {
        const newId = await createDepartmentEvent(profile, {
          title,
          description,
          category,
          eventDate,
          startTime,
          endTime,
          venue,
          registrationUrl,
          clubId,
        });
        setSelectedEventId(newId);
        setSelectedDate(eventDate);
        const [y, m] = eventDate.split('-').map(Number);
        if (y && m) setMonthCursor({ year: y, month: m - 1 });
        onNotify('success', 'Event scheduled and department members notified.');
      }
      setIsFormOpen(false);
      setEditingEvent(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save event.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmedAction = async () => {
    if (!profile || !isAdmin || !confirmTarget) return;
    setIsActionBusy(true);
    try {
      const { action, item } = confirmTarget;
      if (action === 'delete') {
        await deleteDepartmentEvent(profile, item);
        if (selectedEventId === item.eventId) setSelectedEventId(null);
        onNotify('success', 'Event permanently deleted.');
      } else {
        const nextStatus =
          action === 'cancel' ? 'cancelled' : action === 'archive' ? 'archived' : 'scheduled';
        await updateDepartmentEvent(profile, item.eventId, {
          title: item.title,
          description: item.description,
          category: item.category,
          eventDate: item.eventDate,
          startTime: item.startTime,
          endTime: item.endTime,
          venue: item.venue,
          registrationUrl: item.registrationUrl,
          clubId: item.clubId,
          status: nextStatus,
        });
        onNotify(
          action === 'restore' ? 'success' : 'info',
          action === 'cancel'
            ? 'Event marked as cancelled.'
            : action === 'archive'
              ? 'Event archived.'
              : 'Event restored to scheduled.'
        );
      }
      setConfirmTarget(null);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update event.');
    } finally {
      setIsActionBusy(false);
    }
  };

  const shiftMonth = (delta: number) => {
    setMonthCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const renderEventRow = (ev: DepartmentEvent) => {
    const isCancelled = ev.status === 'cancelled';
    const isArchived = ev.status === 'archived';
    const linkedClubName = ev.clubId ? clubNameMap.get(ev.clubId) ?? ev.clubId : null;

    return (
      <article
        key={ev.eventId}
        className={`rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${
          selectedEventId === ev.eventId ? 'ring-1 ring-[#157347]/40 dark:ring-emerald-400/40' : ''
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono font-medium text-slate-900 dark:text-slate-200 tabular-nums">
                {formatReadableDate(ev.eventDate)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {ev.startTime}–{ev.endTime}
              </span>
              <span aria-hidden="true">·</span>
              <span>{ev.category}</span>
              {linkedClubName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{linkedClubName}</span>
                </>
              )}
              {isCancelled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-red-700 dark:text-red-400">Cancelled</span>
                </>
              )}
              {isArchived && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-500">Archived</span>
                </>
              )}
            </div>

            <h3
              className={`mt-1.5 font-display text-base font-semibold ${
                isCancelled
                  ? 'line-through text-slate-500 dark:text-slate-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {ev.title}
            </h3>

            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
              {ev.description}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>{ev.venue}</span>
              </span>
              {ev.registrationUrl && !isCancelled && (
                <a
                  href={ev.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#157347] hover:underline dark:text-emerald-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Registration Link</span>
                </a>
              )}
              <span className="text-slate-400 dark:text-slate-500">
                Posted by {ev.createdByName}
              </span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openEditForm(ev)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit</span>
              </button>
              {ev.status === 'scheduled' && (
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ action: 'cancel', item: ev })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50 cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              )}
              {ev.status !== 'scheduled' && (
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ action: 'restore', item: ev })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Restore</span>
                </button>
              )}
              {ev.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ action: 'archive', item: ev })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Archive</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmTarget({ action: 'delete', item: ev })}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </div>
          )}
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
            Department of Computer Science · Academic &amp; Club Schedule
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Department Event Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Seminars, hackathons, workshops, club meetups, and official academic deadlines.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => openCreateForm()}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Schedule Event</span>
          </button>
        )}
      </section>

      {/* Tabs + Filters */}
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('month')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'month'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Month Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'upcoming'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Upcoming ({activeEvents.filter((ev) => ev.eventDate >= todayIso).length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('past')}
              className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'past'
                  ? 'bg-[#0F4C2E] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Past ({activeEvents.filter((ev) => ev.eventDate < todayIso).length})
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('archived')}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'archived'
                    ? 'bg-[#0F4C2E] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                Archived ({archivedCount})
              </button>
            )}
          </div>

          <select
            aria-label="Filter events by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as 'all' | EventCategory)}
            className="rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-[#157347] focus:outline-none"
          >
            <option value="all">All Categories</option>
            {EVENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full lg:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events or venues…"
            className="w-full rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>
      </section>

      {/* Admin Create / Edit Form */}
      {isAdmin && isFormOpen && (
        <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {editingEvent ? 'Edit Department Event' : 'Schedule New Department Event'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingEvent(null);
              }}
              aria-label="Close event form"
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
                  htmlFor="evTitle"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Event Title *
                </label>
                <input
                  id="evTitle"
                  type="text"
                  required
                  minLength={4}
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Distributed Systems Research Colloquium"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="evCategory"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Category *
                </label>
                <select
                  id="evCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                >
                  {EVENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label
                  htmlFor="evDate"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Date *
                </label>
                <input
                  id="evDate"
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="evStart"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Start Time *
                </label>
                <input
                  id="evStart"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="evEnd"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  End Time *
                </label>
                <input
                  id="evEnd"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="evClub"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Host Club (Optional)
                </label>
                <select
                  id="evClub"
                  value={clubId}
                  onChange={(e) => setClubId(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                >
                  <option value="">CS Department (General)</option>
                  {clubs
                    .filter((c) => c.status === 'active')
                    .map((club) => (
                      <option key={club.clubId} value={club.clubId}>
                        {club.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="evVenue"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Venue / Room *
                </label>
                <input
                  id="evVenue"
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g., CS Auditorium, Block B — Room 302"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>
              <div>
                <label
                  htmlFor="evRegUrl"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Registration / RSVP Link (Optional HTTPS)
                </label>
                <input
                  id="evRegUrl"
                  type="url"
                  value={registrationUrl}
                  onChange={(e) => setRegistrationUrl(e.target.value)}
                  placeholder="https://forms.university.edu/..."
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="evDesc"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Event Description &amp; Agenda *
              </label>
              <textarea
                id="evDesc"
                required
                minLength={10}
                maxLength={3000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe speakers, prerequisites, topics covered, or submission instructions…"
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingEvent(null);
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
                {isSaving ? 'Saving…' : editingEvent ? 'Save Changes' : 'Publish Event'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Main Content */}
      {isLoading ? (
        <div className="h-96 animate-pulse rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814]" />
      ) : activeTab === 'month' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Monthly Calendar Grid */}
          <section className="lg:col-span-8 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {monthLabel}
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMonthCursor({ year: now.getFullYear(), month: now.getMonth() });
                    setSelectedDate(todayIso);
                  }}
                  className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E]/70 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-2.5">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-emerald-950/60">
              {monthDays.map((cell, idx) => {
                if (!cell.iso || cell.dayNum === null) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[82px] bg-slate-50/50 dark:bg-[#0B120E]/40"
                    />
                  );
                }
                const dayEvents = eventsByDate.get(cell.iso) ?? [];
                const isSelected = selectedDate === cell.iso;
                const isToday = todayIso === cell.iso;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.iso!);
                      if (dayEvents.length === 1) {
                        setSelectedEventId(dayEvents[0].eventId);
                      }
                    }}
                    className={`min-h-[82px] p-2 text-left align-top transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/45'
                        : 'hover:bg-slate-50/70 dark:hover:bg-emerald-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs tabular-nums ${
                          isToday
                            ? 'bg-[#0F4C2E] font-semibold text-white'
                            : isSelected
                              ? 'font-semibold text-[#0F4C2E] dark:text-emerald-300'
                              : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="font-mono text-[10px] font-semibold text-[#157347] dark:text-emerald-400 tabular-nums">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div
                          key={ev.eventId}
                          className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                            ev.status === 'cancelled'
                              ? 'bg-red-50 text-red-700 line-through dark:bg-red-950/50 dark:text-red-400'
                              : 'bg-emerald-100/80 text-[#0F4C2E] dark:bg-emerald-950/80 dark:text-emerald-200'
                          }`}
                        >
                          {ev.startTime} {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="px-1 text-[10px] text-slate-500 dark:text-slate-400">
                          +{dayEvents.length - 2} more
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Day Agenda / Event Inspector */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Selected Day</p>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatReadableDate(selectedDate)}
                  </h2>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openCreateForm(selectedDate)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-emerald-900/60 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add</span>
                  </button>
                )}
              </div>

              {selectedDayEvents.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No department events scheduled for this date.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 dark:divide-emerald-950/60">
                  {selectedDayEvents.map((ev) => (
                    <div key={ev.eventId} className="py-3 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => setSelectedEventId(ev.eventId)}
                        className="w-full text-left cursor-pointer group"
                      >
                        <p className="font-mono text-xs font-semibold text-[#157347] dark:text-emerald-400 tabular-nums">
                          {ev.startTime}–{ev.endTime} · {ev.category}
                        </p>
                        <p
                          className={`mt-1 text-sm font-semibold group-hover:text-[#157347] dark:group-hover:text-emerald-400 ${
                            ev.status === 'cancelled'
                              ? 'line-through text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {ev.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {ev.venue}
                        </p>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedEvent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Event Details</span>
                  <button
                    type="button"
                    onClick={() => setSelectedEventId(null)}
                    className="font-semibold text-[#157347] dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                {renderEventRow(selectedEvent)}
              </div>
            )}
          </aside>
        </div>
      ) : (
        <section className="space-y-3">
          {(() => {
            const list =
              activeTab === 'upcoming'
                ? upcomingEvents
                : activeTab === 'past'
                  ? pastEvents
                  : filteredEvents;
            if (list.length === 0) {
              return (
                <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-6 py-12 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <CalendarIcon className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                  <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    No {activeTab} events found
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {searchQuery || selectedCategory !== 'all'
                      ? 'Try clearing your search or category filter.'
                      : isAdmin
                        ? 'Use "Schedule Event" above to publish a department event.'
                        : 'Upcoming Computer Science seminars and deadlines will appear here.'}
                  </p>
                </div>
              );
            }
            return list.map((ev) => renderEventRow(ev));
          })()}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={
          confirmTarget?.action === 'delete'
            ? 'Delete Event Permanently?'
            : confirmTarget?.action === 'cancel'
              ? 'Cancel Scheduled Event?'
              : confirmTarget?.action === 'archive'
                ? 'Archive Event?'
                : 'Restore Event?'
        }
        description={
          confirmTarget?.action === 'delete'
            ? `Permanently delete "${confirmTarget.item.title}" from the department calendar?`
            : confirmTarget?.action === 'cancel'
              ? `Mark "${confirmTarget?.item.title}" as cancelled? Students will still see the cancelled notice on the calendar.`
              : confirmTarget?.action === 'archive'
                ? `Archive "${confirmTarget?.item.title}" out of the active department calendar?`
                : `Restore "${confirmTarget?.item.title}" back to scheduled status?`
        }
        confirmLabel={
          confirmTarget?.action === 'delete'
            ? 'Delete Permanently'
            : confirmTarget?.action === 'cancel'
              ? 'Cancel Event'
              : confirmTarget?.action === 'archive'
                ? 'Archive Event'
                : 'Restore Event'
        }
        variant={confirmTarget?.action === 'restore' ? 'primary' : 'danger'}
        isBusy={isActionBusy}
        onConfirm={() => void handleConfirmedAction()}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
