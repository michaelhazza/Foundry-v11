import nlp from 'compromise';

export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'person_name'
  | 'address'
  | 'date_of_birth'
  | 'url'
  | 'custom';

export interface PIIMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface PIIDetectionResult {
  hasPII: boolean;
  matches: PIIMatch[];
  redactedText: string;
}

// Regex patterns for various PII types
const patterns: Record<string, { regex: RegExp; type: PIIType; confidence: number }> = {
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    type: 'email',
    confidence: 0.95,
  },
  phone: {
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    type: 'phone',
    confidence: 0.85,
  },
  ssn: {
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    type: 'ssn',
    confidence: 0.90,
  },
  creditCard: {
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    type: 'credit_card',
    confidence: 0.90,
  },
  ipAddress: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    type: 'ip_address',
    confidence: 0.95,
  },
  url: {
    regex: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/g,
    type: 'url',
    confidence: 0.95,
  },
  dateOfBirth: {
    regex: /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
    type: 'date_of_birth',
    confidence: 0.70,
  },
};

/**
 * Detect PII in text using regex patterns
 */
function detectPatternPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const [, pattern] of Object.entries(patterns)) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type: pattern.type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: pattern.confidence,
      });
    }
  }

  return matches;
}

/**
 * Detect person names using compromise NLP
 */
function detectPersonNames(text: string): PIIMatch[] {
  const doc = nlp(text);
  const people = doc.people();
  const matches: PIIMatch[] = [];

  people.forEach((person: { text: () => string }) => {
    const name = person.text();
    if (name.length >= 2) {
      const index = text.indexOf(name);
      if (index !== -1) {
        matches.push({
          type: 'person_name',
          value: name,
          start: index,
          end: index + name.length,
          confidence: 0.75,
        });
      }
    }
  });

  return matches;
}

/**
 * Detect places/addresses using compromise NLP
 */
function detectAddresses(text: string): PIIMatch[] {
  const doc = nlp(text);
  const places = doc.places();
  const matches: PIIMatch[] = [];

  places.forEach((place: { text: () => string }) => {
    const address = place.text();
    if (address.length >= 3) {
      const index = text.indexOf(address);
      if (index !== -1) {
        matches.push({
          type: 'address',
          value: address,
          start: index,
          end: index + address.length,
          confidence: 0.65,
        });
      }
    }
  });

  return matches;
}

/**
 * Remove duplicate/overlapping matches, keeping higher confidence ones
 */
function deduplicateMatches(matches: PIIMatch[]): PIIMatch[] {
  // Sort by start position, then by confidence (descending)
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: PIIMatch[] = [];

  for (const match of sorted) {
    // Check if this match overlaps with any existing match
    const overlaps = result.some(
      (existing) =>
        (match.start >= existing.start && match.start < existing.end) ||
        (match.end > existing.start && match.end <= existing.end) ||
        (match.start <= existing.start && match.end >= existing.end)
    );

    if (!overlaps) {
      result.push(match);
    }
  }

  return result;
}

/**
 * Detect all PII in text
 */
export function detectPII(
  text: string,
  options: {
    detectNames?: boolean;
    detectAddresses?: boolean;
    customPatterns?: { name: string; regex: RegExp; type: PIIType }[];
  } = {}
): PIIDetectionResult {
  const { detectNames = true, detectAddresses = true, customPatterns = [] } = options;

  const allMatches: PIIMatch[] = [];

  // Detect pattern-based PII
  allMatches.push(...detectPatternPII(text));

  // Detect names using NLP
  if (detectNames) {
    allMatches.push(...detectPersonNames(text));
  }

  // Detect addresses using NLP
  if (detectAddresses) {
    allMatches.push(...detectAddresses(text));
  }

  // Detect custom patterns
  for (const pattern of customPatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      allMatches.push({
        type: pattern.type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.80,
      });
    }
  }

  // Deduplicate overlapping matches
  const matches = deduplicateMatches(allMatches);

  // Generate redacted text
  let redactedText = text;
  // Sort matches in reverse order to preserve positions while replacing
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

  for (const match of sortedMatches) {
    const redactionLabel = `[${match.type.toUpperCase()}]`;
    redactedText =
      redactedText.slice(0, match.start) +
      redactionLabel +
      redactedText.slice(match.end);
  }

  return {
    hasPII: matches.length > 0,
    matches,
    redactedText,
  };
}

/**
 * Redact PII from text with custom redaction string
 */
export function redactPII(
  text: string,
  options: {
    redactionChar?: string;
    preserveLength?: boolean;
    redactionLabels?: Record<PIIType, string>;
  } = {}
): string {
  const {
    redactionChar = '*',
    preserveLength = false,
    redactionLabels,
  } = options;

  const result = detectPII(text);

  if (!result.hasPII) {
    return text;
  }

  let redactedText = text;
  // Sort matches in reverse order
  const sortedMatches = [...result.matches].sort((a, b) => b.start - a.start);

  for (const match of sortedMatches) {
    let replacement: string;

    if (redactionLabels && redactionLabels[match.type]) {
      replacement = redactionLabels[match.type];
    } else if (preserveLength) {
      replacement = redactionChar.repeat(match.value.length);
    } else {
      replacement = `[${match.type.toUpperCase()}]`;
    }

    redactedText =
      redactedText.slice(0, match.start) +
      replacement +
      redactedText.slice(match.end);
  }

  return redactedText;
}

/**
 * Check if text contains any PII
 */
export function containsPII(text: string): boolean {
  return detectPII(text).hasPII;
}

/**
 * Get PII statistics for text
 */
export function getPIIStats(text: string): Record<PIIType, number> {
  const result = detectPII(text);
  const stats: Record<PIIType, number> = {
    email: 0,
    phone: 0,
    ssn: 0,
    credit_card: 0,
    ip_address: 0,
    person_name: 0,
    address: 0,
    date_of_birth: 0,
    url: 0,
    custom: 0,
  };

  for (const match of result.matches) {
    stats[match.type]++;
  }

  return stats;
}

/**
 * Process a batch of records for PII
 */
export async function processBatchPII(
  records: Array<{ id: string; text: string }>,
  options: {
    redact?: boolean;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<
  Array<{
    id: string;
    original: string;
    result: PIIDetectionResult;
  }>
> {
  const { redact = false, onProgress } = options;
  const results: Array<{
    id: string;
    original: string;
    result: PIIDetectionResult;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const result = detectPII(record.text);

    results.push({
      id: record.id,
      original: record.text,
      result: redact
        ? result
        : {
            ...result,
            redactedText: record.text,
          },
    });

    if (onProgress) {
      onProgress(i + 1, records.length);
    }
  }

  return results;
}
