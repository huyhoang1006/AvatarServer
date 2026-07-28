import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';

/**
 * Phong / thu quyền admin.
 *
 *   npm run admin:grant -- alice
 *   npm run admin:revoke -- alice
 *   npm run admin:list
 */
async function main() {
  const [, , action, username] = process.argv;

  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);

  try {
    if (action === 'list') {
      const admins = await users.find({ where: { isAdmin: true } });
      if (!admins.length) {
        console.log('Chưa có admin nào. Phong bằng: npm run admin:grant -- <username>');
      } else {
        console.log('Admin hiện tại:');
        for (const a of admins) console.log(`  #${a.id}  ${a.username ?? a.email ?? '(oauth)'}`);
      }
      return;
    }

    if (!username) {
      console.error('Thiếu username.  Ví dụ: npm run admin:grant -- alice');
      process.exitCode = 1;
      return;
    }

    const user = await users.findOne({ where: { username } });
    if (!user) {
      console.error(`Không tìm thấy tài khoản "${username}"`);
      process.exitCode = 1;
      return;
    }

    user.isAdmin = action === 'grant';
    await users.save(user);
    console.log(
      action === 'grant'
        ? `Đã phong admin cho "${username}" (#${user.id})`
        : `Đã thu quyền admin của "${username}" (#${user.id})`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
