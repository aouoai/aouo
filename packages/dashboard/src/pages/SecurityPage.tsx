import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SecurityPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Configure file access boundaries and execution fence mode.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution Boundaries</CardTitle>
          <CardDescription>
            Allowed filesystem paths and out-of-fence behavior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Security configuration form will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
