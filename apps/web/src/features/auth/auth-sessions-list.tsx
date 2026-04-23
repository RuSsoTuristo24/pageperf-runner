import { useState } from 'react';

import type { ApiAuthSession } from '../../lib/api.js';

type AuthSessionsListProps = {
  sessions: ApiAuthSession[];
  capturingHost: string | null;
  onCapture: (targetUrl: string) => void;
  onRecapture: (host: string, targetUrl?: string) => void;
  onDelete: (host: string) => void;
};

function getStatusLabel(status: ApiAuthSession['status']): string
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

function formatUpdatedAt(updatedAt: string | undefined): string | null
{
  if (!updatedAt)
  {
    return null;
  }

  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp))
  {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1)
  {
    return 'только что';
  }
  if (diffMinutes < 60)
  {
    return `${diffMinutes} мин назад`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24)
  {
    return `${diffHours} ч назад`;
  }

  const diffDays = Math.round(diffHours / 24);

  return `${diffDays} дн назад`;
}

export function AuthSessionsList(props: AuthSessionsListProps)
{
  const { sessions, capturingHost, onCapture, onRecapture, onDelete } = props;
  const [isAdding, setIsAdding] = useState(false);
  const [newTargetUrl, setNewTargetUrl] = useState('');

  function handleSubmitNew(): void
  {
    const trimmed = newTargetUrl.trim();
    if (!trimmed)
    {
      return;
    }

    onCapture(trimmed);
    setNewTargetUrl('');
    setIsAdding(false);
  }

  return (
    <section className="sidebar-section sidebar-section-auth" aria-labelledby="auth-heading">
      <div className="sidebar-section-heading">
        <div>
          <p className="eyebrow">Auth Sessions</p>
          <h2 id="auth-heading">Saved Logins</h2>
        </div>
      </div>

      <p className="sidebar-copy">
        Откроется отдельное окно Chrome. Войдите один раз и дождитесь возврата на целевую страницу. Перед каждым авторизованным прогоном сессия проверяется автоматически.
      </p>

      {sessions.length === 0 && !isAdding ? (
        <p className="sidebar-copy">Нет сохранённых сессий.</p>
      ) : null}

      {sessions.map((session) => {
        const updatedLabel = formatUpdatedAt(session.updatedAt);
        const isBusy = capturingHost === session.host || session.status === 'capturing';
        const canRecapture = session.status !== 'capturing';

        return (
          <div
            key={session.host}
            className="auth-session-status"
            aria-label={`Auth session ${session.host}`}
          >
            <strong>{session.host}</strong>
            <span>
              {getStatusLabel(session.status)}
              {updatedLabel ? ` (обновлено ${updatedLabel})` : ''}
            </span>
            {session.targetUrl ? <span>{session.targetUrl}</span> : null}

            {session.error ? (
              <p className="message-banner message-banner-error">{session.error}</p>
            ) : null}

            <div className="auth-session-actions">
              <button
                type="button"
                className="primary-button primary-button-inline"
                disabled={isBusy || !canRecapture}
                onClick={() => onRecapture(session.host, session.targetUrl)}
              >
                {isBusy
                  ? 'Ожидание входа…'
                  : session.status === 'ready' ? 'Переснять' : 'Снять сессию'}
              </button>
              <button
                type="button"
                className="secondary-button secondary-button-compact secondary-button-danger"
                onClick={() => onDelete(session.host)}
                disabled={isBusy}
              >
                Удалить
              </button>
            </div>
          </div>
        );
      })}

      {isAdding ? (
        <div className="auth-session-add">
          <label className="field">
            <span>URL для входа</span>
            <input
              aria-label="URL для входа"
              type="url"
              value={newTargetUrl}
              placeholder="https://portal.bitrix24.ru/"
              onChange={(event) => setNewTargetUrl(event.target.value)}
            />
          </label>
          <div className="auth-session-actions">
            <button
              type="button"
              className="primary-button primary-button-inline"
              onClick={handleSubmitNew}
              disabled={newTargetUrl.trim() === ''}
            >
              Открыть окно входа
            </button>
            <button
              type="button"
              className="secondary-button secondary-button-compact"
              onClick={() => {
                setIsAdding(false);
                setNewTargetUrl('');
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary-button secondary-button-compact"
          onClick={() => setIsAdding(true)}
        >
          + Добавить вход…
        </button>
      )}
    </section>
  );
}
