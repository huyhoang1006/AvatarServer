# Avatar Farm — Godot 4.x client
#
# Login options:
#   - Username/password     → AvatarClient.login(username, password)
#   - Google / Facebook     → AvatarClient.login_with_oauth(provider)
#
# OAuth flow (device code):
#   1. POST /auth/device/start → get { deviceCode, verificationUri }
#   2. Open verificationUri in OS browser
#   3. Poll POST /auth/device/poll every 2s
#   4. On { status: "ready" } → token stored, signal emitted, game starts
#
# Extend Node, attach to a node in your login scene, or load as autoload.
extends Node

signal login_succeeded(user: Dictionary)
signal login_failed(message: String)
signal oauth_browser_opened(url: String)

const API_HOST := "http://localhost:3000"   # change in production
const WS_HOST := "ws://localhost:3000/ws"   # change in production

var token: String = ""
var current_user: Dictionary = {}

var ws := WebSocketPeer.new()
var _authenticated := false

var _auto_save_timer: Timer
var _reconnect_timer: Timer
var _poll_timer: Timer

# ---------------- Public API ----------------

func login(username: String, password: String) -> Dictionary:
    var res := await _http_post("/auth/login", {"username": username, "password": password})
    if res.has("accessToken"):
        _apply_login(res)
    else:
        login_failed.emit(_err_message(res))
    return res

func register(username: String, password: String) -> Dictionary:
    var res := await _http_post("/auth/register", {"username": username, "password": password})
    if res.has("accessToken"):
        _apply_login(res)
    else:
        login_failed.emit(_err_message(res))
    return res

func login_with_oauth(provider: String) -> void:
    # provider: "google" or "facebook"
    var body := {} if token.is_empty() else {}
    var headers := [] if token.is_empty() else ["Authorization: Bearer " + token]
    var res := await _http_post("/auth/device/start", {"mode": "login"}, headers)
    if not res.has("deviceCode"):
        login_failed.emit(_err_message(res))
        return

    oauth_browser_opened.emit(res["verificationUri"])
    OS.shell_open(res["verificationUri"]) # Godot 4.x

    _start_polling(res["deviceCode"])

func link_provider(provider: String) -> void:
    # Requires token (logged in)
    if token.is_empty():
        login_failed.emit("Chưa đăng nhập")
        return
    var headers := ["Authorization: Bearer " + token]
    var res := await _http_post("/auth/device/start", {"mode": "link"}, headers)
    if not res.has("deviceCode"):
        login_failed.emit(_err_message(res))
        return

    oauth_browser_opened.emit(res["verificationUri"])
    OS.shell_open(res["verificationUri"])

    _start_polling_link(res["deviceCode"])

func list_linked_providers() -> Array:
    if token.is_empty(): return []
    var res := await _http_get("/auth/identities", ["Authorization: Bearer " + token])
    return res.get("providers", [])

func unlink_provider(provider: String) -> Dictionary:
    if token.is_empty():
        return {"error": "not_logged_in"}
    return await _http_delete("/auth/identities/" + provider, ["Authorization: Bearer " + token])

func logout() -> void:
    token = ""
    current_user = {}
    _authenticated = false
    if ws.get_ready_state() in [WebSocketPeer.STATE_OPEN, WebSocketPeer.STATE_CONNECTING]:
        ws.close()

# ---------------- WS / game loop helpers ----------------

func connect_ws() -> void:
    if token.is_empty(): return
    var err := ws.connect_to_url(WS_HOST + "?token=" + token)
    if err != OK:
        push_error("WS connect error: %d" % err)

func _ready() -> void:
    _auto_save_timer = Timer.new()
    _auto_save_timer.wait_time = 30.0
    _auto_save_timer.timeout.connect(_on_auto_save)
    add_child(_auto_save_timer)

    _reconnect_timer = Timer.new()
    _reconnect_timer.wait_time = 5.0
    _reconnect_timer.one_shot = true
    _reconnect_timer.timeout.connect(connect_ws)
    add_child(_reconnect_timer)

    _poll_timer = Timer.new()
    _poll_timer.wait_time = 2.0
    _poll_timer.timeout.connect(_poll_tick)
    add_child(_poll_timer)

