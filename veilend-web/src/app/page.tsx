import { Badge } from '@/components/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { ContributorInterest } from '@/components/ContributorInterest';
import { CampaignTracker } from '@/components/CampaignTracker';
import { Container, Flex, Grid, Section } from '@/components/Layout';
import { TrackedLink } from '@/components/TrackedLink';

const contributionTracks = [
  {
    title: 'Soroban contracts',
    description:
      'Extend the Stellar contract foundation with token flows, collateral checks, and analytics events.',
    badge: 'High impact',
  },
  {
    title: 'Web campaign UX',
    description:
      'Ship a privacy-first web presence that helps contributors discover issues and onboarding steps quickly.',
    badge: 'Good first issue',
  },
  {
    title: 'Mobile product',
    description:
      'Improve private lending flows, wallet onboarding, and contributor-friendly demos in the Expo app.',
    badge: 'Active track',
  },
];

const campaignCtas = [
  {
    ctaId: 'view-issues',
    ctaLabel: 'View open issues',
    href: 'https://github.com/Zyntarivoid/Veillend/issues',
    variant: 'primary' as const,
  },
  {
    ctaId: 'read-contributor-guide',
    ctaLabel: 'Read contributor guide',
    href: 'https://github.com/Zyntarivoid/Veillend?tab=readme-ov-file#-join-the-drips-monthly-wave-contributor-program',
    variant: 'secondary' as const,
  },
  {
    ctaId: 'explore-soroban',
    ctaLabel: 'Explore Soroban workspace',
    href: 'https://github.com/Zyntarivoid/Veillend/tree/main/veilend-soroban',
    variant: 'outline' as const,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <CampaignTracker />
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg" className="max-w-4xl">
            <Flex gap="md" wrap>
              <Badge variant="primary">GrantFox OSS campaign</Badge>
              <Badge variant="secondary">Built on Stellar</Badge>
              <Badge variant="success">Privacy-first analytics</Badge>
            </Flex>
            <div>
              <h1 className="text-5xl font-bold leading-tight text-text sm:text-6xl">
                Help build VeilLend on Stellar and measure campaign momentum responsibly
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-text-secondary">
                This campaign page tracks page visits, CTA clicks, and contributor interest with
                anonymous first-party events so the team can learn which contribution paths resonate
                without collecting personal data.
              </p>
            </div>
            <Flex gap="md" wrap className="pt-2">
              {campaignCtas.map((cta) => (
                <TrackedLink
                  key={cta.ctaId}
                  ctaId={cta.ctaId}
                  ctaLabel={cta.ctaLabel}
                  href={cta.href}
                  variant={cta.variant}
                  target="_blank"
                  rel="noreferrer"
                >
                  {cta.ctaLabel}
                </TrackedLink>
              ))}
            </Flex>
          </Flex>
        </Section>

        <Section>
          <Grid columns={3} gap="lg">
            <Card>
              <CardHeader>
                <CardTitle>What gets measured</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-text-secondary">
                <p>Anonymous page visits for the campaign landing page.</p>
                <p>Outbound CTA clicks to GitHub, docs, and contributor resources.</p>
                <p>Interest selections for contracts, web, mobile, privacy, and docs.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>What stays private</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-text-secondary">
                <p>No cookies or local storage identifiers.</p>
                <p>No wallet addresses, emails, names, or contributor profiles.</p>
                <p>No fingerprinting fields beyond the selected event metadata.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>How to review results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-text-secondary">
                <p>Search deployment logs for the stable `campaign-analytics` marker.</p>
                <p>Break down `campaign_cta_click` by `ctaId` to rank high-intent links.</p>
                <p>Review `campaign_contributor_interest` to see which tracks draw attention.</p>
              </CardContent>
            </Card>
          </Grid>
        </Section>

        <Section>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
            <Flex direction="col" gap="lg">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">
                  Contribution tracks
                </p>
                <h2 className="mt-3 text-3xl font-bold text-text">
                  Guide contributors toward the highest-value work
                </h2>
              </div>
              <Grid columns={3} gap="lg">
                {contributionTracks.map((track) => (
                  <Card key={track.title} className="h-full">
                    <CardHeader>
                      <Flex justify="between" align="center" gap="md">
                        <CardTitle className="text-2xl">{track.title}</CardTitle>
                        <Badge variant="warning">{track.badge}</Badge>
                      </Flex>
                    </CardHeader>
                    <CardContent>
                      <p className="leading-7 text-text-secondary">{track.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </Grid>
            </Flex>
          </div>
        </Section>

        <Section>
          <ContributorInterest />
        </Section>

        <Section className="pt-0">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-6 text-sm leading-7 text-text-secondary">
            Privacy note: the campaign analytics route only accepts a small allowlist of event
            fields and records anonymous interaction metadata. It does not store cookies, wallet
            identifiers, email addresses, or user-generated text.
          </div>
        </Section>
      </Container>
    </div>
  );
}
