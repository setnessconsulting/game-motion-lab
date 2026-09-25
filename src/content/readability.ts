/**
 * Reading-complexity metrics for authored learner-facing copy.
 *
 * This exists so that the human readability review of GAME-389 AC4 starts
 * from numbers rather than from an impression, and so that a later edit which
 * quietly raises the difficulty of the prose fails a gate instead of shipping.
 *
 * What it is *not*: a readability judgement. Flesch-Kincaid counts syllables.
 * It cannot tell whether a learner can follow an argument, whether a
 * definition is right, or whether the physics is being explained well. The
 * thresholds below are a floor, not a sign-off; the AC4 review itself remains
 * a human gate and is not satisfied by any number computed here.
 *
 * The counters are deterministic and dependency-free, so the same copy always
 * scores the same and the check cannot drift between runs.
 */

/** The frozen target band. Motion Lab v1 is written for grades 6-8. */
export const READABILITY_TARGET = {
  /** Highest acceptable Flesch-Kincaid grade level. */
  gradeLevelCeiling: 8,
  /** Longest acceptable sentence, in words. */
  longestSentenceWords: 28,
  /** Most acceptable share of words with four or more syllables. */
  polysyllableShareCeiling: 0.18,
} as const;

export interface ReadabilityMetrics {
  readonly words: number;
  readonly sentences: number;
  readonly syllables: number;
  /** Flesch-Kincaid grade level, to one decimal place. */
  readonly gradeLevel: number;
  readonly meanSentenceWords: number;
  readonly longestSentenceWords: number;
  readonly polysyllableWords: number;
  readonly polysyllableShare: number;
}

/** Split authored copy into sentences without pulling in an NLP dependency. */
export function splitSentences(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Split a sentence into word-like tokens, dropping punctuation. */
export function tokeniseWords(text: string): readonly string[] {
  return text
    .split(/[^A-Za-z'-]+/)
    .map((token) => token.replace(/^[-']+|[-']+$/g, ""))
    .filter((token) => token.length > 0);
}

/**
 * Count syllables with the standard vowel-group heuristic.
 *
 * A vowel group is a maximal run of a, e, i, o, u (and y, which behaves as a
 * vowel inside a word). A trailing silent `e` does not add a syllable, and no
 * word is ever counted as zero.
 */
export function countSyllables(word: string): number {
  const normalised = word.toLowerCase().replace(/[^a-z]/g, "");
  if (normalised.length === 0) return 0;
  const groups = normalised.match(/[aeiouy]+/g);
  let count = groups === null ? 0 : groups.length;
  if (normalised.endsWith("e") && count > 1 && !/[aeiouy]e$/.test(normalised)) count -= 1;
  return Math.max(count, 1);
}

/**
 * Score one block of authored copy.
 *
 * Empty text scores zero rather than dividing by zero, so an empty field is
 * reported as "no evidence" by the caller rather than as a passing grade.
 */
export function measureReadability(text: string): ReadabilityMetrics {
  const sentences = splitSentences(text);
  const words = tokeniseWords(text);
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
  const polysyllable = words.filter((word) => countSyllables(word) >= 4).length;
  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);

  const gradeLevel =
    0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;
  const roundedGrade = Math.round(gradeLevel * 10) / 10;

  return {
    words: words.length,
    sentences: sentences.length,
    syllables,
    gradeLevel: roundedGrade,
    meanSentenceWords: round2(words.length / sentenceCount),
    longestSentenceWords: sentences.reduce(
      (longest, sentence) => Math.max(longest, tokeniseWords(sentence).length),
      0
    ),
    polysyllableWords: polysyllable,
    polysyllableShare: round2(polysyllable / wordCount),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ReadabilityBreach {
  readonly metric: "gradeLevel" | "longestSentenceWords" | "polysyllableShare" | "empty";
  readonly observed: number;
  readonly limit: number;
}

/** Every way a block of copy exceeds the grades 6-8 target, in report order. */
export function findReadabilityBreaches(metrics: ReadabilityMetrics): readonly ReadabilityBreach[] {
  const breaches: ReadabilityBreach[] = [];
  if (metrics.words === 0) {
    breaches.push({ metric: "empty", observed: 0, limit: 1 });
    return breaches;
  }
  if (metrics.gradeLevel > READABILITY_TARGET.gradeLevelCeiling) {
    breaches.push({
      metric: "gradeLevel",
      observed: metrics.gradeLevel,
      limit: READABILITY_TARGET.gradeLevelCeiling,
    });
  }
  if (metrics.longestSentenceWords > READABILITY_TARGET.longestSentenceWords) {
    breaches.push({
      metric: "longestSentenceWords",
      observed: metrics.longestSentenceWords,
      limit: READABILITY_TARGET.longestSentenceWords,
    });
  }
  if (metrics.polysyllableShare > READABILITY_TARGET.polysyllableShareCeiling) {
    breaches.push({
      metric: "polysyllableShare",
      observed: metrics.polysyllableShare,
      limit: READABILITY_TARGET.polysyllableShareCeiling,
    });
  }
  return breaches;
}
