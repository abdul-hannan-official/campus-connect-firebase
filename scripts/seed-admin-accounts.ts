/**
 * One-command provisioning script for the 3 UOS CS Department Admin accounts:
 *   - hodcs@uos.edu.pk      (HOD)
 *   - csheadcr@uos.edu.pk   (Head CR)
 *   - csheadgr@uos.edu.pk   (Head GR)
 *
 * Prerequisite:
 *   Enable "Email/Password" in Firebase Console -> Authentication -> Sign-in method.
 *
 * Usage:
 *   ADMIN_SEED_PASSWORD="Admin@1122" npm run seed:admins
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore';

const SEED_ACCOUNTS = [
  {
    email: 'hodcs@uos.edu.pk',
    displayName: 'Head of Department (CS)',
    adminTitle: 'HOD' as const,
    semester: 'Faculty' as const,
    track: 'Department Faculty' as const,
    studentId: 'UOS-CS-HOD',
  },
  {
    email: 'csheadcr@uos.edu.pk',
    displayName: 'Head CR — CS Department',
    adminTitle: 'Head CR' as const,
    semester: 'Semester 8' as const,
    track: 'Software Engineering' as const,
    studentId: 'UOS-CS-HCR',
  },
  {
    email: 'csheadgr@uos.edu.pk',
    displayName: 'Head GR — CS Department',
    adminTitle: 'Head GR' as const,
    semester: 'Semester 8' as const,
    track: 'Software Engineering' as const,
    studentId: 'UOS-CS-HGR',
  },
];

async function main() {
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password || password.length < 6) {
    console.error(
      'Missing ADMIN_SEED_PASSWORD environment variable (min 6 chars).\n' +
        'Run: ADMIN_SEED_PASSWORD="Admin@1122" npm run seed:admins'
    );
    process.exit(1);
  }

  const configPath = path.resolve('firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    apiKey: string;
    authDomain: string;
    projectId: string;
    firestoreDatabaseId: string;
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  for (const account of SEED_ACCOUNTS) {
    console.log(`\nProvisioning ${account.email} (${account.adminTitle})…`);
    let user;
    try {
      const cred = await createUserWithEmailAndPassword(auth, account.email, password);
      user = cred.user;
      await updateProfile(user, { displayName: account.displayName });
      console.log(`  Created Firebase Auth user (uid=${user.uid})`);
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === 'auth/operation-not-allowed') {
        console.error(
          '\nERROR: Email/Password sign-in is disabled in Firebase Console.\n' +
            `Open https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers\n` +
            'Enable "Email/Password", then re-run this script.'
        );
        process.exit(1);
      }
      if (code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, account.email, password);
        user = cred.user;
        console.log(`  Auth user already exists (uid=${user.uid}), verifying Firestore docs…`);
      } else {
        throw error;
      }
    }

    const uid = user.uid;
    const [profileSnap, userSnap, adminSnap] = await Promise.all([
      getDoc(doc(db, 'profiles', uid)),
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'admins', uid)),
    ]);

    if (!profileSnap.exists() || !userSnap.exists() || !adminSnap.exists()) {
      const batch = writeBatch(db);
      if (!adminSnap.exists()) {
        batch.set(doc(db, 'admins', uid), {
          uid,
          adminTitle: account.adminTitle,
          grantedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (!profileSnap.exists()) {
        batch.set(doc(db, 'profiles', uid), {
          uid,
          displayName: account.displayName,
          photoURL: '',
          department: 'CS',
          role: 'admin',
          adminTitle: account.adminTitle,
          semester: account.semester,
          track: account.track,
          bio: `Official ${account.adminTitle} account for the Department of Computer Science.`,
          assignedClubIds: [],
          onboardingCompleted: true,
          isDirectoryVisible: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (!userSnap.exists()) {
        batch.set(doc(db, 'users', uid), {
          uid,
          email: account.email,
          studentId: account.studentId,
          role: 'admin',
          adminTitle: account.adminTitle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      console.log(`  Synced /admins/${uid}, /profiles/${uid}, and /users/${uid} in Firestore.`);
    } else {
      console.log(`  Firestore records already exist for ${account.email}.`);
    }

    await signOut(auth);
  }

  console.log('\nAll 3 UOS CS Department Admin accounts provisioned successfully.');
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
