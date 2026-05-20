import { useState, useEffect, useRef } from 'react';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { playSound } from '../../utils/audio';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';

export const LabelsCheck = () => {
  const { 
    activeLot, lastLabelCheckTimestamp, setLastLabelCheckTimestamp, 
    fetchLogs, fetchAllLogs, saveLog, 
    settings, fetchSettings,
    tvModels, fetchTvModels,
    showToast, showConfirm
  } = useDataStore();

  const [sn, setSn] = useState('');
  const [mn, setMn] = useState('');
  const [ean, setEan] = useState('');
  
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const snInputRef = useRef<HTMLInputElement>(null);

  const [timeLeftStr, setTimeLeftStr] = useState('00:00:00');
  const [isAlarm, setIsAlarm] = useState(false);

  useEffect(() => {
    loadData();
    fetchSettings();
    fetchTvModels();
    setTimeout(() => snInputRef.current?.focus(), 50);
  }, [activeLot]);

  useEffect(() => {
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('oqa_labels_updated', handleUpdate);
    return () => {
      window.removeEventListener('oqa_labels_updated', handleUpdate);
    };
  }, [activeLot]);


  const loadData = async () => {
    setLoading(true);
    const backendLogs = await fetchLogs('oqa_labels');
    setLogs(backendLogs.map(l => ({ id: l.id, status: l.status, date: l.date, ...l.data })));
    setLoading(false);
  };

  useEffect(() => {
    const calculateTime = () => {
      if (!lastLabelCheckTimestamp) return;
      const msPassed = Date.now() - lastLabelCheckTimestamp;
      const msLimit = Number(settings.label_timer_limit) || 3600000;
      let msLeft = msLimit - msPassed;
      
      if (msLeft <= 0) {
        msLeft = Math.abs(msLeft);
        setIsAlarm(true);
      } else {
        setIsAlarm(false);
      }

      const h = Math.floor(msLeft / 3600000).toString().padStart(2, '0');
      const m = Math.floor((msLeft % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((msLeft % 60000) / 1000).toString().padStart(2, '0');
      
      setTimeLeftStr(`${h}:${m}:${s}`);
    };

    calculateTime();

    // 1 second interval check for real-time updates
    const timer = setInterval(calculateTime, 1000);

    // Event listener for tab focus recovery
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        calculateTime();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lastLabelCheckTimestamp, settings.label_timer_limit]);

  // Auto-scroll removed as per user request to prevent jumping
  // useEffect(() => {
  //   logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [logs]);

  const handleValidate = async () => {
    if (!activeLot) return showToast('Выберите лот!', 'warning');
    if (!sn && !mn && !ean) return;

    const isDuplicate = logs.some(l => 
      (sn && l.sn?.trim().toUpperCase() === sn.trim().toUpperCase()) || 
      (mn && l.mn?.trim().toUpperCase() === mn.trim().toUpperCase())
    );
    if (isDuplicate) {
      showToast('Ошибка! Этот ТВ (SN/MN) уже проверялся (дубликат) в текущем лоте.', 'error');
      playSound('ng');
      setSn('');
      setMn('');
      setEan('');
      setTimeout(() => snInputRef.current?.focus(), 50);
      return;
    }

    const timeStr = new Date().toLocaleTimeString('ru-RU');
    let errors: string[] = [];

    const snLenRaw = model?.label_sn_len ?? Number(settings.label_sn_len);
    const snLen = (snLenRaw === null || snLenRaw === '') ? null : Number(snLenRaw);
    const mnLenRaw = model?.label_mn_len ?? Number(settings.label_mn_len);
    const mnLen = (mnLenRaw === null || mnLenRaw === '') ? null : Number(mnLenRaw);
    const eanLenRaw = model?.label_ean_len ?? Number(settings.label_ean_len);
    const eanLen = (eanLenRaw === null || eanLenRaw === '') ? null : Number(eanLenRaw);

    if (snLen && snLen > 0 && sn.length !== snLen) errors.push(`SN length error: ${sn.length}/${snLen}`);
    if (mnLen && mnLen > 0 && mn.length !== mnLen) errors.push(`MN length error: ${mn.length}/${mnLen}`);
    if (eanLen && eanLen > 0 && ean.length !== eanLen) errors.push(`EAN length error: ${ean.length}/${eanLen}`);

    const checkFixes = (jsonStr: string | undefined, value: string, name: string) => {
      if (!jsonStr) return;
      try {
        const fixes = JSON.parse(jsonStr);
        for (const f of fixes) {
          const mType = f.matchType || 'contains';
          let isValid = false;
          
          if (mType === 'contains') isValid = value.includes(f.value);
          else if (mType === 'startsWith') isValid = value.startsWith(f.value);
          else if (mType === 'endsWith') isValid = value.endsWith(f.value);
          else if (mType === 'exact') isValid = value === f.value;
          else if (mType === 'regex') {
             try { isValid = new RegExp(f.value).test(value); } catch(e) { isValid = false; }
          }
          
          if (!isValid) {
            errors.push(`Ошибка ${name}: не соответствует правилу [${mType}] "${f.value}" (${f.explanation || 'без описания'})`);
          }
        }
      } catch (e) {}
    };

    checkFixes(model?.label_sn_fix, sn, 'SN');
    checkFixes(model?.label_mn_fix, mn, 'MN');
    checkFixes(model?.label_ean_fix, ean, 'EAN');

    // Dynamic Parsing
    let snDetails: any = {};
    let mnDetails: any = {};
    try {
      const parseCfg = JSON.parse(model?.label_parsing_config || '{"sn":[], "mn":[]}');
      if (sn && parseCfg.sn) {
        parseCfg.sn.forEach((f: any) => {
          snDetails[f.name] = sn.substring(f.start, f.start + f.len);
        });
      }
      if (mn && parseCfg.mn) {
        parseCfg.mn.forEach((f: any) => {
          mnDetails[f.name] = mn.substring(f.start, f.start + f.len);
        });
      }
    } catch (e) {
      console.error('Label parsing failed', e);
    }

    const datePrv = new Date().toLocaleDateString('ru-RU');
    if (errors.length > 0) {
      const data = { 
        time: timeStr, 
        date: datePrv,
        message: errors.join('; '), 
        sn, mn, ean,
        snDetails, mnDetails
      };
      await saveLog('oqa_labels', data, 'NG');
      playSound('ng');
      setSn('');
      setMn('');
      setEan('');
      setTimeout(() => snInputRef.current?.focus(), 50);

    } else {
      const data = {
        time: timeStr,
        date: datePrv,
        message: `SN: ${sn} | MN: ${mn}\nEAN: ${ean}\nOK`,
        sn, mn, ean,
        snDetails, mnDetails
      };
      await saveLog('oqa_labels', data, 'OK');
      playSound('ok');
      setLastLabelCheckTimestamp(Date.now());

      setSn('');
      setMn('');
      setEan('');
      setTimeout(() => snInputRef.current?.focus(), 50);
    }
    loadData();
  };

  const exportExcel = async () => {
    const logs = await fetchLogs('oqa_labels');
    const records = logs.map(l => ({ id: l.id, status: l.status, date: l.date, ...l.data }));
    
    const exportData = records.map(r => ({
      'Time': r.time,
      'Date': formatDate(r.date),
      'SN': r.sn,
      'MN': r.mn,
      'EAN': r.ean,
      'Result': r.status,
      'Note': r.status === 'OK' ? 'OK' : r.message
    }));
    const lotName = activeLot?.name ? `_Lot_${activeLot.name}` : '';
    const fileName = `Labels_Check${lotName}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(exportData, fileName, 'Labels_Check');
  };

  const model = tvModels.find(m => m.id === activeLot?.tv_model_id);
  const snLen = model?.label_sn_len || Number(settings.label_sn_len) || 18;
  const mnLen = model?.label_mn_len || Number(settings.label_mn_len) || 21;
  const eanLen = model?.label_ean_len || Number(settings.label_ean_len) || 13;

  const getFixes = (jsonStr?: string) => { try { return JSON.parse(jsonStr || '[]'); } catch { return []; } };
  const snFixes = getFixes(model?.label_sn_fix);
  const mnFixes = getFixes(model?.label_mn_fix);
  const eanFixes = getFixes(model?.label_ean_fix);

  return (
    <div className="animate-fade-in split-layout-container">
      {/* Sidebar - Full Height */}
      <div className="split-layout-sidebar">
        <div style={{ background: 'var(--c-bg-base)', border: '1px solid var(--c-border)', padding: '20px', borderRadius: '12px', marginBottom: '30px', textAlign: 'center', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: '11px', color: 'var(--c-text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Time until next check</div>
          <div style={{ fontFamily: 'monospace', fontSize: '42px', fontWeight: 'bold', color: isAlarm ? 'var(--c-danger)' : 'var(--c-accent)' }}>
            {isAlarm ? 'OVERDUE' : timeLeftStr}
          </div>
          {isAlarm && <div style={{ fontSize: '12px', color: 'var(--c-danger)', marginTop: '5px', fontWeight: 'bold' }}>{timeLeftStr} ELAPSED</div>}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', fontWeight: 'bold' }}>SN (Serial Number):</label>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: !snLen || snLen === 0 ? 'var(--c-text-muted)' : (sn.length === snLen ? 'var(--c-success)' : (sn.length > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)')) }}>
                {sn.length}{snLen && snLen > 0 ? ` / ${snLen}` : ''}
              </span>
            </div>
            <input ref={snInputRef} className="glass" type="text" value={sn} onChange={e => setSn(e.target.value)} placeholder={snLen && snLen > 0 ? `${snLen} symbols` : 'Any length'} style={{ width: '100%', padding: '14px', color: 'var(--c-text-primary)', fontSize: '16px', borderRadius: '8px', border: snLen && snLen > 0 && sn.length > 0 && sn.length !== snLen ? '1px solid var(--c-danger)' : undefined }} />
            {snFixes.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {snFixes.map((f:any, i:number) => <span key={i} style={{fontSize: '9px', background: 'var(--c-accent-muted)', color: 'var(--c-accent)', padding: '2px 6px', borderRadius: '10px'}}>{f.explanation || f.value}</span>)}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', fontWeight: 'bold' }}>MN (Model Number):</label>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: !mnLen || mnLen === 0 ? 'var(--c-text-muted)' : (mn.length === mnLen ? 'var(--c-success)' : (mn.length > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)')) }}>
                {mn.length}{mnLen && mnLen > 0 ? ` / ${mnLen}` : ''}
              </span>
            </div>
            <input className="glass" type="text" value={mn} onChange={e => setMn(e.target.value)} placeholder={mnLen && mnLen > 0 ? `${mnLen} symbols` : 'Any length'} style={{ width: '100%', padding: '14px', color: 'var(--c-text-primary)', fontSize: '16px', borderRadius: '8px', border: mnLen && mnLen > 0 && mn.length > 0 && mn.length !== mnLen ? '1px solid var(--c-danger)' : undefined }} />
            {mnFixes.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {mnFixes.map((f:any, i:number) => <span key={i} style={{fontSize: '9px', background: 'var(--c-accent-muted)', color: 'var(--c-accent)', padding: '2px 6px', borderRadius: '10px'}}>{f.explanation || f.value}</span>)}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', fontWeight: 'bold' }}>EAN Code:</label>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: !eanLen || eanLen === 0 ? 'var(--c-text-muted)' : (ean.length === eanLen ? 'var(--c-success)' : (ean.length > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)')) }}>
                {ean.length}{eanLen && eanLen > 0 ? ` / ${eanLen}` : ''}
              </span>
            </div>
            <input className="glass" type="text" value={ean} onChange={e => setEan(e.target.value)} placeholder={eanLen && eanLen > 0 ? `${eanLen} symbols` : 'Any length'} style={{ width: '100%', padding: '14px', color: 'var(--c-text-primary)', fontSize: '16px', borderRadius: '8px', border: eanLen && eanLen > 0 && ean.length > 0 && ean.length !== eanLen ? '1px solid var(--c-danger)' : undefined }} />
            {eanFixes.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {eanFixes.map((f:any, i:number) => <span key={i} style={{fontSize: '9px', background: 'var(--c-accent-muted)', color: 'var(--c-accent)', padding: '2px 6px', borderRadius: '10px'}}>{f.explanation || f.value}</span>)}
              </div>
            )}
          </div>

          <button onClick={handleValidate} style={{ width: '100%', padding: '18px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginTop: '10px' }}>VERIFY SCAN</button>
          <button onClick={exportExcel} style={{ width: '100%', padding: '12px', background: 'transparent', color: 'var(--c-text-muted)', border: '1px solid var(--c-border)', cursor: 'pointer', borderRadius: '6px', fontSize: '13px' }}>Download History (Excel)</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="split-layout-content">
        <div className="glass-panel" style={{ padding: '15px 25px', borderBottom: '1px solid var(--c-border)', borderRadius: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--c-bg-surface-glass)' }}>
          <strong style={{ color: 'var(--c-text-secondary)' }}>Проверка этикеток [ЛОТ: <span style={{ color: 'var(--c-accent)' }}>{activeLot?.name || 'Не выбран'}</span>]</strong>
          {model && <span style={{ fontSize: '12px', background: 'var(--c-accent-muted)', color: 'var(--c-accent)', padding: '4px 8px', borderRadius: '4px' }}>{model.name}</span>}
        </div>

        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border)', paddingBottom: '15px', marginBottom: '25px' }}>
            <h3 style={{ margin: 0, color: 'var(--c-text-secondary)', fontSize: '1.2rem' }}>Recent Scan Activity</h3>
            <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>Total: {logs.length} records</span>
          </div>

          <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {logs.length === 0 ? (
               <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--c-text-muted)', marginTop: '50px', padding: '50px', background: 'var(--c-bg-surface-glass)', borderRadius: '12px', border: '1px dashed var(--c-border)' }}>No scans recorded yet for this session.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="animate-fade-in" style={{ background: 'var(--c-bg-surface-elevated)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', transition: 'transform 0.2s', cursor: 'default' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', background: log.status === 'OK' ? 'var(--c-success-muted)' : 'var(--c-danger-muted)', color: log.status === 'OK' ? 'var(--c-success)' : 'var(--c-danger)' }}>{log.status}</span>
                    <span style={{ color: 'var(--c-text-muted)', fontSize: '11px' }}>{log.time}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--c-bg-base)', paddingBottom: '5px' }}>
                      <span style={{ color: 'var(--c-text-muted)', fontSize: '11px' }}>SN:</span>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--c-text-primary)' }}>{log.sn || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--c-bg-base)', paddingBottom: '5px' }}>
                      <span style={{ color: 'var(--c-text-muted)', fontSize: '11px' }}>MN:</span>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--c-text-primary)' }}>{log.mn || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--c-text-muted)', fontSize: '11px' }}>EAN:</span>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--c-text-primary)' }}>{log.ean || '-'}</span>
                    </div>

                    {/* Details Parsing Display */}
                    {(log.snDetails && Object.keys(log.snDetails).length > 0) && (
                      <div style={{ marginTop: '5px', padding: '10px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--c-accent)', marginBottom: '5px', fontWeight: 'bold' }}>SN BREAKDOWN:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {Object.entries(log.snDetails).map(([k, v]) => (
                            <span key={k} style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              <b style={{ opacity: 0.7 }}>{k}:</b> {v as string}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(log.mnDetails && Object.keys(log.mnDetails).length > 0) && (
                      <div style={{ marginTop: '5px', padding: '10px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--c-accent)', marginBottom: '5px', fontWeight: 'bold' }}>MN BREAKDOWN:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {Object.entries(log.mnDetails).map(([k, v]) => (
                            <span key={k} style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              <b style={{ opacity: 0.7 }}>{k}:</b> {v as string}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {log.status !== 'OK' && (
                    <div style={{ color: 'var(--c-danger)', fontSize: '12px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px' }}>
                      <strong>Error:</strong> {log.message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

