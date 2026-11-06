import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { requireVerifiedEmail } from '@/lib/require-verified-email';
import { validateBody } from '@/lib/api-helpers';
import { basicReply, asksForPrivateInformation } from '@/lib/ai-public';
import { loadPublicContext } from '@/lib/ai-public-context';
import { assistantMessages, validateAssistantReply } from '@/lib/ai-assistant';
import { generateDeepSeekReply, DeepSeekError } from '@/lib/deepseek-server';
import { reserveAiCall, pauseAiProvider } from '@/lib/ai-budget';

export const maxDuration = 30;
const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(6000) }).strict()).max(20).default([]),
  scholarshipId: z.string().uuid().optional(),
}).strict();
const json = (body: unknown) => NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para conversar con Franky.' }, { status: 401 });
  const rl = await rateLimit(request, { key: 'ai-chat', subject: user.id, limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const unverified = await requireVerifiedEmail(supabase, user.id);
  if (unverified) return unverified;
  const parsed = await validateBody(request, bodySchema, { maxBytes: 80_000 });
  if (parsed instanceof NextResponse) return parsed;
  const { message, history, scholarshipId } = parsed;
  if (asksForPrivateInformation(message)) return json(basicReply(message));
  const previousQuestion = history.filter(h => h.role === 'user' && !asksForPrivateInformation(h.content)).slice(-2).map(h => h.content.slice(0, 700)).join(' ');
  const context = await loadPublicContext(message, previousQuestion, scholarshipId);
  const fallback = basicReply(message, context.scholarshipCount, previousQuestion, context.scholarshipId);
  if (!await reserveAiCall(user.id)) return json(fallback);
  try {
    const result = await generateDeepSeekReply(process.env.DEEPSEEK_API_KEY!, assistantMessages(message, history, context));
    return json(validateAssistantReply(result, context) ?? fallback);
  } catch (error) {
    // Malformed/truncated output affects this question only. A user must not be
    // able to pause the shared service by provoking a long or non-JSON answer.
    if (error instanceof DeepSeekError && error.status !== undefined
      && ([401, 402, 429].includes(error.status) || error.status >= 500)) await pauseAiProvider(error.status);
    return json(fallback);
  }
}
