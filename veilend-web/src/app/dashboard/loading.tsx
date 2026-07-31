import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg">
            <div>
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-6 w-96" />
            </div>
          </Flex>
        </Section>

        {/* Portfolio Section Loading */}
        <Section>
          <Grid columns={3} gap="lg">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle>
                    <Skeleton className="h-5 w-32" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-40" />
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Section>

        {/* Asset Breakdown Loading */}
        <Section>
          <Grid columns={2} gap="lg">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle>
                    <Skeleton className="h-5 w-40" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Flex direction="col" gap="md">
                    {[1, 2, 3].map((j) => (
                      <Flex key={j} justify="between" align="center" className="py-2">
                        <Flex gap="md" align="center">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div>
                            <Skeleton className="h-5 w-24 mb-1" />
                            <Skeleton className="h-4 w-16" />
                          </div>
                        </Flex>
                        <Skeleton className="h-5 w-20" />
                      </Flex>
                    ))}
                  </Flex>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Section>

        {/* Recent Activity Loading */}
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>
                <Skeleton className="h-5 w-32" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Flex direction="col" gap="md">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Flex key={i} justify="between" align="center" className="py-3">
                    <Flex gap="md" align="center">
                      <div>
                        <Flex align="center" gap="sm" className="mb-1">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-5 w-24" />
                        </Flex>
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </Flex>
                    <div className="text-right">
                      <Skeleton className="h-5 w-20 mb-1" />
                      <Skeleton className="h-4 w-16" />
                    </div>
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