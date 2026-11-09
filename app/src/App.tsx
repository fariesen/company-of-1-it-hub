import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HubLayout } from './components/Layout';
import { Loading } from './components/ui';
import { HubProvider } from './state';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Devices } from './pages/Devices';
import { DeviceDetail } from './pages/DeviceDetail';
import { Software } from './pages/Software';
import { SectionDocs } from './pages/SectionDocs';
import { Docs } from './pages/Docs';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { More } from './pages/More';

const NotFound = lazy(() => import('./pages/NotFound'));
const SoftwareDetail = lazy(() => import('./pages/SoftwareDetail').then((m) => ({ default: m.SoftwareDetail })));
const Onboarding = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })));

export function App() {
  return (
    <HubProvider>
      <HashRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/hub" element={<HubLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="devices" element={<Devices />} />
              <Route path="devices/:id" element={<DeviceDetail />} />
              <Route path="software" element={<Software />} />
              <Route path="software/:id" element={<SoftwareDetail />} />
              <Route path="setup-pc" element={<Onboarding />} />
              <Route path="infrastructure" element={<SectionDocs section="infrastructure" />} />
              <Route path="setup" element={<SectionDocs section="setup" />} />
              <Route path="docs" element={<Docs />} />
              <Route path="docs/:repo/*" element={<Docs />} />
              <Route path="search" element={<Search />} />
              <Route path="settings" element={<Settings />} />
              <Route path="more" element={<More />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </HubProvider>
  );
}
