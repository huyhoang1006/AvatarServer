import 'dotenv/config';
import Redis from 'ioredis';
import { AppDataSource } from '../data-source';

/**
 * Xoá sạch DB rồi chạy lại migration, ĐỒNG THỜI dọn Redis.
 *
 *   npm run db:reset
 *
 * Phải dọn cả hai nơi: nếu chỉ xoá Postgres thì id sự kiện bắt đầu lại từ 1 trong
 * khi key `leaderboard:1` cũ vẫn nằm trong Redis, và sự kiện mới thừa hưởng điểm cũ.
 */
async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Từ chối chạy khi NODE_ENV=production. Thêm --force nếu thực sự muốn.');
    process.exit(1);
  }

  console.log(`Xoá dữ liệu của "${process.env.DB_NAME ?? 'avatar_farm'}"...`);

  await AppDataSource.initialize();
  await AppDataSource.dropDatabase();       // xoá toàn bộ bảng trong schema
  console.log('  Postgres: đã xoá bảng');

  await AppDataSource.runMigrations();
  console.log('  Postgres: đã chạy lại migration');
  await AppDataSource.destroy();

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
  });

  let removed = 0;
  for (const pattern of ['session:*', 'leaderboard:*', 'event:rate:*', 'auth:device:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) {
      await redis.del(...keys);
      removed += keys.length;
    }
  }
  console.log(`  Redis: đã xoá ${removed} key`);
  redis.disconnect();

  console.log('Xong. Lưu ý: job BullMQ đang chờ vẫn còn — restart server để dọn.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
