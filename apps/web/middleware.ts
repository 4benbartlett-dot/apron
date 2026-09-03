import { NextResponse, type NextRequest } from "next/server";

/**
 * A door on the front office. The admin is already off in production unless
 * APRON_ADMIN=1 (lib/admin/gate.ts); when it IS on somewhere reachable, set
 * APRON_ADMIN_PASSWORD and every /admin request must carry it as HTTP Basic
 * auth (the browser prompts once and remembers). No password set = no prompt,
 * which is the local-dev default. The user name is not checked.
 */
export function middleware(req: NextRequest) {
  const password = process.env.APRON_ADMIN_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return NextResponse.next();
  }
  return new NextResponse("The front office needs a password.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Over the Apron front office", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
