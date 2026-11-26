/**
 * Firestore Security Rules Emulator Test Suite — Campus Connect (Modules 1–8)
 *
 * Requires Java 11+ and Firebase CLI Emulator:
 *   firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'campus-connect-rules-test';

let testEnv: RulesTestEnvironment;

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

async function seedAdminAndStudent() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'admin-1'), {
      uid: 'admin-1',
      adminTitle: 'HOD',
      grantedBy: 'admin-1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'profiles', 'admin-1'), {
      uid: 'admin-1',
      displayName: 'Dr. HOD',
      photoURL: '',
      department: 'CS',
      role: 'admin',
      adminTitle: 'HOD',
      semester: 'Faculty',
      track: 'Department Faculty',
      bio: '',
      assignedClubIds: [],
      onboardingCompleted: true,
      isDirectoryVisible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'moderators', 'mod-1'), {
      uid: 'mod-1',
      assignedClubIds: ['ai-research'],
      grantedBy: 'admin-1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'clubs', 'ai-research'), {
      clubId: 'ai-research',
      name: 'AI Research Club',
      description: 'Machine learning reading group and systems projects.',
      category: 'AI & Data',
      logoUrl: '',
      department: 'CS',
      status: 'active',
      memberCount: 1,
      moderatorIds: ['mod-1'],
      createdBy: 'admin-1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'clubs', 'cybersec'), {
      clubId: 'cybersec',
      name: 'Cybersecurity Society',
      description: 'CTF team and defensive security workshops.',
      category: 'Cybersecurity',
      logoUrl: '',
      department: 'CS',
      status: 'active',
      memberCount: 0,
      moderatorIds: [],
      createdBy: 'admin-1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'clubMemberships', 'ai-research__stu-1'), {
      membershipId: 'ai-research__stu-1',
      clubId: 'ai-research',
      clubName: 'AI Research Club',
      userId: 'stu-1',
      memberName: 'Student One',
      department: 'CS',
      joinedAt: serverTimestamp(),
    });
  });
}

async function runTests() {
  await setup();

  try {
    await testEnv.clearFirestore();
    await seedAdminAndStudent();

    const adminDb = testEnv
      .authenticatedContext('admin-1', { email: 'hod@cs.edu', email_verified: true })
      .firestore();
    const modDb = testEnv
      .authenticatedContext('mod-1', { email: 'mod@cs.edu', email_verified: true })
      .firestore();
    const studentDb = testEnv
      .authenticatedContext('stu-1', { email: 'stu1@cs.edu', email_verified: true })
      .firestore();
    const outsiderDb = testEnv
      .authenticatedContext('stu-2', { email: 'stu2@cs.edu', email_verified: true })
      .firestore();

    // 1. Non-admin cannot forge admin record
    await assertFails(
      setDoc(doc(studentDb, 'admins', 'stu-1'), {
        uid: 'stu-1',
        adminTitle: 'HOD',
        grantedBy: 'stu-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 2. Student cannot publish official announcements or events
    await assertFails(
      setDoc(doc(studentDb, 'announcements', 'ann-forged'), {
        announcementId: 'ann-forged',
        title: 'Fake Notice',
        body: 'Attempting to bypass admin role.',
        category: 'General',
        externalUrl: '',
        attachmentUrl: '',
        attachmentName: '',
        isPinned: false,
        status: 'published',
        department: 'CS',
        authorId: 'stu-1',
        authorName: 'Student One',
        authorTitle: 'HOD',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertFails(
      setDoc(doc(modDb, 'events', 'evt-forged'), {
        eventId: 'evt-forged',
        title: 'Unauthorized Event',
        description: 'Moderators cannot schedule official department events.',
        category: 'Seminar',
        eventDate: '2026-12-01',
        startTime: '14:00',
        endTime: '15:00',
        venue: 'Room 101',
        registrationUrl: '',
        clubId: '',
        status: 'scheduled',
        department: 'CS',
        createdBy: 'mod-1',
        createdByName: 'Mod One',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3. Admin can publish official announcement
    await assertSucceeds(
      setDoc(doc(adminDb, 'announcements', 'ann-1'), {
        announcementId: 'ann-1',
        title: 'Midterm Schedule Published',
        body: 'All CS midterm examinations begin next Monday in Block B.',
        category: 'Examination',
        externalUrl: 'https://cs.university.edu/exams',
        attachmentUrl: '',
        attachmentName: '',
        isPinned: true,
        status: 'published',
        department: 'CS',
        authorId: 'admin-1',
        authorName: 'Dr. HOD',
        authorTitle: 'HOD',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 4. Club member can create post in joined club; non-member cannot
    const validPost = {
      postId: 'post-1',
      clubId: 'ai-research',
      clubName: 'AI Research Club',
      department: 'CS',
      authorId: 'stu-1',
      authorName: 'Student One',
      authorRole: 'student',
      title: 'Attention Mechanism Study Notes',
      body: 'Sharing my reading notes from this week.',
      externalUrl: '',
      attachmentUrl: '',
      attachmentName: '',
      attachmentType: 'none',
      isPinned: false,
      status: 'active',
      removedReason: '',
      moderatedBy: '',
      upvoteCount: 0,
      downvoteCount: 0,
      voteScore: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(studentDb, 'posts', 'post-1'), validPost));

    await assertFails(
      setDoc(doc(outsiderDb, 'posts', 'post-unauth'), {
        ...validPost,
        postId: 'post-unauth',
        authorId: 'stu-2',
      })
    );

    // 5. XSS javascript: URL rejected in posts
    await assertFails(
      setDoc(doc(studentDb, 'posts', 'post-xss'), {
        ...validPost,
        postId: 'post-xss',
        externalUrl: 'javascript:alert(1)',
      })
    );

    // 6. Moderator can pin post in assigned club (`ai-research`)
    await assertSucceeds(
      updateDoc(doc(modDb, 'posts', 'post-1'), {
        isPinned: true,
        moderatedBy: 'mod-1',
        updatedAt: serverTimestamp(),
      })
    );

    // 7. Student cannot list other students' club requests
    await assertFails(
      getDocs(query(collection(studentDb, 'clubRequests'), where('department', '==', 'CS')))
    );

    // 8. Atomic club join succeeds; direct memberCount inflation without membership fails
    await assertFails(
      updateDoc(doc(outsiderDb, 'clubs', 'cybersec'), {
        memberCount: 1,
        updatedAt: serverTimestamp(),
      })
    );

    const joinBatch = writeBatch(outsiderDb);
    joinBatch.set(doc(outsiderDb, 'clubMemberships', 'cybersec__stu-2'), {
      membershipId: 'cybersec__stu-2',
      clubId: 'cybersec',
      clubName: 'Cybersecurity Society',
      userId: 'stu-2',
      memberName: 'Student Two',
      department: 'CS',
      joinedAt: serverTimestamp(),
    });
    joinBatch.update(doc(outsiderDb, 'clubs', 'cybersec'), {
      memberCount: 1,
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(joinBatch.commit());

    // 9. Audit logs are strictly immutable
    await assertSucceeds(
      setDoc(doc(adminDb, 'activityLogs', 'log-1'), {
        logId: 'log-1',
        actorId: 'admin-1',
        actorName: 'Dr. HOD',
        actorRole: 'admin',
        action: 'announcement_published',
        entityType: 'announcement',
        entityId: 'ann-1',
        summary: 'Published official midterm notice',
        department: 'CS',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(adminDb, 'activityLogs', 'log-1')));

    // 10. Private notifications cannot be read cross-user
    await assertSucceeds(
      setDoc(doc(adminDb, 'notifications', 'ntf-1'), {
        notificationId: 'ntf-1',
        recipientId: 'stu-1',
        actorId: 'admin-1',
        actorName: 'Dr. HOD',
        type: 'announcement',
        title: 'Midterm Schedule Published',
        message: 'Check the notice.',
        targetSection: 'announcements',
        targetId: 'ann-1',
        isRead: false,
        createdAt: serverTimestamp(),
        readAt: null,
      })
    );
    await assertSucceeds(getDoc(doc(studentDb, 'notifications', 'ntf-1')));
    await assertFails(getDoc(doc(outsiderDb, 'notifications', 'ntf-1')));

    assert.ok(true);
    console.log('All Firestore emulator security rules tests passed.');
  } finally {
    await testEnv.cleanup();
  }
}

runTests().catch((err) => {
  console.error('Firestore rules test failed:', err);
  process.exit(1);
});
