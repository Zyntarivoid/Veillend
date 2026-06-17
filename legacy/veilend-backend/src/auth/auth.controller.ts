import { Controller, Post, Body, Query, Get, UseGuards, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { VerifyDto } from './dto/verify.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('nonce')
  async getNonce(@Query('address') address: string) {
    const nonce = await this.authService.generateNonce(address);
    return { nonce };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async verify(@Body() body: VerifyDto) {
    const user = await this.authService.verifySignature(body.address, body.signature, body.typedData, body.publicKey);
    return this.authService.login(user);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(@Request() req) {
    // Stateless JWTs: client can drop token. For server-side revoke, implement blacklist.
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
