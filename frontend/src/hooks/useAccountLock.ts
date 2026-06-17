import { useQuery } from '@tanstack/react-query';
import { runnersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Pay { estado: string; fechaVencimiento?: string | null }

// A runner is "locked" when they have an overdue payment (estado 'vencido', or a
// 'pendiente' payment past its due date). While locked, access is limited to
// payments, store and the private chat — see Layout/Sidebar.
export const LOCK_ALLOWED = ['/pagos', '/tienda', '/chat', '/perfil', '/configuracion'];

export function isPathAllowedWhileLocked(pathname: string): boolean {
  return LOCK_ALLOWED.some(a => pathname === a || pathname.startsWith(a + '/'));
}

export function useAccountLock() {
  const { isCoach, user } = useAuth();
  const { data } = useQuery({
    queryKey: ['runner-me'],
    queryFn: () => runnersApi.me(),
    enabled: !isCoach && !!user,
  });

  const payments: Pay[] = data?.data?.payments ?? [];
  const now = Date.now();
  const locked = !isCoach && payments.some(p =>
    p.estado === 'vencido' ||
    (p.estado === 'pendiente' && p.fechaVencimiento != null && new Date(p.fechaVencimiento).getTime() < now),
  );

  return { locked };
}
