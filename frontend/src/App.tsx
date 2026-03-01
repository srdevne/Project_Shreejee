import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/transactions/Sales';
import Purchases from './pages/transactions/Purchases';
import Materials from './pages/masters/Materials';
import Parties from './pages/masters/Parties';
import Expenses from './pages/financials/Expenses';
import OwnerDashboard from './pages/financials/OwnerDashboard';

// All authenticated users
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
};

// Owner-only pages (Analytics, full Dashboard)
const OwnerRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'owner') return <Navigate to="/sales" replace />;
  return <Layout>{children}</Layout>;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Owner-only */}
      <Route path="/" element={<OwnerRoute><Dashboard /></OwnerRoute>} />
      <Route path="/owner" element={<OwnerRoute><OwnerDashboard /></OwnerRoute>} />

      {/* Both roles */}
      <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><Materials /></ProtectedRoute>} />
      <Route path="/parties" element={<ProtectedRoute><Parties /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />

      {/* Catch-all: owner → home, manager → sales */}
      <Route path="*" element={<RoleDefaultRedirect />} />
    </Routes>
  );
}

// Redirect to correct home by role
function RoleDefaultRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'owner' ? '/' : '/sales'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;

