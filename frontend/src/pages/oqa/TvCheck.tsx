import { useState, useEffect, useRef } from 'react';
import { playSound } from '../../utils/audio';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { api, translateToEnglish } from '../../utils/api';

const DEFECT_LIST = [
  'Внешний вид', 'Электробезопасность', 'Первое включение', 'Линза/кнопки ПДУ',
  'Антенна/модуль CI', 'Звук', 'USB/MKV плеер/матрица', 'Сброс настроек/вес',
  'Аксессуары/наклейки', 'Упаковка', 'Малозначительный', 'Значительный',
  'Критический', 'Термопрогон'
];

interface ShiftConfig {
  ratio_produced: number;
  ratio_checked: number;
}

const defaultShift: ShiftConfig = {
  ratio_produced: 280,
  ratio_checked: 13
};


const getAqlPlan = (produced: number, config: ShiftConfig) => {
  if (produced <= 0) return 0;
  const ratio = (config.ratio_checked || 13) / (config.ratio_produced || 280);
  return Math.round(produced * ratio);
};

export const TvCheck = () => {
  const { user } = useAuthStore();
  const {
    activeLot, fetchLogs, saveLog, settings, fetchSettings,
    tvModels, fetchTvModels, tvTests, fetchTvTests,
    mesFact, mesLoading, fetchMesFact,
    showToast, showConfirm
  } = useDataStore();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Shift & AQL state
  const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(defaultShift);

  useEffect(() => {
    try {
      if (settings.oqa_shift_config) {
        const parsed = JSON.parse(settings.oqa_shift_config);
        setShiftConfig(parsed);
      }
    } catch {
      // ignore
    }
  }, [settings.oqa_shift_config]);

  useEffect(() => {
    fetchMesFact();
    const interval = setInterval(fetchMesFact, 30000);
    return () => clearInterval(interval);
  }, [fetchMesFact]);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [onlyNg, setOnlyNg] = useState(false);
  const [searchMn, setSearchMn] = useState('');
  const [qcNumber, setQcNumber] = useState('');

  // Form State
  const [mnBox, setMnBox] = useState('');
  const [mnTv, setMnTv] = useState('');
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [extraTests, setExtraTests] = useState<string[]>([]);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editDefects, setEditDefects] = useState<string[]>([]);
  const [editTests, setEditTests] = useState<string[]>([]);
  const [editComment, setEditComment] = useState('');
  const [editInspector, setEditInspector] = useState('');



  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputValue, setPassInputValue] = useState('');
  const [pendingRecord, setPendingRecord] = useState<any>(null);
  const [lastPlayedMn, setLastPlayedMn] = useState('');
  const mnBoxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mnBoxRef.current?.focus();
  }, []);





  useEffect(() => {
    loadData();
    fetchSettings();
    fetchTvModels();
    fetchTvTests();
    setTimeout(() => mnBoxRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLot]);

  const handleEditClick = (record: any) => {
    setPendingRecord(record);
    setPassInputValue('');
    setIsPassModalOpen(true);
  };

  const confirmPassword = async () => {
    try {
      await api.post('/auth/verify', { password: passInputValue });
      const record = pendingRecord;
      setEditingRecord(record);
      setEditDefects(record.defects ? record.defects.split(', ').filter(Boolean) : []);

      const commentParts = record.comments ? record.comments.split('; ') : [];
      const testsFromComment = commentParts.filter((p: string) => tvTests.some(t => t.name === p));
      const manualComment = commentParts.filter((p: string) => !tvTests.some(t => t.name === p)).join('; ');

      setEditTests(testsFromComment);
      setEditComment(manualComment);
      setEditInspector(record.inspector || '');
      setIsPassModalOpen(false);
    } catch (e: any) {
      showToast(e.message || 'Неверный пароль', 'error');
    }
  };

  const { updateLog, deleteLog } = useDataStore();

  const handleUpdate = async () => {
    if (!editingRecord) return;
    try {
      const recordId = editingRecord.id;
      const rest = { ...editingRecord };
      delete rest.id;
      delete rest.status;

      const hasDefects = editDefects.length > 0;
      const expectedModel = activeLot?.tv_model_id ? tvModels.find(m => m.id == activeLot.tv_model_id) : null;

      const fullMnEdit = (editingRecord.mnBox + editingRecord.mnTv).toUpperCase();
      const scannedModelEdit = tvModels.find(m => m.mn_keyword && fullMnEdit.includes(m.mn_keyword.toUpperCase()));
      const isModelMismatch = !!(expectedModel && scannedModelEdit && scannedModelEdit.id !== expectedModel.id);

      const boxEditNorm = editingRecord.mnBox.trim().toUpperCase();
      const tvEditNorm = editingRecord.mnTv.trim().toUpperCase();
      const newStatus = (boxEditNorm !== tvEditNorm || hasDefects || isModelMismatch) ? 'NG' : 'OK';

      let finalEditDefects = editDefects.join(', ');
      if (finalEditDefects) {
        const enDef = await translateToEnglish(finalEditDefects);
        if (enDef && enDef.toLowerCase() !== finalEditDefects.toLowerCase()) finalEditDefects = `${finalEditDefects} / ${enDef}`;
      }

      let finalEditTests = editTests.join(', ');
      if (finalEditTests) {
        const enTest = await translateToEnglish(finalEditTests);
        if (enTest && enTest.toLowerCase() !== finalEditTests.toLowerCase()) finalEditTests = `${finalEditTests} / ${enTest}`;
      }

      const updatedData: any = {
        ...rest,
        defects: finalEditDefects,
        tests: finalEditTests,
        comments: [editComment].filter(Boolean).join('; ')
      };

      if (user?.role === 'Admin') {
        updatedData.inspector = editInspector;
      }

      await updateLog('oqa_tv', recordId, updatedData, newStatus);

      // Update local state immediately
      setRecords(prev => prev.map(r => Number(r.id) === Number(recordId) ? { ...r, ...updatedData, status: newStatus } : r));
      setEditingRecord(null);

      // Removed reload to prevent "disappearing" changes. 
      // The local state update above is sufficient and accurate.

      showToast('Запись успешно обновлена!');
    } catch (err) {
      console.error(err);
      showToast('Ошибка при сохранении', 'error');
    }
  };

  const handleDelete = async () => {
    if (!editingRecord) return;
    showConfirm('Вы уверены, что хотите удалить эту запись?', async () => {
      try {
        await deleteLog('oqa_tv', editingRecord.id);
        setRecords(prev => prev.filter(r => r.id !== editingRecord.id));
        setEditingRecord(null);
        showToast('Запись удалена');
      } catch (err) {
        console.error(err);
        showToast('Ошибка при удалении', 'error');
      }
    }, undefined, 'danger');
  };

  // No useEffect needed for model
  const loadData = async () => {
    setLoading(true);
    const logs = await fetchLogs('oqa_tv');
    // Ensure DB id always wins by spreading it LAST or after data
    setRecords(logs.map(l => ({ ...l.data, id: l.id, status: l.status, timestamp: l.timestamp })));
    setLoading(false);
  };

  let statusText = 'В ОЖИДАНИИ';
  let isNg = false;
  let isOk = false;

  const expectedModel = activeLot?.tv_model_id ? tvModels.find(m => m.id == activeLot.tv_model_id) : null;
  const currentModelName = expectedModel ? expectedModel.name : 'Unknown';

  const identifyModel = (barcode: string) => {
    if (!barcode) return null;
    const b = barcode.trim().toUpperCase();
    
    // User wants to identify model based on MN keyword as a prefix
    for (const m of tvModels) {
      if (m.mn_keyword && b.includes(m.mn_keyword.toUpperCase())) {
        return m;
      }
    }
    return null;
  };

  const scannedModelBox = identifyModel(mnBox);
  const scannedModelTv = identifyModel(mnTv);
  const scannedModel = scannedModelBox || scannedModelTv;

  const boxNorm = mnBox.trim().toUpperCase();
  const tvNorm = mnTv.trim().toUpperCase();

  // Detailed mismatch logic
  const mismatchBox = !!(expectedModel && scannedModelBox && scannedModelBox.id !== expectedModel.id);
  const mismatchTv = !!(expectedModel && scannedModelTv && scannedModelTv.id !== expectedModel.id);
  const mismatchBetween = !!(scannedModelBox && scannedModelTv && scannedModelBox.id !== scannedModelTv.id);
  const modelNotFound = !!((mnBox.trim().length > 5 && !scannedModelBox) || (mnTv.trim().length > 5 && !scannedModelTv));

  const isModelMismatch = mismatchBox || mismatchTv || mismatchBetween || modelNotFound;
  
  // Mismatch alert removed per user request (redundant with sound and UI status)

  if (mnBox && mnTv) {
    if (boxNorm !== tvNorm || isModelMismatch) {
      statusText = 'NG';
      isNg = true;
    } else {
      statusText = 'OK';
      isOk = true;
    }
  }

  useEffect(() => {
    if (!mnBox && !mnTv && lastPlayedMn) {
      setLastPlayedMn('');
    }

    const timer = setTimeout(() => {
      if (mnBox.trim().length > 5 && mnTv.trim().length > 5 && (boxNorm + tvNorm) !== lastPlayedMn) {
        const isMatch = boxNorm === tvNorm && !isModelMismatch;
        playSound(isMatch ? 'ok' : 'ng');
        setLastPlayedMn(boxNorm + tvNorm);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [mnBox, mnTv, isModelMismatch, lastPlayedMn, boxNorm, tvNorm]);

  const identifiedModelName = scannedModel 
    ? scannedModel.name 
    : ( (mnBox.length > 0 || mnTv.length > 0) ? 'МОДЕЛЬ НЕ РАСПОЗНАНА' : currentModelName );

  const handleDefectToggle = (defect: string) => {
    setSelectedDefects(prev =>
      prev.includes(defect) ? prev.filter(d => d !== defect) : [...prev, defect]
    );
  };

  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      setValidationError('');
      if (!qcNumber) {
        setValidationError('⚠️ Выберите номер ОТК!');
        setTimeout(() => mnBoxRef.current?.focus(), 50);
        return;
      }
      if (mnBox.trim().toUpperCase() !== mnTv.trim().toUpperCase()) {
        setValidationError('❌ MN Коробки и MN ТВ не совпадают!');
        setMnBox('');
        setMnTv('');
        setTimeout(() => mnBoxRef.current?.focus(), 50);
        return;
      }
      if (!mnBox.trim() || !mnTv.trim()) {
        setValidationError('⚠️ Введите оба серийных номера!');
        setTimeout(() => mnBoxRef.current?.focus(), 50);
        return;
      }

      if (!scannedModel) {
        setValidationError('❌ Модель не распознана в базе данных!');
        showToast('Модель не распознана! Запись не добавлена.', 'error');
        playSound('ng');
        setMnBox('');
        setMnTv('');
        setTimeout(() => mnBoxRef.current?.focus(), 50);
        return;
      }

      const isDuplicate = records.some(r => 
        (mnBox && r.mnBox?.trim().toUpperCase() === mnBox.trim().toUpperCase()) || 
        (mnTv && r.mnTv?.trim().toUpperCase() === mnTv.trim().toUpperCase())
      );
      if (isDuplicate) {
        setValidationError('❌ Этот ТВ уже проверялся (дубликат)!');
        showToast('Ошибка! Этот ТВ уже проверялся в текущем лоте.', 'error');
        playSound('ng');
        setMnBox('');
        setMnTv('');
        setTimeout(() => mnBoxRef.current?.focus(), 50);
        return;
      }

      let finalComment = comment;
      if (comment.trim()) {
        const en = await translateToEnglish(comment.trim());
        if (en && en.toLowerCase() !== comment.trim().toLowerCase()) {
          finalComment = `${comment.trim()} / ${en}`;
        }
      }

      let finalDefects = selectedDefects.join(', ');
      if (finalDefects) {
        const enDef = await translateToEnglish(finalDefects);
        if (enDef && enDef.toLowerCase() !== finalDefects.toLowerCase()) finalDefects = `${finalDefects} / ${enDef}`;
      }

      let finalTests = extraTests.join(', ');
      if (finalTests) {
        const enTest = await translateToEnglish(finalTests);
        if (enTest && enTest.toLowerCase() !== finalTests.toLowerCase()) finalTests = `${finalTests} / ${enTest}`;
      }

      const data = {
        date: new Date().toLocaleString('ru-RU'),
        mnBox,
        mnTv,
        inspector: qcNumber,
        defects: finalDefects,
        tests: finalTests,
        comments: finalComment,
        model: identifiedModelName
      };

      const saveStatus = (boxNorm !== tvNorm || selectedDefects.length > 0 || isModelMismatch) ? 'NG' : 'OK';

      await saveLog('oqa_tv', data, saveStatus);
      playSound('add');

      setMnBox('');
      setMnTv('');
      setSelectedDefects([]);
      setExtraTests([]);
      setComment('');
      setValidationError('');
      setQcNumber('');
      setTimeout(() => mnBoxRef.current?.focus(), 50);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('Ошибка при добавлении в отчет', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const exportExcel = async () => {
    try {
      const logs = await fetchLogs('oqa_tv');
      const records = logs.map(l => ({ ...l.data, id: l.id, status: l.status }));

      const exportData = records.map(r => {
        const displayTests = r.tests || (r.comments ? r.comments.split('; ').filter((p: string) => tvTests.some(t => t.name === p)).join(', ') : '');
        const displayComment = r.tests ? r.comments : (r.comments ? r.comments.split('; ').filter((p: string) => !tvTests.some(t => t.name === p)).join('; ') : '');
        return {
          'Date': formatDate(r.date),
          'Box MN': r.mnBox,
          'TV MN': r.mnTv,
          'Model': r.model,
          'Inspector': r.inspector,
          'Defects': r.defects,
          'Tests': displayTests,
          'Status': r.status,
          'Comments': displayComment
        };
      });
      const lotName = activeLot?.name ? `_Lot_${activeLot.name}` : '';
      const fileName = `OQA_TV${lotName}_${new Date().toISOString().split('T')[0]}`;
      exportToExcel(exportData, fileName, 'OQA TV Check');
    } catch (e) {
      console.error(e);
      showToast('Ошибка экспорта');
    }
  };

  const filteredRecords = records.filter(r => {
    if (onlyNg && r.status !== 'NG') return false;
    if (searchMn && !(r.mnBox.includes(searchMn) || r.mnTv.includes(searchMn))) return false;

    if (filterDateFrom) {
      const [day, month, rest] = r.date.split('.');
      const year = rest.split(',')[0].trim();
      const recordDateIso = `${year}-${month}-${day}`;
      if (recordDateIso !== filterDateFrom) return false;
    }

    return true;
  });

  const totalChecked = filteredRecords.length;
  const defectsCount = filteredRecords.filter(r => r.status === 'NG').length;
  const defectPercent = totalChecked > 0 ? ((defectsCount / totalChecked) * 100).toFixed(1) : '0.0';

  const plan = getAqlPlan(mesFact || 0, shiftConfig);
  const progressPercent = plan > 0 ? (totalChecked / plan) * 100 : 0;
  
  let progressColor = 'var(--c-danger)';
  if (plan === 0 || progressPercent >= 100) {
    progressColor = 'var(--c-success)';
  } else if (progressPercent >= 75) {
    progressColor = 'var(--c-warning)';
  }

  return (
    <div className="responsive-flex-container">

      {/* Top Header */}
      <div className="glass-panel responsive-header" style={{ borderBottom: '1px solid var(--c-border)', padding: '10px 15px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', fontSize: '14px', borderRadius: '0' }}>
        <strong style={{ color: 'var(--c-accent)' }}>Выборочный контроль ГП</strong>
        <div style={{
          backgroundColor: 'var(--c-accent-muted)',
          border: '1px solid var(--c-accent)',
          borderRadius: '4px',
          padding: '4px 10px',
          fontWeight: 'bold',
          color: 'var(--c-text-primary)',
          fontSize: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          boxShadow: '0 0 10px rgba(147, 51, 234, 0.15)'
        }}>
          Лот: {activeLot?.name || 'Не задан'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <label style={{ color: 'var(--c-text-secondary)' }}>Дата: <input type="date" className="glass" style={{ padding: '4px', border: '1px solid var(--c-border)', borderRadius: '4px', color: 'var(--c-text-primary)' }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} /></label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: 'var(--c-text-secondary)' }}>MN:
            <input type="text" placeholder="Поиск..." className="glass" value={searchMn} onChange={e => setSearchMn(e.target.value)} style={{ padding: '4px 8px', marginLeft: '5px', width: '150px', border: '1px solid var(--c-border)', borderRadius: '4px', color: 'var(--c-text-primary)' }} />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: onlyNg ? 'var(--c-danger)' : 'var(--c-text-secondary)' }}>
          <input type="checkbox" checked={onlyNg} onChange={(e) => setOnlyNg(e.target.checked)} /> Только NG
        </label>
      </div>

      {/* Main Content Area */}
      <div className="responsive-flex-split">
        {/* Left Sidebar: Form */}
        <div className="glass-panel responsive-flex-sidebar">
          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <fieldset style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '15px', margin: 0, marginBottom: '15px' }}>
              <legend style={{ fontSize: '12px', color: 'var(--c-text-muted)', padding: '0 5px' }}>Сверка серийных номеров</legend>
              <input 
                ref={mnBoxRef}
                placeholder="МN Коробки..." 
                className="glass" 
                value={mnBox} 
                onChange={e => setMnBox(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', color: 'var(--c-text-primary)' }} 
              />
              <input placeholder="МN ТВ..." className="glass" value={mnTv} onChange={e => setMnTv(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', fontSize: '14px', color: 'var(--c-text-primary)' }} />
              <select className="glass" value={qcNumber} onChange={e => setQcNumber(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-surface)', fontSize: '14px', color: 'var(--c-accent)' }}>
                <option value="" disabled>Выберите ОТК...</option>
                {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num.toString()}>{num}</option>
                ))}
              </select>
              <div style={{ marginTop: '10px', fontSize: '14px' }}>
                Модель: <span style={{ color: isModelMismatch ? 'var(--c-danger)' : (scannedModel ? 'var(--c-success)' : 'var(--c-accent)'), fontWeight: 'bold' }}>{identifiedModelName}</span>
                {isModelMismatch && (
                  <div style={{ color: 'var(--c-danger)', fontSize: '11px', marginTop: '5px', fontWeight: 'bold', padding: '5px', background: 'var(--c-danger-muted)', borderRadius: '4px' }}>
                    ⚠️ НЕСООТВЕТСТВИЕ ЛОТУ!
                  </div>
                )}
              </div>
            </fieldset>

            <div style={{
              height: '80px', background: isOk ? 'var(--c-success)' : isNg ? 'var(--c-danger)' : 'var(--c-bg-surface-elevated)',
              color: isOk || isNg ? '#000' : 'var(--c-text-muted)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', marginBottom: '15px', transition: 'all 0.3s ease'
            }}>
              {statusText}
            </div>

            <fieldset style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '15px', margin: 0, marginBottom: '15px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <legend style={{ fontSize: '12px', color: 'var(--c-text-muted)', padding: '0 5px' }}>Дефекты</legend>
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {DEFECT_LIST.map(d => (
                  <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', marginBottom: '5px', cursor: 'pointer', color: selectedDefects.includes(d) ? 'var(--c-danger)' : 'var(--c-text-secondary)' }}>
                    <input type="checkbox" style={{ accentColor: 'var(--c-danger)' }} checked={selectedDefects.includes(d)} onChange={() => handleDefectToggle(d)} /> {d}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '10px' }}>
                <button 
                  onClick={() => setIsTestModalOpen(true)} 
                  className={extraTests.length > 0 ? "" : "glass"} 
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    fontSize: '12px', 
                    background: extraTests.length > 0 ? 'var(--c-accent)' : 'transparent',
                    color: extraTests.length > 0 ? '#000' : 'var(--c-accent)', 
                    border: extraTests.length > 0 ? 'none' : '1px dashed var(--c-accent)', 
                    borderRadius: '4px',
                    fontWeight: extraTests.length > 0 ? 'bold' : 'normal'
                  }}
                >
                  + Добавить тест ({extraTests.length})
                </button>
              </div>
            </fieldset>

            <textarea placeholder="Комментарий (Русский/Eng)..." className="glass" value={comment} onChange={e => setComment(e.target.value)} style={{ width: '100%', height: '50px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: '13px', marginBottom: '10px', color: 'var(--c-text-primary)' }} />

            {validationError && (
              <div style={{ color: 'var(--c-danger)', fontSize: '12px', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                {validationError}
              </div>
            )}

            <button 
              onClick={handleAdd} 
              disabled={isAdding}
              style={{ 
                width: '100%', 
                padding: '12px', 
                background: isAdding ? 'var(--c-border)' : 'var(--c-accent)', 
                color: '#000', 
                border: 'none', 
                borderRadius: 'var(--radius-sm)', 
                fontWeight: 'bold', 
                cursor: isAdding ? 'not-allowed' : 'pointer',
                opacity: isAdding ? 0.7 : 1
              }}
            >
              {isAdding ? 'Добавление...' : '+ В отчёт'}
            </button>
          </div>
        </div>

        {/* Right Content: Table */}
        <div className="responsive-flex-content table-mobile-responsive">
          {loading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', color: 'var(--c-accent)' }}>
              <div className="spinner"></div>
              <span>Загрузка данных...</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="glass-panel" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-secondary)' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>Дата</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>MN короб</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>MN ТВ</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>Модель</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>ОТК</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>Дефекты</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>Тесты</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>OK/NG</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left' }}>Комментарии</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(r => {
                  // Legacy support: parse tests from comments if tests field is empty
                  const displayTests = r.tests || (r.comments ? r.comments.split('; ').filter((p: string) => tvTests.some(t => t.name === p)).join(', ') : '');
                  const displayComment = r.tests ? r.comments : (r.comments ? r.comments.split('; ').filter((p: string) => !tvTests.some(t => t.name === p)).join('; ') : '');

                  return (
                    <tr key={r.id} style={{ 
                      background: r.status === 'OK' ? 'var(--c-success-muted)' : 'var(--c-danger-muted)', 
                      borderBottom: '1px solid var(--c-border)',
                      height: '22px'
                    }}>
                      <td style={{ padding: '2px 12px' }}>
                        {r.date}
                        {(!r.date || !r.date.includes(',')) && r.timestamp && (
                          <span style={{ color: 'var(--c-text-muted)', fontSize: '0.9em', marginLeft: '5px' }}>
                            {new Date(r.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </td>
                      <td onClick={() => handleEditClick(r)} style={{ padding: '2px 12px', color: 'var(--c-accent)', cursor: 'pointer', textDecoration: 'underline' }}>{r.mnBox}</td>
                      <td style={{ padding: '2px 12px' }}>{r.mnTv}</td>
                      <td style={{ padding: '2px 12px', fontWeight: 'bold' }}>{r.model}</td>
                      <td style={{ padding: '2px 12px' }}>{r.inspector}</td>
                      <td style={{ padding: '2px 12px', color: 'var(--c-text-primary)' }}>{r.defects}</td>
                      <td style={{ padding: '2px 12px', color: 'var(--c-text-primary)' }}>{displayTests}</td>
                      <td style={{ padding: '2px 12px', color: r.status === 'NG' ? 'var(--c-danger)' : 'var(--c-success)', fontWeight: 'bold' }}>{r.status}</td>
                      <td style={{ padding: '2px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayComment}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Footer Bar / MES Dashboard */}
      <div className="glass-panel" style={{ borderTop: '1px solid var(--c-border)', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderRadius: 0, background: 'var(--c-bg-surface-elevated)' }}>
        <button onClick={exportExcel} style={{ padding: '8px 20px', background: 'var(--c-bg-base)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', borderRadius: '4px', cursor: 'pointer' }}>Выгрузить Excel</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          {/* Defect Stats */}
          <div style={{ display: 'flex', gap: '15px', borderRight: '1px solid var(--c-border)', paddingRight: '30px' }}>
            <span style={{ color: 'var(--c-text-secondary)' }}>Проверено: <strong style={{ color: 'var(--c-text-primary)' }}>{totalChecked}</strong></span>
            <span style={{ color: 'var(--c-text-secondary)' }}>Дефект: <strong style={{ color: 'var(--c-danger)' }}>{defectsCount}</strong></span>
            <span style={{ color: 'var(--c-text-secondary)' }}>%: <strong style={{ color: 'var(--c-text-primary)' }}>{defectPercent}%</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '100px' }}>
              <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>
                ФАКТ MES: <strong style={{ color: mesLoading ? 'var(--c-accent)' : 'var(--c-text-primary)' }}>{mesFact ?? '...'} шт</strong>
              </span>
              <span style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>План AQL: <strong>{plan} шт</strong></span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '150px', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ color: progressColor, fontWeight: 'bold' }}>
                  {totalChecked} / {plan}
                </span>
                <span style={{ color: 'var(--c-text-muted)' }}>{Math.min(100, Math.round(progressPercent))}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--c-bg-base)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, progressPercent)}%`,
                  height: '100%',
                  background: progressColor,
                  transition: 'width 0.5s ease-in-out, background 0.5s ease'
                }} />
              </div>
            </div>

          </div>
        </div>
      </div>





      {/* Password Modal */}
      {isPassModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '320px', padding: '30px', textAlign: 'center', background: '#222' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Подтверждение доступа</h3>
            <p style={{ fontSize: '14px', color: 'var(--c-text-muted)', marginBottom: '20px' }}>Введите пароль Вашего аккаунта <b>{user?.username}</b></p>
            <input
              type="password"
              autoFocus
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

      {/* Modals & Overlays */}
      {isTestModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '650px', padding: '25px', borderRadius: 'var(--radius-lg)', background: 'var(--c-bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Выберите дополнительные тесты</h3>
              <button onClick={() => setIsTestModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--c-text-primary)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ maxHeight: '450px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingRight: '5px' }}>
              {tvTests.map(test => (
                <label key={test.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '11px', background: extraTests.includes(test.name) ? 'var(--c-accent-muted)' : 'var(--c-bg-surface-elevated)', borderRadius: '6px', cursor: 'pointer', lineHeight: '1.2' }}>
                  <input type="checkbox" checked={extraTests.includes(test.name)} onChange={() => setExtraTests(prev => prev.includes(test.name) ? prev.filter(t => t !== test.name) : [...prev, test.name])} />
                  {test.name}
                </label>
              ))}
            </div>
            <button onClick={() => setIsTestModalOpen(false)} style={{ width: '100%', marginTop: '20px', padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Готово</button>
          </div>
        </div>
      )}

      {editingRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(5px)', padding: '15px' }}>
          <div className="glass-panel animate-scale-in" style={{ 
            width: '600px', 
            maxHeight: '90vh', 
            height: '650px',
            display: 'flex', 
            flexDirection: 'column', 
            background: 'var(--c-bg-surface)', 
            color: 'var(--c-text-primary)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            padding: 0,
            border: '1px solid var(--c-border)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 25px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: 'var(--c-text-primary)' }}>Редактировать запись: {editingRecord.mnBox}</h3>
              <button onClick={() => setEditingRecord(null)} style={{ background: 'none', border: 'none', color: 'var(--c-text-primary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {user?.role === 'Admin' && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '10px', display: 'block', fontWeight: 'bold' }}>НОМЕР ОТК (ТОЛЬКО ДЛЯ АДМИНА)</label>
                  <select 
                    className="glass" 
                    value={editInspector} 
                    onChange={e => setEditInspector(e.target.value)} 
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-surface-elevated)', color: 'var(--c-text-primary)', outline: 'none' }}
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num.toString()}>{num}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '10px', display: 'block', fontWeight: 'bold' }}>ДЕФЕКТЫ</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {DEFECT_LIST.map(d => (
                    <button key={d} onClick={() => setEditDefects(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])} className="glass" style={{
                      padding: '10px 8px', fontSize: '11px', textAlign: 'left',
                      background: editDefects.includes(d) ? 'var(--c-danger)' : 'var(--c-bg-surface-elevated)',
                      color: editDefects.includes(d) ? '#fff' : 'var(--c-text-primary)',
                      border: '1px solid var(--c-border)',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}>{editDefects.includes(d) ? '✓ ' : '+ '} {d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '10px', display: 'block', fontWeight: 'bold' }}>ТЕСТЫ</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {tvTests.map(t => (
                    <button key={t.id} onClick={() => setEditTests(prev => prev.includes(t.name) ? prev.filter(x => x !== t.name) : [...prev, t.name])} className="glass" style={{
                      padding: '10px 8px', fontSize: '11px', textAlign: 'left',
                      background: editTests.includes(t.name) ? 'var(--c-accent-muted)' : 'var(--c-bg-surface-elevated)',
                      color: 'var(--c-text-primary)',
                      border: '1px solid var(--c-border)',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}>{editTests.includes(t.name) ? '☑ ' : '☐ '} {t.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--c-text-secondary)', marginBottom: '5px', display: 'block', fontWeight: 'bold' }}>КОММЕНТАРИЙ</label>
                <textarea
                  className="glass"
                  placeholder="Комментарий (Русский/Eng)..."
                  value={editComment}
                  onChange={e => setEditComment(e.target.value)}
                  style={{ width: '100%', padding: '10px', minHeight: '80px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', background: 'var(--c-bg-surface-elevated)', borderRadius: '6px' }}
                />
              </div>
            </div>

            {/* Footer containing Save/Delete buttons */}
            <div style={{ padding: '20px 25px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: '10px', background: 'var(--c-bg-surface-elevated)', flexShrink: 0 }}>
              <button
                onClick={handleUpdate}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'var(--c-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}
              >
                СОХРАНИТЬ ИЗМЕНЕНИЯ
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: '14px 20px',
                  background: 'var(--c-danger-muted)',
                  color: 'var(--c-danger)',
                  border: '1px solid var(--c-danger)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                УДАЛИТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

