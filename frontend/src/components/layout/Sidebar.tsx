import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { useThemeStore } from '../../store/useThemeStore';
import { LogOut, Home, Monitor, Combine, ClipboardList, Layers, Box, PenTool, QrCode, Sun, Moon, ChevronLeft, ChevronRight, TrendingUp, Calculator } from 'lucide-react';

export const Sidebar = () => {
  const { user, logout } = useAuthStore();
  const { lastLabelCheckTimestamp, activeLot } = useDataStore();
  const { theme, toggleTheme } = useThemeStore();
  const [isLabelAlarm, setIsLabelAlarm] = useState(false);
  const [isLotModalOpen, setIsLotModalOpen] = useState(false);
  const [draftLotId, setDraftLotId] = useState<number | null>(activeLot?.id || null);
  const [isCollapsedState, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCollapsed = isMobile ? false : isCollapsedState;

  useEffect(() => {
    const checkAlarm = () => {
      if (!lastLabelCheckTimestamp) return;
      const msPassed = Date.now() - lastLabelCheckTimestamp;
      const hoursPassed = msPassed / (1000 * 60 * 60);
      setIsLabelAlarm(hoursPassed >= 1);
    };

    checkAlarm();

    // 15 seconds interval check
    const interval = setInterval(checkAlarm, 15000);

    // Event listener for tab focus recovery
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAlarm();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lastLabelCheckTimestamp]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navStyles = ({ isActive }: { isActive: boolean }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: isCollapsed ? '0' : '10px',
    padding: isCollapsed ? '8px' : '8px 12px',
    justifyContent: isCollapsed ? 'center' : 'flex-start',
    borderRadius: 'var(--radius-sm)',
    color: isActive 
      ? (theme === 'light' ? 'var(--c-accent)' : 'var(--c-accent)') 
      : 'var(--c-text-secondary)',
    backgroundColor: isActive ? 'var(--c-accent-muted)' : 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left' as const,
    textDecoration: 'none',
    fontWeight: 500,
    marginBottom: '2px',
    transition: 'all 0.2s',
    fontSize: '0.8rem',
    cursor: 'pointer'
  });

  const isAdmin = user?.role === 'Admin';

  return (
    <aside style={{ 
      height: '100vh',
      width: isCollapsed ? '80px' : 'var(--sidebar-width)', 
      borderRight: '1px solid var(--c-border)', 
      padding: isCollapsed ? '20px 10px' : '25px 20px',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--c-bg-surface-elevated)',
      transition: 'width 0.3s ease, padding 0.3s ease',
      overflowX: 'hidden',
      boxShadow: '10px 0 30px rgba(0,0,0,0.15)',
      zIndex: 100
    }}>
      <div style={{ marginBottom: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', marginBottom: '10px' }}>
          {!isCollapsed && <h2 style={{ color: 'var(--c-accent)', margin: 0, textShadow: 'var(--shadow-neon)' }}>QMS</h2>}
          
          {!isMobile && (
            <button onClick={() => setIsCollapsed(!isCollapsedState)} className="glass" style={{ padding: '6px', display: 'flex', borderRadius: 'var(--radius-sm)' }}>
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>

        {/* Global Lot Selection Button */}
        <button 
          onClick={() => {
            useDataStore.getState().fetchLots();
            setIsLotModalOpen(true);
          }}
          className={activeLot ? "" : "glass"}
          style={{
            width: '100%',
            padding: isCollapsed ? '10px 0' : '10px 10px',
            borderRadius: 'var(--radius-sm)',
            border: activeLot ? 'none' : '1px solid var(--c-border)',
            background: activeLot ? 'var(--c-accent)' : 'var(--c-bg-surface-glass)',
            color: activeLot ? '#000' : 'var(--c-text-primary)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            boxShadow: activeLot ? '0 4px 15px rgba(0, 255, 128, 0.3)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, textAlign: 'left' }}>
              <span style={{ fontSize: '10px', color: activeLot ? 'rgba(0,0,0,0.7)' : 'var(--c-text-muted)', textTransform: 'uppercase', fontWeight: activeLot ? 'bold' : 'normal' }}>Текущий лот</span>
              <strong style={{ color: activeLot ? '#000' : '#ff4d4d', fontSize: '14px', marginTop: '2px' }}>
                {activeLot ? activeLot.name : 'Не выбран'}
              </strong>
            </div>
          )}
          <Box size={16} color={activeLot ? '#000' : 'var(--c-text-muted)'} />
        </button>
      </div>

      {isLotModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="glass-panel" style={{ width: '400px', padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--c-bg-surface-elevated)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--c-text-primary)' }}>Выберите лот</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {useDataStore.getState().lots.map(lot => (
                <button
                  key={lot.id}
                  onClick={() => setDraftLotId(lot.id)}
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    background: draftLotId === lot.id ? 'var(--c-accent-muted)' : 'var(--c-bg-surface-glass)',
                    border: draftLotId === lot.id ? '1px solid var(--c-accent)' : '1px solid var(--c-border)',
                    color: draftLotId === lot.id ? 'var(--c-accent)' : 'var(--c-text-primary)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: draftLotId === lot.id ? 'bold' : 'normal'
                  }}
                >
                  {lot.name}
                </button>
              ))}
              {useDataStore.getState().lots.length === 0 && <p style={{color: '#888'}}>Лоты не найдены</p>}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setIsLotModalOpen(false)}
                style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Отмена
              </button>
              <button 
                onClick={() => {
                  const targetLot = useDataStore.getState().lots.find(l => l.id === draftLotId);
                  if (targetLot) {
                    useDataStore.getState().setActiveLot(targetLot);
                  }
                  setIsLotModalOpen(false);
                }}
                disabled={!draftLotId}
                style={{ padding: '8px 15px', background: draftLotId ? 'var(--c-accent)' : 'var(--c-border)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: draftLotId ? 'pointer' : 'not-allowed' }}
              >
                ОК
              </button>
            </div>
          </div>
        </div>
      )}

      <nav 
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, paddingRight: isCollapsed ? '0' : '4px' }}
      >
        {(isAdmin || user?.permissions?.includes('dashboard')) && (
          <NavLink to="/app/dashboard" style={navStyles}>
            <Home size={18} /> {!isCollapsed && <span>Дашборд</span>}
          </NavLink>
        )}
        
        {isAdmin && (
          <NavLink to="/app/kpi" style={navStyles}>
            <TrendingUp size={18} /> {!isCollapsed && <span>KPI сотрудников</span>}
          </NavLink>
        )}

        {/* OQA MODULE */}
        {(isAdmin || user?.permissions?.some(p => p.startsWith('oqa_'))) && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: isCollapsed ? '0' : '12px', textAlign: isCollapsed ? 'center' : 'left' }}>OQA</p>
            
            {(isAdmin || user?.permissions?.includes('oqa_tv')) && (
              <NavLink to="/app/oqa/tv" style={navStyles}><Monitor size={18} /> {!isCollapsed && <span>Выборочный контроль ГП</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('oqa_pallets')) && (
              <NavLink to="/app/oqa/pallets" style={navStyles}><Box size={18} /> {!isCollapsed && <span>Приемка паллет ГП</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('oqa_labels')) && (
              <NavLink to="/app/oqa/labels" style={(props) => ({ 
                ...navStyles(props), 
                backgroundColor: isLabelAlarm ? 'rgba(255, 0, 0, 0.1)' : navStyles(props).backgroundColor, 
                color: isLabelAlarm ? '#ff4d4d' : navStyles(props).color,
                animation: isLabelAlarm ? 'blink-alarm 1.2s infinite' : 'none'
              })}>
                <QrCode size={18} /> {!isCollapsed && <span>Проверка этикетки</span>}
              </NavLink>
            )}

            {(isAdmin || user?.permissions?.includes('oqa_patrol')) && (
              <NavLink to="/app/oqa/patrol" style={navStyles}><ClipboardList size={18} /> {!isCollapsed && <span>Журнал обхода</span>}</NavLink>
            )}
          </div>
        )}

        {/* IQC MODULE */}
        {(isAdmin || user?.permissions?.some(p => p.startsWith('iqc_'))) && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: isCollapsed ? '0' : '12px', textAlign: isCollapsed ? 'center' : 'left' }}>IQC</p>
            
            {(isAdmin || user?.permissions?.includes('iqc_aql')) && (
              <NavLink to="/app/iqc/aql" style={navStyles}><ClipboardList size={18} /> {!isCollapsed && <span>Журнал входного контроля AQL</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('iqc_panels')) && (
              <NavLink to="/app/iqc/panels" style={navStyles}><Combine size={18} /> {!isCollapsed && <span>Проверка панелей</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('iqc_eps')) && (
              <NavLink to="/app/iqc/eps" style={navStyles}><Layers size={18} /> {!isCollapsed && <span>Замеры пеновкладышей</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('iqc_covers')) && (
              <NavLink to="/app/iqc/covers" style={navStyles}><PenTool size={18} /> {!isCollapsed && <span>Замеры крышек</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('iqc_components')) && (
              <NavLink to="/app/iqc/components" style={navStyles}><ClipboardList size={18} /> {!isCollapsed && <span>Проверка комплектующих</span>}</NavLink>
            )}
            
            {(isAdmin || user?.permissions?.includes('iqc_aql_calculator')) && (
              <NavLink to="/app/iqc/aql-calculator" style={navStyles}><Calculator size={18} /> {!isCollapsed && <span>Калькулятор AQL</span>}</NavLink>
            )}
          </div>
        )}

        {/* ADMIN MODULE */}
        {(isAdmin || user?.permissions?.includes('admin_panel')) && (
          <div style={{ marginTop: '12px' }}>
            {!isCollapsed && <p style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '12px' }}>Settings</p>}
            <NavLink to="/app/admin" style={navStyles}><Monitor size={18} /> {!isCollapsed && <span>Администрирование</span>}</NavLink>
          </div>
        )}
      </nav>

      <div style={{ 
        marginTop: 'auto', 
        paddingTop: '20px', 
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flexShrink: 0
      }}>
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          style={navStyles({ isActive: false })}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!isCollapsed && <span>{theme === 'dark' ? 'Светлая тема' : 'Темная тема'}</span>}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: isCollapsed ? '0' : '0 8px', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--c-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-accent)', fontWeight: 'bold', flexShrink: 0 }}>
            {user?.username?.[0]?.toUpperCase()}
          </div>
          {!isCollapsed && (
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user?.username}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>{user?.role}</div>
            </div>
          )}
        </div>
        <button 
          onClick={handleLogout}
          className="glass"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: '8px', borderRadius: 'var(--radius-sm)',
            color: 'var(--c-danger)', border: '1px solid var(--c-danger-muted)',
            background: 'transparent', cursor: 'pointer'
          }}
        >
        </button>
        
        {/* Footer License */}
        {!isCollapsed && (
          <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--c-text-muted)', textAlign: 'center', lineHeight: '1.3' }}>
            Copyright &copy; 2026 Izenov Nurbolat / DS Multimedia CA.<br/>All rights reserved.<br/>Proprietary and confidential.
          </div>
        )}
      </div>
    </aside>
  );
};

