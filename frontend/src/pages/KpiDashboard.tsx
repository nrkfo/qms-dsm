import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { api } from '../utils/api';
import { Users, Target, ShieldCheck, Clock, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

// Replicating OQA Production Logic for Dynamic AQL Plan

const getAqlPlan = (produced: number, config: any) => {
  if (produced <= 0) return 0;
  const ratio = (config.ratio_checked || 13) / (config.ratio_produced || 280);
  return Math.round(produced * ratio);
};

const getPageName = (path: string) => {
  if (!path) return 'Неизвестно';
  if (path.includes('/dashboard')) return '📊 Дашборд';
  if (path.includes('/kpi')) return '📈 KPI сотрудников';
  if (path.includes('/oqa/tv')) return '📺 Выборочный контроль ГП';
  if (path.includes('/oqa/pallets')) return '📦 Приемка паллет ГП';
  if (path.includes('/oqa/labels')) return '🏷️ Проверка этикетки';
  if (path.includes('/oqa/patrol')) return '🚶 Журнал обхода';
  if (path.includes('/iqc/aql-calculator')) return '🧮 Калькулятор AQL';
  if (path.includes('/iqc/aql')) return '📋 Входной контроль AQL';
  if (path.includes('/iqc/panels')) return '🧱 Проверка панелей';
  if (path.includes('/iqc/eps')) return '📐 Замеры пеновкладышей';
  if (path.includes('/iqc/covers')) return '⚙️ Замеры крышек';
  if (path.includes('/iqc/components')) return '🧩 Проверка комплектующих';
  if (path.includes('/admin')) return '🛠️ Панель администратора';
  return path;
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'Admin': return 'Администратор';
    case 'Inspector': return 'Инспектор';
    case 'Warehouse': return 'Склад';
    case 'Production': return 'Производство';
    case 'Technologist': return 'Технолог';
    case 'Master': return 'Мастер смены';
    case 'Viewer': return 'Наблюдатель';
    default: return role;
  }
};

