import { describe, expect, it } from 'vitest';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';
import { resolveQuizStep, REQUIRED_PRACTICAL_QUESTIONS } from '@/app/test-vocacional/lib/quiz-flow';
import { decodeQuizDraft, encodeQuizDraft, type AnswerEntry } from '@/app/test-vocacional/lib/quiz-draft';
import { getEstimatedTotal, STAGE_FLOW } from '@/app/test-vocacional/lib/adaptive-selector';
import type { QuizStage } from '@/app/test-vocacional/types';

const livePath = [
  ['En un equipo, ¿qué papel encaja más contigo?', 'mantiene buen rollo'],
  ['Si pudieras elegir UN superpoder profesional, ¿cuál sería?', 'ayude a miles'],
  ['Estás zapeando y un documental te engancha. ¿Cuál de estos?', 'corazón abierto'],
  ['Lo más importante para ti en una carrera es…', 'Tener impacto'],
  ['Sin pensar en dinero ni nota, ¿qué tipo de día de trabajo te molaría?', 'hospital o consulta'],
  ['¿Te ves trabajando o estudiando en el extranjero algún día?', 'un Erasmus'],
  ['¿Te ves más como tu propio jefe o como empleado?', 'algo público o estable'],
  ['De estas asignaturas, ¿cuáles te resultan más fáciles o te gustan más?', 'Biología / Química'],
  ['¿Te imaginas haciendo un DOBLE GRADO?', 'grado simple'],
  ['Si tuvieras que elegir AHORA una rama del conocimiento, ¿cuál?', 'Ciencias de la Salud'],
  ['¿Pacientes o laboratorio?', 'Pacientes:'],
  ['¿Cómo te llevas con el cuerpo humano?', 'Me fascina'],
  ['En una serie médica, ¿qué papel te gustaría hacer?', 'médico que diagnostica'],
  ['¿Cómo te gustaría ayudar a los demás?', 'problemas emocionales'],
  ['¿Desde dónde te gustaría ayudar a cambiar las cosas?', 'una ONG'],
  ['¿Qué área de la salud te interesa más?', 'Salud mental'],
  ['¿Te atrae más analizar datos o construir sistemas?', 'Analizar datos'],
  ['¿Qué tipo de investigación te fliparía más?', 'La vida a nivel celular'],
  ['¿Con animales o con personas?', 'Prefiero personas'],
  ['¿Con qué edades te gustaría trabajar?', 'Con adultos'],
];

describe('adaptive quiz reaches practical constraints before completing', () => {
  it('continues the real 20-answer health path when stage 2 runs out of eligible questions', () => {
    const history: AnswerEntry[] = livePath.map(([text, optionText]) => {
      const question = QUESTION_BANK.find(q => q.text === text)!;
      expect(question, text).toBeDefined();
      const options = question.options.filter(o => o.text.includes(optionText));
      expect(options, optionText).toHaveLength(1);
      return { questionId: question.id, option: options[0], stage: question.stage };
    });
    const replay = replayAnswers(history);
    expect(replay.profile.pragmatico.presupuesto).toBe(0);
    const step = resolveQuizStep(replay.profile, new Set(replay.answeredIds), 2, QUESTION_BANK, replay.recentDims);
    expect(step.complete).toBe(false);
    expect(step.stage).toBe(3);
    expect(step.question?.stage).toBe(3);
    const restored = decodeQuizDraft(encodeQuizDraft(history));
    expect(restored?.history).toHaveLength(20);
    expect(restored?.stage).toBe(3);
  });

  it.each(Array.from({ length: 16 }, (_, seed) => seed))('finishes a varied full route, preserves the draft and asks all practical questions (seed %i)', seed => {
    const history: AnswerEntry[] = [];
    const stages = new Set<QuizStage>();
    let stage: QuizStage = 1;
    let complete = false;
    for (let n = 0; n < 80; n++) {
      const replay = replayAnswers(history);
      const step = resolveQuizStep(replay.profile, new Set(replay.answeredIds), stage, QUESTION_BANK, replay.recentDims);
      stage = step.stage;
      if (step.complete) { complete = true; break; }
      expect(step.question).not.toBeNull();
      const question = step.question!;
      stages.add(stage);
      const index = (seed * 17 + n * 7) % question.options.length;
      history.push({ questionId: question.id, option: question.options[index], stage });
      const restored = decodeQuizDraft(encodeQuizDraft(history));
      expect(restored?.history).toHaveLength(history.length);
      expect(replayAnswers(restored!.history).profile).toEqual(replayAnswers(history).profile);
    }
    expect(complete).toBe(true);
    expect(stages).toEqual(new Set(STAGE_FLOW));
    expect(history.length).toBeLessThanOrEqual(getEstimatedTotal());
    for (const id of REQUIRED_PRACTICAL_QUESTIONS) expect(history.some(entry => entry.questionId === id)).toBe(true);
    expect(replayAnswers(history).profile.pragmatico.presupuesto).toBeGreaterThan(0);
  });

  it('does not use the 50-question cap to bypass unanswered practical questions', () => {
    const answered = new Set(Array.from({ length: 50 }, (_, n) => `fixture-${n}`));
    const step = resolveQuizStep(replayAnswers([]).profile, answered, 4, QUESTION_BANK);
    expect(step.complete).toBe(false);
    expect(step.question?.id).toBe('q4_01');
  });
});
