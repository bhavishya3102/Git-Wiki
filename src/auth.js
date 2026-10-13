// src/auth.js
// This file is used to authenticate users with GitHub.
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { fetchUserFromCode } from './github.js';
import { getUser, upsertUser } from './db.js';

const SESSION_COOKIE = 'session';
const STATE_COOKIE = 'oauth_state';
const WEEK = 7 * 24 * 60 * 60 * 1000;

// Goes through the Vite proxy in dev, so the cookies land on the UI's origin.
const CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || 'http://localhost:5173/api/auth/github/callback';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export function signSession(user) {
  return jwt.sign({ login: user.login }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: '7d',
  });
}

// Sets req.user = { id, login } from the session cookie, or answers 401.
export function requireAuth(req, res, next) {
  try {
    const { sub, login } = jwt.verify(req.cookies?.[SESSION_COOKIE] ?? '', process.env.JWT_SECRET);
    req.user = { id: Number(sub), login };
    next();
  } catch {
    res.status(401).json({ error: 'Sign in with GitHub first' });
  }
}

export const authRouter = Router();

// Step 1: send the browser to GitHub. No scope is requested — the public
// profile is all we need. `state` guards the callback against forgery.
authRouter.get('/auth/github', (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GITHUB_CLIENT_ID is not set' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: GitHub sends the user back with a code. Trade it for their profile,
// save them in Neon, and start our own session.
authRouter.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) {
    return res.status(400).json({ error: 'Sign-in expired or was tampered with — try again' });
  }

  const user = await upsertUser(await fetchUserFromCode(code, CALLBACK_URL));
  res.clearCookie(STATE_COOKIE, cookieOptions);
  res.cookie(SESSION_COOKIE, signSession(user), { ...cookieOptions, maxAge: WEEK });
  res.redirect('/');
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUser(req.user.id);
  if (!user) return res.status(401).json({ error: 'Sign in with GitHub first' });
  res.json(user);
});

authRouter.post('/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});
