import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  CS_TRACK_OPTIONS,
  SCHEMA_LIMITS,
  SCHEMA_PATTERNS,
  SEMESTER_OPTIONS,
} from '../lib/validation.ts';
import { updateOwnAcademicProfile } from '../services/userService.ts';
import type { CSTrack, SemesterOption } from '../types/campus.ts';

export function ProfileSettingsView() {
  const {
    firebaseUser,
    profile,
    privateAccount,
    verifiedRole,
    verifiedAdminTitle,
    sendPasswordReset,
    signOutUser,
  } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [semester, setSemester] = useState<SemesterOption>('Semester 1');
  const [track, setTrack] = useState<CSTrack>('General CS');
  const [bio, setBio] = useState('');
  const [isDirectoryVisible, setIsDirectoryVisible] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setSemester(profile.semester);
      setTrack(profile.track);
      setBio(profile.bio);
      setIsDirectoryVisible(profile.isDirectoryVisible);
    }
  }, [profile]);

  useEffect(() => {
    if (privateAccount) {
      setStudentId(privateAccount.studentId);
    }
  }, [privateAccount]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;

    setFormError(null);
    setSaveMessage(null);

    const trimmedName = displayName.trim();
    if (
      trimmedName.length < SCHEMA_LIMITS.DISPLAY_NAME_MIN ||
      trimmedName.length > SCHEMA_LIMITS.DISPLAY_NAME_MAX
    ) {
      setFormError(
        `Display name must be between ${SCHEMA_LIMITS.DISPLAY_NAME_MIN} and ${SCHEMA_LIMITS.DISPLAY_NAME_MAX} characters.`
      );
      return;
    }

    const cleanStudentId = studentId.trim().toUpperCase();
    if (
      cleanStudentId.length > SCHEMA_LIMITS.STUDENT_ID_MAX ||
      !SCHEMA_PATTERNS.STUDENT_ID.test(cleanStudentId)
    ) {
      setFormError('Student ID may contain only letters, numbers, and hyphens (max 32 characters).');
      return;
    }

    if (bio.trim().length > SCHEMA_LIMITS.BIO_MAX) {
      setFormError(`Academic bio cannot exceed ${SCHEMA_LIMITS.BIO_MAX} characters.`);
      return;
    }

    setIsSaving(true);
    try {
      await updateOwnAcademicProfile(firebaseUser.uid, {
        displayName: trimmedName,
        studentId: cleanStudentId,
        semester,
        track,
        bio,
        isDirectoryVisible,
      });
      setSaveMessage('Academic profile saved to Cloud Firestore.');
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save profile changes right now.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!privateAccount?.email) return;
    setIsResettingPassword(true);
    setSecurityNotice(null);
    try {
      await sendPasswordReset(privateAccount.email);
      setSecurityNotice(`Password reset email requested for ${privateAccount.email}.`);
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (!profile || !privateAccount) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814]"
          />
        ))}
      </div>
    );
  }

  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const roleLabel =
    verifiedRole === 'admin'
      ? `Department Admin (${verifiedAdminTitle})`
      : verifiedRole === 'moderator'
        ? 'Club Moderator'
        : 'CS Student';

  const memberSince = profile.createdAt?.toDate()
    ? profile.createdAt.toDate().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Verified';

  const isPasswordAccount = firebaseUser?.providerData.some((p) => p.providerId === 'password');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your academic profile, directory visibility, and account security.
        </p>
      </div>

      {/* 3-Card Bento Settings Layout (Inspired by Screenshot 3) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* Card 1: Profile Identity */}
        <section className="lg:col-span-4 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_3px_rgba(11,59,36,0.04)]">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Profile
          </h2>

          <div className="mt-5 flex items-center gap-3.5">
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="h-14 w-14 rounded-full object-cover border border-slate-200 dark:border-emerald-900/70 shrink-0"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-100/90 dark:bg-emerald-900/70 font-display text-lg font-bold text-amber-900 dark:text-emerald-200">
                {initials || 'CS'}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
                {profile.displayName}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {privateAccount.email}
              </p>
            </div>
          </div>

          <dl className="mt-6 divide-y divide-slate-100 dark:divide-emerald-950/60 text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                {roleLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">Department</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                Computer Science
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">Standing</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                {profile.semester}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500 dark:text-slate-400">Member since</dt>
              <dd className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {memberSince}
              </dd>
            </div>
          </dl>

          <p className="mt-5 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            Institutional email and student ID are stored in your private account record and never
            exposed to peers.
          </p>
        </section>

        {/* Card 2: Academic Profile & Visibility Controls */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_3px_rgba(11,59,36,0.04)] space-y-4"
        >
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Academic details &amp; privacy
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Update how your CS profile appears in clubs and discussions.
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {saveMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{saveMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="displayName"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Full name
              </label>
              <input
                id="displayName"
                type="text"
                required
                minLength={SCHEMA_LIMITS.DISPLAY_NAME_MIN}
                maxLength={SCHEMA_LIMITS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/15"
              />
            </div>

            <div>
              <label
                htmlFor="studentId"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Student / Faculty ID
              </label>
              <input
                id="studentId"
                type="text"
                maxLength={SCHEMA_LIMITS.STUDENT_ID_MAX}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="UOS-CS-2026-042"
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-3.5 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/15"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="semester"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Semester / Standing
              </label>
              <select
                id="semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value as SemesterOption)}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              >
                {SEMESTER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="track"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                CS specialization
              </label>
              <select
                id="track"
                value={track}
                onChange={(e) => setTrack(e.target.value as CSTrack)}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              >
                {CS_TRACK_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="bio"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Academic bio
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {bio.length}/{SCHEMA_LIMITS.BIO_MAX}
              </span>
            </div>
            <textarea
              id="bio"
              rows={3}
              maxLength={SCHEMA_LIMITS.BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your CS research areas, languages, or club interests…"
              className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/15"
            />
          </div>

          {/* Crisp Emerald Toggle Switch (Mirrors Screenshot 3) */}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 dark:border-emerald-950/60 pt-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Directory visibility
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Allow CS peers to view your public profile in the directory.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isDirectoryVisible}
              onClick={() => setIsDirectoryVisible((prev) => !prev)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                isDirectoryVisible
                  ? 'bg-[#0F5132] dark:bg-emerald-600'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                  isDirectoryVisible ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_-6px_rgba(15,76,46,0.5)] disabled:opacity-60 cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{isSaving ? 'Saving changes…' : 'Save profile'}</span>
            </button>
          </div>
        </form>

        {/* Card 3: Security (Mirrors Screenshot 3) */}
        <section className="lg:col-span-3 rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_3px_rgba(11,59,36,0.04)] space-y-5">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Security
          </h2>

          <div className="flex items-start gap-3 rounded-2xl bg-[#F5F7F6] dark:bg-[#15211B] p-4">
            <ShieldCheck
              className="h-5 w-5 text-[#157347] dark:text-emerald-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {isPasswordAccount ? 'Password auth active' : 'Google verified'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Firestore RBAC enforces your {verifiedRole} permissions server-side.
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300">Account UID</p>
            <p className="mt-1 font-mono text-[11px] break-all rounded-xl bg-slate-50 dark:bg-[#0B120E] border border-slate-100 dark:border-emerald-950/60 px-3 py-2 text-slate-600 dark:text-slate-400">
              {profile.uid}
            </p>
          </div>

          {securityNotice && (
            <p
              role="status"
              className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200"
            >
              {securityNotice}
            </p>
          )}

          {isPasswordAccount && (
            <button
              type="button"
              onClick={() => void handlePasswordReset()}
              disabled={isResettingPassword}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#142019] px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-emerald-950/50 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <KeyRound className="h-4 w-4 text-[#157347] dark:text-emerald-400" aria-hidden="true" />
              <span>{isResettingPassword ? 'Sending link…' : 'Change password'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void signOutUser()}
            className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign out of this device</span>
          </button>
        </section>
      </div>
    </div>
  );
}
