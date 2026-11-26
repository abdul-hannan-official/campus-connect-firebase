import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  CLUB_CATEGORIES,
  sanitizeDisplayName,
  SCHEMA_LIMITS,
  SCHEMA_PATTERNS,
  slugifyClubName,
  validateHttpsUrl,
} from '../lib/validation.ts';
import type {
  Club,
  ClubCategory,
  ClubMembership,
  ClubRequest,
  ClubStatus,
  MemberProfile,
  ModeratorRecord,
} from '../types/campus.ts';
import { createNotification, logActivity } from './activityService.ts';

function generateRequestId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `creq_${randomPart}`;
}

export function subscribeToClubs(
  onData: (clubs: Club[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'clubs'), where('department', '==', 'CS'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const clubs = snapshot.docs
        .map((d) => d.data() as Club)
        .sort((a, b) => a.name.localeCompare(b.name));
      onData(clubs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'clubs');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToUserMemberships(
  userId: string,
  onData: (memberships: ClubMembership[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'clubMemberships'),
    where('department', '==', 'CS'),
    where('userId', '==', userId),
    limit(100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as ClubMembership));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'clubMemberships');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToClubMembers(
  clubId: string,
  onData: (memberships: ClubMembership[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'clubMemberships'),
    where('department', '==', 'CS'),
    where('clubId', '==', clubId),
    limit(200)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => d.data() as ClubMembership)
        .sort((a, b) => a.memberName.localeCompare(b.memberName));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'clubMemberships');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToClubRequests(
  options: { isAdmin: boolean; userId: string },
  onData: (requests: ClubRequest[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = options.isAdmin
    ? query(collection(db, 'clubRequests'), where('department', '==', 'CS'), limit(100))
    : query(
        collection(db, 'clubRequests'),
        where('department', '==', 'CS'),
        where('requestedBy', '==', options.userId),
        limit(50)
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as ClubRequest)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'clubRequests');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export interface ClubFormInput {
  clubId?: string;
  name: string;
  description: string;
  category: ClubCategory;
  logoUrl: string;
}

export async function createClub(
  actor: MemberProfile,
  input: ClubFormInput
): Promise<string> {
  const cleanName = input.name.trim();
  const cleanDesc = input.description.trim();
  const slug = slugifyClubName(input.clubId?.trim() || cleanName);
  const logoCheck = validateHttpsUrl(input.logoUrl);

  if (cleanName.length < SCHEMA_LIMITS.CLUB_NAME_MIN || cleanName.length > SCHEMA_LIMITS.CLUB_NAME_MAX) {
    throw new Error(`Club name must be ${SCHEMA_LIMITS.CLUB_NAME_MIN}–${SCHEMA_LIMITS.CLUB_NAME_MAX} characters.`);
  }
  if (cleanDesc.length < SCHEMA_LIMITS.CLUB_DESC_MIN || cleanDesc.length > SCHEMA_LIMITS.CLUB_DESC_MAX) {
    throw new Error(`Description must be ${SCHEMA_LIMITS.CLUB_DESC_MIN}–${SCHEMA_LIMITS.CLUB_DESC_MAX} characters.`);
  }
  if (!CLUB_CATEGORIES.includes(input.category)) {
    throw new Error('Select a valid club category.');
  }
  if (!SCHEMA_PATTERNS.CLUB_SLUG.test(slug) || slug.length < SCHEMA_LIMITS.CLUB_SLUG_MIN) {
    throw new Error('Club slug must contain 2–64 lowercase letters, numbers, or hyphens.');
  }
  if (!logoCheck.valid) {
    throw new Error(logoCheck.error ?? 'Invalid logo URL.');
  }

  const clubRef = doc(db, 'clubs', slug);
  try {
    const existingSnap = await getDoc(clubRef);
    if (existingSnap.exists()) {
      throw new Error(`A club with slug "${slug}" already exists.`);
    }

    await setDoc(clubRef, {
      clubId: slug,
      name: cleanName,
      description: cleanDesc,
      category: input.category,
      logoUrl: logoCheck.value,
      department: 'CS',
      status: 'active',
      memberCount: 0,
      moderatorIds: [],
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `clubs/${slug}`);
  }

  await logActivity({
    actorId: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    action: 'club_created',
    entityType: 'club',
    entityId: slug,
    summary: `Created CS club "${cleanName}" (${slug})`,
  });

  return slug;
}

export async function updateClub(
  actor: MemberProfile,
  clubId: string,
  input: Omit<ClubFormInput, 'clubId'> & { status: ClubStatus }
): Promise<void> {
  const cleanName = input.name.trim();
  const cleanDesc = input.description.trim();
  const logoCheck = validateHttpsUrl(input.logoUrl);

  if (cleanName.length < SCHEMA_LIMITS.CLUB_NAME_MIN || cleanName.length > SCHEMA_LIMITS.CLUB_NAME_MAX) {
    throw new Error(`Club name must be ${SCHEMA_LIMITS.CLUB_NAME_MIN}–${SCHEMA_LIMITS.CLUB_NAME_MAX} characters.`);
  }
  if (cleanDesc.length < SCHEMA_LIMITS.CLUB_DESC_MIN || cleanDesc.length > SCHEMA_LIMITS.CLUB_DESC_MAX) {
    throw new Error(`Description must be ${SCHEMA_LIMITS.CLUB_DESC_MIN}–${SCHEMA_LIMITS.CLUB_DESC_MAX} characters.`);
  }
  if (!CLUB_CATEGORIES.includes(input.category)) {
    throw new Error('Select a valid club category.');
  }
  if (!logoCheck.valid) {
    throw new Error(logoCheck.error ?? 'Invalid logo URL.');
  }

  try {
    await updateDoc(doc(db, 'clubs', clubId), {
      name: cleanName,
      description: cleanDesc,
      category: input.category,
      logoUrl: logoCheck.value,
      status: input.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `clubs/${clubId}`);
  }

  await logActivity({
    actorId: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    action: input.status === 'archived' ? 'club_archived' : 'club_updated',
    entityType: 'club',
    entityId: clubId,
    summary: `Updated club "${cleanName}" (status: ${input.status})`,
  });
}

export async function joinClub(actor: MemberProfile, club: Club): Promise<void> {
  const membershipId = `${club.clubId}__${actor.uid}`;
  const clubRef = doc(db, 'clubs', club.clubId);
  const membershipRef = doc(db, 'clubMemberships', membershipId);

  try {
    await runTransaction(db, async (tx) => {
      const [clubSnap, memSnap] = await Promise.all([tx.get(clubRef), tx.get(membershipRef)]);
      if (!clubSnap.exists()) {
        throw new Error('Club does not exist.');
      }
      const liveClub = clubSnap.data() as Club;
      if (liveClub.status !== 'active') {
        throw new Error('Archived clubs cannot accept new members.');
      }
      if (memSnap.exists()) {
        throw new Error('You are already a member of this club.');
      }

      tx.set(membershipRef, {
        membershipId,
        clubId: liveClub.clubId,
        clubName: liveClub.name,
        userId: actor.uid,
        memberName: sanitizeDisplayName(actor.displayName),
        department: 'CS',
        joinedAt: serverTimestamp(),
      });

      tx.update(clubRef, {
        memberCount: liveClub.memberCount + 1,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already a member') ||
        error.message.includes('Archived clubs') ||
        error.message.includes('does not exist'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `clubMemberships/${membershipId}`);
  }
}

export async function leaveClub(actor: MemberProfile, club: Club): Promise<void> {
  const membershipId = `${club.clubId}__${actor.uid}`;
  const clubRef = doc(db, 'clubs', club.clubId);
  const membershipRef = doc(db, 'clubMemberships', membershipId);

  try {
    await runTransaction(db, async (tx) => {
      const [clubSnap, memSnap] = await Promise.all([tx.get(clubRef), tx.get(membershipRef)]);
      if (!clubSnap.exists() || !memSnap.exists()) {
        throw new Error('Membership record was not found.');
      }
      const liveClub = clubSnap.data() as Club;
      tx.delete(membershipRef);
      tx.update(clubRef, {
        memberCount: Math.max(0, liveClub.memberCount - 1),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `clubMemberships/${membershipId}`);
  }
}

export async function submitClubRequest(
  actor: MemberProfile,
  input: {
    name: string;
    category: ClubCategory;
    description: string;
    justification: string;
    logoUrl: string;
  }
): Promise<string> {
  const cleanName = input.name.trim();
  const cleanDesc = input.description.trim();
  const cleanJustification = input.justification.trim();
  const proposedSlug = slugifyClubName(cleanName);
  const logoCheck = validateHttpsUrl(input.logoUrl);

  if (cleanName.length < SCHEMA_LIMITS.CLUB_NAME_MIN || cleanName.length > SCHEMA_LIMITS.CLUB_NAME_MAX) {
    throw new Error(`Club name must be ${SCHEMA_LIMITS.CLUB_NAME_MIN}–${SCHEMA_LIMITS.CLUB_NAME_MAX} characters.`);
  }
  if (cleanDesc.length < SCHEMA_LIMITS.CLUB_DESC_MIN || cleanDesc.length > SCHEMA_LIMITS.CLUB_DESC_MAX) {
    throw new Error(`Description must be ${SCHEMA_LIMITS.CLUB_DESC_MIN}–${SCHEMA_LIMITS.CLUB_DESC_MAX} characters.`);
  }
  if (
    cleanJustification.length < SCHEMA_LIMITS.CLUB_JUSTIFICATION_MIN ||
    cleanJustification.length > SCHEMA_LIMITS.CLUB_JUSTIFICATION_MAX
  ) {
    throw new Error(
      `Justification must be ${SCHEMA_LIMITS.CLUB_JUSTIFICATION_MIN}–${SCHEMA_LIMITS.CLUB_JUSTIFICATION_MAX} characters.`
    );
  }
  if (!SCHEMA_PATTERNS.CLUB_SLUG.test(proposedSlug) || proposedSlug.length < 2) {
    throw new Error('Club name must produce a valid alphanumeric slug.');
  }
  if (!logoCheck.valid) {
    throw new Error(logoCheck.error ?? 'Invalid logo URL.');
  }

  const requestId = generateRequestId();
  try {
    await setDoc(doc(db, 'clubRequests', requestId), {
      requestId,
      name: cleanName,
      proposedSlug,
      category: input.category,
      description: cleanDesc,
      justification: cleanJustification,
      logoUrl: logoCheck.value,
      department: 'CS',
      requestedBy: actor.uid,
      requesterName: sanitizeDisplayName(actor.displayName),
      status: 'pending',
      reviewNote: '',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `clubRequests/${requestId}`);
  }

  return requestId;
}

export async function reviewClubRequest(params: {
  admin: MemberProfile;
  request: ClubRequest;
  decision: 'approved' | 'rejected';
  reviewNote: string;
}): Promise<void> {
  const { admin, request, decision, reviewNote } = params;
  const cleanNote = reviewNote.trim().slice(0, SCHEMA_LIMITS.REVIEW_NOTE_MAX);
  const reqRef = doc(db, 'clubRequests', request.requestId);

  if (decision === 'approved') {
    const clubRef = doc(db, 'clubs', request.proposedSlug);
    const existingClub = await getDoc(clubRef);
    if (existingClub.exists()) {
      throw new Error(
        `A club with slug "${request.proposedSlug}" already exists. Reject this request or edit the existing club.`
      );
    }

    const batch = writeBatch(db);
    batch.update(reqRef, {
      status: 'approved',
      reviewNote: cleanNote,
      reviewedBy: admin.uid,
      updatedAt: serverTimestamp(),
    });
    batch.set(clubRef, {
      clubId: request.proposedSlug,
      name: request.name,
      description: request.description,
      category: request.category,
      logoUrl: request.logoUrl,
      department: 'CS',
      status: 'active',
      memberCount: 0,
      moderatorIds: [],
      createdBy: admin.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `clubRequests/${request.requestId}`);
    }
  } else {
    try {
      await updateDoc(reqRef, {
        status: 'rejected',
        reviewNote: cleanNote,
        reviewedBy: admin.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clubRequests/${request.requestId}`);
    }
  }

  await createNotification({
    recipientId: request.requestedBy,
    actorId: admin.uid,
    actorName: admin.displayName,
    type: 'club_request',
    title:
      decision === 'approved'
        ? `Club request approved: ${request.name}`
        : `Club request declined: ${request.name}`,
    message:
      cleanNote ||
      (decision === 'approved'
        ? `Your proposal for ${request.name} is now live in the CS Club Directory.`
        : `Your proposal for ${request.name} was reviewed by Department Administration.`),
    targetSection: 'clubs',
    targetId: decision === 'approved' ? request.proposedSlug : request.requestId,
  });

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: decision === 'approved' ? 'club_request_approved' : 'club_request_rejected',
    entityType: 'clubRequest',
    entityId: request.requestId,
    summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} club request "${request.name}"`,
  });
}

export async function updateClubModeratorAssignment(params: {
  admin: MemberProfile;
  club: Club;
  targetProfile: MemberProfile;
  action: 'assign' | 'remove';
}): Promise<void> {
  const { admin, club, targetProfile, action } = params;
  const targetUid = targetProfile.uid;

  const currentClubMods = Array.isArray(club.moderatorIds) ? club.moderatorIds : [];
  const nextClubMods =
    action === 'assign'
      ? Array.from(new Set([...currentClubMods, targetUid]))
      : currentClubMods.filter((id) => id !== targetUid);

  if (nextClubMods.length > SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX) {
    throw new Error(`A club can have at most ${SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX} assigned moderators.`);
  }

  const clubRef = doc(db, 'clubs', club.clubId);
  const modRef = doc(db, 'moderators', targetUid);
  const profileRef = doc(db, 'profiles', targetUid);
  const userRef = doc(db, 'users', targetUid);

  let modSnap;
  let adminSnap;
  try {
    [modSnap, adminSnap] = await Promise.all([getDoc(modRef), getDoc(doc(db, 'admins', targetUid))]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `moderators/${targetUid}`);
  }

  const batch = writeBatch(db);
  batch.update(clubRef, {
    moderatorIds: nextClubMods,
    updatedAt: serverTimestamp(),
  });

  // If the target is not already a Department Admin, synchronize their Moderator RBAC authority record
  if (!adminSnap.exists()) {
    const existingAssigned = modSnap.exists()
      ? ((modSnap.data() as ModeratorRecord).assignedClubIds ?? [])
      : [];
    const nextAssigned =
      action === 'assign'
        ? Array.from(new Set([...existingAssigned, club.clubId]))
        : existingAssigned.filter((id) => id !== club.clubId);

    if (nextAssigned.length > SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX) {
      throw new Error(`A moderator can manage at most ${SCHEMA_LIMITS.ASSIGNED_CLUBS_MAX} clubs.`);
    }

    if (nextAssigned.length > 0) {
      if (modSnap.exists()) {
        batch.update(modRef, {
          assignedClubIds: nextAssigned,
          grantedBy: admin.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(modRef, {
          uid: targetUid,
          assignedClubIds: nextAssigned,
          grantedBy: admin.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(profileRef, {
        role: 'moderator',
        adminTitle: 'none',
        assignedClubIds: nextAssigned,
        updatedAt: serverTimestamp(),
      });
      batch.update(userRef, {
        role: 'moderator',
        adminTitle: 'none',
        updatedAt: serverTimestamp(),
      });
    } else if (modSnap.exists()) {
      batch.delete(modRef);
      batch.update(profileRef, {
        role: 'student',
        adminTitle: 'none',
        assignedClubIds: [],
        updatedAt: serverTimestamp(),
      });
      batch.update(userRef, {
        role: 'student',
        adminTitle: 'none',
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `clubs/${club.clubId}`);
  }

  await createNotification({
    recipientId: targetUid,
    actorId: admin.uid,
    actorName: admin.displayName,
    type: 'moderation',
    title:
      action === 'assign'
        ? `Assigned as moderator for ${club.name}`
        : `Removed as moderator from ${club.name}`,
    message:
      action === 'assign'
        ? `You now have moderator permissions for discussions and reports inside ${club.name}.`
        : `Your moderator assignment for ${club.name} was updated by Department Administration.`,
    targetSection: action === 'assign' ? 'moderator' : 'clubs',
    targetId: club.clubId,
  });

  await logActivity({
    actorId: admin.uid,
    actorName: admin.displayName,
    actorRole: admin.role,
    action: action === 'assign' ? 'moderator_assigned' : 'moderator_removed',
    entityType: 'role',
    entityId: `${club.clubId}:${targetUid}`,
    summary: `${action === 'assign' ? 'Assigned' : 'Removed'} ${targetProfile.displayName} as moderator for ${club.name}`,
  });
}
