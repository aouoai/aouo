import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { ProviderPage } from '@/pages/ProviderPage'
import { ToolsPage } from '@/pages/ToolsPage'
import { ChannelsPage } from '@/pages/ChannelsPage'
import { AdvancedPage } from '@/pages/AdvancedPage'
import { SecurityPage } from '@/pages/SecurityPage'
import { PacksPage } from '@/pages/PacksPage'
import { StatusPage } from '@/pages/StatusPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/provider" replace />} />
          <Route path="provider" element={<ProviderPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="advanced" element={<AdvancedPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="packs" element={<PacksPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
