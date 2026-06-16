import { Button } from "@/components/Button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { Container, Section, Flex, Grid } from "@/components/Layout";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { Alert } from "@/components/Alert";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Container>
        <Section>
          <h1 className="text-4xl font-bold text-primary mb-2">VeilLend Design System</h1>
          <p className="text-text-secondary text-lg mb-12">Reusable UI primitives for VeilLend on Stellar</p>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Buttons</h2>
          <Flex gap="lg" wrap>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </Flex>
          <Flex gap="lg" wrap className="mt-4">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
          </Flex>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Badges</h2>
          <Flex gap="md" wrap>
            <Badge variant="default">Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
          </Flex>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Input</h2>
          <Flex direction="col" gap="md" className="max-w-md">
            <Input label="Email" placeholder="Enter your email" />
            <Input label="Password" placeholder="Enter your password" type="password" />
            <Input label="Error Example" placeholder="Invalid input" error="This field is required" />
          </Flex>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Cards</h2>
          <Grid columns={3} gap="lg">
            <Card>
              <CardHeader>
                <CardTitle>Market Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">View available assets and market rates</p>
              </CardContent>
              <CardFooter>
                <Button variant="primary" fullWidth>Explore Markets</Button>
              </CardFooter>
            </Card>
            <Card hoverable>
              <CardHeader>
                <CardTitle>Deposit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">Supply assets to earn interest</p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary" fullWidth>Deposit Now</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Borrow</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">Borrow assets with collateral</p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" fullWidth>Get Started</Button>
              </CardFooter>
            </Card>
          </Grid>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Skeletons</h2>
          <Flex gap="lg" align="stretch" wrap>
            <Flex direction="col" gap="md" className="w-full md:w-64">
              <Skeleton variant="card" />
            </Flex>
            <Flex direction="col" gap="md" className="flex-1">
              <Skeleton variant="text" />
              <Skeleton variant="text" width="50%" />
              <Skeleton variant="text" width="66%" />
            </Flex>
          </Flex>
          <Flex gap="md" className="mt-6" wrap>
            <Skeleton variant="circular" width={40} height={40} />
            <Skeleton variant="rectangular" width={120} height={32} />
          </Flex>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Spinners</h2>
          <Flex gap="lg" align="center" wrap>
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <Spinner size="xl" color="var(--veil-secondary)" />
          </Flex>
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold text-text mb-6">Alerts</h2>
          <Flex direction="col" gap="md">
            <Alert variant="default" title="Default">This is a default alert message</Alert>
            <Alert variant="success" title="Success">Transaction confirmed! Your deposit has been processed</Alert>
            <Alert variant="warning" title="Warning">Health factor is approaching liquidation threshold</Alert>
            <Alert variant="error" title="Error">Transaction failed. Please check your wallet balance</Alert>
            <Alert variant="info" title="Info">New market available for XLM/USDC pair</Alert>
          </Flex>
        </Section>
      </Container>
    </div>
  );
}
