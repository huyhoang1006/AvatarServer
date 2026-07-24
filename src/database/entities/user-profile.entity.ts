import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', unique: true })
  userId: number;

  @OneToOne(() => User, (u) => u.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 1 })
  level: number;

  @Column({ default: 0 })
  exp: number;

  @Column({ default: 0 })
  coins: number;

  @Column({ default: 0 })
  gems: number;

  // Free-form snapshot of "current" mid-game state, mirrored to Redis on login.
  // Heavy things stay here (e.g. permanent unlocks), volatile things in Redis.
  @Column({ type: 'jsonb', default: {} })
  data: Record<string, any>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
