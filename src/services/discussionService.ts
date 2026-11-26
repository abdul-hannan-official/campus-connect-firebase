import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  REPORT_REASONS,
  sanitizeDisplayName,
  SCHEMA_LIMITS,
  validateHttpsUrl,
} from '../lib/validation.ts';
import type {
  Club,
  Comment,
  ContentReport,
  MemberProfile,
  Post,
  PostAttachmentType,
  PostBookmark,
  PostVote,
  ReportReason,
} from '../types/campus.ts';
import { createNotification, logActivity } from './activityService.ts';

function generateId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

export function subscribeToPosts(
  clubId: string | null,
  onData: (posts: Post[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = clubId
    ? query(
        collection(db, 'posts'),
        where('department', '==', 'CS'),
        where('clubId', '==', clubId),
        limit(120)
      )
    : query(collection(db, 'posts'), where('department', '==', 'CS'), limit(150));

  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs
        .map((d) => d.data() as Post)
        .filter((p) => p.status !== 'deleted')
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(posts);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToPostComments(
  postId: string,
  onData: (comments: Comment[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'comments'),
    where('department', '==', 'CS'),
    where('postId', '==', postId),
    limit(250)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as Comment)
        .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'comments');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToUserVotes(
  userId: string,
  onData: (votes: Record<string, 1 | -1>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'votes'), where('userId', '==', userId), limit(300));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, 1 | -1> = {};
      for (const d of snapshot.docs) {
        const v = d.data() as PostVote;
        map[v.postId] = v.value;
      }
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'votes');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToUserBookmarks(
  userId: string,
  onData: (bookmarks: PostBookmark[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'bookmarks'), where('userId', '==', userId), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => d.data() as PostBookmark)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bookmarks');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export interface PostInput {
  title: string;
  body: string;
  externalUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: PostAttachmentType;
}

export async function createPost(
  actor: MemberProfile,
  club: Club,
  input: PostInput
): Promise<string> {
  const title = input.title.trim();
  const body = input.body.trim();
  const extCheck = validateHttpsUrl(input.externalUrl);
  const attCheck = validateHttpsUrl(input.attachmentUrl);

  if (title.length < SCHEMA_LIMITS.POST_TITLE_MIN || title.length > SCHEMA_LIMITS.POST_TITLE_MAX) {
    throw new Error(`Post title must be ${SCHEMA_LIMITS.POST_TITLE_MIN}–${SCHEMA_LIMITS.POST_TITLE_MAX} characters.`);
  }
  if (body.length < SCHEMA_LIMITS.POST_BODY_MIN || body.length > SCHEMA_LIMITS.POST_BODY_MAX) {
    throw new Error(`Post body must be ${SCHEMA_LIMITS.POST_BODY_MIN}–${SCHEMA_LIMITS.POST_BODY_MAX} characters.`);
  }
  if (!extCheck.valid) {
    throw new Error(extCheck.error ?? 'Invalid external link.');
  }
  if (!attCheck.valid) {
    throw new Error(attCheck.error ?? 'Invalid attachment URL.');
  }

  const attachmentType: PostAttachmentType = attCheck.value ? input.attachmentType : 'none';
  const attachmentName = attCheck.value
    ? (input.attachmentName.trim() || 'Attached resource').slice(0, SCHEMA_LIMITS.ATTACHMENT_NAME_MAX)
    : '';

  const postId = generateId('post');
  try {
    await setDoc(doc(db, 'posts', postId), {
      postId,
      clubId: club.clubId,
      clubName: club.name,
      department: 'CS',
      authorId: actor.uid,
      authorName: sanitizeDisplayName(actor.displayName),
      authorRole: actor.role,
      title,
      body,
      externalUrl: extCheck.value,
      attachmentUrl: attCheck.value,
      attachmentName,
      attachmentType,
      isPinned: false,
      status: 'active',
      removedReason: '',
      moderatedBy: '',
      upvoteCount: 0,
      downvoteCount: 0,
      voteScore: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postId}`);
  }

  return postId;
}

export async function updateOwnPost(postId: string, input: PostInput): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  const extCheck = validateHttpsUrl(input.externalUrl);
  const attCheck = validateHttpsUrl(input.attachmentUrl);

  if (title.length < SCHEMA_LIMITS.POST_TITLE_MIN || title.length > SCHEMA_LIMITS.POST_TITLE_MAX) {
    throw new Error(`Post title must be ${SCHEMA_LIMITS.POST_TITLE_MIN}–${SCHEMA_LIMITS.POST_TITLE_MAX} characters.`);
  }
  if (body.length < SCHEMA_LIMITS.POST_BODY_MIN || body.length > SCHEMA_LIMITS.POST_BODY_MAX) {
    throw new Error(`Post body must be ${SCHEMA_LIMITS.POST_BODY_MIN}–${SCHEMA_LIMITS.POST_BODY_MAX} characters.`);
  }
  if (!extCheck.valid) throw new Error(extCheck.error ?? 'Invalid external link.');
  if (!attCheck.valid) throw new Error(attCheck.error ?? 'Invalid attachment URL.');

  const attachmentType: PostAttachmentType = attCheck.value ? input.attachmentType : 'none';
  const attachmentName = attCheck.value
    ? (input.attachmentName.trim() || 'Attached resource').slice(0, SCHEMA_LIMITS.ATTACHMENT_NAME_MAX)
    : '';

  try {
    await updateDoc(doc(db, 'posts', postId), {
      title,
      body,
      externalUrl: extCheck.value,
      attachmentUrl: attCheck.value,
      attachmentName,
      attachmentType,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function deleteOwnPost(postId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'posts', postId), {
      status: 'deleted',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function moderatePost(params: {
  moderator: MemberProfile;
  post: Post;
  isPinned?: boolean;
  status?: 'active' | 'removed';
  removedReason?: string;
}): Promise<void> {
  const { moderator, post } = params;
  const nextPinned = params.isPinned ?? post.isPinned;
  const nextStatus = params.status ?? (post.status === 'deleted' ? 'removed' : post.status);
  const nextReason =
    nextStatus === 'removed'
      ? (params.removedReason ?? 'Removed by club moderator').trim().slice(0, 300)
      : '';

  try {
    await updateDoc(doc(db, 'posts', post.postId), {
      isPinned: nextPinned,
      status: nextStatus,
      removedReason: nextReason,
      moderatedBy: moderator.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${post.postId}`);
  }

  if (post.authorId !== moderator.uid) {
    await createNotification({
      recipientId: post.authorId,
      actorId: moderator.uid,
      actorName: moderator.displayName,
      type: 'moderation',
      title:
        nextStatus === 'removed'
          ? `Post removed in ${post.clubName}`
          : nextPinned !== post.isPinned
            ? nextPinned
              ? `Your post was pinned in ${post.clubName}`
              : `Your post was unpinned in ${post.clubName}`
            : `Post moderation updated in ${post.clubName}`,
      message:
        nextStatus === 'removed'
          ? `Reason: ${nextReason}`
          : `"${post.title}" was updated by a club moderator.`,
      targetSection: 'discussions',
      targetId: post.postId,
    });
  }

  await logActivity({
    actorId: moderator.uid,
    actorName: moderator.displayName,
    actorRole: moderator.role,
    action: nextStatus === 'removed' ? 'post_removed' : nextPinned ? 'post_pinned' : 'post_moderated',
    entityType: 'post',
    entityId: post.postId,
    summary: `Moderated post "${post.title}" in ${post.clubName}`,
  });
}

export async function castVote(
  userId: string,
  post: Post,
  direction: 1 | -1
): Promise<void> {
  const voteId = `${post.postId}__${userId}`;
  const voteRef = doc(db, 'votes', voteId);
  const postRef = doc(db, 'posts', post.postId);

  try {
    await runTransaction(db, async (tx) => {
      const [postSnap, voteSnap] = await Promise.all([tx.get(postRef), tx.get(voteRef)]);
      if (!postSnap.exists()) {
        throw new Error('Post no longer exists.');
      }
      const livePost = postSnap.data() as Post;
      if (livePost.status !== 'active') {
        throw new Error('Voting is disabled on removed posts.');
      }

      let upDelta = 0;
      let downDelta = 0;

      if (!voteSnap.exists()) {
        if (direction === 1) upDelta = 1;
        else downDelta = 1;

        tx.set(voteRef, {
          voteId,
          postId: livePost.postId,
          clubId: livePost.clubId,
          userId,
          value: direction,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingVote = voteSnap.data() as PostVote;
        if (existingVote.value === direction) {
          if (direction === 1) upDelta = -1;
          else downDelta = -1;
          tx.delete(voteRef);
        } else {
          if (direction === 1) {
            upDelta = 1;
            downDelta = -1;
          } else {
            upDelta = -1;
            downDelta = 1;
          }
          tx.update(voteRef, {
            value: direction,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const nextUp = Math.max(0, livePost.upvoteCount + upDelta);
      const nextDown = Math.max(0, livePost.downvoteCount + downDelta);

      tx.update(postRef, {
        upvoteCount: nextUp,
        downvoteCount: nextDown,
        voteScore: nextUp - nextDown,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `votes/${voteId}`);
  }
}

export async function toggleBookmark(
  userId: string,
  post: Post,
  isCurrentlyBookmarked: boolean
): Promise<void> {
  const bookmarkId = `${post.postId}__${userId}`;
  const ref = doc(db, 'bookmarks', bookmarkId);
  try {
    if (isCurrentlyBookmarked) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        bookmarkId,
        postId: post.postId,
        clubId: post.clubId,
        postTitle: post.title.slice(0, SCHEMA_LIMITS.POST_TITLE_MAX),
        userId,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      isCurrentlyBookmarked ? OperationType.DELETE : OperationType.CREATE,
      `bookmarks/${bookmarkId}`
    );
  }
}

export async function createComment(params: {
  actor: MemberProfile;
  post: Post;
  body: string;
  parentComment?: Comment | null;
}): Promise<string> {
  const cleanBody = params.body.trim();
  if (
    cleanBody.length < SCHEMA_LIMITS.COMMENT_BODY_MIN ||
    cleanBody.length > SCHEMA_LIMITS.COMMENT_BODY_MAX
  ) {
    throw new Error(
      `Comment must be ${SCHEMA_LIMITS.COMMENT_BODY_MIN}–${SCHEMA_LIMITS.COMMENT_BODY_MAX} characters.`
    );
  }

  const commentId = generateId('cmt');
  const postRef = doc(db, 'posts', params.post.postId);
  const commentRef = doc(db, 'comments', commentId);
  const parentCommentId = params.parentComment?.commentId ?? '';

  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) {
        throw new Error('Post not found.');
      }
      const livePost = postSnap.data() as Post;
      tx.set(commentRef, {
        commentId,
        postId: livePost.postId,
        clubId: livePost.clubId,
        parentCommentId,
        department: 'CS',
        authorId: params.actor.uid,
        authorName: sanitizeDisplayName(params.actor.displayName),
        authorRole: params.actor.role,
        body: cleanBody,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(postRef, {
        commentCount: livePost.commentCount + 1,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `comments/${commentId}`);
  }

  // Notify post author or parent comment author
  const notifyRecipient = params.parentComment
    ? params.parentComment.authorId
    : params.post.authorId;

  if (notifyRecipient && notifyRecipient !== params.actor.uid) {
    await createNotification({
      recipientId: notifyRecipient,
      actorId: params.actor.uid,
      actorName: params.actor.displayName,
      type: params.parentComment ? 'comment_reply' : 'post_comment',
      title: params.parentComment
        ? `${params.actor.displayName} replied to your comment`
        : `${params.actor.displayName} commented on your post`,
      message: `"${cleanBody.slice(0, 140)}" in ${params.post.clubName}`,
      targetSection: 'discussions',
      targetId: params.post.postId,
    });
  }

  return commentId;
}

export async function updateOwnComment(commentId: string, body: string): Promise<void> {
  const cleanBody = body.trim();
  if (
    cleanBody.length < SCHEMA_LIMITS.COMMENT_BODY_MIN ||
    cleanBody.length > SCHEMA_LIMITS.COMMENT_BODY_MAX
  ) {
    throw new Error(
      `Comment must be ${SCHEMA_LIMITS.COMMENT_BODY_MIN}–${SCHEMA_LIMITS.COMMENT_BODY_MAX} characters.`
    );
  }
  try {
    await updateDoc(doc(db, 'comments', commentId), {
      body: cleanBody,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `comments/${commentId}`);
  }
}

export async function deleteOwnComment(comment: Comment): Promise<void> {
  const commentRef = doc(db, 'comments', comment.commentId);
  const postRef = doc(db, 'posts', comment.postId);

  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      tx.update(commentRef, {
        status: 'deleted',
        body: '[Deleted by author]',
        updatedAt: serverTimestamp(),
      });
      if (postSnap.exists()) {
        const livePost = postSnap.data() as Post;
        tx.update(postRef, {
          commentCount: Math.max(0, livePost.commentCount - 1),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `comments/${comment.commentId}`);
  }
}

export async function removeCommentByModerator(
  moderator: MemberProfile,
  comment: Comment
): Promise<void> {
  const commentRef = doc(db, 'comments', comment.commentId);
  const postRef = doc(db, 'posts', comment.postId);

  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      tx.update(commentRef, {
        status: 'removed',
        body: '[Removed by club moderator]',
        updatedAt: serverTimestamp(),
      });
      if (postSnap.exists()) {
        const livePost = postSnap.data() as Post;
        tx.update(postRef, {
          commentCount: Math.max(0, livePost.commentCount - 1),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `comments/${comment.commentId}`);
  }

  await logActivity({
    actorId: moderator.uid,
    actorName: moderator.displayName,
    actorRole: moderator.role,
    action: 'comment_removed',
    entityType: 'comment',
    entityId: comment.commentId,
    summary: `Removed a comment in club ${comment.clubId}`,
  });
}

export async function submitContentReport(params: {
  actor: MemberProfile;
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string;
  clubId: string;
  targetExcerpt: string;
  reason: ReportReason;
  details: string;
}): Promise<string> {
  if (!REPORT_REASONS.includes(params.reason)) {
    throw new Error('Select a valid report reason.');
  }
  const reportId = generateId('rep');
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reportId,
      targetType: params.targetType,
      targetId: params.targetId,
      postId: params.postId,
      clubId: params.clubId,
      department: 'CS',
      targetExcerpt: params.targetExcerpt.trim().slice(0, 240),
      reason: params.reason,
      details: params.details.trim().slice(0, SCHEMA_LIMITS.REPORT_DETAILS_MAX),
      reportedBy: params.actor.uid,
      reporterName: sanitizeDisplayName(params.actor.displayName),
      status: 'open',
      resolutionNote: '',
      resolvedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
  return reportId;
}

export function subscribeToReports(
  options: { isAdmin: boolean; assignedClubIds: string[]; userId: string },
  onData: (reports: ContentReport[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (options.isAdmin) {
    const q = query(collection(db, 'reports'), where('department', '==', 'CS'), limit(120));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ContentReport)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'reports');
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  }

  if (options.assignedClubIds.length > 0) {
    const q = query(
      collection(db, 'reports'),
      where('department', '==', 'CS'),
      where('clubId', 'in', options.assignedClubIds.slice(0, 10)),
      limit(120)
    );
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ContentReport)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'reports');
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  }

  onData([]);
  return () => {};
}

export async function resolveContentReport(params: {
  moderator: MemberProfile;
  report: ContentReport;
  status: 'resolved' | 'dismissed';
  resolutionNote: string;
}): Promise<void> {
  const cleanNote = params.resolutionNote.trim().slice(0, SCHEMA_LIMITS.REVIEW_NOTE_MAX);
  try {
    await updateDoc(doc(db, 'reports', params.report.reportId), {
      status: params.status,
      resolutionNote: cleanNote,
      resolvedBy: params.moderator.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${params.report.reportId}`);
  }

  await createNotification({
    recipientId: params.report.reportedBy,
    actorId: params.moderator.uid,
    actorName: params.moderator.displayName,
    type: 'moderation',
    title: `Report ${params.status} in ${params.report.clubId}`,
    message:
      cleanNote ||
      `Your ${params.report.targetType} report was marked ${params.status} by a moderator.`,
    targetSection: 'discussions',
    targetId: params.report.postId,
  });

  await logActivity({
    actorId: params.moderator.uid,
    actorName: params.moderator.displayName,
    actorRole: params.moderator.role,
    action: `report_${params.status}`,
    entityType: 'report',
    entityId: params.report.reportId,
    summary: `Marked ${params.report.targetType} report in ${params.report.clubId} as ${params.status}`,
  });
}
