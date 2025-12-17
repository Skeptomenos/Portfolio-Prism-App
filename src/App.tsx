import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/views/Dashboard';
import XRayView from './components/views/XRayView';
import HealthView from './components/views/HealthView';
import OverlapView from './components/views/OverlapView';
import HoldingsView from './components/views/HoldingsView';
import TradeRepublicView from './components/views/TradeRepublicView';
import { ToastContainer } from './components/ui/Toast';
import { useCurrentView, useAppStore } from './store/useAppStore';
import { useTauriEvents } from './hooks/useTauriEvents';
import { getEnvironment, trCheckSavedSession, trGetAuthStatus } from './lib/ipc';

// Re-export ViewType from types for backward compatibility
export type { ViewType } from './types';

function App() {
    const currentView = useCurrentView();
    const { setCurrentView, setAuthState: setAuth, setSavedPhone } = useAppStore();
    
    // Initialize Tauri event listeners
    useTauriEvents();
    
    // Check authentication on mount and auto-navigate if not authenticated
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await trCheckSavedSession();
                
                if (session.hasSession) {
                    // Check if session is still valid
                    const status = await trGetAuthStatus();
                    if (status.authState === 'authenticated') {
                        setAuth('authenticated');
                        setSavedPhone(session.phoneNumber || null);
                        return; // Don't navigate, stay on current view
                    }
                }
                
                // Not authenticated - navigate to Trade Republic page
                setAuth('idle');
                setCurrentView('trade-republic');
            } catch (error) {
                console.error('[App] Auth check failed:', error);
                setAuth('idle');
                setCurrentView('trade-republic');
            }
        };

        checkAuth();
    }, [setAuth, setCurrentView, setSavedPhone]);
    
    // Log environment on first render
    console.log(`[App] Running in ${getEnvironment()} environment`);

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
                return <Dashboard />;
            case 'trade-republic':
                return <TradeRepublicView />;
            case 'xray':
                return <XRayView />;
            case 'overlap':
                return <OverlapView />;
            case 'data':
                return <Dashboard />; // Data view not implemented yet
            case 'health':
                return <HealthView />;
            case 'holdings':
                return <HoldingsView />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
                {renderView()}
            </main>
            
            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
}

export default App;
