# Campus Connect — Complete Firestore Security Specification (Modules 1–8)

## 1. Core Security Invariants (All 16 Collections)

1. **Email Verification Invariant**: Every single Firestore read and write operation across all 16 collections requires `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation Invariant**: Email addresses and university student IDs exist exclusively in `/users/{userId}` and are strictly readable only by the owner (`request.auth.uid == userId`) or a verified Admin. `/users` can never be listed (`allow list: if false`).
3. **RBAC Authority Invariant**: Authoritative roles live exclusively in `/admins/{userId}` and `/moderators/{userId}`. Only an existing verified Admin (or the verified bootstrap Admin `apexorasolution@gmail.com`) can write to `/admins` or `/moderators`.
4. **Zero Self-Escalation Invariant**: No non-admin user can create or update `/profiles/{userId}` or `/users/{userId}` with `role != 'student'`, `adminTitle != 'none'`, or non-empty `assignedClubIds`.
5. **Full Array Validation Invariant**: `isValidClubIdList` and `isValidUidList` explicitly validate all 10 allowed array indices (`0..9`), eliminating tail-index injection.
6. **Atomic Membership & Counter Integrity**:
   - Joining a club requires creating `/clubMemberships/{clubId}__{uid}` atomically with incrementing `clubs/{clubId}.memberCount` by exactly `+1` (`!exists` + `existsAfter`).
   - Leaving a club requires deleting `/clubMemberships/{clubId}__{uid}` atomically with decrementing `clubs/{clubId}.memberCount` by exactly `-1` (`exists` + `!existsAfter`).
   - Composite document IDs `{clubId}__{uid}` structurally prevent duplicate memberships.
7. **Member-Only Club Discussions**: Creating a post in `/posts/{postId}` requires the target club to exist with `status == 'active'` and the author to be a club member (`exists(/clubMemberships/{clubId}__{uid})`), an Admin, or an assigned Club Moderator.
8. **Club-Scoped Moderation**: Moderators can pin/unpin posts, remove posts/comments, and resolve/dismiss reports **strictly** for clubs listed in their authoritative `/moderators/{uid}.assignedClubIds` document.
9. **Atomic Vote Integrity**: Casting, switching, or removing a vote on `/votes/{postId}__{uid}` requires an atomic update to `/posts/{postId}` verifying exact delta math on `upvoteCount`, `downvoteCount`, and `voteScore`, plus `getAfter(...).data.updatedAt == request.time` (or `!existsAfter` on removal) to prevent counter replay attacks.
10. **Admin-Only Official Content**: Creating, editing, archiving, pinning, cancelling, or deleting `/announcements` and `/events` is strictly restricted to verified Department Admins (Head CR, Head GR, HOD).
11. **Terminal State Locks**: `/clubRequests` and `/reports` can only transition once from `pending` → `approved`/`rejected` or `open` → `resolved`/`dismissed`.
12. **Private Notifications & Immutable Audit Logs**: `/notifications` are strictly readable/updatable/deletable by `recipientId == request.auth.uid`, and `/activityLogs` are append-only (`allow update: if false; allow delete: if false`).
13. **Schema & Temporal Integrity**: Every collection enforces exact key sets (`hasAll` + `hasOnly`), field length/regex checks (HTTPS-only URLs), server timestamps (`createdAt == request.time`, `updatedAt == request.time`), and `affectedKeys().hasOnly(...)` on every update.
14. **Default-Deny Catch-All**: No wildcard fallback rules exist; any path outside the 16 explicit collections is denied by default.

## 2. Adversarial Test Matrix

| # | Attack Class | Target Path | Adversarial Payload / Action | Expected Result |
|---|---|---|---|---|
| 1 | Self-Assigned Admin on Signup | `/profiles/stu-1` (create) | `{ role: "admin", adminTitle: "HOD", ... }` as student `stu-1` | `PERMISSION_DENIED` |
| 2 | Role Escalation via Profile Update | `/profiles/stu-1` (update) | `{ role: "moderator", assignedClubIds: ["ai-club"] }` as `stu-1` | `PERMISSION_DENIED` |
| 3 | Ghost / Shadow Field Injection | `/profiles/stu-1` (update) | `{ bio: "CS junior", isVerified: true }` as `stu-1` | `PERMISSION_DENIED` |
| 4 | Direct Admin Registry Forgery | `/admins/stu-1` (create) | Create admin doc as non-admin | `PERMISSION_DENIED` |
| 5 | Cross-User PII Read / List | `/users/victim-2` (get/list) | Read or list private email & studentId as `stu-1` | `PERMISSION_DENIED` |
| 6 | Unverified Email Spoof | `/admins/spoof-1` (create) | Token with `email_verified: false` | `PERMISSION_DENIED` |
| 7 | Non-Member Club Post | `/posts/p1` (create) | Student creates post in club without `/clubMemberships/{club}__{uid}` | `PERMISSION_DENIED` |
| 8 | Cross-Club Moderator Abuse | `/posts/p1` (update) | Moderator of `ai-lab` attempts to pin/remove post in `cybersec` | `PERMISSION_DENIED` |
| 9 | Student Announcement Forgery | `/announcements/a1` (create) | Student or Moderator attempts to publish official notice | `PERMISSION_DENIED` |
| 10 | Student Event Forgery | `/events/e1` (create) | Student or Moderator attempts to schedule department event | `PERMISSION_DENIED` |
| 11 | Duplicate Membership Bypass | `/clubs/ai-lab` (update) | Increment `memberCount` without atomic `/clubMemberships` create | `PERMISSION_DENIED` |
| 12 | Vote Counter Replay | `/posts/p1` (update) | Increment `upvoteCount` twice without modifying `/votes/p1__uid` | `PERMISSION_DENIED` |
| 13 | Cross-User Club Request Scraping | `/clubRequests` (list) | Student queries all club requests instead of own `requestedBy == uid` | `PERMISSION_DENIED` |
| 14 | XSS URL Protocol Injection | `/posts/p1` (create) | `externalUrl: "javascript:alert(1)"` | `PERMISSION_DENIED` |
| 15 | Cross-User Notification Read | `/notifications/n1` (get/list) | Read another user's notification inbox | `PERMISSION_DENIED` |
| 16 | Audit Log Tampering | `/activityLogs/l1` (update/delete) | Even Admin attempts to modify or delete audit entry | `PERMISSION_DENIED` |
