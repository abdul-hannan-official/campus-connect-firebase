import { Router } from 'express';

const router = Router();

const DEPARTMENT_CONFIG = {
  departmentCode: 'CS',
  departmentName: 'Department of Computer Science',
  platformName: 'Campus Connect',
  academicYear: '2026–2027',
  semesters: [
    'Semester 1',
    'Semester 2',
    'Semester 3',
    'Semester 4',
    'Semester 5',
    'Semester 6',
    'Semester 7',
    'Semester 8',
    'Faculty',
  ],
  tracks: [
    'General CS',
    'Systems & Architecture',
    'AI & Machine Learning',
    'Cybersecurity',
    'Software Engineering',
    'Data Science',
    'Department Faculty',
  ],
  adminTitles: ['Head CR', 'Head GR', 'HOD'],
  modules: [
    {
      id: 'auth',
      index: '01',
      name: 'Authentication & Role Governance',
      status: 'active',
      summary: 'Verified Google Sign-In, PII-isolated accounts, academic onboarding, and Firestore RBAC enforcement.',
    },
    {
      id: 'clubs',
      index: '02',
      name: 'Club Management & Requests',
      status: 'active',
      summary: 'CS club directory, duplicate-proof memberships, club proposals, and scoped moderator assignments.',
    },
    {
      id: 'posts',
      index: '03',
      name: 'Club Feeds, Posts & Nested Replies',
      status: 'active',
      summary: 'Independent club feeds, voting, bookmarks, nested replies, reporting, and moderator content controls.',
    },
    {
      id: 'announcements',
      index: '04',
      name: 'Official Announcements, Events & Notifications',
      status: 'active',
      summary: 'Verified leadership notices, monthly CS event calendar, and real-time per-user notifications.',
    },
  ],
};

router.get('/config', (_req, res) => {
  res.json(DEPARTMENT_CONFIG);
});

export default router;
