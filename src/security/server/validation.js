export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function text(value, { name = 'Value', max = 1000, required = false, fallback = '' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw httpError(400, `${name} is required.`);
    return fallback;
  }
  if (typeof value !== 'string') throw httpError(400, `${name} must be text.`);
  // Remove non-printing controls, while retaining ordinary line breaks and tabs.
  const clean = value.replace(/\p{Cc}/gu, character => ['\n', '\r', '\t'].includes(character) ? character : '').trim();
  if (clean.length > max) throw httpError(400, `${name} is too long.`);
  if (required && !clean) throw httpError(400, `${name} is required.`);
  return clean || fallback;
}

export function pageNumber(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw httpError(400, 'Invalid pagination.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw httpError(400, 'Invalid pagination.');
  return number;
}
