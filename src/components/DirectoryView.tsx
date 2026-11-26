import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MemberProfile, UserRole } from '../types/campus.ts';

interface DirectoryViewProps {
  members: MemberProfile[];
  isLoading: boolean;
}

type RoleFilter = 'all' | UserRole;

export function DirectoryView({ members, isLoading }: DirectoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.track.toLowerCase().includes(q) ||
        m.semester.toLowerCase().includes(q) ||
        m.bio.toLowerCase().includes(q)
      );
    });
  }, [members, searchQuery, roleFilter]);

  const roleLabel = (m: MemberProfile) => {
    if (m.role === 'admin') return `Admin · ${m.adminTitle}`;
    if (m.role === 'moderator') return 'Moderator';
    return 'Student';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
          CS Member Directory
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Live directory synchronized from Cloud Firestore. Private email addresses and student IDs
          are strictly excluded from public views.
        </p>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, track, or semester…"
            className="block w-full rounded-full border border-slate-200/90 dark:border-emerald-950/60 bg-white dark:bg-[#101814] py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>

        {/* Interactive Segmented Filter Control */}
        <div
          role="group"
          aria-label="Filter members by role"
          className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-[#101814] p-1 border border-slate-200/80 dark:border-emerald-950/60 self-start"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'admin', label: 'Admins' },
              { id: 'moderator', label: 'Moderators' },
              { id: 'student', label: 'Students' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                roleFilter === tab.id
                  ? 'bg-[#0F4C2E] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Table */}
      <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        {isLoading ? (
          <div className="divide-y divide-slate-100 dark:divide-emerald-950/60">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between px-6 py-4">
                <div className="space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
                  <div className="h-3 w-56 animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
              </div>
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              No matching members found
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {searchQuery || roleFilter !== 'all'
                ? 'Try clearing your search query or switching the role filter.'
                : 'Verified Computer Science members who opt into the directory appear here.'}
            </p>
            {(searchQuery || roleFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                }}
                className="mt-4 rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E]/70 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="px-6 py-3.5 font-semibold">Member</th>
                  <th className="px-6 py-3.5 font-semibold">Standing &amp; Track</th>
                  <th className="px-6 py-3.5 font-semibold">Role</th>
                  <th className="px-6 py-3.5 font-semibold">Bio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-950/60 text-sm">
                {filteredMembers.map((member) => (
                  <tr
                    key={member.uid}
                    className="hover:bg-slate-50/70 dark:hover:bg-emerald-950/25 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {member.photoURL ? (
                          <img
                            src={member.photoURL}
                            alt={member.displayName}
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-emerald-900/60 shrink-0"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-xs font-bold text-[#0F4C2E] dark:text-emerald-300">
                            {member.displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {member.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <span>{member.semester}</span>
                      <span className="mx-1.5 text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span>{member.track}</span>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          member.role === 'admin'
                            ? 'text-[#157347] dark:text-emerald-400'
                            : member.role === 'moderator'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {roleLabel(member)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {member.bio || 'No academic bio added yet.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
