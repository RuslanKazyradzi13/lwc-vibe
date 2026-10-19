/**
 * Helpers for regular expressions over Cyrillic text.
 *
 * In JavaScript `\b` and `\w` are ASCII-only: `/\bтест\b/.test('тесты')` → false.
 * Word boundaries are therefore expressed with Unicode look-arounds and "letters" with \p{L}.
 */
const WORD_CHAR = '[\\p{L}\\p{N}_]';
const LETTERS = '\\p{L}*';
const B0 = `(?<!${WORD_CHAR})`;
const B1 = `(?!${WORD_CHAR})`;

/** "Whole word from alternatives" regex (unicode, case-insensitive by default). */
export function words(alternatives: string, flags = 'iu'): RegExp {
  return new RegExp(`${B0}(?:${alternatives})${B1}`, flags);
}

/** Alternation "stem + any letters": stems('сохран') → 'сохран\p{L}*'. */
export function stems(...stemsList: string[]): string {
  return stemsList.map((s) => `${s}${LETTERS}`).join('|');
}
