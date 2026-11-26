# Campus Connect — Computer Science Department Community Platform

Campus Connect is a full-stack community platform built exclusively for the **Department of Computer Science**. It combines a Reddit-style club discussion system with official department announcements, an academic & club event calendar, in-app notifications, and database-enforced Role-Based Access Control (RBAC).

---

## Core Modules

1. **Authentication & Academic Profiles (Module 1)**
   - Email/Password and Google Sign-In via Firebase Authentication.
   - PII isolation: private email and university Student ID live in `/users/{uid}`; public CS directory data lives in `/profiles/{uid}`.
   - Role hierarchy: **Admin** (`Head CR`, `Head GR`, `HOD`), **Moderator** (assigned clubs only), and **Student**.
2. **Club Management (Module 2)**
   - Active/archived club directory with search, category filters, logos, member counts, and club detail pages.
   - Atomic join/leave transactions using deterministic composite IDs (`{clubId}__{uid}`) to prevent duplicate memberships.
   - Student club creation proposals (`pending`, `approved`, `rejected`) and Admin review, club CRUD, archiving, and moderator assignments.
3. **Club Discussion Feeds (Module 3)**
   - Independent real-time discussion feeds per club plus a department-wide feed and saved bookmarks view.
   - Sort by **Latest**, **Popular** (vote score), or **Relevant** (time-decayed engagement), plus instant keyword search.
   - Member-only posting enforced directly in Firestore security rules.
4. **Posts, Comments & Nested Replies (Module 4)**
   - Create, edit, and delete own posts with optional HTTPS external links and image/document attachments.
   - Unlimited nested comment replies, edit/delete own comments, atomic upvote/downvote with duplicate-vote prevention, bookmarks, content reporting, and moderator pinning/removal.
5. **Official Department Announcements (Module 5)**
   - Admin-only publishing, editing, pinning, archiving, and deleting with external HTTPS links and document attachments.
   - Clear pinned official notice distinction and full-detail expansion for students.
6. **Department Event Calendar (Module 6)**
   - Interactive monthly calendar grid + Upcoming / Past / Archived views with search and category filtering.
   - Admin event scheduling, editing, cancellation, archiving, and deletion with optional club linkage and RSVP URLs.
7. **In-App Notifications & UI/UX (Module 7)**
   - Real-time Firestore inbox for club request decisions, official announcements, upcoming events, thread replies, and moderation updates.
   - Unread counter badges, mark-as-read / mark-all-read, accessible confirmation dialogs, toast feedback, and light/dark theme support.
8. **Security, Audit Logs & Testing (Module 8)**
   - Hardened `firestore.rules` covering all 16 collections with `email_verified` checks, strict field whitelists, full array validation, and immutable `/activityLogs`.
   - Server-side RS256 Firebase ID token verification middleware (`GET /api/auth/session`).

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Vite
- **Backend**: Node.js + Express (`server.ts`)
- **Database & Auth**: Firebase Authentication (Google Provider) + Cloud Firestore (Named Database)

---

## Firebase Configuration

Campus Connect connects to the configured Firebase project and **named Firestore database** defined in `firebase-applet-config.json`:

- `projectId`: Your Firebase project ID
- `firestoreDatabaseId`: Named Firestore database ID (passed to `getFirestore(app, firebaseConfig.firestoreDatabaseId)`)

> **Security Note**: Firebase client config (`apiKey`, `authDomain`, `projectId`) is a public client identifier required by the Firebase Web SDK. Never commit Admin SDK private service-account keys or `.env` files (`.env*` is ignored in `.gitignore`).

### Required Firebase Console Setup (Manual Steps)

1. **Authorized Domains**: In Firebase Console → Authentication → Settings → Authorized domains, add your production domain(s) (e.g., `localhost`, your Cloud Run / Render / Railway / custom domain).
2. **Sign-In Providers**: In Firebase Console → Authentication → Sign-in method, ensure both **Google** and **Email/Password** are enabled.
3. **Department Admin Accounts (`HOD`, `Head CR`, `Head GR`)**:
   - Pre-authorized in `src/lib/validation.ts` (`DEPARTMENT_ADMIN_ACCOUNTS`) and `firestore.rules` (`isBootstrapAdmin()` / `bootstrapAdminTitle()`):
     - `hodcs@uos.edu.pk` (`HOD`)
     - `csheadcr@uos.edu.pk` (`Head CR`)
     - `csheadgr@uos.edu.pk` (`Head GR`)
   - Once **Email/Password** is enabled in Firebase Console, seed all three accounts into Firebase Auth & Cloud Firestore in one command:
     ```bash
     ADMIN_SEED_PASSWORD="Admin@1122" npm run seed:admins
     ```
   - Alternatively, create them in Firebase Console → Authentication → Users (or register them on the login page); their exact Admin records (`HOD`, `Head CR`, `Head GR`) are provisioned automatically on first sign-in.
4. **Firestore Security Rules**: Deploy `firestore.rules` to your named database:
   ```bash
   firebase deploy --only firestore:rules
   ```
5. **Firestore Composite Indexes**: Deploy `firestore.indexes.json` when using indexed compound queries at scale:
   ```bash
   firebase deploy --only firestore:indexes
   ```

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Start full-stack dev server (Express + Vite on http://localhost:3000)
npm run dev
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Express + Vite middleware on port `3000` |
| `npm run build` | Builds production frontend bundle into `dist/` |
| `npm start` | Runs `server.ts` in production mode serving `dist/` |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm test` | Runs automated validation, rules-invariant, token-verifier & API tests |
| `npm run seed:admins` | Seeds `hodcs@uos.edu.pk`, `csheadcr@uos.edu.pk`, and `csheadgr@uos.edu.pk` using `ADMIN_SEED_PASSWORD` |
| `npx eslint firestore.rules` | Lints `firestore.rules` using `@firebase/eslint-plugin-security-rules` |

### Running Firestore Emulator Rules Tests (Optional — Requires Java 11+)

```bash
firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
```

---

## Production Deployment

Campus Connect runs a unified Express server (`server.ts`) that serves `/api/*` routes and the compiled Vite SPA from `dist/` when `NODE_ENV=production`.

### Option A — Google Cloud Run / Render / Railway (Recommended Full-Stack Node.js Hosting)

1. Push this repository to GitHub (verify `.env` is NOT staged; `.gitignore` excludes `.env*`).
2. Connect the repository to your hosting provider:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `NODE_ENV=production npx tsx server.ts` (or `npm start` on Node 22.18+ with native TypeScript execution)
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `PORT=3000` (or platform-assigned port; update `server.ts` `PORT` if platform injects custom port)
     - `APP_URL=https://your-production-domain`
3. Add your deployed hostname to **Firebase Console → Authentication → Settings → Authorized domains**.
4. Verify `/api/health` returns `{"ok":true,"service":"campus-connect-api"}` and test Google Sign-In in the browser.

### Option B — Pushing to GitHub

```bash
git status
git add .
git commit -m "Complete Campus Connect Modules 1-8"
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```
