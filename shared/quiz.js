function invalid(detail) {
  throw new Error(`Invalid quiz structure: ${detail}.`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Keep the model response contract identical at the API and rendering boundaries.
export function validateQuizStructure(quiz) {
  if (!isObject(quiz) || typeof quiz.title !== 'string' || quiz.title.length > 1000) invalid('expected a quiz with a string title of at most 1000 characters');
  if (!Array.isArray(quiz.parts) || quiz.parts.length === 0 || quiz.parts.length > 3) invalid('parts must contain 1 to 3 entries');
  let totalQuestions = 0;

  for (const [partIndex, part] of quiz.parts.entries()) {
    const partPath = `parts[${partIndex}]`;
    if (!isObject(part) || typeof part.partTitle !== 'string' || part.partTitle.length > 1000) invalid(`${partPath} must have a string partTitle of at most 1000 characters`);
    if (!Array.isArray(part.questions) || part.questions.length === 0 || part.questions.length > 50) invalid(`${partPath}.questions must contain 1 to 50 entries`);
    totalQuestions += part.questions.length;
    if (totalQuestions > 50) invalid('the quiz must contain at most 50 questions');

    for (const [questionIndex, question] of part.questions.entries()) {
      const questionPath = `${partPath}.questions[${questionIndex}]`;
      if (!isObject(question) || typeof question.question !== 'string' || question.question.length > 4000 || typeof question.answer !== 'string' || question.answer.length > 1000) {
        invalid(`${questionPath} must have string question and answer fields`);
      }
      if (Object.hasOwn(question, 'options') && (!Array.isArray(question.options) || question.options.length === 0 || question.options.length > 10 || [...question.options].some(option => typeof option !== 'string' || option.length > 1000))) {
        invalid(`${questionPath}.options must be a nonempty array of strings when provided`);
      }
    }
  }

  return quiz;
}
