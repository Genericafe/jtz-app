import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { stripeApi } from '../services/api';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const sessionId = params.get('session_id');
    const paymentId = params.get('payment_id');

    if (!sessionId || !paymentId) {
      setStatus('error');
      return;
    }

    stripeApi.verifyPayment(sessionId, paymentId)
      .then((res) => setStatus(res.data.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [params]);

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <Loader size={48} className="mx-auto text-brand-400 animate-spin mb-4" />
            <p className="text-white font-semibold text-lg">Verificando pago...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={56} className="mx-auto text-green-400 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">¡Pago exitoso!</h1>
            <p className="text-gray-400 mb-6">Tu pago ha sido procesado correctamente. Ya está registrado en tu cuenta.</p>
            <Link to="/" className="inline-block bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">
              Ir al inicio
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto text-red-400 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">No se pudo confirmar</h1>
            <p className="text-gray-400 mb-6">El pago pudo no haberse completado o hubo un error al verificarlo. Contacta a tu coach.</p>
            <Link to="/pagos" className="inline-block bg-dark-700 hover:bg-dark-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">
              Ver mis pagos
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
