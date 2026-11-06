/** null means cookie authentication; an empty bearer is an invalid credential,
 * never permission to fall back to a different user's cookie. */
export function getRequestBearer(req: { headers: Headers }): string | null {
  const header = req.headers.get('authorization');
  return header !== null && /^bearer(?:\s|$)/i.test(header)
    ? header.replace(/^bearer\s*/i, '').trim()
    : null;
}
