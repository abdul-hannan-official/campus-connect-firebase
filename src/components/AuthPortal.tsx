import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LogIn,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BrandLogo } from './BrandLogo.tsx';

interface AuthPortalProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function AuthPortal({ isDark, onToggleTheme }: AuthPortalProps) {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    authError,
    authNotice,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sharedComputer, setSharedComputer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, fullName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F5] dark:bg-[#090F0C] text-slate-900 dark:text-slate-100 flex items-center justify-center p-3 sm:p-6 lg:p-8">
      <div className="w-full max-w-[1260px] rounded-[28px] overflow-hidden bg-white dark:bg-[#101814] border border-slate-200/80 dark:border-emerald-950/60 shadow-[0_20px_60px_-24px_rgba(9,44,27,0.18)] grid grid-cols-1 lg:grid-cols-12">
        {/* Left Auth Column */}
        <div className="lg:col-span-6 flex flex-col justify-between px-6 py-7 sm:px-12 sm:py-10 lg:px-14 lg:py-11">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-4">
            <BrandLogo />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#16211B] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-emerald-950/70 transition-colors cursor-pointer shrink-0"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          {/* Center Form Block */}
          <div className="my-8 sm:my-10 w-full max-w-[400px] mx-auto">
            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mode === 'signin' ? 'Welcome back' : 'Create a student account'}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {mode === 'signin'
                ? 'Sign in with your UOS CS credentials or verified Google account.'
                : 'Register for the Department of Computer Science community portal.'}
            </p>

            {authError && (
              <div
                role="alert"
                className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs leading-relaxed text-red-800 dark:text-red-300"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={clearAuthError}
                  className="font-medium underline underline-offset-2 shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {authNotice && (
              <div
                role="status"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{authNotice}</span>
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
              {mode === 'signup' && (
                <div>
                  <label
                    htmlFor="fullName"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ayesha Khan"
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20 transition-colors"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="universityEmail"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  University email
                </label>
                <input
                  id="universityEmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@uos.edu.pk"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="passwordInput"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="passwordInput"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="block w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0B120E] pl-4 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {mode === 'signin' && (
                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                  <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sharedComputer}
                      onChange={(e) => setSharedComputer(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#157347] focus:ring-[#157347] cursor-pointer"
                    />
                    <span>This is a shared computer</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={isSubmitting}
                    className="font-semibold text-[#157347] hover:text-[#0F5132] dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer whitespace-nowrap"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-full bg-emerald-btn px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(15,76,46,0.55)] disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap"
              >
                {mode === 'signin' ? (
                  <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {isSubmitting
                    ? mode === 'signin'
                      ? 'Signing in…'
                      : 'Creating account…'
                    : mode === 'signin'
                      ? 'Sign in'
                      : 'Create account'}
                </span>
              </button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-emerald-950/80" />
              <span className="text-xs text-slate-400">or continue with</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-emerald-950/80" />
            </div>

            {/* Google Sign-In (Preserved Module 1 Auth) */}
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#142019] px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-emerald-950/60 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {mode === 'signin' ? (
                <>
                  New to CampusConnect?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      clearAuthError();
                    }}
                    className="font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
                  >
                    Create a student account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      clearAuthError();
                    }}
                    className="font-semibold text-[#157347] hover:underline dark:text-emerald-400 cursor-pointer"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Quiet Footer */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            UOS Computer Science Department · CampusConnect
          </p>
        </div>

        {/* Right Emerald Showcase Column (Inspired by Screenshot 2) */}
        <div className="lg:col-span-6 relative bg-emerald-hero text-white px-8 py-10 sm:px-12 sm:py-12 flex flex-col justify-between overflow-hidden">
          {/* Subtle Architectural Ribbon Curves */}
          <svg
            aria-hidden="true"
            viewBox="0 0 600 720"
            fill="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
            preserveAspectRatio="none"
          >
            <path
              d="M-80 510C90 390 290 340 660 170"
              stroke="white"
              strokeWidth="90"
              strokeOpacity="0.12"
            />
            <path
              d="M-40 690C180 540 360 490 680 340"
              stroke="white"
              strokeWidth="72"
              strokeOpacity="0.08"
            />
          </svg>

          <div className="relative z-10 max-w-lg">
            <p className="text-xs font-semibold tracking-[0.14em] text-emerald-200/90">
              CS DEPARTMENT PORTAL
            </p>
            <h2
              className="mt-4 font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-[1.12] text-white"
              style={{ textWrap: 'balance' }}
            >
              Every CS club, thread &amp; notice in one place.
            </h2>

            <ul className="mt-8 space-y-5 text-sm leading-relaxed text-emerald-50/90">
              <li className="flex items-start gap-3.5">
                <CheckCircle2
                  className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Join department clubs across AI, Systems, Security, and Software Engineering with
                  dedicated club feeds.
                </span>
              </li>
              <li className="flex items-start gap-3.5">
                <MessageSquare
                  className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Read verified announcements from HOD, Head CR, and Head GR and track seminars on
                  the department calendar.
                </span>
              </li>
              <li className="flex items-start gap-3.5">
                <ShieldCheck
                  className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Database-enforced role access control and strict PII isolation protect student IDs
                  and institutional emails.
                </span>
              </li>
            </ul>
          </div>

          {/* Bottom 2 Architectural Mini Cards */}
          <div className="relative z-10 mt-10 grid grid-cols-1 gap-4 sm:grid-cols-12 items-stretch">
            <div className="sm:col-span-7 rounded-2xl bg-white p-5 text-slate-900 shadow-lg">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-medium text-slate-500 tabular-nums">
                  UOS-CS-2026
                </span>
                <span className="font-semibold text-[#157347]">Verified Portal</span>
              </div>
              <p className="mt-2.5 font-display text-sm font-bold text-slate-900">
                Department Governance Active
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                HOD · Head CR · Head GR · Club Moderators
              </p>
              <div className="mt-3.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-700">
                Real-time Cloud Firestore discussions, notices &amp; event calendar.
              </div>
            </div>

            <div className="sm:col-span-5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 p-5 flex flex-col justify-between">
              <p className="text-xs font-semibold text-emerald-100">Weekly pulse</p>
              <div className="mt-4 flex items-end justify-between gap-2 h-24">
                <span className="w-3.5 h-11 rounded-full bg-emerald-300/80" />
                <span className="w-3.5 h-16 rounded-full bg-emerald-300/90" />
                <span className="w-3.5 h-9 rounded-full bg-emerald-300/75" />
                <span className="w-3.5 h-20 rounded-full bg-white" />
                <span className="w-3.5 h-14 rounded-full bg-hatched-emerald-on-dark" />
                <span className="w-3.5 h-14 rounded-full bg-hatched-emerald-on-dark" />
                <span className="w-3.5 h-14 rounded-full bg-hatched-emerald-on-dark" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
