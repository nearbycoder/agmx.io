import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { magicLink } from "better-auth/plugins/magic-link"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { eq } from "drizzle-orm"
import { db } from "./db/client"
import * as schema from "./db/schema"
import { env, isAdminEmail, isEmailAllowed } from "./env"
import { IP_HEADERS, rateLimitingEnabled } from "./rate-limit"
import { buttonEmail } from "./system-mail"

const NOT_ALLOWED = "AGMX is invite-only right now. This email isn't on the access list."

const deliver = async (to: string, subject: string, content: { text: string; html: string }) => {
  const [{ runtime }, { sendSystemEmail }] = await Promise.all([import("./runtime"), import("./system-mail")])
  await runtime.runPromise(sendSystemEmail({ to, subject, ...content }))
}

const emailFromBody = (body: unknown): string | null =>
  typeof body === "object" && body !== null && "email" in body && typeof (body as { email: unknown }).email === "string"
    ? (body as { email: string }).email
    : null

export const auth = betterAuth({
  appName: "AGMX",
  baseURL: env.appUrl,
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification }
  }),
  trustedOrigins: [env.appUrl],
  advanced: { cookiePrefix: "agmx", ipAddress: { ipAddressHeaders: IP_HEADERS } },
  // Better Auth's own limiter (in memory). Sign-in and sign-up endpoints get tight budgets because
  // each magic link or reset sends an email from our domain.
  rateLimit: {
    enabled: env.isProduction && rateLimitingEnabled(),
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/magic-link": { window: 600, max: 5 },
      "/sign-in/email": { window: 300, max: 10 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/request-password-reset": { window: 600, max: 3 },
      "/magic-link/verify": { window: 60, max: 20 }
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 }
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
      plan: { type: "string", input: false, defaultValue: env.defaultPlan }
    }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await deliver(
        user.email,
        "Reset your AGMX password",
        buttonEmail({
          heading: "Reset your password",
          body: "Someone (hopefully you) asked to reset the password for your AGMX account. This link expires in one hour.",
          cta: "Choose a new password",
          url,
          footer: "If you didn't request this, you can safely ignore this email."
        })
      )
    }
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        await deliver(
          email,
          "Your AGMX sign-in link",
          buttonEmail({
            heading: "Sign in to AGMX",
            body: "Click the button below to sign in. The link works once and expires in 15 minutes.",
            cta: "Sign in to AGMX",
            url,
            footer: "If you didn't try to sign in, you can ignore this email."
          })
        )
      }
    }),
    tanstackStartCookies()
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (["/sign-up/email", "/sign-in/email", "/sign-in/magic-link", "/request-password-reset"].includes(ctx.path)) {
        const email = emailFromBody(ctx.body)
        if (email && !isEmailAllowed(email)) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED, code: "NOT_ALLOWED" })
      }
    })
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isEmailAllowed(user.email)) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED, code: "NOT_ALLOWED" })
          return {
            data: {
              ...user,
              role: isAdminEmail(user.email) ? "admin" : "user",
              plan: isAdminEmail(user.email) ? "unlimited" : env.defaultPlan
            }
          }
        }
      }
    },
    session: {
      create: {
        // Re-check the allow-list on every new session so removing someone takes effect.
        before: async (session) => {
          const [row] = await db.select({ email: schema.user.email, role: schema.user.role }).from(schema.user).where(eq(schema.user.id, session.userId))
          if (!row || !isEmailAllowed(row.email)) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED, code: "NOT_ALLOWED" })
          if (isAdminEmail(row.email) && row.role !== "admin") {
            await db.update(schema.user).set({ role: "admin", plan: "unlimited" }).where(eq(schema.user.id, session.userId))
          }
          return { data: session }
        }
      }
    }
  }
})

export type Session = typeof auth.$Infer.Session
