import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Runners from './pages/Runners';
import TrainingPlans from './pages/TrainingPlans';
import Events from './pages/Events';
import Payments from './pages/Payments';
import Store from './pages/Store';
import Communication from './pages/Communication';
import Profile from './pages/Profile';
import RunnerProfile from './pages/RunnerProfile';
import EventLanding from './pages/EventLanding';
import EventLeads from './pages/EventLeads';
import SettingsPage from './pages/Settings';
import PlanDetail from './pages/PlanDetail';
import PlanBuilder from './pages/PlanBuilder';
import PaymentSuccess from './pages/PaymentSuccess';
import Chat from './pages/Chat';
import MyActivities from './pages/MyActivities';
import RecordActivity from './pages/RecordActivity';
import RoutesPage from './pages/Routes';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/pago-exitoso" element={<PaymentSuccess />} />
          <Route path="/evento/:id" element={<EventLanding />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/corredores" element={<Runners />} />
            <Route path="/corredores/:id" element={<RunnerProfile />} />
          <Route path="/eventos/:id/inscritos" element={<EventLeads />} />
            <Route path="/planes" element={<TrainingPlans />} />
            <Route path="/eventos" element={<Events />} />
            <Route path="/pagos" element={<Payments />} />
            <Route path="/tienda" element={<Store />} />
            <Route path="/comunicacion" element={<Communication />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/planes/:id" element={<PlanDetail />} />
            <Route path="/planes/nuevo" element={<PlanBuilder />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:runnerId" element={<Chat />} />
            <Route path="/actividades" element={<MyActivities />} />
            <Route path="/grabar" element={<RecordActivity />} />
            <Route path="/rutas" element={<RoutesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
