import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, ScoreEventDto } from './dto/event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Public read endpoints
  @Get()
  list() {
    return this.events.list();
  }

  @Get(':code/leaderboard')
  leaderboard(@Param('code') code: string) {
    return this.events.getLeaderboard(code);
  }

  // ---- Authenticated scoring ----
  @Post(':code/score')
  @UseGuards(JwtAuthGuard)
  score(
    @Param('code') code: string,
    @CurrentUser() u: { userId: number; username: string },
    @Body() dto: ScoreEventDto,
  ) {
    return this.events.scoreEvent(u.userId, u.username, code, dto);
  }

  // ---- Admin (placeholder, gate with role guard in production) ----
  @Post()
  @UseGuards(JwtAuthGuard) // replace with AdminGuard in prod
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard)
  activate(@Param('id') id: string) {
    return this.events.activate(Number(id));
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard)
  end(@Param('id') id: string) {
    return this.events.end(Number(id));
  }
}
