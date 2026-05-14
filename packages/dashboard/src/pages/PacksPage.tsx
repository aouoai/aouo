import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'

export function PacksPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold tracking-tight">Packs</h1>
        <p className="text-sm text-muted-foreground">
          Installed vertical agent app packs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Installed Packs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Package className="mx-auto mb-3 size-9 opacity-40" />
              <p className="text-sm">Pack listing will load from API</p>
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
