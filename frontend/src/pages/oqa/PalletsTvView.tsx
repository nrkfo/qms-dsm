import { useState, useEffect, useRef } from 'react';
import { useDataStore } from '../../store/useDataStore';
import { Package, CheckCircle2, XCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export const PalletsTvView = () => {
  const { activeLot, fetchLogs, fetchTvModels } = useDataStore();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Flashing State for new pallet scan
  const [flashPallet, setFlashPallet] = useState<any>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const flashTimerRef = useRef<any>(null);



  // Viewport scaling factor for perfect screen fitting
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const targetWidth = 1920;
      const targetHeight = 1080;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const factor = Math.min(w / targetWidth, h / targetHeight);
      setScaleFactor(factor);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch data
  const loadData = async () => {
    setLoading(true);
    try {
      const logs = await fetchLogs('oqa_pallets');
      // Sort and parse
      const formatted = logs.map(l => ({
        id: l.id,
        ...l.data,
        status: l.status,
        timestamp: l.timestamp
      }));
      setRecords(formatted);
    } catch (e) {
      console.error('Failed to load pallets logs on TV', e);
    } finally {
      setLoading(false);
    }
  };

  const [sseConnected, setSseConnected] = useState(true);

  // Sync active lot changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'activeLot_dsm') {
        console.log('[TV] activeLot storage event detected:', e.newValue);
        try {
          if (e.newValue) {
            const parsed = JSON.parse(e.newValue);
            useDataStore.getState().setActiveLot(parsed);
          } else {
            useDataStore.getState().setActiveLot(null);
          }
        } catch (err) {
          console.error('[TV] Failed to parse activeLot from storage event', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    loadData();
    fetchTvModels();
  }, [activeLot]);

  // Connect to Real-time events
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connectSSE = () => {
      if (!isMounted) return;
      
      console.log('[TV] Connecting to real-time events...');
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        console.log('[TV] SSE connection established successfully');
        if (isMounted) {
          setSseConnected(true);
          // Re-fetch data on successful connection to make sure we didn't miss anything while offline
          loadData();
        }
      };

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'DATA_UPDATED' && data.module === 'oqa_pallets') {
            console.log('[TV] Real-time pallet update detected:', data);
            if (isMounted) setSseConnected(true);

            // 1. Auto-switch active lot if a new scan came in under a different lot ID!
            if (data.action === 'create' && data.lot_id && (!activeLot || Number(activeLot.id) !== Number(data.lot_id))) {
              console.log('[TV] New scan belongs to a different lot. Automatically switching active lot to:', data.lot_id);
              await useDataStore.getState().fetchLots();
              const latestLots = useDataStore.getState().lots;
              const matchingLot = latestLots.find((l: any) => Number(l.id) === Number(data.lot_id));
              if (matchingLot) {
                useDataStore.getState().setActiveLot(matchingLot);
                // Return early since the activeLot useEffect hook will recreate the SSE listener and reload all records
                return;
              }
            }
            
            // Re-fetch all logs
            const logs = await fetchLogs('oqa_pallets');
            const formatted = logs.map(l => ({
              id: l.id,
              ...l.data,
              status: l.status,
              timestamp: l.timestamp
            }));
            
            if (isMounted) {
              setRecords(formatted);

              // Trigger flash for new scans or updates (ignore automatic scanning errors)
              if (data.action === 'create' && formatted.length > 0) {
                const newest = formatted[0]; // ordered desc, so index 0 is newest
                if (!newest.isScanError) {
                  setFlashPallet(newest);
                  setIsFlashing(true);

                  if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
                  flashTimerRef.current = setTimeout(() => {
                    setIsFlashing(false);
                    setFlashPallet(null);
                  }, 4000); // Flash for 4 seconds
                }
              } else if (data.action === 'update' && data.id) {
                const updatedRec = formatted.find(r => Number(r.id) === Number(data.id));
                if (updatedRec && !updatedRec.isScanError) {
                  setFlashPallet(updatedRec);
                  setIsFlashing(true);

                  if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
                  flashTimerRef.current = setTimeout(() => {
                    setIsFlashing(false);
                    setFlashPallet(null);
                  }, 4000); // Flash for 4 seconds
                }
              }
            }
          }
        } catch (e) {
          console.error('[TV] SSE error parsing:', e);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('[TV] EventSource disconnected, scheduling automatic reconnect in 3s...', err);
        if (isMounted) {
          setSseConnected(false);
        }
        if (eventSource) {
          eventSource.close();
        }
        
        // Explicitly schedule reconnect to avoid infinite CPU-bound reconnect loops in case of total server outage
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
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [activeLot]);

  // Filter out any automatic scanning validation errors so they do not show on the TV/outdoor monitor
  const validRecords = records.filter(r => !r.isScanError);

  // Statistics calculation for TODAY
  const todayStr = new Date().toLocaleDateString('ru-RU');
  const todayRecords = validRecords.filter(r => {
    if (!r.date) return false;
    return r.date.startsWith(todayStr.split(',')[0]);
  });


  const latestPallet = validRecords.find(r => r.status === 'OK') || null;
  const latestBlockedPallet = todayRecords.find(r => r.status === 'NG') || null;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#09090c',
      color: '#ffffff',
      fontFamily: 'var(--font-sans), sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <div style={{
        width: '1920px',
        height: '1080px',
        transform: `scale(${scaleFactor})`,
        transformOrigin: 'center center',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
      {/* Dynamic Style Injection for beautiful CSS transitions */}
      <style>{`
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseSuccess {
          0% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); }
          70% { box-shadow: 0 0 0 30px rgba(0, 255, 136, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); }
        }
        .animate-scale-up {
          animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .pulse-glow-success {
          animation: pulseSuccess 2s infinite;
        }
        .text-glow {
          text-shadow: 0 0 20px rgba(0, 255, 136, 0.6);
        }
        .text-glow-ng {
          text-shadow: 0 0 20px rgba(255, 51, 102, 0.6);
        }
        /* Hide scrollbars globally */
        ::-webkit-scrollbar {
          display: none !important;
        }
        * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
      `}</style>

      {/* FLASH OVERLAY (VIBRANT GREEN FLASH WHEN NEW PALLET IS SCANNED OR UPDATED) */}
      {isFlashing && flashPallet && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: flashPallet.status === 'NG' ? 'rgba(220, 38, 38, 0.99)' : 'rgba(16, 185, 129, 0.99)',
          color: '#000000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          transition: 'all 0.3s ease-in-out',
          textAlign: 'center',
          padding: '40px'
        }}>
          <div className="animate-scale-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '1000px' }}>
            {flashPallet.status === 'NG' ? (
              <AlertTriangle size={160} style={{ marginBottom: '20px', color: '#000000', filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.2))' }} />
            ) : (
              <CheckCircle size={160} style={{ marginBottom: '20px', color: '#000000', filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.2))' }} />
            )}
            
            <h1 style={{
              fontSize: '5.5rem',
              fontWeight: '900',
              margin: '0 0 10px 0',
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              color: '#000000',
              lineHeight: 1
            }}>
              {flashPallet.status === 'NG' ? 'ЗАБЛОКИРОВАНО!' : 'ПОДДОН ДОБАВЛЕН!'}
            </h1>
            
            <p style={{ fontSize: '2.8rem', fontWeight: 'bold', margin: '0 0 35px 0', color: 'rgba(0,0,0,0.9)' }}>
              {flashPallet.status === 'NG' ? 'ПОДДОН ЗАБЛОКИРОВАН ОТДЕЛОМ ОТК' : 'Успешно зарегистрирован в системе'}
            </p>
 
            <div style={{
              background: '#000000',
              color: flashPallet.status === 'NG' ? '#ff3366' : '#00ff88',
              borderRadius: '32px',
              padding: '40px 80px',
              boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px'
            }}>
              {flashPallet.status === 'NG' ? (
                <>
                  <span style={{ fontSize: '2rem', textTransform: 'uppercase', color: '#ff3366', fontWeight: '900', letterSpacing: '2px' }}>
                    СТАТУС: NG (ЗАБЛОКИРОВАНО)
                  </span>
                  <span style={{ fontSize: '6rem', fontWeight: '900', fontFamily: 'monospace', lineHeight: 1, color: '#ffffff' }}>
                    № {flashPallet.extractedSN || '-'}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '2rem', textTransform: 'uppercase', color: '#888888', fontWeight: 'bold', letterSpacing: '2px' }}>
                    ПОДДОН №
                  </span>
                  <span style={{ fontSize: '7rem', fontWeight: '900', fontFamily: 'monospace', lineHeight: 1 }}>
                    {flashPallet.extractedSN || '-'}
                  </span>
                </>
              )}
              
              <span style={{ fontSize: '2.5rem', fontWeight: 'bold', borderTop: '1px solid #333', paddingTop: '15px', marginTop: '10px', color: '#ffffff' }}>
                {flashPallet.model || '-'}
              </span>
            </div>

            {flashPallet.status === 'NG' && flashPallet.note && (
              <div style={{
                fontSize: '2.2rem',
                color: '#ff3366',
                fontWeight: '900',
                maxWidth: '900px',
                marginTop: '35px',
                padding: '25px 50px',
                background: '#000000',
                border: '3px solid #ff3366',
                borderRadius: '24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                textAlign: 'center'
              }}>
                💬 КОММЕНТАРИЙ ОТК:<br/>
                <span style={{ color: '#ffffff', fontSize: '2.6rem', display: 'block', marginTop: '12px', fontWeight: 'bold', wordBreak: 'break-word' }}>
                  {flashPallet.note}
                </span>
              </div>
            )}
          </div>
        </div>
      )}



      {/* MAIN CONTAINER */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '20px',
        padding: '20px',
        overflow: 'hidden',
        minHeight: 0
      }}>

        {/* LEFT COLUMN: LATEST SCANNED & STATS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          
          {/* LATEST PALLET SUMMARY CARD (HUGE SIZE FOR OUTDOOR READABILITY) */}
          <div className="glass-panel animate-scale-in" style={{
            flex: 1,
            padding: '20px 25px',
            borderRadius: '24px',
            border: '2px solid rgba(0, 255, 136, 0.15)',
            background: 'rgba(0, 255, 136, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 20px 50px rgba(0, 255, 136, 0.05)',
            position: 'relative'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', textTransform: 'uppercase', color: '#00ff88', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '900' }}>
              <CheckCircle size={18} /> Последний принятый поддон
            </h3>

            {latestPallet ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ fontSize: '1.3rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>ПОДДОН №</span>
                    <span className="text-glow" style={{
                      fontSize: '5rem',
                      fontWeight: '900',
                      fontFamily: 'monospace',
                      lineHeight: 1,
                      color: '#00ff88'
                    }}>
                      {latestPallet.extractedSN || '-'}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', marginTop: '5px' }}>
                    {latestPallet.model || '-'}
                  </div>
                  
                  <div style={{ fontSize: '1rem', color: 'var(--c-text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                    <span>Штрихкод: <strong style={{ fontFamily: 'monospace', color: '#fff' }}>{latestPallet.barcode}</strong></span>
                    <span>Время проверки: <strong style={{ color: '#fff' }}>{latestPallet.date}</strong></span>
                  </div>

                  {latestPallet.note && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px 15px',
                      borderRadius: '12px',
                      background: 'rgba(0, 255, 136, 0.05)',
                      border: '1px solid rgba(0, 255, 136, 0.2)',
                      color: '#00ff88',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      maxWidth: '500px'
                    }}>
                      📝 {latestPallet.note}
                    </div>
                  )}
                </div>

                <div style={{
                  padding: '20px 40px',
                  borderRadius: '24px',
                  background: 'rgba(0, 255, 136, 0.1)',
                  border: '2px solid #00ff88',
                  color: '#00ff88',
                  fontSize: '4rem',
                  fontWeight: '900',
                  textAlign: 'center',
                  boxShadow: '0 0 30px rgba(0, 255, 136, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1.2,
                  minWidth: '240px',
                  whiteSpace: 'pre-line'
                }}>
                  OK
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)', fontSize: '1.3rem' }}>
                Сегодня еще нет проверенных поддонов
              </div>
            )}
          </div>

          {/* LATEST BLOCKED PALLET CARD */}
          <div className="glass-panel animate-scale-in" style={{
            flex: 1,
            padding: '20px 25px',
            borderRadius: '24px',
            border: '2px solid rgba(255, 51, 102, 0.15)',
            background: 'rgba(255, 51, 102, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 20px 50px rgba(255, 51, 102, 0.05)',
            position: 'relative'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', textTransform: 'uppercase', color: '#ff3366', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '900' }}>
              <AlertTriangle size={18} /> Последний заблокированный поддон
            </h3>

            {latestBlockedPallet ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ fontSize: '1.3rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>ПОДДОН №</span>
                    <span className="text-glow-ng" style={{
                      fontSize: '5rem',
                      fontWeight: '900',
                      fontFamily: 'monospace',
                      lineHeight: 1,
                      color: '#ff3366'
                    }}>
                      {latestBlockedPallet.extractedSN || '-'}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', marginTop: '5px' }}>
                    {latestBlockedPallet.model || '-'}
                  </div>
                  
                  <div style={{ fontSize: '1rem', color: 'var(--c-text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                    <span>Штрихкод: <strong style={{ fontFamily: 'monospace', color: '#fff' }}>{latestBlockedPallet.barcode}</strong></span>
                    <span>Время блокировки: <strong style={{ color: '#fff' }}>{latestBlockedPallet.date}</strong></span>
                  </div>

                  {latestBlockedPallet.note && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px 15px',
                      borderRadius: '12px',
                      background: 'rgba(255, 51, 102, 0.08)',
                      border: '1px solid rgba(255, 51, 102, 0.2)',
                      color: '#ff3366',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      maxWidth: '500px'
                    }}>
                      ⚠️ {latestBlockedPallet.note}
                    </div>
                  )}
                </div>

                <div style={{
                  padding: '20px 40px',
                  borderRadius: '24px',
                  background: 'rgba(255, 51, 102, 0.15)',
                  border: '2px solid #ff3366',
                  color: '#ff3366',
                  fontSize: '4rem',
                  fontWeight: '900',
                  textAlign: 'center',
                  boxShadow: '0 0 30px rgba(255, 51, 102, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1.2,
                  minWidth: '240px',
                  whiteSpace: 'pre-line'
                }}>
                  NG
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)', fontSize: '1.3rem' }}>
                Сегодня нет заблокированных поддонов
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILED LIST OF TODAY'S PALLETS */}
        <div className="glass-panel" style={{
          borderRadius: '24px',
          background: 'rgba(26,26,30,0.45)',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-elevation)'
        }}>
          <div style={{
            padding: '20px 30px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.01em', color: '#ffffff' }}>
                СПИСОК ПОДДОНОВ ЗА СЕГОДНЯ
              </h3>
              {sseConnected ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#00ff88', background: 'rgba(0, 255, 136, 0.08)', padding: '4px 12px', borderRadius: '12px', border: '1px solid rgba(0, 255, 136, 0.2)', fontWeight: 'bold' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff88', display: 'inline-block', boxShadow: '0 0 8px #00ff88' }} />
                  LIVE
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ffcc00', background: 'rgba(255, 204, 0, 0.08)', padding: '4px 12px', borderRadius: '12px', border: '1px solid rgba(255, 204, 0, 0.2)', fontWeight: 'bold' }} className="animate-pulse">
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffcc00', display: 'inline-block' }} />
                  ПОДКЛЮЧЕНИЕ...
                </span>
              )}
            </div>
            {loading && (
              <RefreshCw size={16} color="var(--c-accent)" className="animate-spin" />
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
            {todayRecords.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--c-text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    <th style={{ padding: '12px 24px' }}>№ Поддона</th>
                    <th style={{ padding: '12px 24px' }}>Модель</th>
                    <th style={{ padding: '12px 24px' }}>Время</th>
                    <th style={{ padding: '12px 24px', textAlign: 'center' }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {todayRecords.map((r, i) => (
                    <tr key={r.id} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      fontSize: '1.2rem'
                    }}>
                      <td style={{ padding: '16px 24px', fontWeight: '900', fontFamily: 'monospace', color: r.status === 'OK' ? '#00ff88' : '#ff3366' }}>
                        {r.extractedSN || '-'}
                      </td>
                      <td style={{ padding: '16px 24px', fontWeight: 'bold', color: '#ffffff' }}>
                        {r.model}
                        {r.status === 'NG' && r.note && (
                          <div style={{ fontSize: '0.95rem', color: '#ff3366', fontWeight: 'bold', marginTop: '5px' }}>
                            ⚠️ {r.note}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 24px', color: 'var(--c-text-secondary)' }}>
                        {r.date ? r.date.split(',')[1]?.trim() || r.date : '-'}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                        <span style={{
                          padding: '6px 16px',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          fontWeight: '900',
                          background: r.status === 'OK' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 102, 0.1)',
                          color: r.status === 'OK' ? '#00ff88' : '#ff3366',
                          border: `1px solid ${r.status === 'OK' ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`
                        }}>
                          {r.status === 'OK' ? 'OK' : 'NG'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '1.2rem' }}>
                Список пуст. Ожидание первого сканирования...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
  );
};
