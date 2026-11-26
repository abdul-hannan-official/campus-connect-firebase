import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  type FirestoreErrorInfo,
} from '../lib/firebase.ts';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  rawMessage: string;
  parsedFirestoreError: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    rawMessage: '',
    parsedFirestoreError: null,
  };

  static getDerivedStateFromError(error: Error): State {
    let parsed: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message) as FirestoreErrorInfo;
      if (candidate && typeof candidate.error === 'string' && 'operationType' in candidate) {
        parsed = candidate;
      }
    } catch {
      parsed = null;
    }

    return {
      hasError: true,
      rawMessage: error.message || 'An unexpected application error occurred.',
      parsedFirestoreError: parsed,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Campus Connect ErrorBoundary caught error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const fsErr = this.state.parsedFirestoreError;
    const isQuotaError =
      (fsErr?.error ?? this.state.rawMessage).includes('Quota exceeded');
    const isDailyReadQuota = (fsErr?.error ?? this.state.rawMessage).includes(
      "Free daily read units per project (free tier database)"
    );
    const isPermissionDenied =
      (fsErr?.error ?? this.state.rawMessage).toLowerCase().includes('permission');

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F5] dark:bg-[#090F0C] p-6">
        <div className="w-full max-w-lg rounded-[24px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isQuotaError
                  ? 'Daily Database Quota Reached'
                  : isPermissionDenied
                    ? 'Database Access Denied'
                    : 'Unable to Load Workspace'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {isQuotaError
                  ? 'Firestore free-tier daily quota has been exceeded. Usage resets automatically tomorrow, or you can inspect plan quotas in Firebase.'
                  : isPermissionDenied
                    ? 'Cloud Firestore security rules blocked this request. Verify your signed-in account and role permissions.'
                    : 'Campus Connect encountered an unexpected error while syncing with Firebase.'}
              </p>

              {fsErr && (
                <div className="mt-4 rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-[#F4F6F5] dark:bg-[#090F0C] px-3.5 py-2.5 text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                  <div>Operation: {fsErr.operationType}</div>
                  {fsErr.path && <div>Path: {fsErr.path}</div>}
                </div>
              )}

              {isDailyReadQuota && (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm font-medium text-[#157347] underline underline-offset-4 hover:text-[#0F4C2E] dark:text-emerald-400"
                >
                  Review database quota in Firebase Console
                </a>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="bg-emerald-btn inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reload Application
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
