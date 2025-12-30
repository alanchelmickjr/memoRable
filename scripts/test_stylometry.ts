#!/usr/bin/env npx tsx
/**
 * Test the stylometry-based behavioral analysis functions
 */

// ============================================
// COPY OF STYLOMETRY FUNCTIONS FOR TESTING
// ============================================

const FUNCTION_WORDS = [
  'a', 'an', 'the',
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'who', 'whom', 'whose', 'which', 'that',
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'also', 'as', 'than', 'when', 'while', 'although', 'because',
  'if', 'unless', 'until', 'whether',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did',
  'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must',
  'this', 'that', 'these', 'those',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any',
  'very', 'really', 'just', 'still', 'already', 'even', 'also', 'too', 'quite', 'rather',
  'here', 'there', 'where', 'when', 'how', 'why',
  'now', 'then', 'always', 'never', 'often', 'sometimes',
];

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  const vowelGroups = word.match(/[aeiouy]+/g) || [];
  let count = vowelGroups.length;
  if (word.endsWith('e') && count > 1) count--;
  if (word.endsWith('ed') && count > 1) count--;
  return Math.max(1, count);
}

function generateCharNgrams(text: string, n: number): Map<string, number> {
  const ngrams = new Map<string, number>();
  const cleaned = text.toLowerCase().replace(/[^a-z ]/g, '');
  for (let i = 0; i <= cleaned.length - n; i++) {
    const ngram = cleaned.slice(i, i + n);
    ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
  }
  return ngrams;
}

