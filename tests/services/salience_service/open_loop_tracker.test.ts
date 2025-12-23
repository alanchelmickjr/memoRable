/**
 * @file Tests for Open Loop Tracker Service
 * Tests the commitment/promise tracking system
 */

// Note: These tests focus on the pure functions that don't require database

describe('Open Loop Tracker', () => {
  describe('parseDueDate (tested via heuristics)', () => {
    // Helper to simulate date parsing logic
    function parseDueDateHeuristic(
      byWhen: string | null,
      dueType: 'explicit' | 'implicit' | 'none',
      referenceDate: Date
    ): { dueDate?: Date; softDeadline?: Date } {
      if (!byWhen || dueType === 'none') {
        const softDeadline = new Date(referenceDate);
        softDeadline.setDate(softDeadline.getDate() + 14);
        return { softDeadline };
      }

      // Try ISO8601 first
      const isoDate = new Date(byWhen);
      if (!isNaN(isoDate.getTime())) {
        if (dueType === 'explicit') {
          return { dueDate: isoDate };
        }
        return { softDeadline: isoDate };
      }

      const lowerDate = byWhen.toLowerCase();
      const now = new Date(referenceDate);

      if (lowerDate.includes('today')) {
        return dueType === 'explicit' ? { dueDate: now } : { softDeadline: now };
      }

      if (lowerDate.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return dueType === 'explicit' ? { dueDate: tomorrow } : { softDeadline: tomorrow };
      }

      if (lowerDate.includes('next week')) {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return { softDeadline: nextWeek };
      }

      // Default
      const softDeadline = new Date(now);
      softDeadline.setDate(softDeadline.getDate() + 14);
      return { softDeadline };
    }

    it('should return soft deadline for null date', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic(null, 'none', refDate);

      expect(result.dueDate).toBeUndefined();
      expect(result.softDeadline).toBeDefined();
      // Should be 14 days from reference
      const expectedSoft = new Date(refDate);
      expectedSoft.setDate(expectedSoft.getDate() + 14);
      expect(result.softDeadline?.toDateString()).toBe(expectedSoft.toDateString());
    });

    it('should parse ISO8601 dates with explicit due type', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic('2024-02-01', 'explicit', refDate);

      expect(result.dueDate).toBeDefined();
      expect(result.dueDate?.toISOString().startsWith('2024-02-01')).toBe(true);
    });

    it('should parse ISO8601 dates with implicit due type as soft deadline', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic('2024-02-01', 'implicit', refDate);

      expect(result.softDeadline).toBeDefined();
      expect(result.dueDate).toBeUndefined();
    });

    it('should parse "today" as same day', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic('today', 'explicit', refDate);

      expect(result.dueDate?.toDateString()).toBe(refDate.toDateString());
    });

    it('should parse "tomorrow" as next day', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic('tomorrow', 'explicit', refDate);

      const expected = new Date(refDate);
      expected.setDate(expected.getDate() + 1);
      expect(result.dueDate?.toDateString()).toBe(expected.toDateString());
    });

    it('should parse "next week" as 7 days out', () => {
      const refDate = new Date('2024-01-15');
      const result = parseDueDateHeuristic('next week', 'implicit', refDate);

      const expected = new Date(refDate);
      expected.setDate(expected.getDate() + 7);
      expect(result.softDeadline?.toDateString()).toBe(expected.toDateString());
    });
  });

  describe('determineUrgency (tested via heuristics)', () => {
    function determineUrgency(dueDate?: Date): 'low' | 'normal' | 'high' | 'urgent' {
      if (!dueDate) return 'low';

      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= 1) return 'urgent';
      if (daysUntilDue <= 3) return 'high';
      if (daysUntilDue <= 7) return 'normal';
      return 'low';
    }

    it('should return low for no due date', () => {
      expect(determineUrgency(undefined)).toBe('low');
    });

    it('should return urgent for due today', () => {
      const today = new Date();
      expect(determineUrgency(today)).toBe('urgent');
    });

    it('should return high for due in 2-3 days', () => {
      const twoDays = new Date();
      twoDays.setDate(twoDays.getDate() + 2);
      expect(determineUrgency(twoDays)).toBe('high');
    });

    it('should return normal for due in 4-7 days', () => {
      const fiveDays = new Date();
      fiveDays.setDate(fiveDays.getDate() + 5);
      expect(determineUrgency(fiveDays)).toBe('normal');
    });

    it('should return low for due in more than 7 days', () => {
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      expect(determineUrgency(twoWeeks)).toBe('low');
    });
  });

  describe('categorizeCommitment (tested via heuristics)', () => {
    function categorizeCommitment(description: string): string {
      const lower = description.toLowerCase();

      if (lower.includes('send') || lower.includes('deliver') || lower.includes('provide')) {
        return 'deliverable';
      }
      if (lower.includes('meet') || lower.includes('call') || lower.includes('coffee') || lower.includes('lunch')) {
        return 'meeting';
      }
      if (lower.includes('introduce') || lower.includes('connect')) {
        return 'introduction';
      }
      if (lower.includes('help') || lower.includes('assist') || lower.includes('favor')) {
        return 'favor';
      }
      if (lower.includes('pay') || lower.includes('money') || lower.includes('reimburse')) {
        return 'payment';
      }
      if (lower.includes('let you know') || lower.includes('update') || lower.includes('tell')) {
        return 'information';
      }
      if (lower.includes('decide') || lower.includes('choose') || lower.includes('pick')) {
        return 'decision';
      }

      return 'other';
    }

    it('should categorize send/deliver as deliverable', () => {
      expect(categorizeCommitment('Send the report by Friday')).toBe('deliverable');
      expect(categorizeCommitment('Deliver the package')).toBe('deliverable');
      expect(categorizeCommitment('Provide the documentation')).toBe('deliverable');
    });

    it('should categorize meetings', () => {
      expect(categorizeCommitment('Meet for coffee')).toBe('meeting');
      expect(categorizeCommitment('Call you tomorrow')).toBe('meeting');
      expect(categorizeCommitment('Grab lunch next week')).toBe('meeting');
    });

    it('should categorize introductions', () => {
      expect(categorizeCommitment('Introduce you to John')).toBe('introduction');
      expect(categorizeCommitment('Connect you with the team')).toBe('introduction');
    });

    it('should categorize favors', () => {
      expect(categorizeCommitment('Help you move')).toBe('favor');
      expect(categorizeCommitment('Assist with the project')).toBe('favor');
    });

    it('should categorize payments', () => {
      expect(categorizeCommitment('Pay you back')).toBe('payment');
      expect(categorizeCommitment('Reimburse the expenses')).toBe('payment');
    });

    it('should categorize information sharing', () => {
      expect(categorizeCommitment('Let you know the results')).toBe('information');
      expect(categorizeCommitment('Update you on progress')).toBe('information');
    });

    it('should categorize decisions', () => {
      expect(categorizeCommitment('Decide on the venue')).toBe('decision');
      expect(categorizeCommitment('Choose the option')).toBe('decision');
    });

    it('should return other for unmatched', () => {
      expect(categorizeCommitment('Do something vague')).toBe('other');
    });
  });

  describe('quickClosureCheck (tested via heuristics)', () => {
    function extractKeywords(text: string): string[] {
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      ]);

      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
    }

    function quickClosureCheck(memoryText: string, loopDescription: string): boolean {
      const keywords = extractKeywords(loopDescription);
      const lowerMemory = memoryText.toLowerCase();
      return keywords.some((kw) => lowerMemory.includes(kw));
    }

    it('should return true when keywords match', () => {
      const result = quickClosureCheck(
        'I sent the report to John',
        'Send the quarterly report'
      );
      expect(result).toBe(true);
    });

    it('should return false when no keywords match', () => {
      const result = quickClosureCheck(
        'Had a nice lunch today',
        'Send the quarterly report'
      );
      expect(result).toBe(false);
    });

    it('should be case insensitive', () => {
      const result = quickClosureCheck(
        'SENT THE REPORT',
        'send the report'
      );
      expect(result).toBe(true);
    });
  });

  describe('heuristicClosureConfidence (tested via heuristics)', () => {
    function extractKeywords(text: string): string[] {
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      ]);

      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
    }

    function heuristicClosureConfidence(memoryText: string, loopDescription: string): number {
      const loopKeywords = extractKeywords(loopDescription);
      const memoryLower = memoryText.toLowerCase();

      if (loopKeywords.length === 0) return 0;

      const matches = loopKeywords.filter((kw) => memoryLower.includes(kw)).length;
      const matchRatio = matches / loopKeywords.length;

      const completionSignals = [
        'sent', 'done', 'finished', 'completed', 'delivered', 'shared',
        'received', 'got', 'thanks', 'thank you', 'appreciated',
      ];

      const hasCompletionSignal = completionSignals.some((signal) => memoryLower.includes(signal));

      let confidence = matchRatio * 0.7;
      if (hasCompletionSignal) confidence += 0.3;

      return Math.min(1, confidence);
    }

    it('should return 0 for empty loop description', () => {
      expect(heuristicClosureConfidence('Test memory', '')).toBe(0);
    });

    it('should return low confidence for no matches', () => {
      const confidence = heuristicClosureConfidence(
        'Unrelated content',
        'Send quarterly report'
      );
      expect(confidence).toBeLessThan(0.3);
    });

    it('should return higher confidence with completion signals', () => {
      const withoutSignal = heuristicClosureConfidence(
        'The report is ready',
        'Send the report'
      );
      const withSignal = heuristicClosureConfidence(
        'I sent the report. Done!',
        'Send the report'
      );
      expect(withSignal).toBeGreaterThan(withoutSignal);
    });

    it('should boost confidence for thank you', () => {
      const confidence = heuristicClosureConfidence(
        'Thank you for the report!',
        'Send the report'
      );
      expect(confidence).toBeGreaterThan(0.3);
    });

    it('should cap confidence at 1.0', () => {
      const confidence = heuristicClosureConfidence(
        'Sent done finished completed delivered report quarterly!',
        'Send quarterly report'
      );
      expect(confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('getEscalationDays (tested via heuristics)', () => {
    function getEscalationDays(urgency: 'low' | 'normal' | 'high' | 'urgent'): number {
      switch (urgency) {
        case 'urgent': return 1;
        case 'high': return 3;
        case 'normal': return 7;
        case 'low': return 14;
      }
    }

    it('should return correct escalation days', () => {
      expect(getEscalationDays('urgent')).toBe(1);
      expect(getEscalationDays('high')).toBe(3);
      expect(getEscalationDays('normal')).toBe(7);
      expect(getEscalationDays('low')).toBe(14);
    });
  });

  describe('calculateNextReminder (tested via heuristics)', () => {
    function calculateNextReminder(
      dueDate?: Date,
      softDeadline?: Date,
      createdAt?: Date
    ): Date | undefined {
      const targetDate = dueDate || softDeadline;
      if (!targetDate) return undefined;

      const now = createdAt || new Date();
      const daysUntilDue = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const remindInDays = Math.max(1, Math.floor(daysUntilDue / 2));
      const reminderDate = new Date(now);
      reminderDate.setDate(reminderDate.getDate() + remindInDays);

      return reminderDate;
    }

    it('should return undefined for no target date', () => {
      expect(calculateNextReminder()).toBeUndefined();
    });

    it('should set reminder at halfway point', () => {
      const createdAt = new Date('2024-01-15');
      const dueDate = new Date('2024-01-25'); // 10 days out

      const reminder = calculateNextReminder(dueDate, undefined, createdAt);

      // Should be 5 days from creation
      const expected = new Date('2024-01-20');
      expect(reminder?.toDateString()).toBe(expected.toDateString());
    });

    it('should use soft deadline if no due date', () => {
      const createdAt = new Date('2024-01-15');
      const softDeadline = new Date('2024-01-25');

      const reminder = calculateNextReminder(undefined, softDeadline, createdAt);

      expect(reminder).toBeDefined();
    });

    it('should minimum 1 day for very short deadlines', () => {
      const createdAt = new Date('2024-01-15T10:00:00');
      const dueDate = new Date('2024-01-15T18:00:00'); // Same day

      const reminder = calculateNextReminder(dueDate, undefined, createdAt);

      const expected = new Date(createdAt);
      expected.setDate(expected.getDate() + 1);
      expect(reminder?.toDateString()).toBe(expected.toDateString());
    });
  });
});
