import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AccessTokenGuard }],
})
export class AuthModule {}
