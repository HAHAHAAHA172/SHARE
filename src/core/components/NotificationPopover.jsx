import { useEffect, useRef } from 'react';
import { CheckCircle, Clock, X } from 'lucide-react';

export default function NotificationPopover({ id, notifications, loading, error, onRetry, onClose, triggerRef, compact = false }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    const trigger = triggerRef?.current;
    panel?.querySelector('button')?.focus();
    const onPointerDown = event => {
      if (!panel?.contains(event.target) && !trigger?.contains(event.target)) onClose();
    };
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
      trigger?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (panel?.contains(document.activeElement)) (trigger || previousFocus)?.focus?.();
    };
  }, [onClose, triggerRef]);

  const titleId = `${id}-title`;
  return <div ref={panelRef} className={`share-notifications-popover ${compact ? 'share-compact-notifications' : ''}`} id={id} role="dialog" aria-labelledby={titleId}>
    <div className="share-popup-header">
      <h4 id={titleId}>Notifications</h4>
      <button type="button" aria-label="Close notifications" onClick={onClose}><X size={16} /></button>
    </div>
    {loading && !notifications.length ? <div className="share-popup-item" role="status"><Clock size={18} color="#9A89C6" /><div><strong>Loading notifications…</strong></div></div> : null}
    {error ? <div className="share-popup-item" role="alert"><Clock size={18} color="#9A89C6" /><div><strong>Notifications unavailable</strong><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div></div> : null}
    {!loading && !error && !notifications.length ? <div className="share-popup-item"><Clock size={18} color="#9A89C6" /><div><strong>No notifications yet</strong><p>Updates about your posts will appear here.</p></div></div> : null}
    {notifications.slice(0, 8).map(item => <div className={`share-popup-item ${item.read_at ? '' : 'is-unread'}`} key={item.notification_id}>
      {item.type === 'like' ? <CheckCircle size={18} color="#e9365b" /> : <Clock size={18} color="#9A89C6" />}
      <div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
    </div>)}
  </div>;
}
