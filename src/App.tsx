import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import EinkaufslistePage from '@/pages/EinkaufslistePage';
import EinkaufseintragPage from '@/pages/EinkaufseintragPage';

const ListeBefuellenPage = lazy(() => import('@/pages/intents/ListeBefuellenPage'));
const EinkaufDurchfuehrenPage = lazy(() => import('@/pages/intents/EinkaufDurchfuehrenPage'));

export default function App() {
  return (
    <HashRouter>
      <ActionsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="einkaufsliste" element={<EinkaufslistePage />} />
            <Route path="einkaufseintrag" element={<EinkaufseintragPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="intents/liste-befuellen" element={<Suspense fallback={null}><ListeBefuellenPage /></Suspense>} />
            <Route path="intents/einkauf-durchfuehren" element={<Suspense fallback={null}><EinkaufDurchfuehrenPage /></Suspense>} />
          </Route>
        </Routes>
      </ActionsProvider>
    </HashRouter>
  );
}
