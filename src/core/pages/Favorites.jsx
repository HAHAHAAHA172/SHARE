import './Favorites.css';
import { ArrowLeft, ChevronRight, Star } from 'lucide-react';

export default function Favorites({ onNavigate, favorites = [], onSelectPost }) {
  const items = favorites;

  const handleItemClick = (item) => {
    if (onSelectPost) {
      onSelectPost(item);
    } else if (onNavigate) {
      onNavigate('post-detail', item);
    }
  };

  return (
    <div className="fav-screen">
      <div className="fav-container">

        {/* ── Header ── */}
        <header className="fav-header">
          <button
            className="fav-back-btn"
            onClick={() => onNavigate && onNavigate('home')}
            title="Go back"
            aria-label="Back"
          >
            <ArrowLeft size={22} color="#ffffff" strokeWidth={2.2} />
          </button>
          <h1 className="fav-title">Saved</h1>
          <div className="fav-header-spacer" />
        </header>

        {/* ── Scrollable list ── */}
        <div className="fav-list-area">
          {items.length === 0 ? (
            <div className="fav-empty">
              <Star size={48} color="#9A89C6" strokeWidth={1.5} />
              <p>No saved posts yet.</p>
              <span>Tap the ♡ on any post to save it here.</span>
            </div>
          ) : (
            <ul className="fav-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="fav-item"
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="fav-item-text">{item.title}</span>
                    <ChevronRight size={20} color="#c9c5e8" strokeWidth={2} className="fav-item-arrow" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}

