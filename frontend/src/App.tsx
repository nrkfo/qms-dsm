import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Login } from './pages/Login';
import Admin from './pages/Admin';
import { TvCheck } from './pages/oqa/TvCheck';
import { PalletsCheck } from './pages/oqa/PalletsCheck';
import { PalletsTvView } from './pages/oqa/PalletsTvView';
import { LabelsCheck } from './pages/oqa/LabelsCheck';
import { AqlCheck } from './pages/iqc/AqlCheck';
import { PanelsCheck } from './pages/iqc/PanelsCheck';
import { EpsCheck } from './pages/iqc/EpsCheck';
import { CoversCheck } from './pages/iqc/CoversCheck';
import { ComponentsCheck } from './pages/iqc/ComponentsCheck';
import { PatrolCheck } from './pages/oqa/PatrolCheck';
import { Dashboard } from './pages/Dashboard';
import { KpiDashboard } from './pages/KpiDashboard';
import { AqlCalculator } from './pages/AqlCalculator';
import { useAuthStore, hydrateAuth } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { Menu } from 'lucide-react';
import { initAudioContext } from './utils/audio';
import { GlobalUI } from './components/ui/GlobalUI';
import { useDataStore } from './store/useDataStore';
import { api } from './utils/api';

// Layout
const RootLayout = ({ children }: { children: React.ReactNode }) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const { fetchLastLabelCheckTime, activeLot } = useDataStore();

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location]);

  // Send heartbeat periodically to track user activity/online status
  useEffect(() => {
    const token = localStorage.getItem('dsm_qms_token');
    if (!token) return;

    const sendHeartbeat = () => {
      api.post('/users/heartbeat', { 
        currentUrl: location.pathname,
        selectedLotName: activeLot?.name || null
      })
        .catch(err => console.error('Heartbeat error:', err));
    };

    // Send immediately on mount or path change
    sendHeartbeat();

    // Repeat every 15 seconds
    const interval = setInterval(sendHeartbeat, 15000);

    return () => clearInterval(interval);
  }, [location.pathname, activeLot?.name]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      console.log('Global SSE: Connecting...');
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'DATA_UPDATED') {
            if (data.module === 'oqa_labels') {
              console.log('Global SSE: Label check update received, syncing timer.');
              fetchLastLabelCheckTime();
              // Dispatch custom event to notify mounted components like LabelsCheck.tsx to refresh
              window.dispatchEvent(new CustomEvent('oqa_labels_updated'));
            }
          }
        } catch (e) {
          console.error('Global SSE error parsing message', e);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('Global SSE failed, reconnecting in 3s...', err);
        if (eventSource) {
          eventSource.close();
        }
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [fetchLastLabelCheckTime]);

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div className={`sidebar-container${isMobileSidebarOpen ? ' open' : ''}`}>
        <Sidebar />
      </div>
      
      {/* Mobile overlay backdrop */}
      <div 
        className={`sidebar-overlay${isMobileSidebarOpen ? ' open' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      {/* Mobile Top Navigation Header */}
      <div className="mobile-header-bar">
        <button 
          onClick={() => setIsMobileSidebarOpen(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--c-text-primary)',
            cursor: 'pointer',
            padding: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Menu size={24} />
        </button>
        <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--c-accent)', letterSpacing: '0.5px' }}>QMS-DSM</span>
        <div style={{ width: '24px' }} />
      </div>
      
      <main className="main-content" style={{ flex: 1, padding: '30px', overflow: 'auto', backgroundColor: 'var(--c-bg-base)', position: 'relative' }}>
        {children}
      </main>
    </div>
  );
};

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedPermissions, allowedRoles }: { children: React.ReactNode, allowedPermissions?: string[], allowedRoles?: string[] }) => {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admin ALWAYS has access
  if (user?.role === 'Admin') return <>{children}</>;

  // Check roles (Legacy/Coarse)
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Check custom permissions
  if (allowedPermissions && user) {
    const hasPerm = (user.permissions || []).some(p => allowedPermissions.includes(p));
    if (!hasPerm) {
      return <div style={{ padding: '20px', color: 'var(--c-text-primary)' }}>У вас нет доступа к этому модулю. Обратитесь к администратору.</div>;
    }
  }

  return <>{children}</>;
};


function App() {
  const { theme } = useThemeStore();

  useEffect(() => {
    hydrateAuth();
    document.documentElement.setAttribute('data-theme', theme);

    // Warm up audio context on first user interaction
    const handleInteraction = () => {
      initAudioContext();
      window.removeEventListener('click', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    return () => window.removeEventListener('click', handleInteraction);
  }, [theme]);

  return (
    <Router>
      <GlobalUI />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/oqa/pallets-tv" element={<PalletsTvView />} />
        
        <Route path="/app/*" element={
          <ProtectedRoute>
            <RootLayout>
              <Routes>
                <Route path="dashboard" element={<ProtectedRoute allowedPermissions={['dashboard']}><Dashboard /></ProtectedRoute>} />
                <Route path="kpi" element={<ProtectedRoute allowedRoles={['Admin']}><KpiDashboard /></ProtectedRoute>} />
                
                {/* OQA */}
                <Route path="oqa/tv" element={<ProtectedRoute allowedPermissions={['oqa_tv']}><TvCheck /></ProtectedRoute>} />
                <Route path="oqa/pallets" element={<ProtectedRoute allowedPermissions={['oqa_pallets']}><PalletsCheck /></ProtectedRoute>} />
                <Route path="oqa/labels" element={<ProtectedRoute allowedPermissions={['oqa_labels']}><LabelsCheck /></ProtectedRoute>} />
                <Route path="oqa/patrol" element={<ProtectedRoute allowedPermissions={['oqa_patrol']}><PatrolCheck /></ProtectedRoute>} />
                
                {/* IQC */}
                <Route path="iqc/aql" element={<ProtectedRoute allowedPermissions={['iqc_aql']}><AqlCheck /></ProtectedRoute>} />
                <Route path="iqc/panels" element={<ProtectedRoute allowedPermissions={['iqc_panels']}><PanelsCheck /></ProtectedRoute>} />
                <Route path="iqc/eps" element={<ProtectedRoute allowedPermissions={['iqc_eps']}><EpsCheck /></ProtectedRoute>} />
                <Route path="iqc/covers" element={<ProtectedRoute allowedPermissions={['iqc_covers']}><CoversCheck /></ProtectedRoute>} />
                <Route path="iqc/components" element={<ProtectedRoute allowedPermissions={['iqc_components']}><ComponentsCheck /></ProtectedRoute>} />
                <Route path="iqc/aql-calculator" element={<ProtectedRoute allowedPermissions={['iqc_aql_calculator']}><AqlCalculator /></ProtectedRoute>} />

                {/* ADMIN */}
                <Route path="admin" element={<ProtectedRoute allowedPermissions={['admin_panel']}><Admin /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Routes>
            </RootLayout>
          </ProtectedRoute>
        } />
        
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
