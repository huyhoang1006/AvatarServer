/**
 * Test tích hợp cho AvatarServer — chạy bằng test runner có sẵn của Node, không
 * thêm dependency nào.
 *
 *   npm run test:api            # server phải đang chạy ở localhost:3000
 *   API=http://host:port npm run test:api
 *
 * Đây là test tích hợp thật: cần Postgres + Redis + server đang chạy. Nó tạo tài
 * khoản mới cho mỗi lần chạy nên chạy lại nhiều lần không sao.
 */
const test = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');

const API = process.env.API || 'http://localhost:3000';
const WS = API.replace(/^http/, 'ws') + '/ws';

// ---------- tiện ích ----------

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = {};
  try {
    parsed = await res.json();
  } catch {
    /* body rỗng */
  }
  return { status: res.status, body: parsed };
}

function randomName(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

async function newAccount() {
  const username = randomName('t');
  const res = await req('POST', '/auth/register', { username, password: 'secret123' });
  assert.strictEqual(res.status, 201, `register that bai: ${JSON.stringify(res.body)}`);
  return { username, token: res.body.accessToken, id: res.body.user.id };
}

/** Mở WS, gửi auth, trả về { ws, welcome, next(type) } */
function openSocket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${token}`);
    const waiting = [];
    const buffered = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const idx = waiting.findIndex((w) => w.type === msg.type);
      if (idx >= 0) waiting.splice(idx, 1)[0].resolve(msg);
      else buffered.push(msg);
    });
    ws.on('error', reject);

    const next = (type, timeoutMs = 8000) =>
      new Promise((res, rej) => {
        const idx = buffered.findIndex((m) => m.type === type);
        if (idx >= 0) return res(buffered.splice(idx, 1)[0]);
        const timer = setTimeout(() => rej(new Error(`het gio cho message "${type}"`)), timeoutMs);
        waiting.push({ type, resolve: (m) => { clearTimeout(timer); res(m); } });
      });

    ws.on('open', async () => {
      ws.send(JSON.stringify({ event: 'auth', data: { token } }));
      try {
        const welcome = await next('welcome');
        resolve({ ws, welcome, next, send: (event, data = {}) => ws.send(JSON.stringify({ event, data })) });
      } catch (e) {
        reject(e);
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- đăng ký / đăng nhập ----------

test('đăng ký rồi đăng nhập lại được', async () => {
  const acc = await newAccount();
  const login = await req('POST', '/auth/login', {
    username: acc.username,
    password: 'secret123',
  });
  assert.strictEqual(login.status, 200);
  assert.ok(login.body.accessToken);
  assert.strictEqual(login.body.user.username, acc.username);
});

test('từ chối dữ liệu đăng ký không hợp lệ', async () => {
  const acc = await newAccount();

  const cases = [
    ['trùng username', { username: acc.username, password: 'secret123' }, 409],
    ['mật khẩu quá ngắn', { username: randomName('t'), password: '12345' }, 400],
    ['username có ký tự lạ', { username: 'a@b!', password: 'secret123' }, 400],
    ['thiếu mật khẩu', { username: randomName('t') }, 400],
    ['gửi kèm field lạ', { username: randomName('t'), password: 'secret123', isAdmin: true }, 400],
  ];

  for (const [label, body, expected] of cases) {
    const res = await req('POST', '/auth/register', body);
    assert.strictEqual(res.status, expected, `${label}: nhan ${res.status}`);
  }
});

test('sai mật khẩu và user không tồn tại trả về giống nhau', async () => {
  const acc = await newAccount();
  const wrongPass = await req('POST', '/auth/login', { username: acc.username, password: 'sai' });
  const noUser = await req('POST', '/auth/login', { username: randomName('nope'), password: 'sai' });

  assert.strictEqual(wrongPass.status, 401);
  assert.strictEqual(noUser.status, 401);
  // Không được lộ tài khoản nào có thật
  assert.deepStrictEqual(wrongPass.body.message, noUser.body.message);
});

test('endpoint cần đăng nhập thì chặn token thiếu hoặc sai', async () => {
  assert.strictEqual((await req('GET', '/users/me')).status, 401);
  assert.strictEqual((await req('GET', '/users/me', undefined, 'a.b.c')).status, 401);
});

// ---------- hồ sơ ----------

test('client không tự đặt được coins/gems/level', async () => {
  const acc = await newAccount();

  const bad = await req('PATCH', '/users/me', { coins: 999999, gems: 99999, level: 99 }, acc.token);
  assert.strictEqual(bad.status, 400);

  const me = await req('GET', '/users/me', undefined, acc.token);
  assert.strictEqual(me.body.coins, 0);
  assert.strictEqual(me.body.level, 1);

  // nhưng state gameplay thì vẫn ghi được
  const ok = await req('PATCH', '/users/me', { data: { scene: 'farm' } }, acc.token);
  assert.strictEqual(ok.status, 200);
});

// ---------- WebSocket + lưu tiến trình ----------

test('lưu tiến trình rồi kết nối lại thì khôi phục đúng', async () => {
  const acc = await newAccount();
  const state = {
    day: 3,
    stamina: 72.5,
    inventory: { hat_cai: 3 },
    farm: [{ tilled: true, type: 'cai', stage: 2, watered: true }],
  };

  const s1 = await openSocket(acc.token);
  s1.send('patch', { state });
  await s1.next('patched');
  s1.send('save');
  await s1.next('saved');
  s1.ws.close();

  await sleep(300);

  const s2 = await openSocket(acc.token);
  const restored = s2.welcome.ttl;
  assert.strictEqual(restored.day, 3);
  assert.strictEqual(restored.stamina, 72.5);
  assert.strictEqual(restored.inventory.hat_cai, 3);
  assert.strictEqual(restored.farm[0].stage, 2);
  s2.ws.close();
});

test('state lưu xuống DB không lồng nhau qua nhiều vòng save', async () => {
  const acc = await newAccount();
  const state = { day: 5, inventory: { trung: 2 } };

  let size = null;
  for (let i = 0; i < 3; i++) {
    const s = await openSocket(acc.token);
    s.send('patch', { state });
    await s.next('patched');
    s.send('save');
    await s.next('saved');
    s.ws.close();
    await sleep(250);

    const me = await req('GET', '/users/me', undefined, acc.token);
    const current = JSON.stringify(me.body.data).length;
    if (size === null) size = current;
    // Bug cũ: mỗi vòng save->load lồng thêm một tầng, kích thước phình dần
    assert.strictEqual(current, size, `vong ${i + 1}: kich thuoc doi tu ${size} sang ${current}`);
  }
});

test('gửi sai định dạng message thì không làm sập kết nối', async () => {
  const acc = await newAccount();
  const s = await openSocket(acc.token);

  // Định dạng cũ trong README — WsAdapter route theo `event` nên message này bị bỏ qua
  s.ws.send(JSON.stringify({ type: 'patch', state: { day: 9 } }));
  await sleep(300);

  // socket vẫn sống và vẫn phục vụ bình thường
  s.send('ping', { t: 123 });
  const pong = await s.next('pong');
  assert.strictEqual(pong.t, 123);
  s.ws.close();
});

// ---------- lưới an toàn grace period ----------

test('mất kết nối không kịp save thì job grace period vẫn lưu lại được', async (t) => {
  // Grace mặc định là 300s, chờ trong test thì quá lâu. Chỉ chạy khi server được
  // cấu hình grace ngắn:  GRACE_PERIOD_SECONDS=10 npm run start:dev
  const grace = Number(process.env.GRACE_PERIOD_SECONDS || 300);
  if (grace > 30) {
    t.skip(`GRACE_PERIOD_SECONDS=${grace}, qua lau de test (dat <=30 de bat bai nay)`);
    return;
  }

  const acc = await newAccount();
  const s = await openSocket(acc.token);

  // patch nhưng KHÔNG save, rồi rút dây — mô phỏng mất điện
  s.send('patch', { state: { day: 42, inventory: { vang: 7 } } });
  await s.next('patched');

  const before = await req('GET', '/users/me', undefined, acc.token);
  assert.deepStrictEqual(before.body.data, {}, 'chua save thi Postgres phai con rong');

  s.ws.terminate();
  await sleep(grace * 1000 + 4000);

  const after = await req('GET', '/users/me', undefined, acc.token);
  assert.strictEqual(after.body.data.day, 42, 'job grace period phai luu lai state cuoi');
  assert.strictEqual(after.body.data.inventory.vang, 7);
});

test('quay lại trong grace period thì giữ nguyên state đang dở', async (t) => {
  const grace = Number(process.env.GRACE_PERIOD_SECONDS || 300);
  if (grace > 30) {
    t.skip(`GRACE_PERIOD_SECONDS=${grace}, qua lau de test`);
    return;
  }

  const acc = await newAccount();
  const s1 = await openSocket(acc.token);
  s1.send('patch', { state: { day: 99 } });
  await s1.next('patched');
  s1.ws.terminate();

  await sleep(2000); // vẫn còn trong grace
  const s2 = await openSocket(acc.token);

  // Nạp lại từ Postgres ở đây sẽ ra day cũ — đúng thứ grace period sinh ra để tránh
  assert.strictEqual(s2.welcome.ttl.day, 99, 'phai giu state trong Redis, khong nap de tu DB');
  s2.ws.close();
});

// ---------- sự kiện ----------

test('chỉ admin mới tạo/bật/tắt được sự kiện', async () => {
  const acc = await newAccount();
  const body = {
    code: randomName('ev'),
    name: 'Thu nghiem',
    startAt: new Date(Date.now() + 60000).toISOString(),
    endAt: new Date(Date.now() + 120000).toISOString(),
  };

  assert.strictEqual((await req('POST', '/events', body, acc.token)).status, 403);
  assert.strictEqual((await req('POST', '/events/1/activate', {}, acc.token)).status, 403);
  assert.strictEqual((await req('POST', '/events/1/end', {}, acc.token)).status, 403);
});

test('danh sách sự kiện xem được khi chưa đăng nhập', async () => {
  // Client offline cần poll cái này lúc khởi động để biết đang có sự kiện gì
  const res = await req('GET', '/events');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// ---------- device code ----------

test('device code chỉ dùng được một lần', async () => {
  const started = await req('POST', '/auth/device/start', { mode: 'login' });
  assert.strictEqual(started.status, 200);
  const code = started.body.deviceCode;
  assert.ok(code);
  assert.ok(String(started.body.verificationUri).startsWith('http'));

  // Chưa hoàn tất trên trình duyệt
  assert.strictEqual((await req('POST', '/auth/device/poll', { deviceCode: code })).body.status, 'pending');

  // Giả lập server đã ghi kết quả OAuth vào Redis
  const Redis = require('ioredis');
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
  });
  await redis.set(
    `auth:device:${code}`,
    JSON.stringify({
      status: 'completed',
      mode: 'login',
      result: { accessToken: 'token-gia', user: { id: 1, username: 'x', email: null, displayName: null } },
    }),
    'EX',
    600,
  );

  const first = await req('POST', '/auth/device/poll', { deviceCode: code });
  assert.strictEqual(first.body.status, 'ready');
  assert.strictEqual(first.body.accessToken, 'token-gia');

  assert.strictEqual(await redis.exists(`auth:device:${code}`), 0, 'code phai bi tieu huy sau khi dung');

  const second = await req('POST', '/auth/device/poll', { deviceCode: code });
  assert.strictEqual(second.body.status, 'expired', 'code khong duoc dung lai');

  redis.disconnect();
});

test('device/start mode "link" cần đăng nhập', async () => {
  assert.strictEqual((await req('POST', '/auth/device/start', { mode: 'link' })).status, 401);
});

// ---------- OAuth chưa cấu hình ----------

test('OAuth chưa cấu hình thì báo lỗi rõ ràng, không phải 500', async (t) => {
  if (process.env.GOOGLE_CLIENT_ID) {
    t.skip('Google da duoc cau hinh, bo qua');
    return;
  }
  const res = await fetch(`${API}/auth/google/login`, { redirect: 'manual' });
  assert.strictEqual(res.status, 503);
});
