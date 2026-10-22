/**
 * Links we are willing to hand to the OS (Linking.openURL).
 *
 * Only plain web links are allowed. Anything else - intent://, file://, tel:,
 * sms:, javascript:, other apps' custom schemes - could launch an arbitrary
 * app or action on the device, so it is refused both when a link is saved and
 * again right before it is opened (rows restored from a backup file never go
 * through the save path).
 */
export const MAX_URL_LENGTH = 2048;

export function isSafeWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  // No whitespace or control characters anywhere in the link
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  const m = /^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);
  if (!m) return false;
  // Refuse user-info ("https://youtube.com@evil.example") - it disguises the real host.
  return !m[1].includes('@');
}
