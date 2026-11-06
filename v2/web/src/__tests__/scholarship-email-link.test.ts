import { describe, expect, it } from 'vitest';
import { scholarshipDeadlineEmail } from '@/lib/email-templates';

const fixture = { name: 'Beca de prueba', provider: 'Universidad', daysLeft: 1,
  deadline: '2026-10-01', becaUrl: 'https://franky.es/becas/prueba' };
describe('scholarship official email destination', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.test/', 'malformed'])('omits unsafe official link %s', officialUrl => {
    const email = scholarshipDeadlineEmail({ ...fixture, officialUrl });
    const body = new DOMParser().parseFromString(email.html, 'text/html');
    expect([...body.querySelectorAll('a')].some(link => link.href === officialUrl)).toBe(false);
    expect(email.text).not.toContain('Solicitud oficial:');
  });
  it('keeps a valid official URL and escapes its attribute', () => {
    const officialUrl = 'https://universidad.example.test/solicitar?name=" onmouseover="alert(1)';
    const email = scholarshipDeadlineEmail({ ...fixture, officialUrl });
    const body = new DOMParser().parseFromString(email.html, 'text/html');
    expect(body.querySelector('[onmouseover]')).toBeNull();
    expect([...body.querySelectorAll('a')].some(link => link.href === new URL(officialUrl).href)).toBe(true);
  });
});
