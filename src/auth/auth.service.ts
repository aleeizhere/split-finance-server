import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { User } from 'generated/prisma/client';
import { createHash } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
  ) {}
  async issueTokens(user: Pick<User, 'id' | 'email'>) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn:
        this.config.getOrThrow<JwtSignOptions['expiresIn']>('JWT_ACCESS_TTL'),
    });

    const jti = crypto.randomUUID();

    const refreshTTL = Number(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL_SECONDS'),
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTTL,
      },
    );

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.redisService.set(
      `refresh:${user.id}:${jti}`,
      tokenHash,
      'EX',
      refreshTTL,
    );
    return { accessToken, refreshToken, refreshTTL };
  }
}
