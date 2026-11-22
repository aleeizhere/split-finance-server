import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UsersService } from 'src/users/users.service';
import type { Response, Request } from 'express';
import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from './refresh-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  async create(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.usersService.create(createUserDto);
    const { accessToken, refreshToken, refreshTTL } =
      await this.authService.issueTokens(user);

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshTTL));

    return { user, accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();

    const { accessToken, refreshToken, refreshTTL } =
      await this.authService.refresh(token);

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshTTL));
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies[REFRESH_COOKIE];

    if (token) await this.authService.logout(token);

    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions);
  }
}
