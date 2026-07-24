import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Event } from './event.entity';

@Entity('leaderboards')
@Index(['eventId', 'userId'], { unique: true })
export class Leaderboard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'event_id' })
  eventId: number;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ default: 0 })
  score: number;

  @Column({ nullable: true, length: 64 })
  username: string | null; // denormalized snapshot

  @Column({ name: 'snapshot_at', type: 'timestamptz' })
  snapshotAt: Date;
}
