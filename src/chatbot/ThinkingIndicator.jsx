import { useEffect, useState } from 'react';

export default function ThinkingIndicator({ craftingQuiz = false }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="pedro-thinking" role="status" aria-label={craftingQuiz ? 'PEDRO is crafting your quiz' : 'PEDRO is thinking'}>
      <span className="pedro-thinking-dots" aria-hidden="true">
        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
      </span>
      {craftingQuiz && <span className="pedro-thinking-label">Crafting your quiz...</span>}
      <span className="pedro-thinking-elapsed" aria-hidden="true">{elapsed.toFixed(1)}s</span>
    </div>
  );
}
