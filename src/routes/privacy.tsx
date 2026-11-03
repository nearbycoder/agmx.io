/*
 * TEMPLATE — review before relying on it. This is a plain-language starting point written for
 * the AGMX operator and for self-hosters, not legal advice. Check it against how your instance is
 * actually deployed (processors, regions, retention) and the laws that apply to you. Operator
 * name and contact domain come from OPERATOR_NAME and OPERATOR_DOMAIN (see .env.example).
 */
import { createFileRoute, Link } from "@tanstack/react-router"
import { B, LegalPage, List, Mail } from "~/components/marketing/legal"
import { seo, siteUrlFrom } from "~/lib/seo"
import { PLANS } from "~/shared/plans"

export const Route = createFileRoute("/privacy")({
  head: ({ match }) =>
    seo({
      siteUrl: siteUrlFrom(match),
      path: "/privacy",
      title: "Privacy Policy — AGMX",
      description: "What AGMX stores, who processes it, how long it's kept, and how to export or delete your data."
    }),
  component: PrivacyPage
})

const linkClass = "font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"

function PrivacyPage() {
  const { site } = Route.useRouteContext()
  const host = new URL(site.url).host
  const operator = site.operatorName
  const privacy = `privacy@${site.contactDomain}`
  const abuse = `abuse@${site.contactDomain}`
  const plans = Object.values(PLANS).filter((p) => !p.hidden)

  return (
    <LegalPage
      title="Privacy Policy"
      other={{ to: "/terms", label: "Terms of Service" }}
      intro={
        <p>
          This policy explains what {operator} (“we”), the operator of the AGMX service at {host}, collects when you use it, why, and what you can do
          about it. The short version: we store what's needed to run your inboxes, we don't sell your data, and you can export or delete it whenever
          you like.
        </p>
      }
      sections={[
        {
          id: "what-we-store",
          title: "What we store",
          body: (
            <List>
              <li>
                <B>Account:</B> your email address, name, password hash (if you set one), sign-in sessions, plan and role.
              </li>
              <li>
                <B>Agents and settings:</B> agent names and descriptions, inbox addresses, sender rules, send policies, webhook URLs, custom domains, and API
                key names and prefixes. We keep only a one-way hash of each key.
              </li>
              <li>
                <B>Mail:</B> the messages your inboxes send and receive, including headers, body text and HTML, and the data AGMX derives from them, such as
                verification codes, links, calendar events, receipts, tracking numbers and security analysis.
              </li>
              <li>
                <B>Attachments:</B> files sent to or from your inboxes. On {host} they're kept in a private Amazon S3 bucket and served through short-lived
                signed links.
              </li>
              <li>
                <B>Usage and logs:</B> daily send and receive counts, webhook delivery attempts, and server logs. Logs record things like message IDs,
                addresses and errors, and are kept for a short time to run and secure the service.
              </li>
              <li>
                <B>Agent sign-up requests:</B> the agent's name and the IP address and user agent it requested from, so you can decide whether to approve it.
              </li>
            </List>
          )
        },
        {
          id: "how-we-use-it",
          title: "How we use it",
          body: (
            <>
              <p>
                We use your data to provide the service: delivering and storing mail, extracting codes and links for your agents, sending sign-in links,
                enforcing plan limits, preventing abuse, and keeping AGMX secure and working. Our legal basis is performing our contract with you and our
                legitimate interest in running a safe service.
              </p>
              <p>
                We <B>don't sell</B> your data, use your mail to target ads, or use it to train AI models. There are no third-party analytics or advertising
                trackers. The only cookies are the ones that keep you signed in.
              </p>
            </>
          )
        },
        {
          id: "processors",
          title: "Who processes it",
          body: (
            <>
              <p>We rely on a few infrastructure providers, which process data on our behalf under their own data-protection terms:</p>
              <List>
                <li>
                  <B>Amazon Web Services</B> (United States): Amazon SES sends and receives mail, and Amazon S3 stores attachments and holds incoming raw
                  mail briefly while it's processed.
                </li>
                <li>
                  <B>Railway</B>: hosts the application and its Postgres database.
                </li>
              </List>
              <p>
                When your agents send mail, recipients' mail providers receive it, as with any email. If you configure webhooks or forwarding rules, we
                send message data to the destinations you choose.
              </p>
            </>
          )
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <>
              <p>Messages and their attachments are deleted automatically once their thread has been inactive longer than your plan's retention period:</p>
              <List>
                {plans.map((p) => (
                  <li key={p.id}>
                    {p.name}: {p.retentionDays === null ? "kept until you delete them" : `${p.retentionDays} days`}
                  </li>
                ))}
              </List>
              <p>
                Raw incoming mail is deleted from storage as soon as it has been processed. Temporary inboxes and their mail are deleted when they expire.
                Pending or denied agent sign-up requests are removed after about a week. Everything else is kept until you delete it or your account.
              </p>
              <p>
                To protect our sending reputation, we keep a list of addresses that hard-bounced or reported mail as spam. This list isn't linked to your
                account and is kept after account deletion.
              </p>
            </>
          )
        },
        {
          id: "your-rights",
          title: "Your rights",
          body: (
            <>
              <p>
                You can <B>export</B> everything stored for your account as a JSON file, and <B>delete</B> your account and all of its data, from{" "}
                <Link to="/app/settings" className={linkClass}>
                  Settings → Your data
                </Link>
                . Deletion is immediate and permanent. Backups age out on their normal schedule.
              </p>
              <p>
                Depending on where you live, you may also have the right to correct your data, object to or restrict processing, and complain to a data
                protection authority. Email <Mail address={privacy} /> for anything you can't do from Settings.
              </p>
            </>
          )
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Traffic is encrypted in transit, attachment storage is private, API keys are stored only as hashes, and webhooks are signed. Incoming mail is
              scanned for hidden instructions aimed at AI agents. No system is perfectly secure. If you find a vulnerability, please tell us at{" "}
              <Mail address={abuse} />.
            </p>
          )
        },
        {
          id: "children",
          title: "Children",
          body: <p>AGMX isn't meant for anyone under 16, and we don't knowingly collect their data.</p>
        },
        {
          id: "changes",
          title: "Changes",
          body: <p>We'll update this page when our practices change and give notice in the dashboard or by email for material changes.</p>
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <List>
              <li>
                Privacy questions and data requests: <Mail address={privacy} />
              </li>
              <li>
                Abuse and security reports: <Mail address={abuse} />
              </li>
            </List>
          )
        }
      ]}
    />
  )
}
