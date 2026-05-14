import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'

export function StatusPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Status</h1>
        <p className="text-sm text-muted-foreground">
          System health checks and environment diagnostics.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            Health Checks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Activity className="mx-auto mb-3 size-9 opacity-40" />
              <p className="text-sm">Status checks will load from API</p>
              <Badge variant="secondary" className="mt-2">
                Read-only
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
