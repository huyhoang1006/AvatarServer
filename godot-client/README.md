# Godot Client Example

`avatar_client.gd` là script Godot 4.x minh hoạ cách kết nối tới AvatarServer.

## Cách dùng nhanh

1. Mở project Godot của bạn
2. Kéo file `avatar_client.gd` vào `res://`
3. **Project → Project Settings → Autoload** → Add:
   - Path: `res://avatar_client.gd`
   - Name: `AvatarClient`
4. Trong scene đầu tiên (login screen), gọi:

```gdscript
func _on_login_pressed() -> void:
    var username = $UsernameInput.text
    var password = $PasswordInput.text
    var token = await AvatarClient.login(username, password)
    if token != "":
        # chuyển sang scene chính
        get_tree().change_scene_to_file("res://scenes/main.tscn")
```

5. Trong game scene, lắng nghe event:

```gdscript
func _ready() -> void:
    AvatarClient.event_started.connect(_on_event_start)
    AvatarClient.event_ended.connect(_on_event_end)

func _on_event_start(payload: Dictionary) -> void:
    $EventBanner.show_banner(payload.get("name", "Sự kiện mới!"))

func _on_event_end(payload: Dictionary) -> void:
    $EventBanner.hide()
```

## Test nhanh với server local

Trước khi chạy:
1. Server đang chạy ở `http://localhost:3000`
2. Đã tạo user (qua API `POST /auth/register`)
3. Godot chạy → nhập username/password → đăng nhập

Nếu thấy log `✅ Authed as user N` → thành công.
