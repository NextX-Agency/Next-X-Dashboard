/**
 * NextX no longer sells watches. Old watch links answer 410 Gone instead of
 * redirecting to an unrelated audio page: the product is retired, and search
 * engines should drop the URL rather than transfer it to something else.
 * Watch history stays available to staff inside the dashboard.
 */
const RETIRED_PAGE = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Horloges niet meer beschikbaar | NextX</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fafaf8;color:#1b1a18;font:16px/1.55 system-ui,sans-serif}
main{max-width:34rem;padding:2rem 1.25rem}
h1{font-size:1.6rem;line-height:1.2;margin:0 0 .75rem}
p{margin:0 0 1.25rem;color:#4a4742}
a{display:inline-block;background:#c45200;color:#fff;padding:.75rem 1.25rem;border-radius:999px;font-weight:600;text-decoration:none}
a:focus-visible{outline:3px solid #1b1a18;outline-offset:3px}
</style>
</head>
<body>
<main>
<h1>NextX verkoopt geen horloges meer</h1>
<p>Deze pagina bestaat niet meer. Bekijk in de winkel wat NextX nu verkoopt.</p>
<a href="/shop">Bekijk de collectie</a>
</main>
</body>
</html>`;

function retired(includeBody: boolean): Response {
  return new Response(includeBody ? RETIRED_PAGE : null, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export function GET(): Response {
  return retired(true);
}

export function HEAD(): Response {
  return retired(false);
}
