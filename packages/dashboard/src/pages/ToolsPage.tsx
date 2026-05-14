import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ToolsPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Tool APIs & Enablement</h1>
        <p className="text-sm text-muted-foreground">
          Manage enabled tool groups and configure API keys for external services.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enabled Tools</CardTitle>
          <CardDescription>
            Select which tool groups the agent is permitted to invoke.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tool configuration form will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
