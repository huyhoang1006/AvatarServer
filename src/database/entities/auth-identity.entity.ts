import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type AuthProvider = 'local' | 'google' | 'facebook';

/**
 * One row per (user, provider) link. A user can have one local, one google, one facebook.
 * Local rows hold passwordHash; OAuth rows hold providerUserId + providerEmail.
 */
@Entity('auth_identities')
@Index('uq_auth_provider_user', ['provider', 'providerUserId'], { unique: true })
@Index('uq_auth_user_provider', ['userId', 'provider'], { unique: true })
export class AuthIdentity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, (u) => u.identities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  provider: AuthProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId: string;

  @Column({ name: 'provider_email', type: 'varchar', length: 255, nullable: true })
  providerEmail: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