const getRoleStyle = (role: string) => {
  switch (role) {
    case 'Admin': return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
    case 'Inspector': return { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' };
    case 'Warehouse': return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' };
    case 'Production': return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' };
    case 'Technologist': return { background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' };
    case 'Master': return { background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', border: '1px solid rgba(236, 72, 153, 0.3)' };
    case 'Viewer': return { background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af', border: '1px solid rgba(107, 114, 128, 0.3)' };
    default: return { background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)' };
  }
};

export const KpiDashboard = () => {
  const { 
    settings, fetchSettings, activeLot, fetchLots,
    mesFact, mesLoading, fetchMesFact
  } = useDataStore();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showAllDates, setShowAllDates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [globalMetrics, setGlobalMetrics] = useState<any[]>([]);
  const [currentAqlPlan, setCurrentAqlPlan] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, setIsLive] = useState(false);
  const pulseRef = useRef<any>(null);

  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerifyAndClose = async () => {
    setIsVerifying(true);
    setPasswordError('');
    try {
      await api.post('/auth/verify', { password: passwordInput });
      await useDataStore.getState().saveKpiFacts(dateFilter, mesFact || 0, currentAqlPlan);
      setShowPasswordModal(false);
      setPasswordInput('');
    } catch (e: any) {
      console.error('Password verification failed', e);
      setPasswordError('Неверный пароль. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const data = await api.get('/users');
      setAllUsers(data);
    } catch (e) {
      console.error('Failed to fetch users', e);
    }
  };

  const fetchActiveSessions = async () => {
    try {
      const data = await api.get('/users/active-sessions');
      setActiveSessions(data);
    } catch (e) {
      console.error('Failed to fetch active sessions', e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchLots();
    fetchBackupStatus();
    fetchAllUsers();
    fetchActiveSessions();
  }, []);

  useEffect(() => {
    const updatePlan = () => {
      if (settings.oqa_shift_config) {
        try {
          const config = JSON.parse(settings.oqa_shift_config);
          const fact = mesFact || 0;
          const plan = getAqlPlan(fact, config);
          setCurrentAqlPlan(plan);
        } catch (e) {}
      }
    };
    updatePlan();
  }, [settings.oqa_shift_config, mesFact]);

  useEffect(() => {
    fetchMesFact(dateFilter);
  }, [dateFilter]);

  useEffect(() => {
    fetchKpiData();
    fetchGlobalMetrics();
  }, [dateFilter, activeLot?.id]);

  // Real-time SSE
  useEffect(() => {
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DATA_UPDATED') {
          console.log('Real-time update received:', data);
          fetchMesFact(dateFilter);
          fetchKpiData();
          fetchGlobalMetrics();
          fetchBackupStatus();
          setLastUpdate(new Date());
          setIsLive(true);
          if (pulseRef.current) clearTimeout(pulseRef.current);
          pulseRef.current = setTimeout(() => setIsLive(false), 2000);
        } else if (data.type === 'USER_SESSIONS_UPDATED') {
          console.log('User sessions update received:', data.sessions);
          setActiveSessions(data.sessions);
        }
      } catch (e) { console.error(e); }
    };
    return () => eventSource.close();
  }, [dateFilter, activeLot?.id]);

  const fetchBackupStatus = async () => {
    try {
      const res = await api.get('/backup/status');
      if (res && res.lastBackupTime) {
        const localTime = new Date(res.lastBackupTime).toLocaleString('ru-RU');
        setLastBackupTime(localTime);
      }
    } catch (e) {
      console.error('Failed to fetch backup status', e);
    }
  };

  const fetchGlobalMetrics = async () => {
    try {
      const data = await api.get(`/metrics?date=${dateFilter}&lot_id=${activeLot?.id || ''}`);
      setGlobalMetrics(data);
    } catch (e) { console.error(e); }
  };

  const fetchKpiData = async () => {
    if (!stats) setLoading(true);
    try {
      const lotIdParam = activeLot?.id ? `&lot_id=${activeLot.id}` : '';
      const logs = await api.get(`/logs/oqa_tv?date=${dateFilter}${lotIdParam}`);
      
      let breaks = [];
      try {
        breaks = await api.get('/breaks');
      } catch (err) {
        console.error('Failed to fetch breaks', err);
      }
      
      const inspectors: any = {};
      const logIdToInspector: any = {};
      
      logs.forEach((log: any) => {
        const inspectorNum = log.data?.inspector || '0';
        const name = `Инспектор ${inspectorNum}`;
        
        if (!inspectors[inspectorNum]) {
          inspectors[inspectorNum] = {
            id: inspectorNum,
            name: name,
            totalChecked: 0,
            times: [],
            updates: 0,
            lastCheckTime: null
          };
        }
        
        inspectors[inspectorNum].totalChecked++;
        logIdToInspector[log.id] = inspectorNum;

        if (log.timestamp) {
          const time = new Date(log.timestamp);
          const ts = time.getTime();
          inspectors[inspectorNum].times.push(ts);
          if (!inspectors[inspectorNum].lastCheckTime || ts > inspectors[inspectorNum].lastCheckTime) {
            inspectors[inspectorNum].lastCheckTime = ts;
          }
        }
      });

      // Reverting to hardcoded defaults as requested
      const inspectorsCount = 3;
      const leadTimeTarget = 28;
      const personalTarget = currentAqlPlan > 0 ? Math.max(1, Math.round(currentAqlPlan / inspectorsCount)) : 0;

      const processed = Object.values(inspectors).map((insp: any) => {
        const compliance = Math.min(100, (insp.totalChecked / personalTarget) * 100);
        const errorRate = (insp.updates / (insp.totalChecked || 1)) * 100;
        const integrity = Math.max(0, 100 - errorRate);
        const sortedTimes = [...insp.times].sort((a, b) => a - b);
        let totalInterval = 0;
        let intervalCount = 0;
        let lastInterval = 0;
        
        for (let i = 1; i < sortedTimes.length; i++) {
          const t1 = sortedTimes[i - 1];
          const t2 = sortedTimes[i];
          
          let breakOverlapMs = 0;
          breaks.forEach((B: any) => {
            if (!B.start_time || !B.end_time) return;
            const [sh, sm] = B.start_time.split(':');
            const [eh, em] = B.end_time.split(':');
            
            // Construct start/end of break on target dateFilter day
            const bStart = new Date(`${dateFilter}T${sh}:${sm}:00`).getTime();
            const bEnd = new Date(`${dateFilter}T${eh}:${em}:00`).getTime();
            
            if (isNaN(bStart) || isNaN(bEnd)) return;
            
            // Math overlap: max(0, min(t2, bEnd) - max(t1, bStart))
            const overlap = Math.max(0, Math.min(t2, bEnd) - Math.max(t1, bStart));
            breakOverlapMs += overlap;
          });
          
          const rawDiffMs = t2 - t1;
          const netDiffMs = Math.max(0, rawDiffMs - breakOverlapMs);
          const diff = netDiffMs / (1000 * 60);
          
          lastInterval = diff; // Обновляем всегда, чтобы видеть реальное последнее время
          if (diff < 60) { 
            totalInterval += diff; 
            intervalCount++; 
          }
        }
        const avgLeadTime = intervalCount > 0 ? totalInterval / intervalCount : 0;

        return { 
          ...insp, 
          compliance, 
          integrity, 
          avgLeadTime, 
          lastInterval,
          personalTarget,
          leadTimeTarget
        };
      });

      processed.sort((a: any, b: any) => a.id.localeCompare(b.id));
      setStats(processed);
    } catch (e) {
      console.error('Failed to fetch KPI data', e);
    } finally {
      setLoading(false);
    }
  };

  const oqaMetric = globalMetrics.find(m => m.module_id === 'oqa_tv') || { total_passed: 0, total_failed: 0 };
  const totalCheckedGlobal = oqaMetric.total_passed + oqaMetric.total_failed;
  const sessionsMap = new Map(activeSessions.map(s => [s.userId, s]));

  const ALL_MODULES = [
    { id: 'oqa_tv', title: 'Выборочный контроль ГП', desc: 'Проверено ТВ' },
    { id: 'oqa_pallets', title: 'Приемка паллет ГП', desc: 'Проверено поддонов' },
    { id: 'oqa_labels', title: 'Проверка этикетки', desc: 'сканирований этикеток' },
    { id: 'oqa_patrol', title: 'Журнал обхода', desc: 'обходов выполнено' },
    { id: 'iqc_aql', title: 'Журнал входного контроля AQL', desc: 'партий проверено' },
    { id: 'iqc_panels', title: 'Проверка панелей', desc: 'панелей проверено' },
    { id: 'iqc_eps', title: 'Замеры пеновкладышей', desc: 'замеров сделано' },
    { id: 'iqc_covers', title: 'Замеры крышек', desc: 'деталей проверено' },
    { id: 'iqc_components', title: 'Проверка комплектующих', desc: 'позиций принято' },
  ];

  const getModuleMetric = (moduleId: string) => {
    const metric = globalMetrics.find(m => m.module_id === moduleId);
    return metric || { total_passed: 0, total_failed: 0 };
  };

  const renderMetricCircle = (value: number, color: string, title: string, subtitle: string) => {
    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="80" height="80" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r={radius} stroke="var(--c-bg-base)" strokeWidth="6" fill="transparent" />
            <circle 
              cx="50" cy="50" r={radius} 
              stroke={color} strokeWidth="6" fill="transparent" 
              strokeDasharray={circumference} 
              strokeDashoffset={offset} 
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', fontSize: '1rem', fontWeight: 'bold' }}>{Math.round(value)}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--c-text-muted)' }}>{subtitle}</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '100%', padding: '0 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
            <TrendingUp color="var(--c-accent)" size={28} /> KPI сотрудников
            {isLive && <Zap size={20} color="var(--c-warning)" />}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isLive ? 'var(--c-warning)' : 'var(--c-success)', transition: 'background 0.3s' }}></div>
            <p style={{ color: 'var(--c-text-secondary)', margin: 0, fontSize: '0.9rem' }}>
              Обновлено: {lastUpdate.toLocaleTimeString()} | Лот: {activeLot?.name || '...'}
              {lastBackupTime && ` | Последний бэкап: ${lastBackupTime}`}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
           <div className="glass-panel" style={{ padding: '8px 15px', borderRadius: 'var(--radius-md)', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>Дата:</label>
            <input 
              type="date" 
              className="glass" 
              value={dateFilter} 
              disabled={showAllDates}
              onChange={e => setDateFilter(e.target.value)} 
              style={{ border: 'none', background: 'transparent', color: 'var(--c-text-primary)', outline: 'none', fontSize: '0.9rem', opacity: showAllDates ? 0.5 : 1 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--c-text-primary)', cursor: 'pointer', userSelect: 'none' }}>
            <input 
              type="checkbox" 
              checked={showAllDates} 
              onChange={(e) => {
                const checked = e.target.checked;
                setShowAllDates(checked);
                if (checked) {
                  setDateFilter('');
                } else {
                  setDateFilter(new Date().toISOString().split('T')[0]);
                }
              }}
              style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--c-accent)' }}
            />
            📅 Все даты
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
         <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--c-accent)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>ФАКТ ВЫПУСКА (MES)</h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--c-text-primary)' }}>
                {mesFact ?? '...'} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>шт</span>
              </div>
              <button
                onClick={() => {
                  setPasswordInput('');
                  setPasswordError('');
                  setShowPasswordModal(true);
                }}
                className="hover-scale"
                style={{
                  padding: '6px 12px',
                  background: 'var(--c-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                🔒 Завершить смену
              </button>
            </div>
            <div style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', marginTop: '10px' }}>реальные данные из MES</div>
         </div>
         <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--c-success)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>ВЫПОЛНЕНИЕ ПЛАНА (AQL)</h4>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
               {currentAqlPlan > 0 ? ((totalCheckedGlobal / currentAqlPlan) * 100).toFixed(1) : '0'}%
            </div>
            <div style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem' }}>{totalCheckedGlobal} из {currentAqlPlan} необходимых</div>
         </div>
         <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--c-warning)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>НОРМА НА 1 ИНСПЕКТОРА</h4>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{Math.round(currentAqlPlan / 3)}</div>
            <div style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem' }}>при текущем выпуске</div>
         </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--c-accent)' }}>Производительность инспекторов</h3>
          <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {loading && !stats ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px' }}>
                <div className="spinner"></div>
              </div>
            ) : stats?.length > 0 ? stats.map((insp: any) => {
              const personalTarget = currentAqlPlan > 0 ? Math.max(1, Math.round(currentAqlPlan / 3)) : 0;
              const compliance = personalTarget > 0 ? Math.min(100, Math.round((insp.totalChecked / personalTarget) * 100)) : 100;
              return (
                <div key={insp.id} className="glass-panel" style={{ padding: '25px', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'var(--c-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-accent)', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        {insp.id}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{insp.name}</h3>
                        <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
                          Последняя проверка: <span style={{ color: 'var(--c-text-primary)' }}>{insp.lastCheckTime ? new Date(insp.lastCheckTime).toLocaleTimeString() : '---'}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ padding: '4px 10px', background: compliance >= 100 ? 'var(--c-success-muted)' : compliance >= 80 ? 'var(--c-warning-muted)' : 'var(--c-danger-muted)', color: compliance >= 100 ? 'var(--c-success)' : compliance >= 80 ? 'var(--c-warning)' : 'var(--c-danger)', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                        {compliance >= 100 ? 'ЦЕЛЬ ДОСТИГНУТА' : 'В ПРОЦЕССЕ'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    {renderMetricCircle(compliance, 'var(--c-accent)', 'Sampling', `${insp.totalChecked} / ${personalTarget}`)}
                    {renderMetricCircle(insp.integrity, 'var(--c-success)', 'Integrity', 'Достоверность')}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: insp.avgLeadTime > insp.leadTimeTarget ? 'var(--c-danger)' : 'var(--c-success)' }}>
                          {Math.round(insp.avgLeadTime)}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--c-text-muted)', textTransform: 'uppercase' }}>мин/ТВ</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Lead Time</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--c-text-muted)' }}>Среднее: {insp.avgLeadTime.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                     <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '5px' }}>
                        <span style={{ color: 'var(--c-text-muted)' }}>Темп последнего интервала</span>
                        <span style={{ fontWeight: 'bold', color: insp.lastInterval > insp.leadTimeTarget ? 'var(--c-danger)' : 'var(--c-success)' }}>
                          {insp.lastInterval > 0 ? insp.lastInterval.toFixed(1) : '--'} мин
                        </span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--c-bg-base)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, personalTarget > 0 ? (insp.totalChecked / personalTarget) * 100 : 0)}%`, height: '100%', background: compliance >= 100 ? 'var(--c-success)' : 'var(--c-accent)' }}></div>
                      </div>
                    </div>
                    {insp.avgLeadTime > insp.leadTimeTarget && <span title="Превышение среднего времени"><AlertTriangle size={18} color="var(--c-danger)" /></span>}
                    {insp.lastInterval > (insp.leadTimeTarget + 12) && <span title="Длительный перерыв между проверками"><Clock size={18} color="var(--c-warning)" /></span>}
                  </div>
                </div>
              );
            }) : (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px', background: 'var(--c-bg-surface-glass)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--c-border)' }}>
                 <Users size={48} color="var(--c-text-muted)" style={{ marginBottom: '20px', opacity: 0.5 }} />
                 <p style={{ color: 'var(--c-text-muted)' }}>Записей о проверках не найдено.</p>
              </div>
            )}
          </div>
        </div>

        {/* Analytics and Activity Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--c-border)', paddingTop: '25px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--c-accent)' }}>Активность пользователей и аналитика</h3>
          <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', alignItems: 'stretch' }}>
            {/* User Activity Tracker Card */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <style>{`
                @keyframes pulse-neon {
                  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                  70% { transform: scale(1.2); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
              `}</style>
              <h4 style={{ margin: '0 0 5px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={16} color="var(--c-accent)" /> Активность пользователей
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                {allUsers.length === 0 ? (
                  <div style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px' }}>
                    Загрузка пользователей...
                  </div>
                ) : (
                  allUsers.map((u: any) => {
                    const session = sessionsMap.get(u.id);
                    const isOnline = !!session;
                    
                    return (
                      <div 
                        key={u.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: isOnline ? 'var(--c-bg-surface-elevated)' : 'transparent',
                          borderRadius: '8px',
                          border: isOnline ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--c-border)',
                          transition: 'all 0.3s ease',
                          gap: '15px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          {/* Avatar */}
                          <div style={{ flexShrink: 0, position: 'relative', width: '36px', height: '36px', borderRadius: '50%', background: isOnline ? 'var(--c-accent-muted)' : 'var(--c-bg-base)', border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: isOnline ? 'var(--c-accent)' : 'var(--c-text-muted)', userSelect: 'none' }}>
                              {u.username.substring(0, 2).toUpperCase()}
                            </span>
                            <span 
                              style={{ 
                                position: 'absolute', 
                                bottom: '-1px', 
                                right: '-1px', 
                                width: '9px', 
                                height: '9px', 
                                borderRadius: '50%', 
                                background: isOnline ? '#10b981' : '#6b7280', 
                                boxShadow: isOnline ? '0 0 8px #10b981' : 'none',
                                border: '1.5px solid var(--c-bg-base)',
                                animation: isOnline ? 'pulse-neon 2s infinite' : 'none'
                              }}
                            />
                          </div>
                          
                          {/* User & Role */}
                          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
                              {u.username}
                            </span>
                            <span style={{ 
                              fontSize: '0.65rem', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              marginTop: '3px',
                              alignSelf: 'flex-start',
                              fontWeight: 500,
                              flexShrink: 0,
                              ...getRoleStyle(u.role)
                            }}>
                              {getRoleLabel(u.role)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Location Badge */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                          {isOnline ? (
                            <>
                              <span style={{ 
                                fontSize: '0.7rem', 
                                fontWeight: 500, 
                                color: '#8b5cf6', 
                                background: 'rgba(139, 92, 246, 0.12)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(139, 92, 246, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                              }}>
                                {getPageName(session.currentUrl)}
                              </span>
                              <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 500, flexShrink: 0 }}>
                                активен
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', flexShrink: 0 }}>
                              оффлайн
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
               <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                 <TrendingUp size={16} color="var(--c-accent)" /> Распределение нагрузки (Проверки)
               </h4>
               <div style={{ width: '100%', height: 260, position: 'relative' }}>
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={ALL_MODULES.map(m => {
                         const met = getModuleMetric(m.id);
                         return { name: m.title.split(' ').slice(0, 2).join(' '), value: met.total_passed + met.total_failed };
                       }).filter(m => m.value > 0)}
                       cx="50%"
                       cy="50%"
                       innerRadius={45}
                       outerRadius={85}
                       paddingAngle={2}
                       dataKey="value"
                       stroke="none"
                       isAnimationActive={false}
                     >
                       {ALL_MODULES.map((m, index) => {
                         const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#6366F1', '#14B8A6', '#F43F5E'];
                         return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                       })}
                     </Pie>
                     <RechartsTooltip 
                       contentStyle={{ backgroundColor: 'var(--c-bg-surface-elevated)', borderColor: 'var(--c-border)', color: 'var(--c-text-primary)', borderRadius: '8px' }}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, var(--c-accent-muted), var(--c-bg-surface-elevated))' }}>
               <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--c-accent)' }}>Статус OQA</h4>
               <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                  {totalCheckedGlobal}
               </div>
               <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>единиц проверено сегодня</div>
            </div>
            
            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
               <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem' }}>Легенда KPI</h4>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--c-accent)', marginTop: '2px' }}></div>
                     <div>
                        <strong>Sampling Compliance:</strong>
                        <div style={{ color: 'var(--c-text-muted)', fontSize: '0.7rem' }}>Выполнение индивидуального плана AQL (процент от нормы на смену).</div>
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--c-success)', marginTop: '2px' }}></div>
                     <div>
                        <strong>Data Integrity:</strong>
                        <div style={{ color: 'var(--c-text-muted)', fontSize: '0.7rem' }}>Достоверность данных. Снижается, если записи редактировались вручную.</div>
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--c-danger)', marginTop: '2px' }}></div>
                     <div>
                        <strong>Lead Time:</strong>
                        <div style={{ color: 'var(--c-text-muted)', fontSize: '0.7rem' }}>Среднее время проверки (Норма: 28 мин). Красный цвет — превышение.</div>
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', alignItems: 'center', borderTop: '1px solid var(--c-border)', paddingTop: '10px' }}>
                     <Zap size={14} color="var(--c-warning)" />
                     <span style={{ color: 'var(--c-text-muted)' }}>Real-time обновление активно</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fade-in 0.2s ease'
        }}>
          <div className="glass-panel animate-scale-in" style={{
            width: '400px',
            padding: '30px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--c-accent-muted)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🔒 Подтверждение пароля
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)', marginBottom: '20px' }}>
              Для завершения смены и сохранения всех данных KPI в базу, пожалуйста, введите текущий пароль от вашего аккаунта.
            </p>
            
            <input 
              type="password"
              placeholder="Введите ваш пароль"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await handleVerifyAndClose();
                }
              }}
              disabled={isVerifying}
              className="glass"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: passwordError ? '1px solid var(--c-danger)' : '1px solid var(--c-border)',
                background: 'var(--c-bg-surface-elevated)',
                color: 'var(--c-text-primary)',
                marginBottom: '15px',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              autoFocus
            />

            {passwordError && (
              <div style={{ color: 'var(--c-danger)', fontSize: '0.8rem', marginBottom: '15px', fontWeight: 'bold' }}>
                ⚠️ {passwordError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                disabled={isVerifying}
                style={{
                  padding: '10px 18px',
                  background: 'transparent',
                  border: '1px solid var(--c-border)',
                  borderRadius: '6px',
                  color: 'var(--c-text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                Отмена
              </button>
              <button 
                onClick={handleVerifyAndClose}
                disabled={isVerifying || !passwordInput}
                style={{
                  padding: '10px 18px',
                  background: 'var(--c-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isVerifying ? 'Проверка...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
