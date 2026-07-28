import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, ScoreEventDto } from './dto/event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
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

  // ---- Admin: cần users.is_admin = true ----
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  activate(@Param('id') id: string) {
    return this.events.activate(Number(id));
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard, AdminGuard)
  end(@Param('id') id: string) {
    return this.events.end(Number(id));
  }
}
