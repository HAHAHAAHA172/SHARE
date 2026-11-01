export default function ThinkingIndicator({ craftingQuiz = false, elapsed }) {
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
