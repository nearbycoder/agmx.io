import { defineRailway, github, preserve, project, service } from "railway/iac"

/**
 * Railway Infrastructure as Code for the AGMX `web` service (replaces railway.json).
 *
 * Railway does not read this file during deploys. Changes take effect only when you run
 * `railway config plan` and then `railway config apply` (locally or from CI).
 *
 * This file is a named partial, so it only manages `web`. The Postgres database and its
 * volume stay as they are in the dashboard and are never deleted by an apply from here.
 *
 * Variables are `preserve()`: their values live on Railway, never in git. Self-hosters
 * deploying their own copy: rename the project/service and set variables in the dashboard.
 */
export const partial = "web"

export default defineRailway(() => {
  const web = service("web", {
    source: github("nearbycoder/agmx.io", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      healthcheckPath: "/api/v1/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5
    },
    replicas: 1,
    // The app listens on Railway's PORT (8080); the custom domain must target it.
    domains: [{ domain: "agmx.io", port: 8080 }],
    env: {
      ADMIN_EMAILS: preserve(),
      ALLOWED_EMAILS: preserve(),
      APP_URL: preserve(),
      ATTACHMENT_STORAGE: preserve(),
      AWS_ACCESS_KEY_ID: preserve(),
      AWS_REGION: preserve(),
      AWS_SECRET_ACCESS_KEY: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
      DEFAULT_PLAN: preserve(),
      MAIL_DOMAIN: preserve(),
      MAIL_TRANSPORT: preserve(),
      OPERATOR_DOMAIN: preserve(),
      SES_CONFIGURATION_SET: preserve(),
      SES_INBOUND_TOPIC_ARNS: preserve(),
      SES_RECEIPT_RULE: preserve(),
      SES_RECEIPT_RULE_SET: preserve(),
      STORAGE_BUCKET: preserve(),
      SYSTEM_FROM: preserve()
    }
  })

  return project("agmx", { resources: [web] })
})
