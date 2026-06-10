"""
App đăng nhập Gemini cho VIDEO_PROVIDER=gemini_session — CHẠY TRÊN MÁY NGƯỜI DÙNG (Windows).

Dành cho người không rành kỹ thuật: bấm đúp file .exe (xem hướng dẫn build bên dưới).
Một cửa sổ trình duyệt mở ra trang Gemini → bạn ĐĂNG NHẬP GOOGLE BÌNH THƯỜNG BẰNG TAY
(mật khẩu, 2FA, CAPTCHA — vì là người thật nên qua được). Đăng nhập xong, app tự lấy
cookie phiên và GỬI LÊN ỨNG DỤNG (backend) để lưu mã hoá. Bạn không cần đụng tới cookie.

Chạy bản script (dev):
    pip install playwright
    playwright install chromium
    python gemini_login.py

Đóng gói thành 1 file .exe (cho người dùng cuối) — cần đã cài Google Chrome trên máy:
    pip install pyinstaller playwright
    pyinstaller --onefile --collect-all playwright gemini_login.py
    # => dist/gemini_login.exe — gửi file này cho người dùng, họ chỉ bấm đúp.

Backend mặc định http://localhost:3001 — đổi bằng biến môi trường BACKEND_URL nếu cần.
"""

import os
import sys
import time
import json
import urllib.request

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001").rstrip("/")
GEMINI_URL = "https://gemini.google.com/app"
COOKIE_NAMES = ("__Secure-1PSID", "__Secure-1PSIDTS")
POLL_TIMEOUT_SEC = int(os.getenv("LOGIN_TIMEOUT_SEC", "300"))


def send_to_backend(psid: str, psidts: str) -> None:
    """Gửi cookie phiên lên backend để lưu (mã hoá) — worker sẽ dùng để sinh video."""
    data = json.dumps({"psid": psid, "psidts": psidts}).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/v1/api-keys/session",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"backend trả HTTP {resp.status}")


def capture_cookies() -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Chưa cài Playwright. Chạy:\n  pip install playwright\n  playwright install chromium")
        return {}

    with sync_playwright() as p:
        # Ưu tiên Chrome thật (Google ít nghi ngờ automation hơn); fallback Chromium của Playwright.
        # Ẩn dấu hiệu automation — Google chặn login nếu phát hiện browser bị điều khiển.
        stealth_args = ["--disable-blink-features=AutomationControlled"]
        ignore = ["--enable-automation"]
        try:
            browser = p.chromium.launch(headless=False, channel="chrome", args=stealth_args, ignore_default_args=ignore)
        except Exception:
            browser = p.chromium.launch(headless=False, args=stealth_args, ignore_default_args=ignore)
        context = browser.new_context()
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        context.new_page().goto(GEMINI_URL)

        print(f"Hãy đăng nhập Google trong cửa sổ vừa mở. Đang chờ tối đa {POLL_TIMEOUT_SEC}s...")
        deadline = time.time() + POLL_TIMEOUT_SEC
        while time.time() < deadline:
            found = {c["name"]: c["value"] for c in context.cookies() if c["name"] in COOKIE_NAMES}
            if all(found.get(name) for name in COOKIE_NAMES):
                browser.close()
                return found
            time.sleep(2)
        browser.close()
        return {}


def main() -> int:
    cookies = capture_cookies()
    if not cookies:
        print("Hết thời gian chờ — chưa phát hiện đăng nhập. Hãy chạy lại và đăng nhập đầy đủ.")
        return 1

    try:
        send_to_backend(cookies["__Secure-1PSID"], cookies["__Secure-1PSIDTS"])
    except Exception as e:
        print(f"Gửi lên ứng dụng thất bại: {e}\nỨng dụng (backend) có đang chạy ở {BACKEND_URL} không?")
        return 1

    print("Đã kết nối tài khoản Gemini với ứng dụng. Bạn có thể đóng cửa sổ này.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
