import type { ApiAuthSession } from '../../lib/api.js';

type AuthSessionCardProps = {
  authSession: ApiAuthSession | null;
  isCapturing: boolean;
  targetUrl: string;
  onCapture: () => void;
};

function getStatusLabel(status: ApiAuthSession['status'] | undefined): string
{
  switch (status)
  {
    case 'ready':
      return 'Сессия готова';
    case 'capturing':
      return 'Идёт сохранение';
    case 'failed':
      return 'Ошибка сохранения';
    case 'missing':
    default:
      return 'Сессия не сохранена';
  }
}

export function AuthSessionCard({ authSession, isCapturing, targetUrl, onCapture }: AuthSessionCardProps)
{
  const statusLabel = getStatusLabel(authSession?.status);

  return (
    <section className="sidebar-section sidebar-section-auth" aria-labelledby="auth-heading">
      <div className="sidebar-section-heading">
        <div>
          <p className="eyebrow">Auth Session</p>
          <h2 id="auth-heading">Saved Login</h2>
        </div>
      </div>

      <p className="sidebar-copy">
        Откроется отдельное окно Chrome. Войдите один раз и дождитесь возврата на целевую страницу. Перед каждым авторизованным прогоном сессия проверяется автоматически.
      </p>

      <div className="auth-session-status">
        <strong>{statusLabel}</strong>
        <span>{authSession?.targetUrl ?? targetUrl}</span>
      </div>

      {authSession?.error ? (
        <p className="message-banner message-banner-error">{authSession.error}</p>
      ) : null}

      <button
        type="button"
        className="primary-button"
        disabled={isCapturing}
        onClick={onCapture}
      >
        {isCapturing ? 'Ожидание входа…' : 'Открыть окно входа'}
      </button>
    </section>
  );
}
