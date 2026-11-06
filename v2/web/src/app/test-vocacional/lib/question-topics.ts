// Historical questions remain in the bank so drafts can still be restored.
// Equivalent questions are asked once and only the latest answer is scored.
const TOPICS: Record<string, string> = {
  q4_uni_campus: 'campus_environment',
  q4_12: 'campus_environment',
};

export function questionTopic(id: string): string {
  return TOPICS[id] ?? id;
}
