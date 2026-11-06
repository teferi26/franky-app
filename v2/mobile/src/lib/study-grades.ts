import { studyStorage, type SessionIdentity } from './study-storage';
import { scheduleCloudSync } from './study';

export type StudyGrade = { id: string; name: string; credits: number; grade: number };
const KEY = 'franky.notamedia.v1';

async function read(owner: SessionIdentity): Promise<StudyGrade[]> {
  const raw = await studyStorage.get(owner, KEY);
  const value: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(value)) throw new Error('invalid_grades');
  return value as StudyGrade[];
}
export function getStudyGrades(owner: SessionIdentity): Promise<StudyGrade[]> {
  return studyStorage.mutate(owner, () => read(owner));
}
async function edit(owner: SessionIdentity, update: (grades: StudyGrade[]) => StudyGrade[]): Promise<StudyGrade[]> {
  return studyStorage.mutate(owner, async () => {
    const next = update(await read(owner));
    await studyStorage.set(owner, KEY, JSON.stringify(next));
    scheduleCloudSync(owner);
    return next;
  });
}
export function addStudyGrade(owner: SessionIdentity, grade: StudyGrade) {
  return edit(owner, previous => [...previous, grade]);
}
export function removeStudyGrade(owner: SessionIdentity, id: string) {
  return edit(owner, previous => previous.filter(grade => grade.id !== id));
}
