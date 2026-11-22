import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { User } from 'generated/prisma/client';
import { createHash } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
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

  async refresh(token: string) {
    // a) Check the signature and expiry
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }

    // b) Read and delete the Redis entry in one step
    const key = `refresh:${payload.sub}:${payload.jti}`;
    const stored = await this.redisService.getdel(key);

    // c) Missing key: the token was revoked or already used
    if (!stored) {
      await this.revokeAllForUser(payload.sub);
      throw new UnauthorizedException();
    }

    // d) Hash mismatch: reject
    const hash = createHash('sha256').update(token).digest('hex');
    if (stored !== hash) throw new UnauthorizedException();

    // e) Load the user again (they might have been deleted) and issue a new pair
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException();

    return this.issueTokens(user);
  }

  private async revokeAllForUser(userId: string) {
    const stream = this.redisService.scanStream({
      match: `refresh:${userId}:*`,
    });
    for await (const keys of stream) {
      if ((keys as string[]).length)
        await this.redisService.del(...(keys as string[]));
    }
  }

  async logout(token: string): Promise<void> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return; // invalid or expired: nothing to revoke
    }

    await this.redisService.del(`refresh:${payload.sub}:${payload.jti}`);
  }
}
