import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type ContactKind = 'email' | 'phone';

interface AuthenticatedAccount {
  admin: SupabaseClient;
  user: User;
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authenticateRequest(req: Request): Promise<AuthenticatedAccount | null> {
  const admin = getAdminClient();
  const authorization = req.header('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!admin || !tokenMatch) return null;
  const { data, error } = await admin.auth.getUser(tokenMatch[1]);
  if (error || !data.user) return null;
  return { admin, user: data.user };
}

function getContactKind(value: unknown): ContactKind | null {
  return value === 'email' || value === 'phone' ? value : null;
}

function normalizeTarget(kind: ContactKind, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const target = value.trim();
  if (kind === 'email') {
    const normalizedEmail = target.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ? normalizedEmail
      : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(target) ? target : null;
}

function hashCode(userId: string, kind: ContactKind, target: string, code: string): string {
  const secret = process.env.CONTACT_OTP_SECRET;
  if (!secret) throw new Error('CONTACT_OTP_SECRET is not configured.');
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${kind}:${target}:${code}`)
    .digest('hex');
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(0, phone.length - 5))}${phone.slice(-2)}`;
}

async function sendEmailCode(recipient: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from || !Number.isInteger(port)) {
    throw new Error('SMTP configuration is incomplete.');
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from,
    to: recipient,
    subject: 'Código de segurança Love Flix',
    text: `Seu código para confirmar a alteração do e-mail é ${code}. Ele expira em 10 minutos.`,
  });
}

async function sendSmsCode(recipient: string, code: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    throw new Error('Twilio configuration is incomplete.');
  }

  const body = new URLSearchParams({
    To: recipient,
    From: from,
    Body: `Love Flix: seu código para confirmar o novo número é ${code}. Ele expira em 10 minutos.`,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }
  );
  if (!response.ok) {
    throw new Error(`Twilio rejected the verification message (${response.status}).`);
  }
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ ok: false, error: message });
}

function registerAsyncPost(
  app: Express,
  path: string,
  handler: (req: Request, res: Response) => Promise<void>
): void {
  app.post(path, (req, res) => {
    void handler(req, res).catch((error: unknown) => {
      console.error(`Unhandled account security error on ${path}.`, error);
      if (!res.headersSent) {
        sendError(res, 500, 'Ocorreu um erro ao processar a solicitação.');
      }
    });
  });
}

