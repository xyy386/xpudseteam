import json
import urllib.error
import urllib.request

base = "http://localhost:5173"
owner = "__sites_local_auth=1"
email = "identity-priority-qa@example.invalid"
member_id = None


def call(path, method="GET", body=None, cookie=None):
    headers = {"Cookie": cookie} if cookie else {}
    data = None
    if body is not None:
        headers.update({"Origin": base, "Content-Type": "application/json"})
        data = json.dumps(body).encode()
    elif method != "GET":
        headers["Origin"] = base
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read()
        try:
            parsed = json.loads(payload)
        except (ValueError, UnicodeDecodeError):
            parsed = None
        return response.status, response.headers, payload, parsed


try:
    assert call("/api/editor-members", cookie=owner)[0] == 200
    status, _, _, created = call("/api/editor-members", "POST", {"email": email, "days": 1}, owner)
    assert status == 200, (status, created)
    member_id = created["member"]["id"]
    password = created["initialPassword"]

    status, headers, _, _ = call("/api/editor-session", "POST", {"email": email, "password": password}, owner)
    assert status == 200, status
    session_cookies = headers.get_all("Set-Cookie")
    member = next(cookie.split(";", 1)[0] for cookie in session_cookies if cookie.startswith("research_editor_session="))
    mode = next(cookie.split(";", 1)[0] for cookie in session_cookies if cookie.startswith("research_editor_mode="))
    both = owner + "; " + member + "; " + mode

    status, _, html, _ = call("/edit", cookie=both)
    assert status == 200 and email.encode() in html, status
    assert call("/api/site-content", cookie=both)[0] == 200
    assert call("/api/editor-members", cookie=both)[0] == 403
    assert call("/api/editor-members", "POST", {"email": "blocked@example.invalid", "days": 1}, both)[0] == 403
    status, _, html, _ = call("/editor-members", cookie=both)
    assert status == 200 and "仅管理员可管理成员".encode() in html, status
    status, _, html, _ = call("/editor-login", cookie=both)
    assert status == 200 and "退出成员账号并切换身份".encode() in html, status

    next_password = "identity-qa-next-password-123"
    status, headers, _, _ = call("/api/editor-session", "PATCH", {"current": password, "next": next_password}, both)
    assert status == 200 and "Set-Cookie" not in headers, status
    assert call("/api/site-content", cookie=both)[0] == 403
    assert call("/api/editor-members", cookie=both)[0] == 403
    assert call("/api/editor-members", cookie=owner + "; " + mode)[0] == 403
    status, _, html, _ = call("/editor-login", cookie=owner + "; " + mode)
    assert status == 200 and "退出成员账号并切换身份".encode() in html, status
    status, _, html, _ = call("/editor-login", cookie=both)
    assert status == 200 and "成员会话已失效".encode() in html, status

    status, headers, _, _ = call("/api/editor-session", "POST", {"email": email, "password": next_password}, both)
    assert status == 200, status
    member = next(cookie.split(";", 1)[0] for cookie in headers.get_all("Set-Cookie") if cookie.startswith("research_editor_session="))
    both = owner + "; " + member + "; " + mode
    assert call("/api/site-content", cookie=both)[0] == 200
    assert call("/api/editor-members", cookie=both)[0] == 403

    status, _, _, _ = call("/api/editor-members", "PATCH", {"id": member_id, "action": "revoke"}, owner)
    assert status == 200, status
    assert call("/api/site-content", cookie=both)[0] == 403
    assert call("/api/editor-members", cookie=both)[0] == 403
    status, _, html, _ = call("/editor-login", cookie=both)
    assert status == 200 and "成员会话已失效".encode() in html, status

    status, headers, _, _ = call("/api/editor-session", "DELETE", cookie=both)
    assert status == 200 and len([cookie for cookie in headers.get_all("Set-Cookie") if "Max-Age=0" in cookie]) == 2, status
    assert call("/api/editor-members", cookie=owner)[0] == 200
    assert call("/edit", cookie=owner)[0] == 200
    print("owner/member identity priority PASS")
finally:
    if member_id:
        print("cleanup", call("/api/editor-members", "DELETE", {"id": member_id}, owner)[0])
