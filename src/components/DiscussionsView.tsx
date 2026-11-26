import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { formatRelativeTime } from '../lib/validation.ts';
import {
  castVote,
  createPost,
  subscribeToPosts,
  subscribeToUserBookmarks,
  subscribeToUserVotes,
  toggleBookmark,
} from '../services/discussionService.ts';
import type {
  Club,
  ClubMembership,
  Post,
  PostAttachmentType,
  PostBookmark,
} from '../types/campus.ts';
import { PostDetailView } from './PostDetailView.tsx';

interface DiscussionsViewProps {
  clubs: Club[];
  memberships: ClubMembership[];
  initialClubId: string | null;
  initialPostId: string | null;
  onClearInitialSelection: () => void;
  onOpenClub: (clubId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

type SortMode = 'latest' | 'popular' | 'relevant';
type FeedScope = 'all' | 'bookmarks' | string;

export function DiscussionsView({
  clubs,
  memberships,
  initialClubId,
  initialPostId,
  onClearInitialSelection,
  onOpenClub,
  onNotify,
}: DiscussionsViewProps) {
  const { profile, isAdmin, moderatorRecord } = useAuth();

  const [feedScope, setFeedScope] = useState<FeedScope>(initialClubId ?? 'all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');

  const [posts, setPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, 1 | -1>>({});
  const [bookmarks, setBookmarks] = useState<PostBookmark[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialPostId);

  // New Post Composer state
  const [showComposer, setShowComposer] = useState(false);
  const [composerClubId, setComposerClubId] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postExternalUrl, setPostExternalUrl] = useState('');
  const [postAttachmentType, setPostAttachmentType] = useState<PostAttachmentType>('none');
  const [postAttachmentUrl, setPostAttachmentUrl] = useState('');
  const [postAttachmentName, setPostAttachmentName] = useState('');
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  useEffect(() => {
    if (initialClubId) {
      setFeedScope(initialClubId);
      setSelectedPostId(null);
      onClearInitialSelection();
    } else if (initialPostId) {
      setSelectedPostId(initialPostId);
      onClearInitialSelection();
    }
  }, [initialClubId, initialPostId, onClearInitialSelection]);

  const activeClubs = useMemo(() => clubs.filter((c) => c.status === 'active'), [clubs]);
  const joinedClubIds = useMemo(
    () => new Set(memberships.map((m) => m.clubId)),
    [memberships]
  );
  const assignedModClubs = useMemo(
    () => new Set(moderatorRecord?.assignedClubIds ?? []),
    [moderatorRecord]
  );
  const bookmarkedPostIds = useMemo(
    () => new Set(bookmarks.map((b) => b.postId)),
    [bookmarks]
  );

  const postableClubs = useMemo(() => {
    if (isAdmin) return activeClubs;
    return activeClubs.filter(
      (c) => joinedClubIds.has(c.clubId) || assignedModClubs.has(c.clubId)
    );
  }, [activeClubs, isAdmin, joinedClubIds, assignedModClubs]);

  // Subscribe to posts (either specific club or all CS clubs)
  useEffect(() => {
    setIsPostsLoading(true);
    const clubFilter = feedScope !== 'all' && feedScope !== 'bookmarks' ? feedScope : null;
    const unsub = subscribeToPosts(
      clubFilter,
      (list) => {
        setPosts(list);
        setIsPostsLoading(false);
      },
      (err) => {
        setIsPostsLoading(false);
        onNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [feedScope, onNotify]);

  // Subscribe to current user's votes and bookmarks
  useEffect(() => {
    if (!profile) return;
    const unsubVotes = subscribeToUserVotes(profile.uid, setUserVotes, (err) =>
      onNotify('error', err.message)
    );
    const unsubBookmarks = subscribeToUserBookmarks(profile.uid, setBookmarks, (err) =>
      onNotify('error', err.message)
    );
    return () => {
      unsubVotes();
      unsubBookmarks();
    };
  }, [profile, onNotify]);

  const canModerateClub = (clubId: string) => isAdmin || assignedModClubs.has(clubId);
  const canParticipateInClub = (clubId: string) =>
    isAdmin || joinedClubIds.has(clubId) || assignedModClubs.has(clubId);

  const visiblePosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = posts.filter((p) => {
      if (p.status === 'removed' && !canModerateClub(p.clubId) && p.authorId !== profile?.uid) {
        return false;
      }
      if (feedScope === 'bookmarks' && !bookmarkedPostIds.has(p.postId)) {
        return false;
      }
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q) ||
        p.clubName.toLowerCase().includes(q)
      );
    });

    const nowMs = Date.now();
    return [...filtered].sort((a, b) => {
      // Keep pinned posts on top inside individual club feeds
      if (feedScope !== 'all' && feedScope !== 'bookmarks' && a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      const aTime = a.createdAt?.toMillis() ?? nowMs;
      const bTime = b.createdAt?.toMillis() ?? nowMs;
      if (sortMode === 'popular') {
        if (b.voteScore !== a.voteScore) return b.voteScore - a.voteScore;
        return b.commentCount - a.commentCount;
      }
      if (sortMode === 'relevant') {
        const aAgeHrs = Math.max(1, (nowMs - aTime) / 3_600_000);
        const bAgeHrs = Math.max(1, (nowMs - bTime) / 3_600_000);
        const aRank = (a.voteScore * 2 + a.commentCount * 1.5 + 1) / Math.pow(aAgeHrs + 2, 0.7);
        const bRank = (b.voteScore * 2 + b.commentCount * 1.5 + 1) / Math.pow(bAgeHrs + 2, 0.7);
        return bRank - aRank;
      }
      return bTime - aTime;
    });
  }, [posts, feedScope, bookmarkedPostIds, searchQuery, sortMode, profile, isAdmin, assignedModClubs]);

  const selectedPost = useMemo(
    () => posts.find((p) => p.postId === selectedPostId) ?? null,
    [posts, selectedPostId]
  );

  const openComposer = () => {
    if (postableClubs.length === 0) {
      onNotify('info', 'Join an active CS club first to create discussions.');
      return;
    }
    const defaultClub =
      feedScope !== 'all' &&
      feedScope !== 'bookmarks' &&
      postableClubs.some((c) => c.clubId === feedScope)
        ? feedScope
        : postableClubs[0].clubId;
    setComposerClubId(defaultClub);
    setPostTitle('');
    setPostBody('');
    setPostExternalUrl('');
    setPostAttachmentType('none');
    setPostAttachmentUrl('');
    setPostAttachmentName('');
    setShowComposer(true);
  };

  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const club = activeClubs.find((c) => c.clubId === composerClubId);
    if (!club) {
      onNotify('error', 'Select an active club to post in.');
      return;
    }
    setIsCreatingPost(true);
    try {
      const createdId = await createPost(profile, club, {
        title: postTitle,
        body: postBody,
        externalUrl: postExternalUrl,
        attachmentUrl: postAttachmentUrl,
        attachmentName: postAttachmentName,
        attachmentType: postAttachmentType,
      });
      setShowComposer(false);
      setSelectedPostId(createdId);
      onNotify('success', `Published discussion in ${club.name}.`);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to publish post.');
    } finally {
      setIsCreatingPost(false);
    }
  };

  if (selectedPost) {
    return (
      <PostDetailView
        post={selectedPost}
        userVote={userVotes[selectedPost.postId] ?? 0}
        isBookmarked={bookmarkedPostIds.has(selectedPost.postId)}
        canParticipate={canParticipateInClub(selectedPost.clubId)}
        canModerateClub={canModerateClub(selectedPost.clubId)}
        onBack={() => setSelectedPostId(null)}
        onJoinClubPrompt={onOpenClub}
        onNotify={onNotify}
      />
    );
  }

  const currentClub =
    feedScope !== 'all' && feedScope !== 'bookmarks'
      ? clubs.find((c) => c.clubId === feedScope) ?? null
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#157347] dark:text-emerald-400">
            {currentClub
              ? `${currentClub.category} · ${currentClub.memberCount} members`
              : feedScope === 'bookmarks'
                ? 'Saved Threads'
                : 'Computer Science Club Feeds'}
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {currentClub
              ? currentClub.name
              : feedScope === 'bookmarks'
                ? 'Bookmarked Discussions'
                : 'Club Discussion Feeds'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {currentClub
              ? currentClub.description
              : 'Browse real-time technical discussions across Computer Science clubs.'}
          </p>
        </div>

        <button
          type="button"
          onClick={openComposer}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-btn px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New Discussion</span>
        </button>
      </div>

      {/* Club Scope Selector + Sort + Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select club feed"
            value={feedScope}
            onChange={(e) => setFeedScope(e.target.value)}
            className="rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
          >
            <option value="all">All CS Club Feeds</option>
            <option value="bookmarks">Bookmarked ({bookmarks.length})</option>
            {activeClubs.map((club) => (
              <option key={club.clubId} value={club.clubId}>
                {club.name}
                {joinedClubIds.has(club.clubId) ? ' (Joined)' : ''}
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Sort discussions"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-1"
          >
            {(
              [
                { id: 'latest', label: 'Latest' },
                { id: 'popular', label: 'Popular' },
                { id: 'relevant', label: 'Relevant' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  sortMode === opt.id
                    ? 'bg-[#0F4C2E] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts, topics, authors…"
            className="block w-full rounded-full border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] py-2 pl-10 pr-4 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
          />
        </div>
      </div>

      {/* Membership callout when viewing a specific club the student hasn't joined */}
      {currentClub && !canParticipateInClub(currentClub.clubId) && (
        <div className="flex flex-col gap-3 rounded-[20px] border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Only members of <span className="font-semibold">{currentClub.name}</span> can publish
            new threads or comments in this feed.
          </p>
          <button
            type="button"
            onClick={() => onOpenClub(currentClub.clubId)}
            className="rounded-full bg-emerald-btn px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 cursor-pointer whitespace-nowrap shrink-0"
          >
            Open Club &amp; Join
          </button>
        </div>
      )}

      {/* Feed List */}
      {isPostsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-3"
            >
              <div className="h-3.5 w-48 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
            </div>
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] px-6 py-16 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <MessageSquare className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {feedScope === 'bookmarks'
              ? 'No bookmarked posts yet'
              : searchQuery
                ? 'No discussions match your search'
                : 'No discussions in this feed yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {feedScope === 'bookmarks'
              ? 'Use the Bookmark action on any post to save technical resources here.'
              : postableClubs.length > 0
                ? 'Start the first technical thread for your club.'
                : 'Join a Computer Science club to start posting and replying.'}
          </p>
          {feedScope !== 'bookmarks' && postableClubs.length > 0 && (
            <button
              type="button"
              onClick={openComposer}
              className="mt-4 rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
            >
              Start First Discussion
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {visiblePosts.map((post) => {
            const voteVal = userVotes[post.postId] ?? 0;
            const isSaved = bookmarkedPostIds.has(post.postId);

            return (
              <article
                key={post.postId}
                className="flex gap-3 sm:gap-4 rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-4 sm:p-5 hover:border-emerald-300/80 dark:hover:border-emerald-800/70 transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              >
                {/* Vote Controls */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={post.status !== 'active'}
                    onClick={() => profile && void castVote(profile.uid, post, 1)}
                    aria-label={`Upvote ${post.title}`}
                    className={`rounded-lg p-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                      voteVal === 1
                        ? 'bg-emerald-50 text-[#157347] dark:bg-emerald-950/60 dark:text-emerald-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {post.voteScore}
                  </span>
                  <button
                    type="button"
                    disabled={post.status !== 'active'}
                    onClick={() => profile && void castVote(profile.uid, post, -1)}
                    aria-label={`Downvote ${post.title}`}
                    className={`rounded-lg p-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                      voteVal === -1
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Post Summary */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => setFeedScope(post.clubId)}
                      className="font-semibold text-[#157347] dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      {post.clubName}
                    </button>
                    <span aria-hidden="true">·</span>
                    <span>{post.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelativeTime(post.createdAt?.toDate() ?? null)}</span>
                    {post.isPinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                          <Pin className="h-3 w-3" aria-hidden="true" />
                          Pinned
                        </span>
                      </>
                    )}
                    {post.status === 'removed' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          Removed by Moderator
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPostId(post.postId)}
                    className="mt-1 block text-left font-display text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-[#157347] dark:hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    {post.title}
                  </button>

                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {post.body}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => setSelectedPostId(post.postId)}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer tabular-nums"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{post.commentCount} comments</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => profile && void toggleBookmark(profile.uid, post, isSaved)}
                      className={`inline-flex items-center gap-1 font-semibold cursor-pointer ${
                        isSaved
                          ? 'text-[#157347] dark:text-emerald-400'
                          : 'hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isSaved ? 'Saved' : 'Save'}</span>
                    </button>

                    {post.externalUrl && (
                      <a
                        href={post.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#157347] dark:text-emerald-400 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Link</span>
                      </a>
                    )}

                    {post.attachmentUrl && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{post.attachmentType === 'image' ? 'Image' : 'Document'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* New Post Composer Modal */}
      {showComposer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="composer-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            aria-hidden="true"
            onClick={() => !isCreatingPost && setShowComposer(false)}
          />
          <form
            onSubmit={handleCreatePost}
            className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[24px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-emerald-950/60 pb-3">
              <h2
                id="composer-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Create Club Discussion
              </h2>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label htmlFor="postClub" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Target Club
              </label>
              <select
                id="postClub"
                required
                value={composerClubId}
                onChange={(e) => setComposerClubId(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              >
                {postableClubs.map((c) => (
                  <option key={c.clubId} value={c.clubId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="postTitle" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Title
              </label>
              <input
                id="postTitle"
                type="text"
                required
                minLength={4}
                maxLength={180}
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="Ask a question, share a project, or start a technical thread"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div>
              <label htmlFor="postBody" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Body
              </label>
              <textarea
                id="postBody"
                required
                minLength={1}
                maxLength={8000}
                rows={5}
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Include code notes, architecture details, or discussion prompts…"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="postExt" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  External Link (Optional https://)
                </label>
                <input
                  id="postExt"
                  type="url"
                  maxLength={512}
                  value={postExternalUrl}
                  onChange={(e) => setPostExternalUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="postAttType" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Attachment (Optional)
                </label>
                <select
                  id="postAttType"
                  value={postAttachmentType}
                  onChange={(e) => setPostAttachmentType(e.target.value as PostAttachmentType)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="image">Image Link (https://)</option>
                  <option value="document">Document Link (https://)</option>
                </select>
              </div>
            </div>

            {postAttachmentType !== 'none' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="url"
                  required
                  maxLength={512}
                  value={postAttachmentUrl}
                  onChange={(e) => setPostAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                  className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  maxLength={120}
                  value={postAttachmentName}
                  onChange={(e) => setPostAttachmentName(e.target.value)}
                  placeholder="Label (e.g., Architecture Diagram)"
                  className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingPost}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer"
              >
                {isCreatingPost ? 'Publishing…' : 'Publish Discussion'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
