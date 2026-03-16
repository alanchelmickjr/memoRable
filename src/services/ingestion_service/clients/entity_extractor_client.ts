/**
 * EntityExtractorClient - Extracts entities from text content.
 * Uses pattern matching for names, projects, organizations, locations.
 * No external API dependency — runs locally.
 */
export class EntityExtractorClient {
  public logger = console;

  /**
   * Extract named entities from content using pattern-based NER.
   * Identifies people, projects, organizations, and locations.
   */
  async extract(content: string | object): Promise<Array<{ name: string; type: string; originalText: string }>> {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    if (!text || text.trim().length === 0) return [];

    const entities: Array<{ name: string; type: string; originalText: string }> = [];
    const seen = new Set<string>();

    // Capitalized multi-word names (likely people, projects, orgs)
    // Match 2-4 consecutive capitalized words not at sentence start
    const namePattern = /(?<=[.!?]\s+|^)(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g;
    const midSentenceNames = /(?<=\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g;

    for (const match of text.matchAll(midSentenceNames)) {
      const name = match[1];
      const lower = name.toLowerCase();
      // Skip common non-entity phrases
      if (isCommonPhrase(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);

      entities.push({
        name,
        type: guessEntityType(name, text),
        originalText: match[0],
      });
    }

    // @mentions (e.g., @alan, @claude)
    const mentionPattern = /@(\w+)/g;
    for (const match of text.matchAll(mentionPattern)) {
      const name = match[1];
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      entities.push({ name, type: 'Person', originalText: match[0] });
    }

    // Email addresses → person entities
    const emailPattern = /([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    for (const match of text.matchAll(emailPattern)) {
      const username = match[1];
      if (seen.has(username.toLowerCase())) continue;
      seen.add(username.toLowerCase());
      entities.push({ name: username, type: 'Person', originalText: match[0] });
    }

    return entities;
  }
}

/** Words that look like names but aren't entities */
const COMMON_PHRASES = new Set([
  'the', 'this', 'that', 'these', 'those', 'will', 'would', 'could', 'should',
  'have', 'been', 'some', 'many', 'much', 'more', 'most', 'other', 'another',
  'every', 'each', 'both', 'either', 'neither', 'such', 'same', 'different',
  'first', 'last', 'next', 'new', 'old', 'long', 'great', 'good', 'best',
  'high', 'low', 'big', 'small', 'large', 'right', 'left', 'real', 'true',
  'false', 'open', 'close', 'start', 'end', 'back', 'front', 'top', 'bottom',
  'note', 'update', 'important', 'please', 'thank', 'thanks', 'hello',
]);

function isCommonPhrase(lower: string): boolean {
  return lower.split(' ').every(word => COMMON_PHRASES.has(word));
}

function guessEntityType(name: string, context: string): string {
  const lower = name.toLowerCase();
  const contextLower = context.toLowerCase();

  // Project indicators
  if (contextLower.includes(`project ${lower}`) || contextLower.includes(`${lower} project`) ||
      contextLower.includes(`${lower} repo`) || contextLower.includes(`${lower} codebase`)) {
    return 'Project';
  }

  // Organization indicators
  if (contextLower.includes(`${lower} inc`) || contextLower.includes(`${lower} corp`) ||
      contextLower.includes(`${lower} llc`) || contextLower.includes(`at ${lower}`)) {
    return 'Organization';
  }

  // Location indicators
  if (contextLower.includes(`in ${lower}`) || contextLower.includes(`from ${lower}`) ||
      contextLower.includes(`to ${lower}`)) {
    return 'Location';
  }

  // Default: person (most common entity type in conversation)
  return 'Person';
}
