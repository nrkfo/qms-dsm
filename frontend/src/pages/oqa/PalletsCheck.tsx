import React, { useState, useRef, useEffect } from 'react';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { playSound } from '../../utils/audio';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { api, translateToEnglish } from '../../utils/api';
import { Search, FileSpreadsheet, Trash2, Settings, Tv } from 'lucide-react';

export const PalletsCheck = () => {
  const { user } = useAuthStore();
  const { activeLot, fetchLogs, fetchAllLogs, saveLog, updateLog, deleteLog, tvModels, fetchTvModels, showToast, showConfirm } = useDataStore();
  
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit state
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editNote, setEditNote] = useState('');
  const [editStatus, setEditStatus] = useState('OK');

  // Password confirmation state
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputValue, setPassInputValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete', record: any } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const editNoteRef = useRef<HTMLTextAreaElement>(null);
  const passInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    fetchTvModels();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [activeLot]);

  useEffect(() => {
    if (editingRecord) {
      setTimeout(() => editNoteRef.current?.focus(), 100);
    } else {
      inputRef.current?.focus();
    }
  }, [editingRecord]);

  useEffect(() => {
    if (isPassModalOpen) {
      setTimeout(() => {
        passInputRef.current?.focus();
        passInputRef.current?.select();
      }, 100);
    } else if (!editingRecord) {
      inputRef.current?.focus();
    }
  }, [isPassModalOpen, editingRecord]);

  const loadData = async () => {
    setLoading(true);
    const logs = await fetchLogs('oqa_pallets');
    setRecords(logs.map(l => ({ id: l.id, ...l.data, status: l.status })));
    setLoading(false);
  };

  const openTvWindow = async () => {
    const targetUrl = '/oqa/pallets-tv';
    try {
      if ('getScreenDetails' in window) {
        const screenDetails = await (window as any).getScreenDetails();
        const secondScreen = screenDetails.screens.find((s: any) => s !== screenDetails.currentScreen);
        if (secondScreen) {
          const tvWindow = window.open(
            targetUrl,
            'PalletsTV',
            `left=${secondScreen.left},top=${secondScreen.top},width=${secondScreen.width},height=${secondScreen.height},fullscreen`
          );
          if (!tvWindow || tvWindow.closed || typeof tvWindow.closed === 'undefined') {
            showToast('⚠️ Окно ТВ заблокировано браузером! Пожалуйста, разрешите всплывающие окна.', 'warning');
          } else {
            showToast('ТВ-Монитор открыт на втором экране!', 'success');
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Window management failed or permission denied, falling back to standard window.open:', e);
    }
    
    const tvWindow = window.open(
      targetUrl,
      'PalletsTV',
      'left=1920,top=0,width=1920,height=1080,menubar=no,status=no,titlebar=no'
    );
    if (!tvWindow || tvWindow.closed || typeof tvWindow.closed === 'undefined') {
      showToast('⚠️ Окно ТВ заблокировано браузером! Разрешите всплывающие окна в настройках.', 'warning');
    } else {
      showToast('ТВ-Монитор открыт!', 'success');
    }
  };


  useEffect(() => {
    if (scanInput.trim().length >= 5) { // Assuming barcode length
      const timer = setTimeout(() => {
        processScan(scanInput.trim());
      }, 100); // Faster scan response
      return () => clearTimeout(timer);
    }
  }, [scanInput]);

  const processScan = async (barcode: string) => {
    if (!activeLot) {
      showToast('Выберите лот!', 'warning');
      setScanInput('');
      return;
    }
    if (!barcode) return;

    const isDuplicate = records.some(r => r.barcode?.trim().toUpperCase() === barcode.toUpperCase());
    if (isDuplicate) {
      showToast('Ошибка! Этот ТВ/Паллета уже сканировался (дубликат) в текущем лоте.', 'error');
      playSound('ng');
      setScanInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    
    const identifyModel = (bc: string) => {
      const b = bc.trim().toUpperCase();
      for (const m of tvModels) {
        if (m.pallet_keyword && b.includes(m.pallet_keyword.toUpperCase())) {
          return m;
        }
      }
      return null;
    };



    const expectedModel = tvModels.find(m => m.id === activeLot?.tv_model_id);
    const scannedModel = identifyModel(barcode);
    
    let status = 'OK';
    let note = '';

    // 1. Model Identification & Validation
    if (expectedModel && scannedModel) {
      if (scannedModel.id !== expectedModel.id) {
        status = 'NG';
        const mismatchNote = `Несоответствие модели: ${scannedModel.name} (ожидалось ${expectedModel.name})`;
        note = note ? `${note} | ${mismatchNote}` : mismatchNote;
      }
    } else if (expectedModel && !scannedModel && barcode.length > 5) {
      status = 'NG';
      const notFoundNote = `Модель не распознана по ключу паллеты`;
      note = note ? `${note} | ${notFoundNote}` : notFoundNote;
    }

    if (expectedModel) {
      // 2. Length Check
      if (expectedModel.pallet_barcode_len && barcode.length !== expectedModel.pallet_barcode_len) {
        status = 'NG';
        const lenNote = `Ошибка длины: ${barcode.length} (нужно ${expectedModel.pallet_barcode_len})`;
        note = note ? `${note} | ${lenNote}` : lenNote;
      }

      // 3. Prefix / Rules Check
      try {
        const rules = JSON.parse(expectedModel.pallet_barcode_fix || '[]');
        for (const rule of rules) {
          const mType = rule.matchType || 'contains';
          let isValid = false;
          
          if (mType === 'contains') isValid = barcode.includes(rule.value);
          else if (mType === 'startsWith') isValid = barcode.startsWith(rule.value);
          else if (mType === 'endsWith') isValid = barcode.endsWith(rule.value);
          else if (mType === 'exact') isValid = barcode === rule.value;
          else if (mType === 'regex') {
            try { isValid = new RegExp(rule.value).test(barcode); } catch(e) { isValid = false; }
          }

          if (!isValid) {
            status = 'NG';
            const ruleExpl = rule.explanation || `Не соответствует правилу [${mType}] "${rule.value}"`;
            note = note ? `${note} | ${ruleExpl}` : ruleExpl;
          }
        }
      } catch (e) {
        console.error('Failed to parse pallet rules', e);
      }
    }

    // Parsing logic for specific format (Dynamic from Settings)
    let extractedModelCode = '-';
    let extractedSN = '-';
    
    try {
      const parseCfg = JSON.parse(expectedModel?.pallet_parsing_config || '{"model_start":0, "model_len":13, "sn_start":13, "sn_len":6}');
      if (barcode.length >= (expectedModel?.pallet_barcode_len || 26)) {
        extractedModelCode = barcode.substring(parseCfg.model_start, parseCfg.model_start + parseCfg.model_len);
        extractedSN = barcode.substring(parseCfg.sn_start, parseCfg.sn_start + parseCfg.sn_len);
      }
    } catch (e) {
      console.error('Parsing failed', e);
    }

    let finalNote = note;
    if (note.trim()) {
      const en = await translateToEnglish(note.trim());
      if (en && en.toLowerCase() !== note.trim().toLowerCase()) {
        finalNote = `${note.trim()} / ${en}`;
      }
    }

    const data = {
      barcode: barcode,
      date: new Date().toLocaleString('ru-RU'),
      model: expectedModel?.name || 'Unknown',
      scannedModel: scannedModel?.name || 'Не распознана',
      extractedModelCode: extractedModelCode,
      extractedSN: extractedSN,
      note: finalNote,
      isScanError: status === 'NG'
    };

    await saveLog('oqa_pallets', data, status);
    playSound(status === 'OK' ? 'ok' : 'ng');
    
    if (status === 'NG') {
      setTimeout(() => showToast(`ВНИМАНИЕ: Ошибка сканирования!\n${note}`, 'error'), 100);
    }

    setScanInput('');
    loadData();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScan(scanInput.trim());
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;
    const { id, status: oldStatus, ...data } = editingRecord;
    let finalNote = editNote;
    if (editNote.trim()) {
      const en = await translateToEnglish(editNote.trim());
      if (en && en.toLowerCase() !== editNote.trim().toLowerCase()) {
        finalNote = `${editNote.trim()} / ${en}`;
      }
    }
    const updatedData = { ...data, note: finalNote };
    if (editStatus === 'NG' || editStatus === 'OK') {
      delete (updatedData as any).isScanError;
    }
    await updateLog('oqa_pallets', id, updatedData, editStatus);
    setEditingRecord(null);
    loadData();
  };



  const handleActionClick = (type: 'edit' | 'delete', record: any) => {
    setPendingAction({ type, record });
    setPassInputValue('');
    setIsPassModalOpen(true);
  };

  const confirmPassword = async () => {
    try {
      await api.post('/auth/verify', { password: passInputValue });
      if (pendingAction?.type === 'edit') {
        const record = pendingAction.record;
        setEditingRecord(record);
        setEditNote(record.note || '');
        setEditStatus(record.status || 'OK');
      } else if (pendingAction?.type === 'delete') {
        const recordId = pendingAction.record.id;
        showConfirm('Удалить эту запись?', async () => {
          try {
            await deleteLog('oqa_pallets', recordId);
            showToast('Запись удалена');
            loadData();
          } catch (e) {
            showToast('Ошибка при удалении', 'error');
          }
        }, undefined, 'danger');
      }
      setIsPassModalOpen(false);
      setPendingAction(null);
    } catch (e: any) {
      showToast(e.message || 'Неверный пароль', 'error');
    }
  };

  const openEdit = (record: any) => {
    handleActionClick('edit', record);
  };

  const handleDelete = (id: any) => {
    const record = records.find(r => Number(r.id) === Number(id));
    if (record) {
      handleActionClick('delete', record);
    }
  };

  const exportExcel = async () => {
    const logs = await fetchLogs('oqa_pallets');
    const records = logs.map(l => ({ ...l.data, id: l.id, status: l.status, date: l.date }));

    const exportData = records.map((r, i) => ({
      '#': i + 1,
      'Barcode': r.barcode,
      'Date': formatDate(r.date),
      'Model': r.model,
      'Status': r.status,
      'Note': r.note
    }));
    const lotName = activeLot?.name ? `_Lot_${activeLot.name}` : '';
    const fileName = `OQA_Pallets${lotName}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(exportData, fileName, 'Приемка Паллет');
  };

  const filteredRecords = records.filter(r => 
    r.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.note?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-fade-in responsive-flex-container">
      
      <div className="glass-panel" style={{ padding: '15px 20px', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', borderRadius: 0, borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '18px', fontWeight: 'bold' }}>
          <div>📦 <span style={{ color: 'var(--c-text-secondary)' }}>ЛОТ:</span> <span style={{ color: 'var(--c-accent)' }}>{activeLot?.name || 'Не выбран'}</span></div>
          {activeLot && (
            <div style={{ fontSize: '14px', borderLeft: '1px solid var(--c-border)', paddingLeft: '20px' }}>
              <span style={{ color: 'var(--c-text-secondary)' }}>МОДЕЛЬ:</span> <span style={{ color: 'var(--c-accent)' }}>{tvModels.find(m=>m.id===activeLot.tv_model_id)?.name || '-'}</span>
              <span style={{ color: 'var(--c-text-secondary)', marginLeft: '15px' }}>КЛЮЧ PL:</span> <span style={{ color: 'var(--c-accent)' }}>{tvModels.find(m=>m.id===activeLot.tv_model_id)?.pallet_keyword || '-'}</span>
            </div>
          )}
        </div>

        <button 
          onClick={openTvWindow} 
          className="glass hover-scale" 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px 16px', 
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--c-accent)', 
            color: 'var(--c-accent)', 
            fontWeight: 'bold' 
          }}
        >
          <Tv size={16} /> 📺 Открыть ТВ (2-й экран)
        </button>
      </div>

      <div style={{ padding: '20px' }}>
        <form onSubmit={handleScanSubmit}>
          <input 
            ref={inputRef}
            className="glass"
            type="text" 
            placeholder="Сканируйте штрихкод поддона здесь..." 
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onBlur={() => !editingRecord && !isPassModalOpen && inputRef.current?.focus()}
            style={{ 
              width: '100%', padding: '20px', fontSize: '32px', textAlign: 'center', borderRadius: 'var(--radius-lg)', 
              border: '2px solid var(--c-accent)', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-text-primary)',
              boxShadow: '0 0 20px rgba(0, 255, 136, 0.1)', outline: 'none', fontWeight: 'bold'
            }} 
          />
        </form>
      </div>

      <div style={{ padding: '0 20px 15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-muted)' }} />
          <input 
            placeholder="Поиск..." className="glass" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 35px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)' }} 
          />
        </div>
        
        <button onClick={exportExcel} className="glass" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 165, 0, 0.1)' }}>
          <FileSpreadsheet size={16} color="orange" /> Excel
        </button>
      </div>

      <div className="responsive-flex-content table-mobile-responsive" style={{ padding: '0 20px' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', color: 'var(--c-accent)' }}>
            <div className="spinner"></div>
            <span>Загрузка данных...</span>
          </div>
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="glass-panel" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-secondary)' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Номер</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Код</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Дата</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Модель</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Статус</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Примечание</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)', background: i % 2 === 0 ? 'var(--c-bg-surface)' : 'transparent', transition: 'all 0.2s' }}>
                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: 'var(--c-accent)' }}>{r.extractedSN || '-'}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{r.barcode}</td>
                <td style={{ padding: '8px 10px', color: 'var(--c-text-secondary)' }}>{r.date}</td>
                <td style={{ padding: '8px 10px', color: 'var(--c-accent)', fontWeight: 'bold' }}>
                  {r.model || '-'}
                  {r.scannedModel && r.scannedModel !== r.model && (
                    <div style={{ fontSize: '10px', color: 'var(--c-danger)' }}>Сканировано: {r.scannedModel}</div>
                  )}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ 
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                    background: r.status === 'OK' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 71, 87, 0.1)',
                    color: r.status === 'OK' ? 'var(--c-success)' : 'var(--c-danger)',
                    border: `1px solid ${r.status === 'OK' ? 'var(--c-success)' : 'var(--c-danger)'}`
                  }}>
                    {r.status === 'OK' ? 'Принято' : 'Заблокировано'}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '-'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button onClick={() => openEdit(r)} className="glass" style={{ padding: '4px 8px', borderRadius: '4px', color: 'var(--c-accent)' }}>ред.</button>
                    <button onClick={() => handleDelete(r.id)} style={{ padding: '4px 8px', borderRadius: '4px', color: 'var(--c-danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {editingRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '400px', padding: '30px', background: 'var(--c-bg-surface-elevated)', border: '1px solid var(--c-border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--c-accent)' }}>Редактировать запись</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--c-text-secondary)' }}>Штрихкод</label>
                <div style={{ fontFamily: 'monospace', fontSize: '16px', color: 'var(--c-accent)' }}>{editingRecord.barcode}</div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--c-text-secondary)' }}>Статус</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => setEditStatus('OK')}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: editStatus === 'OK' ? 'var(--c-success)' : 'var(--c-bg-surface)', color: editStatus === 'OK' ? '#000' : '#888' }}
                  >OK</button>
                  <button 
                    onClick={() => setEditStatus('NG')}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: editStatus === 'NG' ? 'var(--c-danger)' : 'var(--c-bg-surface)', color: editStatus === 'NG' ? '#fff' : '#888' }}
                  >NG</button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--c-text-secondary)' }}>Примечание</label>
                <textarea 
                  ref={editNoteRef}
                  placeholder="Примечание (Русский/Eng)..."
                  className="glass"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '6px', color: 'var(--c-text-primary)', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={handleUpdate} style={{ flex: 2, padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>СОХРАНИТЬ</button>
                <button onClick={() => setEditingRecord(null)} style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>ОТМЕНА</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {isPassModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '320px', padding: '30px', textAlign: 'center', background: '#222' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Подтверждение доступа</h3>
            <p style={{ fontSize: '14px', color: 'var(--c-text-muted)', marginBottom: '20px' }}>Введите пароль Вашего аккаунта <b>{useAuthStore.getState().user?.username}</b></p>
            <input
              ref={passInputRef}
              type="password"
              className="glass"
              value={passInputValue}
              onChange={e => setPassInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmPassword()}
              style={{ width: '100%', padding: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={confirmPassword} style={{ flex: 2, padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>ВХОД</button>
              <button onClick={() => setIsPassModalOpen(false)} style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface-elevated)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>ОТМЕНА</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

