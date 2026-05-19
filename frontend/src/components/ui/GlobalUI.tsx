import { useDataStore } from '../../store/useDataStore';
import { ModalPortal } from './ModalPortal';

export const GlobalUI = () => {
  const { toast, notifExiting, hideToast, confirmation, hideConfirm } = useDataStore();

  return (
    <>
      {/* Global Toast */}
      {toast && (
        <ModalPortal>
          <div className={notifExiting ? "animate-slide-out" : "animate-scale-in"} style={{
            position: 'fixed',
            top: '40px',
            right: '40px',
            padding: '16px 28px',
            background: toast.type === 'error' ? 'rgba(255, 51, 102, 0.15)' : (toast.type === 'warning' ? 'rgba(255, 204, 0, 0.15)' : 'rgba(0, 255, 136, 0.15)'),
            backdropFilter: 'blur(10px)',
            color: toast.type === 'error' ? 'var(--c-danger)' : (toast.type === 'warning' ? 'var(--c-warning)' : 'var(--c-success)'),
            borderRadius: '12px',
            fontWeight: 'bold',
            zIndex: 11000,
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: `1px solid ${toast.type === 'error' ? 'rgba(255, 51, 102, 0.3)' : (toast.type === 'warning' ? 'rgba(255, 204, 0, 0.3)' : 'rgba(0, 255, 136, 0.3)')}`,
            cursor: 'pointer'
          }} onClick={hideToast}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              borderRadius: '50%', 
              background: toast.type === 'error' ? 'var(--c-danger)' : (toast.type === 'warning' ? 'var(--c-warning)' : 'var(--c-success)'), 
              color: '#000', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '14px' 
            }}>
              {toast.type === 'error' ? '✕' : (toast.type === 'warning' ? '!' : '✓')}
            </div>
            {toast.message}
          </div>
        </ModalPortal>
      )}

      {/* Global Confirmation */}
      {confirmation && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11005, backdropFilter: 'blur(8px)' }}>
            <div className="glass-panel animate-scale-in" style={{ 
              width: '420px', 
              padding: '40px', 
              textAlign: 'center',
              border: `1px solid ${confirmation.type === 'danger' ? 'rgba(255, 51, 102, 0.3)' : 'rgba(176, 80, 255, 0.3)'}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: confirmation.type === 'danger' ? 'rgba(255, 51, 102, 0.1)' : 'rgba(176, 80, 255, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 24px auto' 
              }}>
                <span style={{ fontSize: '32px' }}>{confirmation.type === 'danger' ? '⚠️' : '❓'}</span>
              </div>
              <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.5rem', color: 'var(--c-text-primary)' }}>
                {confirmation.type === 'danger' ? 'Удалить запись?' : 'Подтверждение'}
              </h3>
              <p style={{ color: 'var(--c-text-muted)', marginBottom: '32px', lineHeight: '1.6', fontSize: '1rem' }}>
                {confirmation.message}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => { if (confirmation.onCancel) confirmation.onCancel(); hideConfirm(); }} 
                  style={{ flex: 1, padding: '14px', background: 'rgba(var(--c-accent-rgb), 0.05)', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                >
                  ОТМЕНА
                </button>
                <button 
                  onClick={() => { confirmation.onConfirm(); hideConfirm(); }} 
                  style={{ 
                    flex: 1.5, 
                    padding: '14px', 
                    background: confirmation.type === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    fontSize: '14px',
                    boxShadow: confirmation.type === 'danger' ? '0 4px 15px rgba(255, 51, 102, 0.3)' : '0 4px 15px rgba(176, 80, 255, 0.3)'
                  }}
                >
                  {confirmation.type === 'danger' ? 'ДА, УДАЛИТЬ' : 'ПОДТВЕРДИТЬ'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};
