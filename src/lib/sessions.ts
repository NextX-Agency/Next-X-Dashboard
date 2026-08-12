import { createHash, randomBytes } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const SESSION_COOKIE_NAME = 'nextics_session'
export const SESSION_DURATION_DAYS = 7

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function getRequestIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? ''
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return hashValue(token)
}

export async function createSession(userId: string, request: NextRequest) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.appSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgentHash: hashValue(request.headers.get('user-agent') ?? ''),
      ipHash: hashValue(getRequestIp(request)),
    },
  })

  return { token, expiresAt }
}

export async function getSessionUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const now = new Date()
  const session = await prisma.appSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: now },
      user: { isActive: true },
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      },
    },
  })

  if (!session?.user.isActive) return null
  return { sessionId: session.id, user: session.user }
}

export async function revokeSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return

  await prisma.appSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    expires: expiresAt,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}
