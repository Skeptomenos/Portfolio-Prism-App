import Sidebar from './components/Sidebar';
import Dashboard from './components/views/Dashboard';
import XRayView from './components/views/XRayView';
import OverlapView from './components/views/OverlapView';
import HoldingsView from './components/views/HoldingsView';
import { useCurrentView } from './store/useAppStore';

// Re-export ViewType from types for backward compatibility
export type { ViewType } from './types';

function App() {
    const currentView = useCurrentView();

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
                return <Dashboard />;
            case 'xray':
                return <XRayView />;
            case 'overlap':
                return <OverlapView />;
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
        </div>
    );
}

export default App;
