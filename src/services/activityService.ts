import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { sanitizeDisplayName } from '../lib/validation.ts';
import type {
  ActivityEntityType,
  ActivityLog,
  AppNotification,
  MemberProfile,
  NotificationTargetSection,
  NotificationType,
  UserRole,
} from '../types/campus.ts';

function generateId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

export async function logActivity(params: {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
}): Promise<void> {
  const logId = generateId('log');
  const path = `activityLogs/${logId}`;
  try {
    await setDoc(doc(db, 'activityLogs', logId), {
      logId,
      actorId: params.actorId,
      actorName: sanitizeDisplayName(params.actorName),
      actorRole: params.actorRole,
      action: params.action.trim().slice(0, 80),
      entityType: params.entityType,
      entityId: params.entityId.trim().slice(0, 128),
      summary: params.summary.trim().slice(0, 300),
      department: 'CS',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToActivityLogs(
  options: { isAdmin: boolean; userId: string },
  onData: (logs: ActivityLog[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'activityLogs';
  const q = options.isAdmin
    ? query(collection(db, 'activityLogs'), where('department', '==', 'CS'), limit(60))
    : query(
        collection(db, 'activityLogs'),
        where('department', '==', 'CS'),
        where('actorId', '==', options.userId),
        limit(40)
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as ActivityLog)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createNotification(params: {
  recipientId: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  title: string;
  message: string;
  targetSection: NotificationTargetSection;
  targetId?: string;
}): Promise<void> {
  if (!params.recipientId || params.recipientId === params.actorId) {
    return;
  }
  const notificationId = generateId('ntf');
  const path = `notifications/${notificationId}`;
  try {
    await setDoc(doc(db, 'notifications', notificationId), {
      notificationId,
      recipientId: params.recipientId,
      actorId: params.actorId,
      actorName: sanitizeDisplayName(params.actorName),
      type: params.type,
      title: params.title.trim().slice(0, 140),
      message: params.message.trim().slice(0, 400),
      targetSection: params.targetSection,
      targetId: (params.targetId ?? '').trim().slice(0, 128),
      isRead: false,
      createdAt: serverTimestamp(),
      readAt: null,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function broadcastDepartmentNotification(params: {
  actorId: string;
  actorName: string;
  type: 'announcement' | 'event' | 'club_activity';
  title: string;
  message: string;
  targetSection: NotificationTargetSection;
  targetId?: string;
}): Promise<void> {
  let members: MemberProfile[] = [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'profiles'),
        where('department', '==', 'CS'),
        where('isDirectoryVisible', '==', true),
        limit(200)
      )
    );
    members = snap.docs.map((d) => d.data() as MemberProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'profiles');
  }

  const recipients = members.filter((m) => m.uid !== params.actorId);
  if (recipients.length === 0) return;

  const batch = writeBatch(db);
  for (const member of recipients.slice(0, 200)) {
    const notificationId = generateId('ntf');
    batch.set(doc(db, 'notifications', notificationId), {
      notificationId,
      recipientId: member.uid,
      actorId: params.actorId,
      actorName: sanitizeDisplayName(params.actorName),
      type: params.type,
      title: params.title.trim().slice(0, 140),
      message: params.message.trim().slice(0, 400),
      targetSection: params.targetSection,
      targetId: (params.targetId ?? '').trim().slice(0, 128),
      isRead: false,
      createdAt: serverTimestamp(),
      readAt: null,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
}

export function subscribeToUserNotifications(
  userId: string,
  onData: (items: AppNotification[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'notifications';
  const q = query(collection(db, 'notifications'), where('recipientId', '==', userId), limit(80));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as AppNotification)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
      readAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(notifications: AppNotification[]): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  for (const item of unread.slice(0, 200)) {
    batch.update(doc(db, 'notifications', item.notificationId), {
      isRead: true,
      readAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
