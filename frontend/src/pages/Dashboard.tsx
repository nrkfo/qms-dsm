import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { api } from '../utils/api';
import { ChevronLeft, Tv, CheckCircle, TrendingUp, Zap, Layers } from 'lucide-react';

const getPhotosArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(item => typeof item === 'string' && item.startsWith('data:image/'));
  if (typeof val === 'string') {
    if (val.startsWith('data:image/')) return [val];
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.filter(item => typeof item === 'string' && item.startsWith('data:image/'));
    } catch (e) {}
  }
  return [];
};

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ');
    }
    return Object.entries(val)
      .map(([subK, subV]) => `${subK}: ${String(subV)}`)
      .join(', ');
  }
  return String(val);
};

export const Dashboard = () => {
  const { user } = useAuthStore();
  const { lots, fetchLots, settings, fetchSettings, activeLot, setActiveLot } = useDataStore();

  const [dateFilter, setDateFilter] = useState('');
  const [showAllDates, setShowAllDates] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [moduleLogs, setModuleLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updatePulseRef = useRef<any>(null);

  const [photoViewerImages, setPhotoViewerImages] = useState<string[] | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [flashingModules, setFlashingModules] = useState<Record<string, 'ok' | 'ng' | 'info'>>({});
  const prevMetricsRef = useRef<any[]>([]);

  useEffect(() => {
    fetchLots();
    fetchSettings();
    // Set default date to today YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    setDateFilter(today);
  }, []);

  useEffect(() => {
    fetchMetrics();
    if (selectedModule) fetchModuleLogs(selectedModule);
  }, [dateFilter, activeLot?.id, selectedModule]);

  useEffect(() => {
    setModuleLogs([]);
  }, [selectedModule]);

  // Automatic polling for metrics every 10 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchMetrics();
      if (selectedModule) {
        fetchModuleLogs(selectedModule);
      }
      setIsUpdating(true);
      if (updatePulseRef.current) clearTimeout(updatePulseRef.current);
      updatePulseRef.current = setTimeout(() => setIsUpdating(false), 1500);
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      if (updatePulseRef.current) clearTimeout(updatePulseRef.current);
    };
  }, [selectedModule, dateFilter, activeLot?.id]);

  // Real-time updates via SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connectSSE = () => {
      if (!isMounted) return;

      console.log('Connecting to real-time events on Dashboard...');
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        console.log('Dashboard SSE connected successfully');
        if (isMounted) {
          fetchMetrics();
          if (selectedModule) {
            fetchModuleLogs(selectedModule);
          }
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'DATA_UPDATED') {
            console.log('Real-time update received:', data);
            if (isMounted) {
              fetchMetrics();
              if (selectedModule) {
                fetchModuleLogs(selectedModule);
              }
              
              // Trigger immediate SSE-based card flash!
              if (data.module && data.module !== 'lots') {
                const flashType = (data.status === 'OK' || data.status === 'Accept') ? 'ok' : 'ng';
                setFlashingModules(prev => ({ ...prev, [data.module]: flashType }));
                setTimeout(() => {
                  if (isMounted) {
                    setFlashingModules(prev => {
                      const updated = { ...prev };
                      delete updated[data.module];
                      return updated;
                    });
                  }
                }, 1500);
              }

              // Also refresh lots if they were updated
              if (data.module === 'lots') {
                fetchLots();
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse SSE data', e);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('Dashboard EventSource failed, scheduling automatic reconnect in 3s...', err);
        if (eventSource) {
          eventSource.close();
        }
        
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          connectSSE();
        }, 3000);
      };
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [selectedModule, dateFilter, activeLot?.id]); // Reconnect when filters change to ensure we have the latest fetch functions in closure

  // Trigger card flash when metrics increase via background polling/refresh
  useEffect(() => {
    if (prevMetricsRef.current && prevMetricsRef.current.length > 0 && metrics.length > 0) {
      const newFlashes: Record<string, 'ok' | 'ng' | 'info'> = {};
      let hasChanges = false;
      
      metrics.forEach(newM => {
        const oldM = prevMetricsRef.current.find(o => o.module_id === newM.module_id);
        if (oldM) {
          const newPassed = Number(newM.total_passed || 0);
          const oldPassed = Number(oldM.total_passed || 0);
          const newFailed = Number(newM.total_failed || 0);
          const oldFailed = Number(oldM.total_failed || 0);
          
          if (newFailed > oldFailed) {
            newFlashes[newM.module_id] = 'ng';
            hasChanges = true;
          } else if (newPassed > oldPassed) {
            newFlashes[newM.module_id] = 'ok';
            hasChanges = true;
          }
        }
      });
      
      if (hasChanges) {
        setFlashingModules(prev => ({ ...prev, ...newFlashes }));
        Object.keys(newFlashes).forEach(modId => {
          setTimeout(() => {
            setFlashingModules(prev => {
              const updated = { ...prev };
              delete updated[modId];
              return updated;
            });
          }, 1500);
        });
      }
    }
    prevMetricsRef.current = metrics;
  }, [metrics]);

  const fetchMetrics = async () => {
    try {
      const data = await api.get(`/metrics?date=${dateFilter}&lot_id=${activeLot?.id || ''}`);
      setMetrics(data);
    } catch (e) {
      console.error('Failed to fetch metrics', e);
    }
  };

  const fetchModuleLogs = async (moduleId: string) => {
    setLogsLoading(true);
    try {
      const data = await api.get(`/logs/${moduleId}?date=${dateFilter}&lot_id=${activeLot?.id || ''}`);
      setModuleLogs(data);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    } finally {
      setLogsLoading(false);
    }
  };

  const ALL_MODULES = [
    { id: 'oqa_tv', title: 'Выборочный контроль ГП', desc: 'ТВ сверено' },
    { id: 'oqa_pallets', title: 'Приемка паллет ГП', desc: 'поддонов загружено' },
    { id: 'oqa_labels', title: 'Проверка этикетки', desc: 'сканирований этикеток' },
    { id: 'oqa_patrol', title: 'Журнал обхода', desc: 'обходов выполнено' },
    { id: 'iqc_aql', title: 'Журнал входного контроля AQL', desc: 'партий проверено' },
    { id: 'iqc_panels', title: 'Проверка панелей', desc: 'панелей проверено' },
    { id: 'iqc_eps', title: 'Замеры пеновкладышей', desc: 'замеров сделано' },
    { id: 'iqc_covers', title: 'Замеры крышек', desc: 'деталей проверено' },
    { id: 'iqc_components', title: 'Проверка комплектующих', desc: 'позиций принято' },
  ];

  const getModuleMetric = (moduleId: string) => {
    const metric = metrics.find(m => m.module_id === moduleId);
    return metric || { total_passed: 0, total_failed: 0 };
  };

  const renderModuleCard = (m: any) => {
    const met = getModuleMetric(m.id);
    const total = met.total_passed + met.total_failed;
    const flashClass = flashingModules[m.id] ? ` flash-${flashingModules[m.id]}` : '';
    return (
      <div 
        key={m.id} 
        onClick={() => setSelectedModule(m.id)}
        className={`glass-panel hover-scale${flashClass}`} 
        style={{ padding: '20px', borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--c-accent)', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.3s, border-color 0.3s' }}
      >
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--c-accent)', fontSize: '0.9rem' }}>{m.title}</h4>
        <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>{total}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', marginBottom: '15px' }}>{m.desc}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingTop: '10px', borderTop: '1px solid var(--c-border)' }}>
          <span style={{ color: 'var(--c-success)' }}>ОК: {met.total_passed}</span>
          <span style={{ color: 'var(--c-danger)' }}>NG: {met.total_failed}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
            Дашборд качества
            {isUpdating && <Zap size={18} color="var(--c-warning)" className="animate-pulse" />}
          </h1>
          <p style={{ color: 'var(--c-text-secondary)' }}>Сводная статистика: {activeLot ? `Лот ${activeLot.name}` : 'Все лоты'}</p>
        </div>
        <button 
          onClick={() => { fetchMetrics(); if (selectedModule) fetchModuleLogs(selectedModule); }} 
          className="glass hover-scale" 
          style={{ padding: '10px 20px', border: '1px solid var(--c-accent)', color: 'var(--c-accent)', borderRadius: '6px', fontWeight: 'bold' }}
        >
          🔄 Обновить данные
        </button>
      </div>



      {/* Filters Section */}
      <div className="glass-panel" style={{ padding: '15px 20px', borderRadius: 'var(--radius-md)', marginBottom: '30px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary)' }}>Дата контроля</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <input 
              type="date" 
              value={dateFilter}
              disabled={showAllDates}
              onChange={(e) => setDateFilter(e.target.value)}
              className="glass"
              style={{ padding: '8px', border: '1px solid var(--c-border)', borderRadius: '4px', background: 'transparent', color: 'var(--c-text-primary)', opacity: showAllDates ? 0.5 : 1 }}
            />
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
      </div>
      
      <div>
        {!selectedModule ? (
          <>
            <h3 style={{ margin: '0 0 15px 0', color: 'var(--c-text-primary)' }}>OQA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              {ALL_MODULES.filter(m => m.id.startsWith('oqa_')).map(renderModuleCard)}
            </div>

            <h3 style={{ margin: '0 0 15px 0', color: 'var(--c-text-primary)' }}>IQC</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {ALL_MODULES.filter(m => m.id.startsWith('iqc_')).map(renderModuleCard)}
            </div>
          </>
        ) : (
          <div className="glass-panel animate-slide-up" style={{ padding: '0', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', background: 'var(--c-bg-surface-elevated)', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <button 
                  onClick={() => setSelectedModule(null)} 
                  className="hover-scale"
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 16px', background: 'var(--c-bg-surface)', 
                    border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', 
                    cursor: 'pointer', fontSize: '0.9rem', borderRadius: '6px',
                    marginBottom: '15px'
                  }}
                >
                  <ChevronLeft size={16} /> Назад к обзору
                </button>
                <h3 style={{ margin: 0 }}>{ALL_MODULES.find(m => m.id === selectedModule)?.title}</h3>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>Всего за выбранный период</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{getModuleMetric(selectedModule).total_passed + getModuleMetric(selectedModule).total_failed}</div>
              </div>
            </div>
            
            <div style={{ padding: '20px', maxHeight: '500px', overflowY: 'auto' }}>
              {logsLoading && moduleLogs.length === 0 ? <div style={{ textAlign: 'center', padding: '40px' }}><div className="spinner"></div> Загрузка...</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {moduleLogs.length === 0 ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text-muted)' }}>Записей не найдено</div> : moduleLogs.map(log => (
                    <div key={log.id} className="glass-panel" style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                       <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flex: 1 }}>
                          <div style={{ minWidth: '80px', fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '-'}</div>
                          <div style={{ 
                             padding: '4px 10px', 
                             borderRadius: '4px', 
                             fontSize: '0.75rem', 
                             fontWeight: 'bold',
                             background: log.status === 'OK' || log.status === 'Accept' ? 'var(--c-success-muted)' : 'var(--c-danger-muted)',
                             color: log.status === 'OK' || log.status === 'Accept' ? 'var(--c-success)' : 'var(--c-danger)'
                          }}>
                             {log.status}
                          </div>
                           <div style={{ fontSize: '0.85rem', flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px 15px' }}>
                              {Object.entries(log.data || {}).map(([k, v]) => {
                                if (k === 'photos' || k === 'previewPhotos') {
                                  const photos = getPhotosArray(v);
                                  if (photos.length === 0) return null;
                                  return (
                                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                      <strong style={{ color: 'var(--c-text-secondary)' }}>Фото:</strong>
                                      <button
                                        onClick={() => {
                                          setPhotoViewerImages(photos);
                                          setActivePhotoIdx(0);
                                        }}
                                        className="hover-scale"
                                        style={{
                                          background: 'rgba(59, 130, 246, 0.15)',
                                          border: '1px solid rgba(59, 130, 246, 0.3)',
                                          color: '#60a5fa',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '0.75rem',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          fontWeight: 'bold'
                                        }}
                                      >
                                        📸 {photos.length} фото (посмотреть)
                                      </button>
                                    </span>
                                  );
                                }
                                return (
                                  <span key={k}><strong style={{ color: 'var(--c-text-secondary)' }}>{k}:</strong> {formatValue(v)}</span>
                                );
                              })}
                           </div>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox / Photo Viewer Modal */}
      {photoViewerImages && (
        <div 
          onClick={() => setPhotoViewerImages(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            zIndex: 9999, padding: '20px', transition: 'all 0.3s ease'
          }}
        >
          {/* Close button */}
          <button 
            onClick={() => setPhotoViewerImages(null)}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', padding: '10px 20px', borderRadius: '50px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '0.9rem', backdropFilter: 'blur(5px)'
            }}
          >
            Закрыть
          </button>

          {/* Main Image */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '90%', maxHeight: '80%' }}
          >
            <img 
              src={photoViewerImages[activePhotoIdx]} 
              alt={`Panel Photo ${activePhotoIdx + 1}`} 
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', objectFit: 'contain' }}
            />
            
            {/* Image counter */}
            <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: '15px', fontSize: '1rem', fontWeight: 'bold' }}>
              Фото {activePhotoIdx + 1} из {photoViewerImages.length}
            </div>
          </div>

          {/* Thumbnail Strip (if multiple photos) */}
          {photoViewerImages.length > 1 && (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', gap: '10px', marginTop: '20px', overflowX: 'auto',
                maxWidth: '90%', padding: '10px', background: 'rgba(255,255,255,0.05)',
                borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              {photoViewerImages.map((img, idx) => (
                <img 
                  key={idx}
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  onClick={() => setActivePhotoIdx(idx)}
                  style={{
                    width: '60px', height: '60px', borderRadius: '6px', cursor: 'pointer',
                    objectFit: 'cover', border: activePhotoIdx === idx ? '2px solid var(--c-accent)' : '2px solid transparent',
                    opacity: activePhotoIdx === idx ? 1 : 0.6, transition: 'all 0.2s'
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