function createDistributionSignature(freqs: Record<string, number>): string {
  const sorted = Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  const sigString = sorted.map(([k, v]) => `${k}:${v.toFixed(2)}`).join('|');
  let hash = 0;
  for (let i = 0; i < sigString.length; i++) {
    const char = sigString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sig_${Math.abs(hash).toString(36)}`;
}

interface BehavioralSignals {
  vocabulary: {
    avgWordLength: number;
    abbreviationRatio: number;
    uniqueWordRatio: number;
    jargonScore: number;
    hapaxRatio: number;
    typeTokenRatio: number;
    avgSyllables: number;
  };
  syntax: {
    avgSentenceLength: number;
    punctuationStyle: string;
    capitalizationRatio: number;
    questionRatio: number;
    commaFrequency: number;
    semicolonUsage: boolean;
    ellipsisUsage: boolean;
    exclamationRatio: number;
    parentheticalRatio: number;
    clauseComplexity: number;
  };
  timing: {
    hourOfDay: number;
    dayOfWeek: number;
  };
  topics: string[];
  style: {
    formalityScore: number;
    emojiUsage: number;
    politenessMarkers: number;
    contractionRatio: number;
    numberStyle: string;
    listUsage: boolean;
  };
  charNgrams: {
    top3grams: string[];
    ngramSignature: string;
  };
  functionWords: {
    frequencies: Record<string, number>;
    signature: string;
  };
}

function analyzeBehavioralSignals(message: string): BehavioralSignals {
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const now = new Date();

  // Vocabulary
  const avgWordLength = words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0;
  const abbreviations = ['u', 'ur', 'thx', 'pls', 'btw', 'idk', 'imo', 'tbh', 'lol', 'omg', 'brb', 'afk', 'gg', 'np', 'ty', 'yw'];
  const abbrevCount = words.filter(w => abbreviations.includes(w)).length;
  const abbreviationRatio = words.length > 0 ? abbrevCount / words.length : 0;
  const uniqueWords = new Set(words);
  const uniqueWordRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  const wordCounts = new Map<string, number>();
  for (const w of words) {
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }
  const hapaxCount = Array.from(wordCounts.values()).filter(c => c === 1).length;
  const hapaxRatio = words.length > 0 ? hapaxCount / words.length : 0;
  const avgSyllables = words.length > 0 ? words.reduce((sum, w) => sum + countSyllables(w), 0) / words.length : 0;

  // Syntax
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const allPunctuation = message.match(/[.,!?;:'"()\-—]/g) || [];
  const punctuationStyle = allPunctuation.length > 10 ? 'heavy' : allPunctuation.length > 4 ? 'moderate' : 'light';
  const upperCase = (message.match(/[A-Z]/g) || []).length;
  const lowerCase = (message.match(/[a-z]/g) || []).length;
  const capitalizationRatio = (upperCase + lowerCase) > 0 ? upperCase / (upperCase + lowerCase) : 0;
  const questions = (message.match(/\?/g) || []).length;
  const questionRatio = sentences.length > 0 ? questions / sentences.length : 0;
  const commas = (message.match(/,/g) || []).length;
  const commaFrequency = sentences.length > 0 ? commas / sentences.length : 0;
  const semicolonUsage = message.includes(';');
  const ellipsisUsage = message.includes('...') || message.includes('…');
  const exclamations = (message.match(/!/g) || []).length;
  const exclamationRatio = sentences.length > 0 ? exclamations / sentences.length : 0;
  const parentheses = (message.match(/[()]/g) || []).length;
  const parentheticalRatio = words.length > 0 ? parentheses / words.length : 0;
  const clauseMarkers = ['although', 'because', 'since', 'while', 'whereas', 'if', 'unless', 'until', 'when', 'whenever', 'where', 'wherever', 'whether', 'which', 'who', 'whom', 'whose', 'that'];
  const clauseCount = words.filter(w => clauseMarkers.includes(w)).length;
  const clauseComplexity = sentences.length > 0 ? clauseCount / sentences.length : 0;

  // Style
  const formalWords = ['please', 'thank', 'appreciate', 'kindly', 'would', 'could', 'shall', 'regarding', 'concerning', 'furthermore', 'however', 'therefore', 'consequently'];
  const formalCount = words.filter(w => formalWords.some(f => w.includes(f))).length;
  const formalityScore = words.length > 0 ? Math.min(1, formalCount / words.length * 10) : 0.5;
  const emojis = (message.match(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  const emojiUsage = emojis / Math.max(1, words.length);
  const politeWords = ['please', 'thanks', 'thank you', 'appreciate', 'sorry', 'excuse me', 'pardon'];
  const politeCount = politeWords.filter(p => message.toLowerCase().includes(p)).length;
  const contractions = ["n't", "'re", "'ve", "'ll", "'m", "'d", "'s"];
  const contractionCount = contractions.filter(c => message.toLowerCase().includes(c)).length;
  const contractionRatio = words.length > 0 ? contractionCount / words.length : 0;
  const writtenNumbers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const hasWrittenNumbers = words.some(w => writtenNumbers.includes(w));
  const hasNumericNumbers = /\d+/.test(message);
  const numberStyle = hasWrittenNumbers && !hasNumericNumbers ? 'written' : hasNumericNumbers && !hasWrittenNumbers ? 'numeric' : 'mixed';
  const listUsage = /^[\-\*•]\s|^\d+[.)]\s/m.test(message);

  // Character N-grams
  const charNgrams3 = generateCharNgrams(message, 3);
  const sortedNgrams = Array.from(charNgrams3.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ngram]) => ngram);
  const ngramFreqs: Record<string, number> = {};
  const totalNgrams = Array.from(charNgrams3.values()).reduce((a, b) => a + b, 0);
  for (const [ngram, count] of charNgrams3) {
    ngramFreqs[ngram] = count / totalNgrams;
  }
  const ngramSignature = createDistributionSignature(ngramFreqs);

  // Function Words
  const functionWordFreqs: Record<string, number> = {};
  let functionWordTotal = 0;
  for (const fw of FUNCTION_WORDS) {
    const count = words.filter(w => w === fw).length;
    if (count > 0) {
      functionWordFreqs[fw] = count;
      functionWordTotal += count;
    }
  }
  for (const fw of Object.keys(functionWordFreqs)) {
    functionWordFreqs[fw] = functionWordFreqs[fw] / (functionWordTotal || 1);
  }
  const functionWordSignature = createDistributionSignature(functionWordFreqs);

  // Topics
  const stopWords = new Set(FUNCTION_WORDS);
  const topics = words.filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 10);

  return {
    vocabulary: {
      avgWordLength,
      abbreviationRatio,
      uniqueWordRatio,
      jargonScore: abbreviationRatio * 0.5 + (1 - capitalizationRatio) * 0.5,
      hapaxRatio,
      typeTokenRatio: uniqueWordRatio,
      avgSyllables,
    },
    syntax: {
      avgSentenceLength,
      punctuationStyle,
      capitalizationRatio,
      questionRatio,
      commaFrequency,
      semicolonUsage,
      ellipsisUsage,
      exclamationRatio,
      parentheticalRatio,
      clauseComplexity,
    },
    timing: {
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    },
    topics,
    style: {
      formalityScore,
      emojiUsage,
      politenessMarkers: politeCount,
      contractionRatio,
      numberStyle,
      listUsage,
    },
    charNgrams: {
      top3grams: sortedNgrams,
      ngramSignature,
    },
    functionWords: {
      frequencies: functionWordFreqs,
      signature: functionWordSignature,
    },
  };
}

// ============================================
// TESTS
// ============================================

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        STYLOMETRY BEHAVIORAL ANALYSIS TESTS                ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name} - FAILED`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${name} - ERROR: ${e}`);
    failed++;
  }
}

// Test 1: Informal message
console.log('\n--- Test: Informal Message ---');
const informal = "hey can u check the payment thing from yesterday? thx!";
const informalSignals = analyzeBehavioralSignals(informal);
console.log(`Input: "${informal}"`);

test('Detects abbreviations (u, thx)', () => informalSignals.vocabulary.abbreviationRatio > 0);
test('Low formality score', () => informalSignals.style.formalityScore < 0.3);
test('Has question', () => informalSignals.syntax.questionRatio > 0);
test('Light punctuation', () => informalSignals.syntax.punctuationStyle === 'light' || informalSignals.syntax.punctuationStyle === 'moderate');
test('Generates char n-grams', () => informalSignals.charNgrams.top3grams.length > 0);
test('Has n-gram signature', () => informalSignals.charNgrams.ngramSignature.startsWith('sig_'));
test('Detects function words', () => Object.keys(informalSignals.functionWords.frequencies).length > 0);

// Test 2: Formal message
console.log('\n--- Test: Formal Message ---');
const formal = "I would appreciate it if you could kindly review the quarterly financial report. Please let me know if you have any questions regarding the budget allocation.";
const formalSignals = analyzeBehavioralSignals(formal);
console.log(`Input: "${formal.slice(0, 60)}..."`);

test('Higher formality score', () => formalSignals.style.formalityScore > informalSignals.style.formalityScore);
test('No abbreviations', () => formalSignals.vocabulary.abbreviationRatio === 0);
test('Longer avg word length', () => formalSignals.vocabulary.avgWordLength > informalSignals.vocabulary.avgWordLength);
test('Higher syllable count', () => formalSignals.vocabulary.avgSyllables > informalSignals.vocabulary.avgSyllables);
test('Has politeness markers', () => formalSignals.style.politenessMarkers > 0);
test('Different n-gram signature', () => formalSignals.charNgrams.ngramSignature !== informalSignals.charNgrams.ngramSignature);

// Test 3: Complex syntax
console.log('\n--- Test: Complex Syntax ---');
const complex = "Although the project deadline is approaching, I believe that if we prioritize the critical features, which are outlined in the document that Sarah shared, we should be able to deliver on time; however, this assumes no additional requirements.";
const complexSignals = analyzeBehavioralSignals(complex);
console.log(`Input: "${complex.slice(0, 60)}..."`);

test('High clause complexity', () => complexSignals.syntax.clauseComplexity > 0);
test('Semicolon usage detected', () => complexSignals.syntax.semicolonUsage === true);
test('Heavy/moderate punctuation', () => complexSignals.syntax.punctuationStyle !== 'light');
test('Long average sentence', () => complexSignals.syntax.avgSentenceLength > 20);
test('High comma frequency', () => complexSignals.syntax.commaFrequency > 3);

// Test 4: Emoji and contractions
console.log('\n--- Test: Emoji & Contractions ---');
const casual = "I don't think we'll be able to make it work 😅 but let's try anyway! 🚀";
const casualSignals = analyzeBehavioralSignals(casual);
console.log(`Input: "${casual}"`);

test('Detects emoji usage', () => casualSignals.style.emojiUsage > 0);
test('Detects contractions', () => casualSignals.style.contractionRatio > 0);
test('Has exclamations', () => casualSignals.syntax.exclamationRatio > 0);

// Test 5: List format
console.log('\n--- Test: List Format ---');
const listMessage = `Here are the items:
- First thing to do
- Second important task
- Third item on the list`;
const listSignals = analyzeBehavioralSignals(listMessage);
console.log(`Input: "Here are the items: - First thing...")`);

test('Detects list usage', () => listSignals.style.listUsage === true);

// Test 6: Number styles
console.log('\n--- Test: Number Styles ---');
const numericMsg = "We need 3 items by 5pm on the 12th";
const writtenMsg = "We need three items by five pm";
const numericSignals = analyzeBehavioralSignals(numericMsg);
const writtenSignals = analyzeBehavioralSignals(writtenMsg);

test('Detects numeric style', () => numericSignals.style.numberStyle === 'numeric');
test('Detects written style', () => writtenSignals.style.numberStyle === 'written');

// Test 7: Ellipsis detection
console.log('\n--- Test: Ellipsis ---');
const ellipsisMsg = "I'm not sure... maybe we should wait...";
const ellipsisSignals = analyzeBehavioralSignals(ellipsisMsg);

test('Detects ellipsis usage', () => ellipsisSignals.syntax.ellipsisUsage === true);

// Test 8: Hapax ratio (unique words)
console.log('\n--- Test: Hapax Ratio ---');
const uniqueMsg = "The quick brown fox jumps over the lazy dog";
const uniqueSignals = analyzeBehavioralSignals(uniqueMsg);

test('Calculates hapax ratio', () => uniqueSignals.vocabulary.hapaxRatio > 0);
test('Calculates type-token ratio', () => uniqueSignals.vocabulary.typeTokenRatio > 0.5);

// Summary
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log(`║  RESULTS: ${passed} passed, ${failed} failed                            ║`);
console.log('╚════════════════════════════════════════════════════════════╝');

if (failed === 0) {
  console.log('\n✅ All stylometry tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
