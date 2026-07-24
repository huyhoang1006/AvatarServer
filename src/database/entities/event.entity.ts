import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventLog } from './event-log.entity';

export type EventStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';
export type EventScope = 'global' | 'guild' | 'personal';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 128 })
  code: string; // e.g. "summer_festival_2026"

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: 'global' })
  scope: EventScope;

  @Column({ default: 'scheduled' })
  status: EventStatus;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>; // rewards, rules, milestones, etc.

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => EventLog, (l) => l.event)
  logs: EventLog[];
}
