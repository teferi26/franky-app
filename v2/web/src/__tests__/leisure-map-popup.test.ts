import { describe, expect, it } from 'vitest';
import { leisureMapPopup } from '@/lib/leisure-map-popup';

const fixture = { name: 'Local de prueba', city: 'Alicante', category: 'bar', rating: 4.5, image_url: null as string | null };
describe('leisure map listing content', () => {
  it('renders owner-controlled markup as text without creating links or executable elements', () => {
    const payload = '<img src=x onerror=alert(1)><a href="https://attacker.test">enlace</a>';
    const popup = leisureMapPopup({ ...fixture, name: payload, city: payload }, payload);
    expect(popup.querySelector('strong')?.textContent).toBe(payload);
    expect(popup.textContent?.split(payload)).toHaveLength(4);
    expect(popup.querySelectorAll('img,a,script,iframe')).toHaveLength(0);
  });
  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>',
    'https://name:pass@example.test/p.jpg', 'not a URL'])('ignores unsafe image %s', image_url => {
    expect(leisureMapPopup({ ...fixture, image_url }, 'Bar').querySelector('img')).toBeNull();
  });
  it('keeps a valid image and rating without interpreting image URL quotes as attributes', () => {
    const image_url = 'https://images.example.test/photo?caption=" onerror="alert(1)';
    const popup = leisureMapPopup({ ...fixture, image_url }, 'Bar');
    const image = popup.querySelector('img')!;
    expect(image.src).toBe(new URL(image_url).href);
    expect(image.hasAttribute('onerror')).toBe(false);
    expect(popup.textContent).toContain('4.5 / 5');
  });
});
