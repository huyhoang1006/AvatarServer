import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { Inventory } from './entities/inventory.entity';
import { Event } from './entities/event.entity';
import { EventLog } from './entities/event-log.entity';
import { Leaderboard } from './entities/leaderboard.entity';
import { AuthIdentity } from './entities/auth-identity.entity';

dotenv.config();

/**
 * Standalone DataSource for TypeORM CLI (migrations, seeds).
 * The app itself uses TypeOrmModule.forRootAsync() in app.module.ts.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'avatar',
  password: process.env.DB_PASSWORD || 'avatar_pass',
  database: process.env.DB_NAME || 'avatar_farm',
  entities: [User, UserProfile, Inventory, Event, EventLog, Leaderboard, AuthIdentity],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
