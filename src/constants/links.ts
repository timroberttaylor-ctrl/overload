/** Public pages, served by GitHub Pages from the repo's /docs folder. */
const SITE = 'https://timroberttaylor-ctrl.github.io/overload';

export const PRIVACY_URL = `${SITE}/privacy.html`;
export const SUPPORT_URL = `${SITE}/`;

/** New GitHub issue, pre-filled with the app version and OS (nothing personal). */
export function feedbackUrl(appVersion: string, os: string): string {
  const body = `What happened, or what would you like?\n\n\n---\nOVRLD ${appVersion} · ${os}`;
  return `https://github.com/timroberttaylor-ctrl/overload/issues/new?title=${encodeURIComponent('Feedback: ')}&body=${encodeURIComponent(body)}`;
}
