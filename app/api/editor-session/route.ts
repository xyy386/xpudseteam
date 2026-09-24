import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { changeMemberPassword, clearSessionCookie, getEditorIdentity, loginMember, logoutMember, memberModeCookie, normalizedEmail, sameOrigin, SESSION_COOKIE, validPassword } from "../../editor-credentials";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = normalizedEmail(body.email);
    if (!email || typeof body.password !== "string") return Response.json({ error: "邮箱或密码不正确" }, { status: 400 });
    const cookie = await loginMember(email, body.password, request);
    if (!cookie) return Response.json({ error: "邮箱或密码不正确，或账号已过期、被停用" }, { status: 401 });
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", memberModeCookie(request));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Member login failed", error);
    return Response.json({ error: "登录暂时不可用，请稍后重试" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const identity = await getEditorIdentity();
  if (!identity || identity.role !== "member") return Response.json({ error: "请先登录成员账号" }, { status: 403 });
  try {
    const body = await request.json() as { current?: unknown; next?: unknown };
    if (typeof body.current !== "string" || !validPassword(body.next)) return Response.json({ error: "新密码至少 12 位，最多 128 位" }, { status: 400 });
    const changed = await changeMemberPassword(identity, body.current, body.next);
    if (!changed) return Response.json({ error: "当前密码不正确，请重试" }, { status: 400 });
    // Keep the now-invalid member cookie until an explicit logout or new member login.
    // Clearing it here would silently reveal a still-signed-in ChatGPT owner session.
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Password change failed", error);
    return Response.json({ error: "修改密码失败，请重试" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    if (env.DB) await logoutMember(token);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearSessionCookie(request));
    headers.append("Set-Cookie", memberModeCookie(request, 0));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Member logout failed", error);
    return Response.json({ error: "退出失败，请重试" }, { status: 503 });
  }
}
