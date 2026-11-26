import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'moderator' | 'admin';

export type AdminTitle = 'none' | 'Head CR' | 'Head GR' | 'HOD';
export type AssignedAdminTitle = 'Head CR' | 'Head GR' | 'HOD';

export type SemesterOption =
  | 'Semester 1'
  | 'Semester 2'
  | 'Semester 3'
  | 'Semester 4'
  | 'Semester 5'
  | 'Semester 6'
  | 'Semester 7'
  | 'Semester 8'
  | 'Faculty';

export type CSTrack =
  | 'General CS'
  | 'Systems & Architecture'
  | 'AI & Machine Learning'
  | 'Cybersecurity'
  | 'Software Engineering'
  | 'Data Science'
  | 'Department Faculty';

export interface MemberProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  department: 'CS';
  role: UserRole;
  adminTitle: AdminTitle;
  semester: SemesterOption;
  track: CSTrack;
  bio: string;
  assignedClubIds: string[];
  onboardingCompleted: boolean;
  isDirectoryVisible: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivateAccount {
  uid: string;
  email: string;
  studentId: string;
  role: UserRole;
  adminTitle: AdminTitle;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AdminRecord {
  uid: string;
  adminTitle: AssignedAdminTitle;
  grantedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ModeratorRecord {
  uid: string;
  assignedClubIds: string[];
  grantedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// Module 2 — Clubs, Memberships & Requests
export type ClubCategory =
  | 'AI & Data'
  | 'Systems & Cloud'
  | 'Cybersecurity'
  | 'Software & Web'
  | 'Competitive Programming'
  | 'Robotics & IoT'
  | 'Research & Open Source';

export type ClubStatus = 'active' | 'archived';

export interface Club {
  clubId: string;
  name: string;
  description: string;
  category: ClubCategory;
  logoUrl: string;
  department: 'CS';
  status: ClubStatus;
  memberCount: number;
  moderatorIds: string[];
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ClubMembership {
  membershipId: string;
  clubId: string;
  clubName: string;
  userId: string;
  memberName: string;
  department: 'CS';
  joinedAt: Timestamp | null;
}

export type ClubRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ClubRequest {
  requestId: string;
  name: string;
  proposedSlug: string;
  category: ClubCategory;
  description: string;
  justification: string;
  logoUrl: string;
  department: 'CS';
  requestedBy: string;
  requesterName: string;
  status: ClubRequestStatus;
  reviewNote: string;
  reviewedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// Modules 3 & 4 — Posts, Comments, Votes & Bookmarks
export type PostAttachmentType = 'none' | 'image' | 'document';
export type ContentStatus = 'active' | 'removed' | 'deleted';

export interface Post {
  postId: string;
  clubId: string;
  clubName: string;
  department: 'CS';
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  body: string;
  externalUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: PostAttachmentType;
  isPinned: boolean;
  status: ContentStatus;
  removedReason: string;
  moderatedBy: string;
  upvoteCount: number;
  downvoteCount: number;
  voteScore: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Comment {
  commentId: string;
  postId: string;
  clubId: string;
  parentCommentId: string;
  department: 'CS';
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  status: ContentStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PostVote {
  voteId: string;
  postId: string;
  clubId: string;
  userId: string;
  value: 1 | -1;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PostBookmark {
  bookmarkId: string;
  postId: string;
  clubId: string;
  postTitle: string;
  userId: string;
  createdAt: Timestamp | null;
}

// Module 5 — Official Department Announcements
export type AnnouncementCategory =
  | 'Academic'
  | 'Examination'
  | 'Club Notice'
  | 'Placement & Career'
  | 'General';

export type AnnouncementStatus = 'published' | 'archived';

export interface Announcement {
  announcementId: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  externalUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  isPinned: boolean;
  status: AnnouncementStatus;
  department: 'CS';
  authorId: string;
  authorName: string;
  authorTitle: AssignedAdminTitle;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// Module 6 — Department Event Calendar
export type EventCategory =
  | 'Seminar'
  | 'Workshop'
  | 'Hackathon'
  | 'Club Meetup'
  | 'Academic Deadline'
  | 'Department Townhall';

export type EventStatus = 'scheduled' | 'cancelled' | 'archived';

export interface DepartmentEvent {
  eventId: string;
  title: string;
  description: string;
  category: EventCategory;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  venue: string;
  registrationUrl: string;
  clubId: string;
  status: EventStatus;
  department: 'CS';
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// Modules 7 & 8 — Notifications, Reports, Activity Logs
export type NotificationType =
  | 'club_request'
  | 'announcement'
  | 'event'
  | 'club_activity'
  | 'moderation'
  | 'post_comment'
  | 'comment_reply';

export type NotificationTargetSection =
  | 'clubs'
  | 'discussions'
  | 'announcements'
  | 'calendar'
  | 'moderator'
  | 'admin'
  | 'overview';

export interface AppNotification {
  notificationId: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  title: string;
  message: string;
  targetSection: NotificationTargetSection;
  targetId: string;
  isRead: boolean;
  createdAt: Timestamp | null;
  readAt: Timestamp | null;
}

export type ReportReason =
  | 'Spam or Self-Promotion'
  | 'Harassment or Disrespect'
  | 'Off-Topic for Club'
  | 'Academic Integrity Violation'
  | 'Misinformation or Unsafe Link';

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ContentReport {
  reportId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string;
  clubId: string;
  department: 'CS';
  targetExcerpt: string;
  reason: ReportReason;
  details: string;
  reportedBy: string;
  reporterName: string;
  status: ReportStatus;
  resolutionNote: string;
  resolvedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ActivityEntityType =
  | 'club'
  | 'clubRequest'
  | 'post'
  | 'comment'
  | 'announcement'
  | 'event'
  | 'report'
  | 'role';

export interface ActivityLog {
  logId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  summary: string;
  department: 'CS';
  createdAt: Timestamp | null;
}

export type NavSection =
  | 'overview'
  | 'profile'
  | 'directory'
  | 'clubs'
  | 'discussions'
  | 'announcements'
  | 'calendar'
  | 'notifications'
  | 'moderator'
  | 'admin';

export interface DepartmentModuleInfo {
  id: string;
  index: string;
  name: string;
  status: 'active' | 'next' | 'planned';
  summary: string;
}

export interface DepartmentConfig {
  departmentCode: string;
  departmentName: string;
  platformName: string;
  academicYear: string;
  semesters: SemesterOption[];
  tracks: CSTrack[];
  adminTitles: AssignedAdminTitle[];
  modules: DepartmentModuleInfo[];
}

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
