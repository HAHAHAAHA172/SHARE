import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../shared/api.js';

const PAGE_SIZE = 24;
const requestCache = new Map();
const CACHE_TTL_MS = 10_000;
const CACHE_LIMIT = 20;

function rememberRequest(key, value) {
  requestCache.delete(key);
  requestCache.set(key, value);
  while (requestCache.size > CACHE_LIMIT) requestCache.delete(requestCache.keys().next().value);
}

async function fetchFeedPage({ page, query, subject, userId, version = 0 }) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (query) params.set('q', query);
  if (subject && subject !== 'All') params.set('subject', subject);
  const key = `${userId || 'guest'}:${version}:${params}`;
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;

  // The shared promise deliberately owns the request lifetime. Consumers ignore
  // stale results through their generation/abort guards without cancelling a
  // request that another mounted consumer may still be awaiting.
  const request = apiFetch(`/api/posts?${params}`).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Could not load posts. Please try again.');
    }
    return response.json();
  });
  rememberRequest(key, { createdAt: Date.now(), value: request });
  try {
    const result = await request;
    rememberRequest(key, { createdAt: Date.now(), value: result });
    return result;
  } catch (error) {
    requestCache.delete(key);
    throw error;
  }
}

export default function useFeed({ currentUserId, query, subject, refreshVersion, setPosts }) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const load = async () => {
      try {
        const result = await fetchFeedPage({ page: 1, query, subject, userId: currentUserId, version: refreshVersion });
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const nextPosts = [...new Map((result.posts || []).map((post) => [post.id, post])).values()];
        setPosts?.(nextPosts);
        setPage(1);
        setTotal(Number(result.count) || nextPosts.length);
        setHasMore(Boolean(result.hasMore));
        setError('');
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message || 'Could not reach the server. Please try again.');
      } finally {
        if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [currentUserId, query, subject, refreshVersion, setPosts]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await fetchFeedPage({ page: nextPage, query, subject, userId: currentUserId, version: refreshVersion });
      setPosts?.((current) => [...new Map([...(current || []), ...(result.posts || [])].map((post) => [post.id, post])).values()]);
      setPage(nextPage);
      setTotal(Number(result.count) || total);
      setHasMore(Boolean(result.hasMore));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load more posts. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [currentUserId, hasMore, loading, loadingMore, page, query, refreshVersion, setPosts, subject, total]);

  return { loading, loadingMore, error, total, hasMore, loadMore };
}
