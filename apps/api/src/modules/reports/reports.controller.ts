import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { requireUsername } from '../../infra/auth/require-username';
import {
  CreateReportDto,
  UpdateReportStatusDto,
} from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles('admin')
  @Get()
  list() {
    return this.reports.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(requireUsername(user), dto);
  }

  @Roles('admin')
  @Patch(':id')
  @HttpCode(204)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    await this.reports.updateStatus(id, dto.status);
  }
}
