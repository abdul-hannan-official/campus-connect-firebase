import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  CS_TRACK_OPTIONS,
  getBootstrapAdminSpec,
  sanitizeBio,
  sanitizeDisplayName,
  sanitizePhotoURL,
  sanitizeStudentId,
  SEMESTER_OPTIONS,
} from '../lib/validation.ts';
import type {
  AdminRecord,
  AssignedAdminTitle,
  CSTrack,
  MemberProfile,
  ModeratorRecord,
  SemesterOption,
  UserPrivateAccount,
  UserRole,
} from '../types/campus.ts';

/**
 * Ensures an authenticated Firebase user has atomic /profiles/{uid} and /users/{uid} records
 * (plus /admins/{uid} when an official department admin signs in for the first time).
 */
export async function ensureUserProvisioned(firebaseUser: User): Promise<void> {
  const uid = firebaseUser.uid;
  const profileRef = doc(db, 'profiles', uid);
  const userRef = doc(db, 'users', uid);

  let profileSnap;
  let userSnap;

  try {
    [profileSnap, userSnap] = await Promise.all([getDoc(profileRef), getDoc(userRef)]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `profiles/${uid}`);
  }

  if (profileSnap.exists() && userSnap.exists()) {
    return;
  }

  const email = (firebaseUser.email ?? '').trim().toLowerCase();
  const isPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');
  if (!email || (!firebaseUser.emailVerified && !isPasswordProvider)) {
    throw new Error('A verified institutional or Google email is required to join Campus Connect.');
  }

  const adminSpec = getBootstrapAdminSpec(email, firebaseUser.emailVerified);
  const isBootstrap = Boolean(adminSpec);
  const role: UserRole = isBootstrap ? 'admin' : 'student';
  const adminTitle = adminSpec?.adminTitle ?? 'none';

  let adminExists = false;
  if (isBootstrap) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      adminExists = adminSnap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
    }
  }

  const batch = writeBatch(db);

  if (isBootstrap && adminSpec && !adminExists) {
    const adminRef = doc(db, 'admins', uid);
    batch.set(adminRef, {
      uid,
      adminTitle: adminSpec.adminTitle,
      grantedBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (!profileSnap.exists()) {
    const fallbackName =
      adminSpec?.defaultDisplayName ??
      (firebaseUser.displayName?.trim() || email.split('@')[0] || 'CS Member');
    batch.set(profileRef, {
      uid,
      displayName: sanitizeDisplayName(firebaseUser.displayName || fallbackName),
      photoURL: sanitizePhotoURL(firebaseUser.photoURL),
      department: 'CS',
      role,
      adminTitle,
      semester: adminSpec?.defaultSemester ?? 'Semester 1',
      track: adminSpec?.defaultTrack ?? 'General CS',
      bio: '',
      assignedClubIds: [],
      onboardingCompleted: isBootstrap,
      isDirectoryVisible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  if (!userSnap.exists()) {
    batch.set(userRef, {
      uid,
      email: firebaseUser.email ?? email,
      studentId: '',
      role,
      adminTitle,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `profiles/${uid}`);
  }
}

export function subscribeToOwnProfile(
  uid: string,
  onData: (profile: MemberProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `profiles/${uid}`;
  return onSnapshot(
    doc(db, 'profiles', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as MemberProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToOwnPrivateAccount(
  uid: string,
  onData: (account: UserPrivateAccount | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as UserPrivateAccount) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToAdminRecord(
  uid: string,
  onData: (record: AdminRecord | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `admins/${uid}`;
  return onSnapshot(
    doc(db, 'admins', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as AdminRecord) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToModeratorRecord(
  uid: string,
  onData: (record: ModeratorRecord | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `moderators/${uid}`;
  return onSnapshot(
    doc(db, 'moderators', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as ModeratorRecord) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToDepartmentDirectory(
  onData: (members: MemberProfile[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'profiles';
  const q = query(
    collection(db, 'profiles'),
    where('department', '==', 'CS'),
    where('isDirectoryVisible', '==', true),
    limit(150)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs
        .map((d) => d.data() as MemberProfile)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      onData(members);
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

export interface ProfileUpdateInput {
  displayName: string;
  studentId: string;
  semester: SemesterOption;
  track: CSTrack;
  bio: string;
  isDirectoryVisible: boolean;
}

export async function updateOwnAcademicProfile(
  uid: string,
  input: ProfileUpdateInput
): Promise<void> {
  const cleanName = sanitizeDisplayName(input.displayName);
  const cleanStudentId = sanitizeStudentId(input.studentId);
  const cleanBio = sanitizeBio(input.bio);

  if (!SEMESTER_OPTIONS.includes(input.semester)) {
    throw new Error('Selected semester is invalid.');
  }
  if (!CS_TRACK_OPTIONS.includes(input.track)) {
    throw new Error('Selected specialization track is invalid.');
  }

  const batch = writeBatch(db);

  batch.update(doc(db, 'profiles', uid), {
    displayName: cleanName,
    semester: input.semester,
    track: input.track,
    bio: cleanBio,
    isDirectoryVisible: Boolean(input.isDirectoryVisible),
    onboardingCompleted: true,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', uid), {
    studentId: cleanStudentId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function assignMemberRole(params: {
  adminUid: string;
  targetUid: string;
  nextRole: UserRole;
  nextAdminTitle: AssignedAdminTitle;
  nextAssignedClubIds: string[];
}): Promise<void> {
  const { adminUid, targetUid, nextRole, nextAdminTitle, nextAssignedClubIds } = params;

  if (targetUid === adminUid && nextRole !== 'admin') {
    throw new Error('Administrators cannot revoke their own admin access.');
  }

  const adminRef = doc(db, 'admins', targetUid);
  const modRef = doc(db, 'moderators', targetUid);
  const profileRef = doc(db, 'profiles', targetUid);
  const userRef = doc(db, 'users', targetUid);

  let adminSnap;
  let modSnap;

  try {
    [adminSnap, modSnap] = await Promise.all([getDoc(adminRef), getDoc(modRef)]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${targetUid}`);
  }

  const batch = writeBatch(db);

  if (nextRole === 'admin') {
    if (adminSnap.exists()) {
      batch.update(adminRef, {
        adminTitle: nextAdminTitle,
        grantedBy: adminUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(adminRef, {
        uid: targetUid,
        adminTitle: nextAdminTitle,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (modSnap.exists()) {
      batch.delete(modRef);
    }

    batch.update(profileRef, {
      role: 'admin',
      adminTitle: nextAdminTitle,
      assignedClubIds: [],
      updatedAt: serverTimestamp(),
    });

    batch.update(userRef, {
      role: 'admin',
      adminTitle: nextAdminTitle,
      updatedAt: serverTimestamp(),
    });
  } else if (nextRole === 'moderator') {
    if (modSnap.exists()) {
      batch.update(modRef, {
        assignedClubIds: nextAssignedClubIds,
        grantedBy: adminUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(modRef, {
        uid: targetUid,
        assignedClubIds: nextAssignedClubIds,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (adminSnap.exists()) {
      batch.delete(adminRef);
    }

    batch.update(profileRef, {
      role: 'moderator',
      adminTitle: 'none',
      assignedClubIds: nextAssignedClubIds,
      updatedAt: serverTimestamp(),
    });

    batch.update(userRef, {
      role: 'moderator',
      adminTitle: 'none',
      updatedAt: serverTimestamp(),
    });
  } else {
    if (adminSnap.exists()) {
      batch.delete(adminRef);
    }
    if (modSnap.exists()) {
      batch.delete(modRef);
    }

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

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `profiles/${targetUid}`);
  }
}

export async function lookupProfileByUid(uid: string): Promise<MemberProfile | null> {
  const cleanUid = uid.trim();
  if (!cleanUid || !/^[a-zA-Z0-9_-]{1,128}$/.test(cleanUid)) {
    throw new Error('Enter a valid user UID (letters, numbers, hyphens, underscores).');
  }
  const path = `profiles/${cleanUid}`;
  try {
    const snap = await getDoc(doc(db, 'profiles', cleanUid));
    return snap.exists() ? (snap.data() as MemberProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
