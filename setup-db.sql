-- Tạo user + database cho AvatarServer.
-- Chạy bằng tài khoản superuser `postgres`:
--
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f setup-db.sql
--
-- (psql sẽ hỏi mật khẩu postgres — mật khẩu bạn đặt lúc cài PostgreSQL)
--
-- Mật khẩu 'avatar_pass' bên dưới phải khớp DB_PASSWORD trong file .env

CREATE USER avatar WITH PASSWORD 'avatar_pass';
CREATE DATABASE avatar_farm OWNER avatar;

-- Cho phép user avatar tạo bảng trong schema public của DB vừa tạo
\connect avatar_farm
GRANT ALL ON SCHEMA public TO avatar;
ALTER SCHEMA public OWNER TO avatar;