func _process(_delta: float) -> void:
    ws.poll()
    var state := ws.get_ready_state()
    if state == WebSocketPeer.STATE_OPEN:
        while ws.get_available_packet_count() > 0:
            var pkt := ws.get_packet().get_string_from_utf8()
            _handle_packet(pkt)
    elif state == WebSocketPeer.STATE_CLOSED and _authenticated:
        _authenticated = false
        _reconnect_timer.start()

func _handle_packet(raw: String) -> void:
    var msg = JSON.parse_string(raw)
    if not msg is Dictionary: return
    match msg.get("type"):
        "welcome": _authenticated = true
        "saved":   pass # optional UI feedback
        "event_start":
            print("🎉 Event started: %s" % msg.get("name"))
        "event_end":
            print("🏁 Event ended: %s" % msg.get("code"))
        "error":   push_error("Server: %s" % msg.get("message"))

func patch_state(partial: Dictionary) -> void:
    if not _authenticated: return
    ws.send_text(JSON.stringify({"type": "patch", "state": partial}))

func save_now() -> void:
    if not _authenticated: return
    ws.send_text(JSON.stringify({"type": "save"}))

func _on_auto_save() -> void:
    if _authenticated:
        save_now()
        patch_state({"ts": Time.get_unix_time_from_system()})

# ---------------- Internal: HTTP, OAuth polling ----------------

func _http_post(path: String, body: Dictionary, extra_headers: Array = []) -> Dictionary:
    var http := HTTPRequest.new()
    add_child(http)
    var headers := ["Content-Type: application/json"] + extra_headers
    http.request(API_HOST + path, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
    var res := await http.request_completed
    http.queue_free()
    return _parse_http(res)

func _http_get(path: String, extra_headers: Array = []) -> Dictionary:
    var http := HTTPRequest.new()
    add_child(http)
    http.request(API_HOST + path, extra_headers, HTTPClient.METHOD_GET)
    var res := await http.request_completed
    http.queue_free()
    return _parse_http(res)

func _http_delete(path: String, extra_headers: Array = []) -> Dictionary:
    var http := HTTPRequest.new()
    add_child(http)
    http.request(API_HOST + path, extra_headers, HTTPClient.METHOD_DELETE)
    var res := await http.request_completed
    http.queue_free()
    return _parse_http(res)

func _parse_http(res: Array) -> Dictionary:
    var code := res[1]
    var raw := res[3].get_string_from_utf8() if res[3] is PackedByteArray else str(res[3])
    var parsed = JSON.parse_string(raw)
    if parsed is Dictionary:
        return parsed
    return {"httpError": code, "raw": raw}

func _apply_login(res: Dictionary) -> void:
    token = res["accessToken"]
    current_user = res.get("user", {})
    login_succeeded.emit(current_user)
    connect_ws()

func _err_message(res: Dictionary) -> String:
    if res.has("message"):
        var m = res["message"]
        if m is String: return m
        if m is Array and m.size() > 0 and m[0] is String: return m[0]
    if res.has("httpError"): return "HTTP %d" % res["httpError"]
    return "Lỗi không xác định"

# --- OAuth polling state ---
var _poll_code := ""
var _poll_is_link := false

func _start_polling(code: String) -> void:
    _poll_code = code
    _poll_is_link = false
    _poll_timer.start()

func _start_polling_link(code: String) -> void:
    _poll_code = code
    _poll_is_link = true
    _poll_timer.start()

func _poll_tick() -> void:
    if _poll_code.is_empty():
        _poll_timer.stop()
        return
    var res := await _http_post("/auth/device/poll", {"deviceCode": _poll_code})
    var status := res.get("status", "")
    if status == "ready":
        _poll_timer.stop()
        _poll_code = ""
        _apply_login(res)
    elif status == "linked":
        _poll_timer.stop()
        _poll_code = ""
        print("🔗 Linked: %s" % res.get("provider", "?"))
        # caller can re-query list_linked_providers to update UI
    elif status == "expired":
        _poll_timer.stop()
        _poll_code = ""
        login_failed.emit("Đăng nhập hết hạn — vui lòng thử lại")
    # pending → keep polling