export function registerAccountSecurityRoutes(app: Express): void {
  registerAsyncPost(app, '/api/account/contact-verification/request', async (req, res) => {
    const authenticated = await authenticateRequest(req);
    if (!authenticated) {
      sendError(res, 401, 'Sua sessão expirou. Entre novamente na conta.');
      return;
    }

    const kind = getContactKind(req.body?.kind);
    const target = kind ? normalizeTarget(kind, req.body?.target) : null;
    if (!kind || !target) {
      sendError(
        res,
        400,
        kind === 'phone'
          ? 'Informe um telefone válido no formato internacional, como +5511999999999.'
          : 'Informe um endereço de e-mail válido.'
      );
      return;
    }

    const { admin, user } = authenticated;
    const oldEmail = user.email?.trim().toLowerCase();
    if (!oldEmail || !user.email_confirmed_at) {
      sendError(res, 403, 'Confirme o e-mail atual da conta antes de alterar os dados.');
      return;
    }
    if ((kind === 'email' && target === oldEmail) || (kind === 'phone' && target === user.phone)) {
      sendError(res, 400, 'O novo dado deve ser diferente do atual.');
      return;
    }

    if (
      !process.env.CONTACT_OTP_SECRET ||
      (kind === 'email' &&
        (!process.env.SMTP_HOST ||
          !process.env.SMTP_USER ||
          !process.env.SMTP_PASS ||
          !process.env.SMTP_FROM)) ||
      (kind === 'phone' &&
        (!process.env.TWILIO_ACCOUNT_SID ||
          !process.env.TWILIO_AUTH_TOKEN ||
          !process.env.TWILIO_FROM_NUMBER))
    ) {
      sendError(res, 503, 'A verificação de contato não está configurada no servidor.');
      return;
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    let codeHash: string;
    try {
      codeHash = hashCode(user.id, kind, target, code);
    } catch (error) {
      console.error('Unable to prepare account contact verification.', error);
      sendError(res, 503, 'Não foi possível iniciar a verificação agora.');
      return;
    }

    const now = new Date();
    const { data: issued, error: issueError } = await admin.rpc(
      'issue_account_contact_verification',
      {
        p_user_id: user.id,
        p_purpose: kind,
        p_target: target,
        p_code_hash: codeHash,
        p_expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
        p_now: now.toISOString(),
      }
    );
    if (issueError) {
      console.error('Unable to store account contact verification.', issueError);
      sendError(res, 503, 'Não foi possível iniciar a verificação agora.');
      return;
    }
    if (!issued) {
      res.setHeader('Retry-After', '60');
      sendError(res, 429, 'Aguarde 1 minuto antes de solicitar outro código.');
      return;
    }

    try {
      if (kind === 'email') {
        await sendEmailCode(oldEmail, code);
      } else {
        await sendSmsCode(target, code);
      }
    } catch (error) {
      console.error('Unable to deliver account contact verification.', error);
      await admin
        .from('account_contact_verifications')
        .delete()
        .eq('user_id', user.id)
        .eq('purpose', kind);
      sendError(res, 503, 'Não foi possível enviar o código. Verifique a configuração do serviço.');
      return;
    }

    res.json({
      ok: true,
      destination: kind === 'email' ? maskEmail(oldEmail) : maskPhone(target),
      message:
        kind === 'email'
          ? `Enviamos um código para ${maskEmail(oldEmail)}.`
          : `Enviamos um código por SMS para ${maskPhone(target)}.`,
    });
  });

  registerAsyncPost(app, '/api/account/contact-verification/confirm', async (req, res) => {
    const authenticated = await authenticateRequest(req);
    if (!authenticated) {
      sendError(res, 401, 'Sua sessão expirou. Entre novamente na conta.');
      return;
    }

    const kind = getContactKind(req.body?.kind);
    const target = kind ? normalizeTarget(kind, req.body?.target) : null;
    const code =
      typeof req.body?.code === 'string' && /^\d{6}$/.test(req.body.code)
        ? req.body.code
        : null;
    if (!kind || !target || !code) {
      sendError(res, 400, 'Confira o código e os dados informados.');
      return;
    }

    const { admin, user } = authenticated;
    let codeHash: string;
    try {
      codeHash = hashCode(user.id, kind, target, code);
    } catch (error) {
      console.error('Unable to validate account contact verification.', error);
      sendError(res, 503, 'A verificação não está configurada no servidor.');
      return;
    }

    const { data: verified, error: verifyError } = await admin.rpc(
      'consume_account_contact_verification',
      {
        p_user_id: user.id,
        p_purpose: kind,
        p_target: target,
        p_code_hash: codeHash,
        p_now: new Date().toISOString(),
      }
    );
    if (verifyError) {
      console.error('Unable to verify account contact code.', verifyError);
      sendError(res, 503, 'Não foi possível confirmar o código agora.');
      return;
    }
    if (!verified) {
      sendError(res, 400, 'Código inválido ou expirado. Solicite outro código.');
      return;
    }

    const { error: updateError } =
      kind === 'email'
        ? await admin.auth.admin.updateUserById(user.id, {
            email: target,
            email_confirm: true,
          })
        : await admin.auth.admin.updateUserById(user.id, {
            phone: target,
            phone_confirm: true,
            user_metadata: { ...user.user_metadata, phone: target },
          });
    if (updateError) {
      console.error('Unable to update verified account contact.', updateError);
      sendError(
        res,
        updateError.status === 422 ? 409 : 503,
        updateError.status === 422
          ? 'Este dado já está associado a outra conta.'
          : 'Não foi possível atualizar os dados da conta agora.'
      );
      return;
    }

    res.json({ ok: true, message: 'Dado de contato atualizado com sucesso.' });
  });
}
