import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ChannelsPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Channels & Cron</h1>
        <p className="text-sm text-muted-foreground">
          Configure messaging channels and scheduled task delivery.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Bot token and allowed user access control.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Telegram configuration form will be implemented here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cron Scheduler</CardTitle>
          <CardDescription>Background scheduled task delivery settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cron configuration form will be implemented here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
