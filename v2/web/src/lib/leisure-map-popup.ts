/** Leaflet accepts a DOM node: listing data must never become HTML markup. */
export function leisureMapPopup(spot: {
  name: string; city: string; category: string; rating: number | null; image_url: string | null;
}, categoryLabel: string): HTMLDivElement {
  const popup = document.createElement('div');
  popup.style.cssText = 'min-width:180px;font-family:Inter,sans-serif;';
  if (spot.image_url) {
    try {
      const url = new URL(spot.image_url);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
        const image = document.createElement('img');
        image.src = url.href;
        image.alt = '';
        image.style.cssText = 'height:100px;object-fit:cover;border-radius:8px 8px 0 0;margin:-14px -14px 8px -14px;width:calc(100% + 28px);';
        popup.append(image);
      }
    } catch { /* An invalid image never prevents opening the listing. */ }
  }
  const name = document.createElement('strong');
  name.style.cssText = 'font-size:14px;color:#121019;';
  name.textContent = spot.name;
  const city = document.createElement('span');
  city.style.cssText = 'color:#6B5F84;font-size:12px;';
  city.textContent = spot.city;
  popup.append(name, document.createElement('br'), city);
  if (typeof spot.rating === 'number' && Number.isFinite(spot.rating) && spot.rating > 0) {
    const rating = document.createElement('span');
    rating.style.cssText = 'float:right;font-size:12px;color:#6B5F84;font-variant-numeric:tabular-nums;';
    rating.textContent = `${spot.rating} / 5`;
    popup.append(rating);
  }
  const category = document.createElement('span');
  category.style.cssText = 'display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid #E7E3EF;color:#6B5F84;';
  category.textContent = categoryLabel;
  popup.append(document.createElement('br'), category);
  return popup;
}
