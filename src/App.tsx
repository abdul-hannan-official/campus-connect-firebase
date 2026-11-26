import { useEffect, useState } from 'react';
import { AuthPortal } from './components/AuthPortal.tsx';
import { DashboardShell } from './components/DashboardShell.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import type { DepartmentConfig } from './types/campus.ts';

function CampusConnectContent() {
  const { firebaseUser, isAuthReady, isProvisioning } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [departmentConfig, setDepartmentConfig] = useState<DepartmentConfig | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    let active = true;
    fetch('/api/department/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DepartmentConfig | null) => {
        if (active && data) {
          setDepartmentConfig(data);
        }
      })
      .catch(() => {
        // Fallback metadata is handled gracefully in child views
      });

    return () => {
      active = false;
    };
  }, []);

  const handleToggleTheme = () => setIsDark((prev) => !prev);

  if (!isAuthReady || isProvisioning) {
    return (
      <div className="min-h-screen bg-[#F4F6F5] dark:bg-[#090F0C] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-7 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#157347] text-white font-display text-sm font-bold">
              C
            </span>
            <p className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Campus<span className="text-[#157347] dark:text-emerald-400">Connect</span>
            </p>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {isProvisioning
              ? 'Synchronizing verified department account…'
              : 'Verifying authentication session…'}
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-emerald-950/60">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#157347]" />
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthPortal isDark={isDark} onToggleTheme={handleToggleTheme} />;
  }

  return (
    <DashboardShell
      isDark={isDark}
      onToggleTheme={handleToggleTheme}
      departmentConfig={departmentConfig}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CampusConnectContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
