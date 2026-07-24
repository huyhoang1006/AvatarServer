/**
 * Minimal HTML pages served by OAuthController. Template literals keep this self-contained
 * (no template engine dependency). Always HTML-escape any dynamic value before interpolation.
 */
function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

const BASE_CSS = `
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
       max-width:480px;margin:60px auto;padding:0 20px;text-align:center;color:#222}
  h1{margin:0 0 20px;font-size:28px}
  p{color:#666;line-height:1.6}
  .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .btn{display:block;width:100%;padding:14px;margin:10px 0;border:0;border-radius:8px;
       font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;color:#fff;
       transition:transform .1s,opacity .1s}
  .btn:hover{transform:translateY(-1px);opacity:.95}
  .google{background:#4285f4}
  .facebook{background:#1877f2}
  .code{background:#f5f5f5;padding:14px;border-radius:8px;font-family:Menlo,Monaco,monospace;
         font-size:20px;letter-spacing:2px;margin:20px 0;font-weight:700}
  .muted{color:#999;font-size:13px;margin-top:24px}
  .ok{color:#22a06b;font-size:48px;margin-bottom:16px}
`;

export function renderChooser(code: string, errorMsg?: string): string {
  const c = esc(code);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avatar Farm · Đăng nhập</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="card">
  <h1>🎮 Avatar Farm</h1>
  <p>Vui lòng chọn cách đăng nhập trên thiết bị này.</p>
  <div class="code">${c}</div>
  ${errorMsg ? `<p style="color:#c0392b">${esc(errorMsg)}</p>` : ''}
  <a class="btn google" href="/auth/google/login?state=${c}">Đăng nhập với Google</a>
  <a class="btn facebook" href="/auth/facebook/login?state=${c}">Đăng nhập với Facebook</a>
  <p class="muted">Code tự hết hạn sau 10 phút. Không cần nhập lại — chỉ cần hoàn tất đăng nhập.</p>
</div>
</body>
</html>`;
}

export function renderDone(opts: {
  success: boolean;
  mode: 'login' | 'link';
  provider?: string;
  error?: string;
}): string {
  const { success, mode, provider, error } = opts;
  const headline = !success
    ? '❌ Đăng nhập thất bại'
    : mode === 'link'
    ? `🔗 Đã liên kết ${provider ?? 'tài khoản'}`
    : '✅ Đăng nhập thành công!';
  const sub = !success
    ? esc(error ?? 'Đã có lỗi xảy ra. Vui lòng thử lại trong game.')
    : 'Bạn có thể quay lại game rồi.';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avatar Farm · ${success ? 'OK' : 'Lỗi'}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="card">
  ${success ? '<div class="ok">✓</div>' : ''}
  <h1>${headline}</h1>
  <p>${sub}</p>
  <p class="muted">Bạn có thể đóng tab này.</p>
</div>
<script>
  // Best-effort: close the tab after a short delay if it was opened by the game
  setTimeout(function() { try { window.close(); } catch(e) {} }, 1500);
</script>
</body>
</html>`;
}
