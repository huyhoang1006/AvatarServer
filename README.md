# AvatarServer

Backend server cho game **Avatar Farm** — NestJS + PostgreSQL + Redis + WebSocket.

## 🎯 Tính năng chính

| Bài toán | Giải pháp |
|---|---|
| Đăng nhập / xác thực | JWT (Bearer token) |
| Lưu tiến trình khi thoát giữa chừng | Redis session + grace period + auto-save về Postgres |
| Realtime (chat, world, sync state) | WebSocket thuần (`ws` package) — Godot `WebSocketPeer` kết nối trực tiếp |
| Event tổng / cá nhân | BullMQ cron + Redis Pub/Sub broadcast + Leaderboard (Sorted Set) |
| Inventory / vật phẩm | Postgres + transactional add/remove |

## 🚀 Quick Start

### Cách 1: Docker Compose (khuyến nghị)

```bash
cp .env.example .env
# Sửa JWT_SECRET trong .env thành chuỗi ngẫu nhiên 32+ ký tự
docker compose up -d
```

App sẽ chạy ở `http://localhost:3000`, Postgres ở `5432`, Redis ở `6379`.

### Cách 2: Chạy local (Node + Postgres + Redis cài sẵn)

```bash
cp .env.example .env
npm install
npm run start:dev
```

Lần đầu khởi động, TypeORM `synchronize=true` sẽ tự tạo schema. Khi lên prod, set `DB_SYNCHRONIZE=false` và dùng migrations:

```bash
npm run db:migrate
```

## 📡 HTTP API

Tất cả endpoint `/users`, `/inventory`, `/events/:code/score`, ... cần header:
```
Authorization: Bearer <accessToken>
```

### Auth

```bash
# Register (local)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

# Login (local)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
# → { "accessToken": "eyJ...", "user": { "id": 1, "username": "alice", ... } }
```

### OAuth (device flow)

```bash
# 1. Lấy device code
curl -X POST http://localhost:3000/auth/device/start \
  -H "Content-Type: application/json" \
  -d '{"mode":"login"}'
# → { "deviceCode": "ABCD-1234", "verificationUri": "http://localhost:3000/auth/oauth?code=ABCD-1234", "expiresIn": 600, "interval": 2 }

# 2. Mở verificationUri trong browser, hoàn tất đăng nhập Google/FB

# 3. Poll
curl -X POST http://localhost:3000/auth/device/poll \
  -H "Content-Type: application/json" \
  -d '{"deviceCode":"ABCD-1234"}'
# → { "status": "ready", "accessToken": "eyJ...", "user": { ... } }
```

### Users

```bash
# Lấy profile hiện tại
curl http://localhost:3000/users/me -H "Authorization: Bearer $TOKEN"

# Update data tuỳ ý (JSON)
curl -X PATCH http://localhost:3000/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": 100, "level": 2, "data": {"skin": "dragon"}}'
```

### Inventory

```bash
curl -X POST http://localhost:3000/inventory \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemId":"seed_apple","quantity":5}'
```

### Events

```bash
# Tạo event (admin)
curl -X POST http://localhost:3000/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "summer_2026",
    "name": "Mùa Hè Sôi Động",
    "startAt": "2026-08-01T00:00:00Z",
    "endAt": "2026-08-07T23:59:59Z",
    "config": { "points": 10 }
  }'

# Ghi điểm trong event (player)
curl -X POST http://localhost:3000/events/summer_2026/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"harvest","payload":{"crop":"apple"}}'

# Xem leaderboard
curl http://localhost:3000/events/summer_2026/leaderboard
```

## 🔐 Đăng nhập / Liên kết tài khoản

Hỗ trợ 3 phương thức, **một user có thể liên kết nhiều provider**:

| Phương thức | Cách dùng |
|---|---|
| **Local** (username + password) | `POST /auth/register` hoặc `POST /auth/login` |
| **Google** | Device code flow: `POST /auth/device/start` → mở browser → poll |
| **Facebook** | Device code flow: `POST /auth/device/start` → mở browser → poll |

### Flow OAuth chi tiết (Google & Facebook giống nhau)

```
[Godot] POST /auth/device/start { mode: "login" }
        ← { deviceCode: "ABCD-1234", verificationUri: "https://server/auth/oauth?code=ABCD-1234" }

[Godot] mở verificationUri trong browser bằng OS.shell_open()
[Browser] /auth/oauth?code=ABCD-1234 → trang chọn provider → bấm "Google"
[Browser] redirect sang Google → user đăng nhập xong → redirect về /auth/google/callback?state=ABCD-1234
[Server] tìm user (theo provider_user_id HOẶC auto-link theo email), tạo JWT, lưu Redis dưới device code
[Browser] redirect sang /auth/done?code=ABCD-1234&mode=login → hiển thị "Đăng nhập thành công"

[Godot] POST /auth/device/poll { deviceCode }  mỗi 2s
        ← { status: "pending" }            ...lặp lại...
        ← { status: "ready", accessToken, user }   ← xong! connect WS như bình thường
```

### Auto-link theo email

Nếu user từng đăng ký local với email `alice@gmail.com`, sau đó đăng nhập bằng Google cùng email đó → server **tự động liên kết** Google vào cùng user. Không cần thao tác thủ công.

### Liên kết thêm provider sau khi đã đăng nhập

