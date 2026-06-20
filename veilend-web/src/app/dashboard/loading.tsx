import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { Spinner } from '@/components/Spinner';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg">
            <Flex align="center" gap="md">
              <h1 className="text-4xl font-bold text-text">Dashboard</h1>
              <Spinner size="md" />
            </Flex>
            <p className="text-lg text-text-secondary">Fetching live portfolio data...</p>
          </Flex>
        </Section>

        <Section>
          <Grid columns={3} gap="lg">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Section>

        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Flex direction="col" gap="md">
                {[1, 2, 3, 4].map((i) => (
                  <Flex key={i} justify="between" align="center" className="py-2 border-b border-border last:border-0">
                    <Flex gap="md" align="center">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div>
                        <Skeleton className="h-5 w-32 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </Flex>
                    <Skeleton className="h-6 w-20" />
                  </Flex>
                ))}
              </Flex>
            </CardContent>
          </Card>
        </Section>
      </Container>
    </div>
  );
}
