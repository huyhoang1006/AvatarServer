import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';
import { Inventory } from './inventory.entity';
import { EventLog } from './event-log.entity';
import { AuthIdentity } from './auth-identity.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  // Display name (from OAuth or set later). Falls back to username/email.
  @Column({ name: 'display_name', type: 'varchar', length: 128, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatar: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => UserProfile, (p) => p.user)
  profile: UserProfile;

  @OneToMany(() => Inventory, (i) => i.user)
  inventory: Inventory[];

  @OneToMany(() => EventLog, (l) => l.user)
  eventLogs: EventLog[];

  @OneToMany(() => AuthIdentity, (i) => i.user)
  identities: AuthIdentity[];
}