```bash
# 1. Lấy device code ở mode "link" (cần JWT hiện tại)
curl -X POST http://localhost:3000/auth/device/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"link"}'
→ { deviceCode, verificationUri, ... }

# 2. Mở URL, hoàn tất OAuth
# 3. Poll → trả về { status: "linked", provider: "google" }

# Xem các provider đã liên kết
curl http://localhost:3000/auth/identities -H "Authorization: Bearer $TOKEN"
→ { "providers": ["local", "google"] }

# Gỡ liên kết (giữ lại ít nhất 1 provider)
curl -X DELETE http://localhost:3000/auth/identities/facebook \
  -H "Authorization: Bearer $TOKEN"
```

### Cấu hình Google / Facebook

Xem chi tiết trong `.env.example`. Tóm tắt:

**Google:**
1. https://console.cloud.google.com/ → tạo project → APIs & Services → Credentials
2. Create OAuth Client ID (Web application)
3. Authorized redirect URIs: `https://yourdomain.com/auth/google/callback`
4. Copy `Client ID` + `Client Secret` → `.env`

**Facebook:**
1. https://developers.facebook.com/ → tạo app → Settings → Basic
2. Copy `App ID` + `App Secret` → `.env`
3. Settings → Valid OAuth Redirect URIs: `https://yourdomain.com/auth/facebook/callback`
4. Bật chế độ Live hoặc thêm tester trong Roles

Nếu chưa cấu hình OAuth, server vẫn chạy bình thường — chỉ là các nút Google/Facebook sẽ không hoạt động.



Endpoint: `ws://localhost:3000/ws?token=<JWT>` (hoặc gửi `auth` message đầu tiên).

Mọi message là JSON. Một số message có cả **request-reply** (kết quả trả về cho client gửi) và **server broadcast** (server đẩy về mọi client).

### Client → Server

| type | payload | mục đích |
|---|---|---|
| `auth` | `{ token }` | Xác thực, khởi tạo session |
| `patch` | `{ state: { scene, position, farmData } }` | Cập nhật state đang chơi (Redis only) |
| `save` | `{}` | Flush state từ Redis → Postgres |
| `ping` | `{ t }` | Đo latency |

### Server → Client

| type | payload | khi nào |
|---|---|---|
| `welcome` | `{ userId, username, ttl }` | Sau khi auth thành công |
| `patched` | `{ state }` | Sau khi patch thành công |
| `saved` | `{ at }` | Sau khi save xong |
| `event_start` | `{ code, name, config }` | Event bắt đầu (broadcast) |
| `event_end` | `{ code }` | Event kết thúc (broadcast) |
| `error` | `{ message }` | Lỗi |
| `pong` | `{ t }` | Reply ping |

## 🎮 Godot Client Example

Xem file [`godot-client/avatar_client.gd`](godot-client/avatar_client.gd). Tóm tắt:

```gdscript
extends Node

var ws := WebSocketPeer.new()
var token := ""

func _ready() -> void:
    token = await login("alice", "secret123")
    var err := ws.connect_to_url("ws://localhost:3000/ws?token=" + token)
    # ...

func _process(_delta: float) -> void:
    ws.poll()
    while ws.get_ready_state() == WebSocketPeer.STATE_OPEN and ws.get_available_packet_count() > 0:
        var packet := ws.get_packet().get_string_from_utf8()
        handle(JSON.parse_string(packet))
```

## 🗂️ Cấu trúc thư mục

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── decorators/
│   ├── guards/ws-jwt.guard.ts
│   ├── filters/
│   └── types/
├── database/
│   ├── entities/
│   └── data-source.ts
└── modules/
    ├── auth/
    ├── users/
    ├── inventory/
    ├── session/        ← Redis session + grace period
    ├── events/         ← BullMQ + leaderboard
    └── realtime/       ← WebSocket gateway
```

## ⚙️ Biến môi trường

Xem `.env.example`. Quan trọng nhất:

- `JWT_SECRET` — **đổi trước khi lên prod**, dùng chuỗi 32+ ký tự ngẫu nhiên
- `SESSION_TTL_SECONDS` — session hết hạn sau bao lâu không hoạt động (mặc định 1800s = 30 phút)
- `GRACE_PERIOD_SECONDS` — sau khi disconnect, bao lâu vẫn giữ state chờ reconnect (mặc định 300s = 5 phút)
- `DB_SYNCHRONIZE` — `true` cho dev, **`false` cho prod** (dùng migration)

## 🔄 Flow lưu trữ tiến trình

```
[Godot] connect WS ──> auth (JWT) ──> load profile từ Postgres → cache Redis (TTL 30m)
                                                  ↓
[Godot] patch state ─────────────────────> update Redis (state tạm)
[Godot] action quan trọng ───────────────> ghi ngay vào Postgres (transaction)
                                                  ↓
[Godot] disconnect ───────────────────────> Redis vẫn giữ, TTL đổi → grace 5 phút
                                                  ↓
[Godot] reconnect <5 phút ───────────────> state y nguyên, tiếp tục chơi
[Godot] quá 5 phút không quay lại ───────> auto-save state cuối → xóa Redis
```

## 📦 Production

```bash
npm run build
node dist/main
```

Hoặc dùng image Docker multi-stage (xem `Dockerfile`).

Khi lên prod:
1. Đổi `JWT_SECRET`
2. Set `DB_SYNCHRONIZE=false`, viết migrations
3. Bật HTTPS (terminate ở Nginx/Caddy, proxy sang Node)
4. WSS: client connect tới `wss://yourdomain.com/ws`
5. Backup Postgres định kỳ (`pg_dump`)
6. Redis có `appendonly yes` để survive restart
