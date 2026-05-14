import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ProviderPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Provider & Model</h1>
        <p className="text-sm text-muted-foreground">
          Configure the active LLM provider, credentials, and model selection.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Provider</CardTitle>
          <CardDescription>
            Choose between Gemini, Codex (OAuth), or DeepSeek as your LLM backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Provider configuration form will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
