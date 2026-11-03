/*
 * TEMPLATE — review before relying on it. This is a plain-language starting point written for
 * the AGMX operator and for self-hosters, not legal advice. Have it checked for your
 * jurisdiction and business. Operator name and contact domain come from OPERATOR_NAME and
 * OPERATOR_DOMAIN (see .env.example).
 */
import { createFileRoute, Link } from "@tanstack/react-router"
import { B, LegalPage, List, Mail } from "~/components/marketing/legal"
import { GITHUB_URL } from "~/components/marketing/header"
import { seo, siteUrlFrom } from "~/lib/seo"

export const Route = createFileRoute("/terms")({
  head: ({ match }) =>
    seo({
      siteUrl: siteUrlFrom(match),
      path: "/terms",
      title: "Terms of Service — AGMX",
      description: "The rules for using AGMX: acceptable use, sending limits, account suspension, open-source licensing and liability."
    }),
  component: TermsPage
})

function TermsPage() {
  const { site } = Route.useRouteContext()
  const host = new URL(site.url).host
  const operator = site.operatorName
  const abuse = `abuse@${site.contactDomain}`
  const privacy = `privacy@${site.contactDomain}`

  return (
    <LegalPage
      title="Terms of Service"
      other={{ to: "/privacy", label: "Privacy Policy" }}
      intro={
        <p>
          These terms are an agreement between you and {operator} (“we”, “us”), the operator of the AGMX service at {host}. By creating an account,
          approving an agent, or using the API, you agree to them. If you use AGMX for an organisation, you agree on its behalf.
        </p>
      }
      sections={[
        {
          id: "service",
          title: "The service",
          body: (
            <>
              <p>
                AGMX gives AI agents real email inboxes. You can create agents and inboxes, send and receive mail through the dashboard, REST API, MCP server
                and webhooks, and let agents request access on your behalf. You're responsible for every agent you approve and every API key you create.
                Anything an agent does with your account counts as something you did.
              </p>
              <p>AGMX is in early access. Features, limits and plans may change, and access may be invite-only.</p>
            </>
          )
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <List>
              <li>Give accurate information and keep your sign-in email and API keys secure. Revoke keys you no longer need.</li>
              <li>Tell us at <Mail address={abuse} /> if you think your account or a key has been compromised.</li>
              <li>You must be old enough to form a binding contract where you live, and at least 16.</li>
            </List>
          )
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <>
              <p>Email only works when senders behave. You and your agents must not use AGMX to:</p>
              <List>
                <li>
                  Send <B>spam</B>: unsolicited bulk or commercial mail, purchased or scraped lists, or mail to people who haven't asked to hear from you.
                </li>
                <li>
                  <B>Phish</B>, impersonate people or organisations, spread malware, or collect credentials or payment details under false pretences.
                </li>
                <li>Harass, threaten or defraud anyone, or send content that is illegal where it is sent or received.</li>
                <li>Create accounts or inboxes in bulk to get around plan limits, or resell access without our permission.</li>
                <li>Probe, overload or attack AGMX or other people's systems, or get around rate limits, quotas or security controls.</li>
              </List>
              <p>
                Outbound mail must honour unsubscribe requests, and you must comply with anti-spam laws such as CAN-SPAM, CASL and the GDPR/ePrivacy rules
                that apply to you.
              </p>
            </>
          )
        },
        {
          id: "limits",
          title: "Limits, suspension and termination",
          body: (
            <>
              <p>
                Plans limit agents, inboxes, sends and received mail. Mail over a limit may be refused or dropped. To protect deliverability for everyone, we
                may <B>pause sending for an agent or account</B> without notice when bounce or complaint rates are high, when we receive abuse reports, or
                when we reasonably suspect a breach of these terms. We'll tell you why and, where it's safe to, how to resume.
              </p>
              <p>
                We may suspend or close accounts that seriously or repeatedly break these terms. You can stop using AGMX at any time and delete your account
                from Settings. Deletion is permanent.
              </p>
            </>
          )
        },
        {
          id: "content",
          title: "Your content",
          body: (
            <p>
              You keep all rights to mail and data you send, receive or store with AGMX. You give us permission to store, process and transmit it only as
              needed to run the service, for example to deliver mail, extract codes and links, and keep backups. How we handle personal data is covered by
              the <Link to="/privacy" className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">Privacy Policy</Link>.
            </p>
          )
        },
        {
          id: "open-source",
          title: "Open source",
          body: (
            <p>
              The AGMX software is open source under the MIT License, available on{" "}
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                GitHub
              </a>
              . These terms cover the hosted service at {host}. If you run your own copy, you're the operator of that instance and these terms don't apply
              between us.
            </p>
          )
        },
        {
          id: "warranty",
          title: "No warranty",
          body: (
            <p>
              AGMX is provided “as is” and “as available”. Email delivery depends on third parties and is never guaranteed. Mail may be delayed, filtered as
              spam, bounced or lost. To the extent the law allows, we disclaim all warranties, including merchantability, fitness for a particular purpose
              and non-infringement. Don't rely on AGMX as your only copy of important mail.
            </p>
          )
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <p>
              To the extent the law allows, we aren't liable for indirect, incidental, special, consequential or punitive damages, or for lost profits,
              revenue, data or goodwill. Our total liability for any claim relating to AGMX is limited to the greater of the amount you paid us in the 12
              months before the claim, or US$50. Some jurisdictions don't allow these limits, so they may not fully apply to you.
            </p>
          )
        },
        {
          id: "changes",
          title: "Changes",
          body: (
            <p>
              We may update these terms. For material changes we'll give notice in the dashboard or by email before they take effect. Continuing to use AGMX
              after that means you accept the new terms.
            </p>
          )
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <List>
              <li>
                Report abuse or spam sent from AGMX: <Mail address={abuse} />
              </li>
              <li>
                Privacy and data requests: <Mail address={privacy} />
              </li>
            </List>
          )
        }
      ]}
    />
  )
}
