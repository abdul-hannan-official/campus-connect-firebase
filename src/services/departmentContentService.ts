import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  ANNOUNCEMENT_CATEGORIES,
  EVENT_CATEGORIES,
  sanitizeDisplayName,
  SCHEMA_LIMITS,
  SCHEMA_PATTERNS,
  validateHttpsUrl,
} from '../lib/validation.ts';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementStatus,
  AssignedAdminTitle,
  DepartmentEvent,
  EventCategory,
  EventStatus,
  MemberProfile,
} from '../types/campus.ts';
import { broadcastDepartmentNotification, logActivity } from './activityService.ts';

function generateId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

export function subscribeToAnnouncements(
  onData: (items: Announcement[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'announcements'), where('department', '==', 'CS'), limit(120));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as Announcement)
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
        });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'announcements');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export interface AnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  externalUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  isPinned: boolean;
  status?: AnnouncementStatus;
}

export async function createAnnouncement(
  admin: MemberProfile,
  adminTitle: AssignedAdminTitle,
  input: AnnouncementInput
): Promise<string> {
  const title = input.title.trim();
  const body = input.body.trim();
  const extCheck = validateHttpsUrl(input.externalUrl);
  const attCheck = validateHttpsUrl(input.attachmentUrl);

  if (
    title.length < SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MIN ||
    title.length > SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MAX
  ) {
    throw new Error(
      `Announcement title must be ${SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MIN}–${SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MAX} characters.`
    );
  }
  if (
    body.length < SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MIN ||
    body.length > SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MAX
  ) {
    throw new Error(
      `Announcement body must be ${SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MIN}–${SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MAX} characters.`
    );
  }
  if (!ANNOUNCEMENT_CATEGORIES.includes(input.category)) {
    throw new Error('Select a valid announcement category.');
  }
  if (!extCheck.valid) throw new Error(extCheck.error ?? 'Invalid external link.');
  if (!attCheck.valid) throw new Error(attCheck.error ?? 'Invalid attachment URL.');

  const announcementId = generateId('ann');
  try {
    await setDoc(doc(db, 'announcements', announcementId), {
      announcementId,
      title,
      body,
      category: input.category,
      externalUrl: extCheck.value,
      attachmentUrl: attCheck.value,
      attachmentName: attCheck.value
        ? (input.attachmentName.trim() || 'Official Document').slice(
            0,
            SCHEMA_LIMITS.ATTACHMENT_NAME_MAX
          )
        : '',
      isPinned: Boolean(input.isPinned),
      status: 'published',
      department: 'CS',
      authorId: admin.uid,
      authorName: sanitizeDisplayName(admin.displayName),
      authorTitle: adminTitle,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcements/${announcementId}`);
  }

  await broadcastDepartmentNotification({
    actorId: admin.uid,
    actorName: admin.displayName,
    type: 'announcement',
    title: input.isPinned ? `Pinned Notice: ${title}` : `Department Notice: ${title}`,
    message: `${adminTitle} published an official ${input.category.toLowerCase()} announcement.`,
    targetSection: 'announcements',
    targetId: announcementId,
  });

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: 'announcement_published',
    entityType: 'announcement',
    entityId: announcementId,
    summary: `Published official announcement "${title}"`,
  });

  return announcementId;
}

export async function updateAnnouncement(
  admin: MemberProfile,
  announcementId: string,
  input: AnnouncementInput
): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  const extCheck = validateHttpsUrl(input.externalUrl);
  const attCheck = validateHttpsUrl(input.attachmentUrl);

  if (
    title.length < SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MIN ||
    title.length > SCHEMA_LIMITS.ANNOUNCEMENT_TITLE_MAX
  ) {
    throw new Error('Announcement title must be 4–180 characters.');
  }
  if (
    body.length < SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MIN ||
    body.length > SCHEMA_LIMITS.ANNOUNCEMENT_BODY_MAX
  ) {
    throw new Error('Announcement body must be 10–8000 characters.');
  }
  if (!extCheck.valid) throw new Error(extCheck.error ?? 'Invalid external link.');
  if (!attCheck.valid) throw new Error(attCheck.error ?? 'Invalid attachment URL.');

  try {
    await updateDoc(doc(db, 'announcements', announcementId), {
      title,
      body,
      category: input.category,
      externalUrl: extCheck.value,
      attachmentUrl: attCheck.value,
      attachmentName: attCheck.value
        ? (input.attachmentName.trim() || 'Official Document').slice(
            0,
            SCHEMA_LIMITS.ATTACHMENT_NAME_MAX
          )
        : '',
      isPinned: Boolean(input.isPinned),
      status: input.status ?? 'published',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `announcements/${announcementId}`);
  }

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: input.status === 'archived' ? 'announcement_archived' : 'announcement_updated',
    entityType: 'announcement',
    entityId: announcementId,
    summary: `Updated announcement "${title}"`,
  });
}

export async function deleteAnnouncement(
  admin: MemberProfile,
  announcement: Announcement
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'announcements', announcement.announcementId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `announcements/${announcement.announcementId}`);
  }

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: 'announcement_deleted',
    entityType: 'announcement',
    entityId: announcement.announcementId,
    summary: `Deleted announcement "${announcement.title}"`,
  });
}

// ============================================================================
// Department Events
// ============================================================================

export function subscribeToEvents(
  onData: (events: DepartmentEvent[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'events'), where('department', '==', 'CS'), limit(150));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as DepartmentEvent)
        .sort((a, b) => {
          const dateCmp = a.eventDate.localeCompare(b.eventDate);
          if (dateCmp !== 0) return dateCmp;
          return a.startTime.localeCompare(b.startTime);
        });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'events');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export interface EventInput {
  title: string;
  description: string;
  category: EventCategory;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  registrationUrl: string;
  clubId?: string;
  status?: EventStatus;
}

function validateEventInput(input: EventInput): { regUrl: string } {
  const title = input.title.trim();
  const desc = input.description.trim();
  const venue = input.venue.trim();
  const regCheck = validateHttpsUrl(input.registrationUrl);

  if (title.length < SCHEMA_LIMITS.EVENT_TITLE_MIN || title.length > SCHEMA_LIMITS.EVENT_TITLE_MAX) {
    throw new Error(`Event title must be ${SCHEMA_LIMITS.EVENT_TITLE_MIN}–${SCHEMA_LIMITS.EVENT_TITLE_MAX} characters.`);
  }
  if (desc.length < SCHEMA_LIMITS.EVENT_DESC_MIN || desc.length > SCHEMA_LIMITS.EVENT_DESC_MAX) {
    throw new Error(`Event description must be ${SCHEMA_LIMITS.EVENT_DESC_MIN}–${SCHEMA_LIMITS.EVENT_DESC_MAX} characters.`);
  }
  if (!EVENT_CATEGORIES.includes(input.category)) {
    throw new Error('Select a valid event category.');
  }
  if (!SCHEMA_PATTERNS.EVENT_DATE.test(input.eventDate)) {
    throw new Error('Event date must follow YYYY-MM-DD format.');
  }
  if (!SCHEMA_PATTERNS.EVENT_TIME.test(input.startTime) || !SCHEMA_PATTERNS.EVENT_TIME.test(input.endTime)) {
    throw new Error('Start and end times must follow HH:MM format.');
  }
  if (input.endTime <= input.startTime) {
    throw new Error('End time must be after start time.');
  }
  if (venue.length < SCHEMA_LIMITS.EVENT_VENUE_MIN || venue.length > SCHEMA_LIMITS.EVENT_VENUE_MAX) {
    throw new Error(`Venue must be ${SCHEMA_LIMITS.EVENT_VENUE_MIN}–${SCHEMA_LIMITS.EVENT_VENUE_MAX} characters.`);
  }
  if (!regCheck.valid) {
    throw new Error(regCheck.error ?? 'Invalid registration URL.');
  }

  return { regUrl: regCheck.value };
}

export async function createDepartmentEvent(
  admin: MemberProfile,
  input: EventInput
): Promise<string> {
  const { regUrl } = validateEventInput(input);
  const eventId = generateId('evt');
  const clubId = (input.clubId ?? '').trim().toLowerCase();

  try {
    await setDoc(doc(db, 'events', eventId), {
      eventId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      venue: input.venue.trim(),
      registrationUrl: regUrl,
      clubId,
      status: 'scheduled',
      department: 'CS',
      createdBy: admin.uid,
      createdByName: sanitizeDisplayName(admin.displayName),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${eventId}`);
  }

  await broadcastDepartmentNotification({
    actorId: admin.uid,
    actorName: admin.displayName,
    type: 'event',
    title: `Upcoming Event: ${input.title.trim()}`,
    message: `${input.eventDate} · ${input.startTime}–${input.endTime} at ${input.venue.trim()}`,
    targetSection: 'calendar',
    targetId: eventId,
  });

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: 'event_created',
    entityType: 'event',
    entityId: eventId,
    summary: `Scheduled event "${input.title.trim()}" on ${input.eventDate}`,
  });

  return eventId;
}

export async function updateDepartmentEvent(
  admin: MemberProfile,
  eventId: string,
  input: EventInput
): Promise<void> {
  const { regUrl } = validateEventInput(input);
  const clubId = (input.clubId ?? '').trim().toLowerCase();
  const status = input.status ?? 'scheduled';

  try {
    await updateDoc(doc(db, 'events', eventId), {
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      venue: input.venue.trim(),
      registrationUrl: regUrl,
      clubId,
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: status === 'cancelled' ? 'event_cancelled' : 'event_updated',
    entityType: 'event',
    entityId: eventId,
    summary: `Updated event "${input.title.trim()}" (status: ${status})`,
  });
}

export async function deleteDepartmentEvent(
  admin: MemberProfile,
  event: DepartmentEvent
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'events', event.eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `events/${event.eventId}`);
  }

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: 'event_deleted',
    entityType: 'event',
    entityId: event.eventId,
    summary: `Deleted event "${event.title}"`,
  });
}
