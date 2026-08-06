const CANONICAL_HOST = 'drift.xbilsenter.no';

export const config = {
  matcher: '/((?!api/|assets/|favicon|robots\\.txt|uploads/).*)'
};

export default function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.vercel.app')) return undefined;

  url.protocol = 'https:';
  url.hostname = CANONICAL_HOST;
  return Response.redirect(url.toString(), 308);
}
