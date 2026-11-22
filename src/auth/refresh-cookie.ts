import type { CookieOptions } from 'express';

export const REFRESH_COOKIE: string = 'refresh_token';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth',
};

export const refreshCookieOptions = (ttlSeconds: number): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: ttlSeconds * 1000,
});

export const clearRefreshCookieOptions = baseCookieOptions;
