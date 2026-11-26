import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  CornerDownRight,
  Edit3,
  ExternalLink,
  FileText,
  Flag,
  MessageSquare,
  Pin,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  formatFullDateTime,
  formatRelativeTime,
  REPORT_REASONS,
} from '../lib/validation.ts';
import {
  castVote,
  createComment,
  deleteOwnComment,
  deleteOwnPost,
  moderatePost,
  removeCommentByModerator,
  submitContentReport,
  subscribeToPostComments,
  toggleBookmark,
  updateOwnComment,
  updateOwnPost,
} from '../services/discussionService.ts';
import type {
  Comment,
  Post,
  PostAttachmentType,
  ReportReason,
} from '../types/campus.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface PostDetailViewProps {
  post: Post;
  userVote: 1 | -1 | 0;
  isBookmarked: boolean;
  canParticipate: boolean;
  canModerateClub: boolean;
  onBack: () => void;
  onJoinClubPrompt: (clubId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function PostDetailView({
  post,
  userVote,
  isBookmarked,
  canParticipate,
  canModerateClub,
  onBack,
  onJoinClubPrompt,
  onNotify,
}: PostDetailViewProps) {
  const { profile } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Edit Post state
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editBody, setEditBody] = useState(post.body);
  const [editExternalUrl, setEditExternalUrl] = useState(post.externalUrl);
  const [editAttachmentUrl, setEditAttachmentUrl] = useState(post.attachmentUrl);
  const [editAttachmentName, setEditAttachmentName] = useState(post.attachmentName);
  const [editAttachmentType, setEditAttachmentType] = useState<PostAttachmentType>(
    post.attachmentType
  );
  const [isSavingPost, setIsSavingPost] = useState(false);

  // Reply / Edit Comment state
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  // Report modal state
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'comment';
    id: string;
    excerpt: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('Spam or Self-Promotion');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Moderator removal reason dialog
  const [showRemovePostModal, setShowRemovePostModal] = useState(false);
  const [removeReason, setRemoveReason] = useState('Violates club discussion guidelines');

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const [imgError, setImgError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditExternalUrl(post.externalUrl);
    setEditAttachmentUrl(post.attachmentUrl);
    setEditAttachmentName(post.attachmentName);
    setEditAttachmentType(post.attachmentType);
  }, [post]);

  useEffect(() => {
    setIsCommentsLoading(true);
    const unsub = subscribeToPostComments(
      post.postId,
      (list) => {
        setComments(list);
        setIsCommentsLoading(false);
      },
      (err) => {
        setIsCommentsLoading(false);
        onNotify('error', err.message);
      }
    );
    return () => unsub();
  }, [post.postId, onNotify]);

  // Build nested reply tree map: parentCommentId -> Comment[]
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      const key = c.parentCommentId || '__root__';
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [comments]);

  const isAuthor = profile?.uid === post.authorId;

  const handleVote = async (dir: 1 | -1) => {
    if (!profile) return;
    try {
      await castVote(profile.uid, post, dir);
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to cast vote.');
    }
  };

  const handleToggleBookmark = async () => {
    if (!profile) return;
    try {
      await toggleBookmark(profile.uid, post, isBookmarked);
      onNotify('info', isBookmarked ? 'Removed bookmark.' : 'Saved post to bookmarks.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update bookmark.');
    }
  };

  const handleSavePostEdit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingPost(true);
    try {
      await updateOwnPost(post.postId, {
        title: editTitle,
        body: editBody,
        externalUrl: editExternalUrl,
        attachmentUrl: editAttachmentUrl,
        attachmentName: editAttachmentName,
        attachmentType: editAttachmentType,
      });
      setIsEditingPost(false);
      onNotify('success', 'Post updated.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update post.');
    } finally {
      setIsSavingPost(false);
    }
  };

  const handleDeleteOwnPost = () => {
    setConfirmAction({
      title: 'Delete this post?',
      description: 'Your post will be removed from the club discussion feed.',
      confirmLabel: 'Delete Post',
      run: async () => {
        setIsBusy(true);
        try {
          await deleteOwnPost(post.postId);
          onNotify('info', 'Post deleted.');
          onBack();
        } catch (error) {
          onNotify('error', error instanceof Error ? error.message : 'Failed to delete post.');
        } finally {
          setIsBusy(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleTogglePin = async () => {
    if (!profile) return;
    try {
      await moderatePost({
        moderator: profile,
        post,
        isPinned: !post.isPinned,
      });
      onNotify('success', post.isPinned ? 'Post unpinned.' : 'Post pinned to top of club feed.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to update pin status.');
    }
  };

  const handleRemoveByModerator = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsBusy(true);
    try {
      await moderatePost({
        moderator: profile,
        post,
        status: 'removed',
        removedReason: removeReason,
      });
      setShowRemovePostModal(false);
      onNotify('info', 'Post removed by moderator.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Moderation action failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestorePost = async () => {
    if (!profile) return;
    try {
      await moderatePost({
        moderator: profile,
        post,
        status: 'active',
        removedReason: '',
      });
      onNotify('success', 'Post restored.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to restore post.');
    }
  };

  const handleAddComment = async (e: FormEvent, parent: Comment | null) => {
    e.preventDefault();
    if (!profile) return;
    const text = parent ? replyBody : newCommentBody;
    if (!text.trim()) return;

    setIsPostingComment(true);
    try {
      await createComment({
        actor: profile,
        post,
        body: text,
        parentComment: parent,
      });
      if (parent) {
        setReplyBody('');
        setReplyingTo(null);
      } else {
        setNewCommentBody('');
      }
      onNotify('success', parent ? 'Reply posted.' : 'Comment added.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Failed to post comment.');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editingCommentBody.trim()) return;
    setIsBusy(true);
    try {
      await updateOwnComment(commentId, editingCommentBody);
      setEditingCommentId(null);
      setEditingCommentBody('');
      onNotify('success', 'Comment updated.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to edit comment.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteComment = (comment: Comment) => {
    setConfirmAction({
      title: 'Delete your comment?',
      description: 'The comment body will be replaced with a deleted placeholder.',
      confirmLabel: 'Delete Comment',
      run: async () => {
        setIsBusy(true);
        try {
          await deleteOwnComment(comment);
          onNotify('info', 'Comment deleted.');
        } catch (error) {
          onNotify('error', error instanceof Error ? error.message : 'Failed to delete comment.');
        } finally {
          setIsBusy(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleModeratorRemoveComment = (comment: Comment) => {
    if (!profile) return;
    setConfirmAction({
      title: 'Remove comment as moderator?',
      description: 'This replaces the comment body with a moderation notice and logs the action.',
      confirmLabel: 'Remove Comment',
      run: async () => {
        setIsBusy(true);
        try {
          await removeCommentByModerator(profile, comment);
          onNotify('info', 'Comment removed by moderator.');
        } catch (error) {
          onNotify('error', error instanceof Error ? error.message : 'Failed to remove comment.');
        } finally {
          setIsBusy(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleSubmitReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !reportTarget) return;
    setIsSubmittingReport(true);
    try {
      await submitContentReport({
        actor: profile,
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        postId: post.postId,
        clubId: post.clubId,
        targetExcerpt: reportTarget.excerpt,
        reason: reportReason,
        details: reportDetails,
      });
      setReportTarget(null);
      setReportDetails('');
      onNotify('success', 'Report submitted to club moderators and department admins.');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'Unable to submit report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const renderCommentNode = (comment: Comment, depth: number) => {
    const replies = childrenByParent.get(comment.commentId) ?? [];
    const isCommentOwner = profile?.uid === comment.authorId;
    const isEditingThis = editingCommentId === comment.commentId;
    const isReplyingThis = replyingTo?.commentId === comment.commentId;

    return (
      <div
        key={comment.commentId}
        className={depth > 0 ? 'mt-3 pl-4 sm:pl-6 border-l border-slate-200 dark:border-slate-800' : 'py-4'}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {comment.authorName}
            </span>
            {comment.authorRole !== 'student' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#157347] dark:text-emerald-400 capitalize">
                  {comment.authorRole}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(comment.createdAt?.toDate() ?? null)}</span>
          </div>

          {isEditingThis ? (
            <div className="space-y-2">
              <textarea
                rows={3}
                maxLength={3000}
                value={editingCommentBody}
                onChange={(e) => setEditingCommentBody(e.target.value)}
                className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSaveCommentEdit(comment.commentId)}
                  className="rounded-full bg-emerald-btn px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCommentId(null)}
                  className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`text-sm leading-relaxed whitespace-pre-wrap ${
                comment.status === 'active'
                  ? 'text-slate-800 dark:text-slate-200'
                  : 'italic text-slate-400 dark:text-slate-500'
              }`}
            >
              {comment.body}
            </p>
          )}

          {comment.status === 'active' && !isEditingThis && (
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
              {canParticipate && post.status === 'active' && depth < 4 && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(isReplyingThis ? null : comment);
                    setReplyBody('');
                  }}
                  className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reply</span>
                </button>
              )}

              {isCommentOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(comment.commentId);
                      setEditingCommentBody(comment.body);
                    }}
                    className="font-medium hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment)}
                    className="font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                </>
              )}

              {canModerateClub && !isCommentOwner && (
                <button
                  type="button"
                  onClick={() => handleModeratorRemoveComment(comment)}
                  className="font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Remove (Mod)
                </button>
              )}

              {!isCommentOwner && (
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      type: 'comment',
                      id: comment.commentId,
                      excerpt: comment.body.slice(0, 200),
                    })
                  }
                  className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Report
                </button>
              )}
            </div>
          )}

          {isReplyingThis && (
            <form
              onSubmit={(e) => void handleAddComment(e, comment)}
              className="mt-3 space-y-2 rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-slate-50/70 dark:bg-[#0B120E] p-3.5"
            >
              <textarea
                rows={2}
                required
                maxLength={3000}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={`Reply to ${comment.authorName}…`}
                className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#101814] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPostingComment || !replyBody.trim()}
                  className="rounded-full bg-emerald-btn px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {isPostingComment ? 'Posting…' : 'Post Reply'}
                </button>
              </div>
            </form>
          )}
        </div>

        {replies.length > 0 && (
          <div className="mt-2">{replies.map((child) => renderCommentNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const rootComments = childrenByParent.get('__root__') ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-[#157347] dark:hover:text-emerald-400 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Discussion Feed</span>
        </button>
      </div>

      {/* Post Article */}
      <article className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex gap-4 sm:gap-6">
          {/* Vote Rail */}
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
            <button
              type="button"
              disabled={post.status !== 'active'}
              onClick={() => void handleVote(1)}
              aria-label="Upvote post"
              className={`rounded-xl p-2 transition-colors cursor-pointer disabled:opacity-40 ${
                userVote === 1
                  ? 'bg-emerald-50 text-[#157347] dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
              }`}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {post.voteScore}
            </span>
            <button
              type="button"
              disabled={post.status !== 'active'}
              onClick={() => void handleVote(-1)}
              aria-label="Downvote post"
              className={`rounded-xl p-2 transition-colors cursor-pointer disabled:opacity-40 ${
                userVote === -1
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
              }`}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>

          {/* Main Post Body */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-[#157347] dark:text-emerald-400">{post.clubName}</span>
              <span aria-hidden="true">·</span>
              <span>Posted by {post.authorName}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {formatFullDateTime(post.createdAt?.toDate() ?? null)}
              </span>
              {post.isPinned && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                    <Pin className="h-3 w-3" aria-hidden="true" />
                    Pinned
                  </span>
                </>
              )}
            </div>

            {post.status === 'removed' && (
              <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>This post was removed by club moderation.</span>
                  </div>
                  {canModerateClub && (
                    <button
                      type="button"
                      onClick={() => void handleRestorePost()}
                      className="text-xs font-medium underline cursor-pointer"
                    >
                      Restore Post
                    </button>
                  )}
                </div>
                {post.removedReason && (
                  <p className="mt-1 text-xs opacity-90">Reason: {post.removedReason}</p>
                )}
              </div>
            )}

            {isEditingPost ? (
              <form onSubmit={handleSavePostEdit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="editTitle" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Title
                  </label>
                  <input
                    id="editTitle"
                    type="text"
                    required
                    minLength={4}
                    maxLength={180}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="editBody" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Content
                  </label>
                  <textarea
                    id="editBody"
                    required
                    rows={6}
                    maxLength={8000}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="editExt" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      External Link (https://)
                    </label>
                    <input
                      id="editExt"
                      type="url"
                      value={editExternalUrl}
                      onChange={(e) => setEditExternalUrl(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="editAttType" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Attachment Type
                    </label>
                    <select
                      id="editAttType"
                      value={editAttachmentType}
                      onChange={(e) => setEditAttachmentType(e.target.value as PostAttachmentType)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-[#157347] focus:outline-none"
                    >
                      <option value="none">No Attachment</option>
                      <option value="image">Image URL (https://)</option>
                      <option value="document">Document URL (https://)</option>
                    </select>
                  </div>
                </div>
                {editAttachmentType !== 'none' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="url"
                      placeholder="https:// attachment URL"
                      value={editAttachmentUrl}
                      onChange={(e) => setEditAttachmentUrl(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Attachment display label"
                      maxLength={120}
                      value={editAttachmentName}
                      onChange={(e) => setEditAttachmentName(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingPost(false)}
                    className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPost}
                    className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 cursor-pointer"
                  >
                    {isSavingPost ? 'Saving…' : 'Save Post'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h1 className="mt-2 font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {post.title}
                </h1>
                <p className="mt-4 text-sm sm:text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {post.body}
                </p>

                {post.externalUrl && (
                  <a
                    href={post.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#157347] dark:text-emerald-400 hover:underline break-all"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{post.externalUrl}</span>
                  </a>
                )}

                {post.attachmentUrl && post.attachmentType === 'image' && !imgError && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-slate-50 dark:bg-[#0B120E]">
                    <img
                      src={post.attachmentUrl}
                      alt={post.attachmentName || post.title}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="max-h-96 w-full object-contain"
                    />
                  </div>
                )}

                {post.attachmentUrl && (post.attachmentType === 'document' || imgError) && (
                  <a
                    href={post.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-slate-50 dark:bg-[#0B120E] px-4 py-3 text-sm hover:bg-slate-100 dark:hover:bg-emerald-950/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 text-[#157347] dark:text-emerald-400 shrink-0" />
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {post.attachmentName || 'Open attached document'}
                      </span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </a>
                )}
              </>
            )}

            {/* Post Footer Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 dark:border-emerald-950/60 pt-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {post.commentCount} comments
              </span>

              <button
                type="button"
                onClick={() => void handleToggleBookmark()}
                className={`inline-flex items-center gap-1.5 font-semibold transition-colors cursor-pointer ${
                  isBookmarked
                    ? 'text-[#157347] dark:text-emerald-400'
                    : 'hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
              </button>

              {isAuthor && post.status === 'active' && !isEditingPost && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditingPost(true)}
                    className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteOwnPost}
                    className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                </>
              )}

              {canModerateClub && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleTogglePin()}
                    className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{post.isPinned ? 'Unpin' : 'Pin Post'}</span>
                  </button>
                  {post.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => setShowRemovePostModal(true)}
                      className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remove (Mod)</span>
                    </button>
                  )}
                </>
              )}

              {!isAuthor && post.status === 'active' && (
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      type: 'post',
                      id: post.postId,
                      excerpt: post.title,
                    })
                  }
                  className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Report</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      {/* Comment Composer */}
      <section className="rounded-[22px] border border-slate-200/75 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Discussion ({comments.length})
        </h2>

        {post.status !== 'active' ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Comments are closed on removed posts.
          </p>
        ) : !canParticipate ? (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Join <span className="font-semibold">{post.clubName}</span> to comment and reply to
              discussions in this club.
            </p>
            <button
              type="button"
              onClick={() => onJoinClubPrompt(post.clubId)}
              className="rounded-full bg-emerald-btn px-4 py-2 text-xs font-semibold text-white hover:brightness-110 cursor-pointer whitespace-nowrap shrink-0"
            >
              View Club &amp; Join
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleAddComment(e, null)} className="mt-4 space-y-3">
            <textarea
              rows={3}
              required
              maxLength={3000}
              value={newCommentBody}
              onChange={(e) => setNewCommentBody(e.target.value)}
              placeholder="Write a constructive technical comment…"
              className="block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#157347] focus:outline-none focus:ring-2 focus:ring-[#157347]/20"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPostingComment || !newCommentBody.trim()}
                className="rounded-full bg-emerald-btn px-5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
              >
                {isPostingComment ? 'Posting…' : 'Post Comment'}
              </button>
            </div>
          </form>
        )}

        {/* Nested Comments Tree */}
        <div className="mt-6 divide-y divide-slate-100 dark:divide-emerald-950/60">
          {isCommentsLoading ? (
            <div className="py-6 space-y-3">
              <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-emerald-950/60" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-emerald-950/40" />
            </div>
          ) : rootComments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No comments yet. Start the conversation above.
            </p>
          ) : (
            rootComments.map((c) => renderCommentNode(c, 0))
          )}
        </div>
      </section>

      {/* Report Modal */}
      {reportTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            aria-hidden="true"
            onClick={() => !isSubmittingReport && setReportTarget(null)}
          />
          <form
            onSubmit={handleSubmitReport}
            className="relative z-10 w-full max-w-md rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2
                id="report-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Report {reportTarget.type === 'post' ? 'Post' : 'Comment'}
              </h2>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label htmlFor="reportReason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Reason
              </label>
              <select
                id="reportReason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as ReportReason)}
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reportDetails" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Additional Context (Optional)
              </label>
              <textarea
                id="reportDetails"
                rows={3}
                maxLength={500}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Provide brief details for the club moderator…"
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReport}
                className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingReport ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Moderator Remove Post Modal */}
      {showRemovePostModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-950/55"
            aria-hidden="true"
            onClick={() => !isBusy && setShowRemovePostModal(false)}
          />
          <form
            onSubmit={handleRemoveByModerator}
            className="relative z-10 w-full max-w-md rounded-[22px] border border-slate-200/80 dark:border-emerald-950/60 bg-white dark:bg-[#101814] p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Remove Post from Club Feed
            </h2>
            <div>
              <label htmlFor="removeReason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Moderation Reason
              </label>
              <input
                id="removeReason"
                type="text"
                required
                maxLength={300}
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-emerald-950/70 bg-white dark:bg-[#0B120E] px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRemovePostModal(false)}
                className="rounded-full border border-slate-200 dark:border-emerald-900/60 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 cursor-pointer"
              >
                {isBusy ? 'Removing…' : 'Remove Post'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          open={true}
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          isBusy={isBusy}
          onConfirm={() => void confirmAction.run()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
