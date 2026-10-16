'use server';

import { z } from 'zod';
import { uuid } from '@/lib/schemas';
import {
  markAllNotificationsRead,
  markNotificationRead as markNotificationReadForMember,
} from '../services/notifications';
import { memberAction } from './client';

export const markNotificationRead = memberAction
  .metadata({ action: 'marked read', entity: 'notification' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput, ctx }) => {
    return { updated: await markNotificationReadForMember(ctx.member.id, parsedInput.id) };
  });

export const markAllNotificationsReadAction = memberAction
  .metadata({ action: 'marked all read', entity: 'notifications' })
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    return { count: await markAllNotificationsRead(ctx.member.id) };
  });
