import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, googleProvider } from '../lib/firebase.ts';
import { getBootstrapAdminSpec, sanitizeDisplayName } from '../lib/validation.ts';
import {
  ensureUserProvisioned,
  subscribeToAdminRecord,
  subscribeToModeratorRecord,
  subscribeToOwnPrivateAccount,
  subscribeToOwnProfile,
} from '../services/userService.ts';
import type {
  AdminRecord,
  AdminTitle,
  MemberProfile,
  ModeratorRecord,
  UserPrivateAccount,
  UserRole,
} from '../types/campus.ts';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: MemberProfile | null;
  privateAccount: UserPrivateAccount | null;
  adminRecord: AdminRecord | null;
  moderatorRecord: ModeratorRecord | null;
  verifiedRole: UserRole;
  verifiedAdminTitle: AdminTitle;
  isAdmin: boolean;
  isModerator: boolean;
  isAuthReady: boolean;
  isProvisioning: boolean;
  authError: string | null;
  authNotice: string | null;
  fatalError: Error | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in your Firebase Console. Open Firebase Console → Authentication → Sign-in method → enable "Email/Password", then try again (or use Google Sign-In below).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid university email or password. Verify your credentials or create an account.';
    case 'auth/invalid-email':
      return 'Please enter a valid university email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in window was closed before completion. Please try again.';
    case 'auth/popup-blocked':
      return 'Browser blocked the sign-in popup. Allow popups for this site and retry.';
    default:
      return error instanceof Error
        ? error.message
        : 'Unable to complete authentication right now. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [privateAccount, setPrivateAccount] = useState<UserPrivateAccount | null>(null);
  const [adminRecord, setAdminRecord] = useState<AdminRecord | null>(null);
  const [moderatorRecord, setModeratorRecord] = useState<ModeratorRecord | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubAccount: (() => void) | null = null;
    let unsubAdmin: (() => void) | null = null;
    let unsubMod: (() => void) | null = null;
    let cancelled = false;

    const cleanupListeners = () => {
      unsubProfile?.();
      unsubAccount?.();
      unsubAdmin?.();
      unsubMod?.();
      unsubProfile = null;
      unsubAccount = null;
      unsubAdmin = null;
      unsubMod = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      cleanupListeners();
      setFatalError(null);

      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setPrivateAccount(null);
        setAdminRecord(null);
        setModeratorRecord(null);
        setIsProvisioning(false);
        setIsAuthReady(true);
        return;
      }

      setFirebaseUser(user);
      setIsProvisioning(true);

      try {
        await ensureUserProvisioned(user);
        if (cancelled) return;

        const handleSubError = (err: Error) => {
          if (!cancelled) {
            setFatalError(err);
          }
        };

        unsubProfile = subscribeToOwnProfile(user.uid, setProfile, handleSubError);
        unsubAccount = subscribeToOwnPrivateAccount(user.uid, setPrivateAccount, handleSubError);
        unsubAdmin = subscribeToAdminRecord(user.uid, setAdminRecord, handleSubError);
        unsubMod = subscribeToModeratorRecord(user.uid, setModeratorRecord, handleSubError);
      } catch (error) {
        if (!cancelled) {
          setFatalError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        if (!cancelled) {
          setIsProvisioning(false);
          setIsAuthReady(true);
        }
      }
    });

    return () => {
      cancelled = true;
      cleanupListeners();
      unsubAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      setAuthError(mapFirebaseAuthError(error));
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    setAuthNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setAuthError('Please enter both your university email and password.');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (error: unknown) {
      setAuthError(mapFirebaseAuthError(error));
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      setAuthError(null);
      setAuthNotice(null);
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        setAuthError('Please complete all required registration fields.');
        return;
      }
      if (password.length < 6) {
        setAuthError('Password must be at least 6 characters long.');
        return;
      }
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const cleanName = sanitizeDisplayName(displayName);
        await updateProfile(cred.user, { displayName: cleanName });
      } catch (error: unknown) {
        setAuthError(mapFirebaseAuthError(error));
      }
    },
    []
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);
    setAuthNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Enter your university email address first to receive a password reset link.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthNotice(`Password reset instructions sent to ${cleanEmail}.`);
    } catch (error: unknown) {
      setAuthError(mapFirebaseAuthError(error));
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    setAuthNotice(null);
    await signOut(auth);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const bootstrapSpec = getBootstrapAdminSpec(
    firebaseUser?.email,
    Boolean(firebaseUser?.emailVerified)
  );
  const isAdmin = Boolean(adminRecord) || Boolean(bootstrapSpec);
  const isModerator = !isAdmin && Boolean(moderatorRecord);

  const verifiedRole: UserRole = isAdmin
    ? 'admin'
    : isModerator
      ? 'moderator'
      : 'student';

  const verifiedAdminTitle: AdminTitle = isAdmin
    ? adminRecord?.adminTitle ?? bootstrapSpec?.adminTitle ?? 'HOD'
    : 'none';

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      privateAccount,
      adminRecord,
      moderatorRecord,
      verifiedRole,
      verifiedAdminTitle,
      isAdmin,
      isModerator,
      isAuthReady,
      isProvisioning,
      authError,
      authNotice,
      fatalError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOutUser,
      clearAuthError,
    }),
    [
      firebaseUser,
      profile,
      privateAccount,
      adminRecord,
      moderatorRecord,
      verifiedRole,
      verifiedAdminTitle,
      isAdmin,
      isModerator,
      isAuthReady,
      isProvisioning,
      authError,
      authNotice,
      fatalError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOutUser,
      clearAuthError,
    ]
  );

  // Escalate structured Firestore permission/connection errors to the React ErrorBoundary
  if (fatalError) {
    throw fatalError;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
