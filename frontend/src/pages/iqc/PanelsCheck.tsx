import React, { useState, useRef, useEffect } from 'react';
import { playSound } from '../../utils/audio';
import { DsmTable } from '../../components/ui/DsmTable';
import { useDataStore } from '../../store/useDataStore';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';

import { compressImage, compressImageMax } from '../../utils/image';

import { ModalPortal } from '../../components/ui/ModalPortal';
import { useAuthStore } from '../../store/useAuthStore';
import { api, translateToEnglish } from '../../utils/api';
import { FileDown, Image as ImageIcon, X, Loader2 } from 'lucide-react';

export const PanelsCheck = () => {
  const { fetchLogs, fetchAllLogs, saveLog, updateLog, deleteLog, activeLot, settings, fetchSettings, showToast, showConfirm } = useDataStore();
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editFiles, setEditFiles] = useState<File[]>([]);
  

  
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel'>('pdf');
  const [exportData, setExportData] = useState({
    inspector: '',
    customer: 'Xiaomi',
    type: 'TV',
    tradeMark: 'Xiaomi',
    modelName: '-',
    startDate: '',
    endDate: '',
    lotQty: 7000,
  });

  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputValue, setPassInputValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete', record: any } | null>(null);

  // Primary Scan State
  const [partCode, setPartCode] = useState('');
  const [openCell, setOpenCell] = useState('');
  
  // Other Data (Defaults)
  const [partName, setPartName] = useState('Panel Xiaomi');
  const [qty, setQty] = useState<number>(1);
  const [defect, setDefect] = useState('OK');
  const [repair, setRepair] = useState('Нет');
  const [responsibility, setResponsibility] = useState('');
  const [process, setProcess] = useState('IQC');
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [defectOptions, setDefectOptions] = useState<string[]>(["OK", "Line", "Point", "Broken", "Other"]);

  useEffect(() => {
    try {
      if (settings.iqc_panels_defects) {
        setDefectOptions(JSON.parse(settings.iqc_panels_defects));
      }
    } catch (e) {
      console.error('Failed to parse iqc_panels_defects', e);
    }
  }, [settings.iqc_panels_defects]);

  const partCodeRef = useRef<HTMLInputElement>(null);
  const openCellRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefEdit = useRef<HTMLInputElement>(null);
  const [lotQty, setLotQty] = useState(3500);
  const [readyQty, setReadyQty] = useState(200);

  useEffect(() => {
    if (showExportModal && records.length > 0) {
      const timestamps = records.map(r => new Date(r.timestamp).getTime()).filter(t => !isNaN(t));
      if (timestamps.length > 0) {
        const start = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
        const end = new Date(Math.max(...timestamps)).toISOString().split('T')[0];
        setExportData(prev => ({
          ...prev,
          startDate: start,
          endDate: end,
          modelName: records[0]?.name || '-'
        }));
      }
    }
  }, [showExportModal, records]);

  useEffect(() => {
    loadData();
    fetchSettings();
    setTimeout(() => partCodeRef.current?.focus(), 50);
  }, [activeLot]);

  const loadData = async () => {
    setLoading(true);
    const logs = await fetchLogs('iqc_panels');
    setRecords(logs.map(l => ({ id: l.id, ...l.data, status: l.status, timestamp: l.timestamp })));
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setIsCompressing(true);
      try {
        const fileArray = Array.from(files);
        for (const file of fileArray) {
          if (photos.length >= 10) break;
          
          if (file.size > 5 * 1024 * 1024) {
            showToast(`Файл "${file.name}" превышает 5 МБ!`, 'error');
            continue;
          }

          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const compressed = await compressImageMax(base64);
          setPhotos(prev => [...prev.slice(0, 9), compressed]);
        }
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && editingRecord) {
      setIsCompressing(true);
      try {
        const fileArray = Array.from(files);
        for (const file of fileArray) {
          const currentCount = (editingRecord.photos?.length || 0) + (editingRecord.previewPhotos?.length || 0);
          if (currentCount >= 10) break;

          if (file.size > 5 * 1024 * 1024) {
            showToast(`Файл "${file.name}" превышает 5 МБ!`, 'error');
            continue;
          }

          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          
          const compressed = await compressImageMax(base64);
          
          setEditingRecord((prev: any) => ({
            ...prev,
            previewPhotos: [...(prev.previewPhotos || []), compressed]
          }));
        }
      } finally {
        setIsCompressing(false);
      }
    }
    // Clear the input so selecting the same file triggers onChange again
    e.target.value = '';
  };

  const removeEditPhoto = (idx: number, isPreview: boolean) => {
    setEditingRecord((prev: any) => {
      if (isPreview) {
        const newPreviewPhotos = [...(prev.previewPhotos || [])];
        newPreviewPhotos.splice(idx, 1);
        setEditFiles(files => {
          const newFiles = [...files];
          newFiles.splice(idx, 1);
          return newFiles;
        });
        return { ...prev, previewPhotos: newPreviewPhotos };
      } else {
        const newPhotos = [...(prev.photos || [])];
        newPhotos.splice(idx, 1);
        return { ...prev, photos: newPhotos };
      }
    });
  };

  // Auto-jump logic for scanners that don't send Enter
  useEffect(() => {
    if (partCode.trim().length >= 5) {
      const timer = setTimeout(() => {
        openCellRef.current?.focus();
      }, 150); 
      return () => clearTimeout(timer);
    }
  }, [partCode]);

  useEffect(() => {
    if (openCell.trim().length >= 5) {
      const timer = setTimeout(() => {
        handleAdd();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [openCell]);

  const handleAdd = async () => {
    if (!activeLot) return showToast('Выберите текущий лот!', 'error');
    
    // Check if we have at least some data
    const pCode = partCode.trim();
    const oCell = openCell.trim();
    if (!pCode || !oCell) return;

    const isDuplicate = records.some(r => 
      (pCode && r.partCode?.trim().toUpperCase() === pCode.toUpperCase()) || 
      (oCell && r.openCell?.trim().toUpperCase() === oCell.toUpperCase())
    );
    if (isDuplicate) {
      showToast('Ошибка! Этот ТВ (матрица/ячейка) уже проверялся в текущем лоте.', 'error');
      playSound('ng');
      setPartCode('');
      setOpenCell('');
      setTimeout(() => partCodeRef.current?.focus(), 50);
      return;
    }
    
    let finalDefect = defect || 'OK';
    if (finalDefect !== 'OK') {
      const enDef = await translateToEnglish(finalDefect);
      if (enDef && enDef.toLowerCase() !== finalDefect.toLowerCase()) finalDefect = `${finalDefect} / ${enDef}`;
    }

    const data = {
      partName,
      partCode: pCode.toUpperCase(),
      openCell: oCell.toUpperCase(),
      qty: qty || 1,
      defect: finalDefect,
      repair,
      responsibility: responsibility || '-',
      process: process || 'IQC',
      comment: comment || '-',
      photos: photos
    };
    
    const status = (defect === 'OK') ? 'OK' : 'NG';
    
    setIsSaving(true);
    try {
      await saveLog('iqc_panels', data, status);
      playSound(status === 'OK' ? 'ok' : 'ng');
      
      // Immediate clear and focus for "seamless" feel
      setPartCode('');
      setOpenCell('');
      setPhotos([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDefect('OK');
      setComment('');
      
      // Small delay before focus to ensure state is processed
      setTimeout(() => partCodeRef.current?.focus(), 50);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Ошибка при сохранении записи', 'error');
      setTimeout(() => partCodeRef.current?.focus(), 50);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePartCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (partCode.trim()) {
        openCellRef.current?.focus();
      }
    }
  };

  const handleOpenCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (openCell.trim()) {
        handleAdd();
      }
    }
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
        const row = pendingAction.record;
        setEditingRecord(row);
        setEditFiles([]);
      } else if (pendingAction?.type === 'delete') {
        const recordId = pendingAction.record.id;
        showConfirm('Вы уверены, что хотите удалить эту запись?', async () => {
          try {
            await deleteLog('iqc_panels', recordId);
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

  const handleDelete = (id: any) => {
    const record = records.find(r => Number(r.id) === Number(id));
    if (record) {
      handleActionClick('delete', record);
    }
  };

  const handleUpdate = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!editingRecord) return;
    setIsSaving(true);
    try {
      const { id, status: oldStatus, previewPhotos, ...data } = editingRecord;
      const newStatus = (data.defect === 'OK') ? 'OK' : 'NG';
      
      if (previewPhotos && previewPhotos.length > 0) {
        data.photos = [...(data.photos || []), ...previewPhotos];
      }
      
      if (data.comment && data.comment.trim()) {
        const en = await translateToEnglish(data.comment.trim());
        if (en && en.toLowerCase() !== data.comment.trim().toLowerCase()) {
          data.comment = `${data.comment.trim()} / ${en}`;
        }
      }

      if (data.defect && data.defect !== 'OK') {
        const enDef = await translateToEnglish(data.defect);
        if (enDef && enDef.toLowerCase() !== data.defect.toLowerCase()) {
          data.defect = `${data.defect} / ${enDef}`;
        }
      }

      await updateLog('iqc_panels', id, data, newStatus);
      playSound(newStatus === 'OK' ? 'ok' : 'ng');
      
      setEditingRecord(null);
      setEditFiles([]);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Ошибка при обновлении записи. Возможно, данные слишком большие.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const exportPDF = async () => {
    if (!activeLot) return showToast('Сначала выберите Лот для экспорта!', 'error');
    try {
      const logs = await fetchLogs('iqc_panels');
      if (logs.length === 0) return showToast('Нет данных для экспорта в этом Лоте', 'error');
      setExportType('pdf');
      setShowExportModal(true);
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
  };

  const exportExcel = async () => {
    if (!activeLot) return showToast('Сначала выберите Лот для экспорта!', 'error');
    try {
      const logs = await fetchLogs('iqc_panels');
      if (logs.length === 0) return showToast('Нет данных для экспорта в этом Лоте', 'error');
      setExportType('excel');
      setShowExportModal(true);
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
  };

  const generatePDFWithData = async () => {
    if (!activeLot) return;
    try {
      const logs = await fetchLogs('iqc_panels');
      const records = logs.map(l => ({ id: l.id, ...l.data, status: l.status }));

      if (records.length === 0) return showToast('Нет данных для экспорта в этом Лоте', 'error');

      const defectsQty = records.filter(r => r.status === 'NG' || r.defect !== 'OK').length;
      
      const report_data = {
        inspector: exportData.inspector,
        lotNr: activeLot.name,
        customer: exportData.customer,
        type: exportData.type,
        tradeMark: exportData.tradeMark,
        modelName: exportData.modelName,
        assemblyStarted: formatDate(exportData.startDate),
        assemblyFinished: formatDate(exportData.endDate),
        lotQty: exportData.lotQty,
        readyQty: records.length,
        defectsQty: defectsQty
      };

      // Request PDF stream from backend
      const blob = await api.postBlob('/reports/panels-pdf', {
        report_data,
        records
      });

      const safeLotName = (activeLot.name || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
      const lotName = `_Lot_${safeLotName}`;
      const fileName = `Panels_Check${lotName}_${new Date().toISOString().split('T')[0]}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
    } catch (e) {
      console.error('PDF Export failed:', e);
      showToast(`Ошибка при создании PDF: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const generateExcelWithData = async () => {
    if (!activeLot) return;
    try {
      const logs = await fetchLogs('iqc_panels');
      const records = logs.map(l => ({ id: l.id, ...l.data, status: l.status }));

      if (records.length === 0) return showToast('Нет данных для экспорта в этом Лоте', 'error');

      const defectsQty = records.filter(r => r.status === 'NG' || r.defect !== 'OK').length;
      
      const report_data = {
        inspector: exportData.inspector,
        lotNr: activeLot.name,
        customer: exportData.customer,
        type: exportData.type,
        tradeMark: exportData.tradeMark,
        modelName: exportData.modelName,
        assemblyStarted: formatDate(exportData.startDate),
        assemblyFinished: formatDate(exportData.endDate),
        lotQty: exportData.lotQty,
        readyQty: records.length,
        defectsQty: defectsQty
      };

      // Request Excel stream from backend
      const blob = await api.postBlob('/reports/panels-excel', {
        report_data,
        records
      });

      const safeLotName = (activeLot.name || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
      const lotName = `_Lot_${safeLotName}`;
      const fileName = `Panels_Check${lotName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
    } catch (e) {
      console.error('Excel Export failed:', e);
      showToast(`Ошибка при создании Excel: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const columns = [
    { key: 'partCode', label: 'PART CODE' },
    { key: 'openCell', label: 'OPEN CELL' },
    { key: 'partName', label: 'NAME' },
    { key: 'qty', label: 'Qty' },
    { key: 'defect', label: 'DEFECT' },
    { 
      key: 'status', 
      label: 'STATUS',
      render: (val: string) => (
        <span style={{ 
          color: val === 'OK' ? 'var(--c-success)' : 'var(--c-danger)', 
          fontWeight: 'bold',
          padding: '2px 8px',
          borderRadius: '4px',
          background: val === 'OK' ? 'var(--c-success-muted)' : 'var(--c-danger-muted)'
        }}>
          {val}
        </span>
      )
    },
    { key: 'comment', label: 'COMMENT' }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingBottom: '30px' }}>
      
      {/* Header Info */}
      <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--c-accent)' }}>Инспекция матриц (Auto-Scan)</h3>
          <span style={{ fontSize: '12px', color: 'var(--c-text-muted)' }}>Лот: {activeLot?.name || 'Не выбран'}</span>
        </div>

        {/* Real-time Counters */}
        <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--c-text-muted)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>Проверено всего</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--c-text-primary)', lineHeight: '1' }}>{records.length}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--c-text-muted)', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>Дефектов (NG)</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--c-danger)', lineHeight: '1' }}>{records.filter(r => r.status === 'NG' || (r.defect && r.defect !== 'OK')).length}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={exportExcel} className="glass" style={{ padding: '8px 15px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px' }}>
            Экспорт Excel
          </button>
          <button onClick={exportPDF} className="glass" style={{ padding: '8px 15px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: '4px' }}>
            Экспорт PDF
          </button>
        </div>
      </div>

      {/* Primary Scan Area */}
      <div className="glass-panel" style={{ padding: '30px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', background: 'var(--c-bg-surface-elevated)', border: '2px solid var(--c-accent-muted)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '10px', color: 'var(--c-accent)', fontWeight: 'bold' }}>1. SCAN PART CODE</label>
            <input 
              ref={partCodeRef}
              className="glass" 
              value={partCode} 
              onChange={e => setPartCode(e.target.value)}
              onKeyDown={handlePartCodeKeyDown}
              placeholder="Ожидание сканирования..."
              autoComplete="off"
              spellCheck="false"
              style={{ width: '100%', padding: '20px', fontSize: '24px', textAlign: 'center', border: '1px solid var(--c-accent)', color: 'var(--c-text-primary)', fontWeight: 'bold' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '10px', color: 'var(--c-warning)', fontWeight: 'bold' }}>2. SCAN OPEN CELL</label>
            <input 
              ref={openCellRef}
              className="glass" 
              value={openCell} 
              onChange={e => setOpenCell(e.target.value)}
              onKeyDown={handleOpenCellKeyDown}
              placeholder="Ожидание сканирования..."
              autoComplete="off"
              spellCheck="false"
              style={{ width: '100%', padding: '20px', fontSize: '24px', textAlign: 'center', border: '1px solid var(--c-warning)', color: 'var(--c-text-primary)', fontWeight: 'bold' }}
            />
          </div>
        </div>
      </div>



      {/* History Table */}
      <div style={{ flex: 1, minHeight: '400px' }}>
        <DsmTable 
          title="История инспекции (нажмите на строку для редактирования)" 
          columns={columns} 
          data={records} 
          loading={loading} 
          hideAdd 
          hideExport 
          onDelete={handleDelete} 
          onEdit={(row) => handleActionClick('edit', row)} 
        />
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '500px', padding: '30px', background: 'var(--c-bg-surface-elevated)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--c-accent)' }}>Редактирование записи</h3>
            <div style={{ display: 'grid', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div><label style={{ fontSize: '12px' }}>PART CODE</label><input className="glass" value={editingRecord.partCode} onChange={e => setEditingRecord({...editingRecord, partCode: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
                <div><label style={{ fontSize: '12px' }}>OPEN CELL</label><input className="glass" value={editingRecord.openCell} onChange={e => setEditingRecord({...editingRecord, openCell: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              </div>
              <div>
                <label style={{ fontSize: '12px' }}>Defect Definition</label>
                <select className="glass" value={editingRecord.defect} onChange={e => setEditingRecord({...editingRecord, defect: e.target.value})} style={{ width: '100%', padding: '10px' }}>
                  {defectOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label style={{ fontSize: '12px' }}>Comment</label><textarea placeholder="Комментарий (Русский/Eng)..." className="glass" value={editingRecord.comment} onChange={e => setEditingRecord({...editingRecord, comment: e.target.value})} style={{ width: '100%', padding: '10px', height: '60px' }} /></div>
              
              <div>
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '10px' }}>
                  Photos ({editingRecord.photos?.length || 0}) 
                  {isCompressing && <span style={{ color: 'var(--c-accent)', marginLeft: '10px' }}>Сжатие...</span>}
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {(editingRecord.photos || []).map((p: string, idx: number) => (
                    <div key={`ext-${idx}`} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
                      <img src={p} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Defect" />
                      <button 
                        onClick={(e) => { e.preventDefault(); removeEditPhoto(idx, false); }}
                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255,0,0,0.7)', color: '#fff', border: 'none', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(editingRecord.previewPhotos || []).map((p: string, idx: number) => (
                    <div key={`prv-${idx}`} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
                      <img src={p} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                      <button 
                        onClick={(e) => { e.preventDefault(); removeEditPhoto(idx, true); }}
                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255,0,0,0.7)', color: '#fff', border: 'none', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {((editingRecord.photos?.length || 0) + (editingRecord.previewPhotos?.length || 0) < 10) && (
                    <button 
                      onClick={(e) => { e.preventDefault(); fileInputRefEdit.current?.click(); }}
                      style={{ width: '60px', height: '60px', borderRadius: '4px', border: '2px dashed var(--c-border)', background: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}
                    >
                      +
                    </button>
                  )}
                </div>
                <input type="file" multiple ref={fileInputRefEdit} onChange={handleEditFileUpload} style={{ display: 'none' }} accept="image/*" />
              </div>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={handleUpdate} 
                  type="button" 
                  disabled={isSaving || isCompressing}
                  style={{ 
                    flex: 2, 
                    padding: '12px', 
                    background: isSaving || isCompressing ? 'var(--c-border)' : 'var(--c-accent)', 
                    color: '#000', 
                    border: 'none', 
                    borderRadius: '4px', 
                    fontWeight: 'bold', 
                    cursor: isSaving || isCompressing ? 'not-allowed' : 'pointer',
                    opacity: isSaving || isCompressing ? 0.7 : 1
                  }}
                >
                  {isSaving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                </button>
                <button 
                  onClick={(e) => { e.preventDefault(); setEditingRecord(null); setEditFiles([]); }} 
                  type="button" 
                  disabled={isSaving}
                  style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ОТМЕНА
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>
    )}

      {/* Export Modal */}
      {showExportModal && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '500px', padding: '30px', background: 'var(--c-bg-surface-elevated)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--c-accent)' }}>{exportType === 'pdf' ? 'Настройки экспорта PDF' : 'Настройки экспорта Excel'}</h3>
            <div style={{ display: 'grid', gap: '15px' }}>
              <div><label style={{ fontSize: '12px' }}>Отчёт составил (а) /revised</label><input className="glass" value={exportData.inspector} onChange={e => setExportData({...exportData, inspector: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div><label style={{ fontSize: '12px' }}>Заказчик / Customer</label><input className="glass" value={exportData.customer} onChange={e => setExportData({...exportData, customer: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
                <div><label style={{ fontSize: '12px' }}>Вид продукции / Type</label><input className="glass" value={exportData.type} onChange={e => setExportData({...exportData, type: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div><label style={{ fontSize: '12px' }}>Бренд / Trade Mark</label><input className="glass" value={exportData.tradeMark} onChange={e => setExportData({...exportData, tradeMark: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
                <div><label style={{ fontSize: '12px' }}>Модель / Model name</label><input className="glass" value={exportData.modelName} onChange={e => setExportData({...exportData, modelName: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div><label style={{ fontSize: '12px' }}>Assembly started</label><input type="date" className="glass" value={exportData.startDate} onChange={e => setExportData({...exportData, startDate: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
                <div><label style={{ fontSize: '12px' }}>Assembly finished</label><input type="date" className="glass" value={exportData.endDate} onChange={e => setExportData({...exportData, endDate: e.target.value})} style={{ width: '100%', padding: '10px' }} /></div>
              </div>
              <div><label style={{ fontSize: '12px' }}>Количество в ЛОТе / LOT Q-ty</label><input type="number" className="glass" value={exportData.lotQty} onChange={e => setExportData({...exportData, lotQty: Number(e.target.value)})} style={{ width: '100%', padding: '10px' }} /></div>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={exportType === 'pdf' ? generatePDFWithData : generateExcelWithData} 
                  style={{ flex: 2, padding: '12px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {exportType === 'pdf' ? 'СГЕНЕРИРОВАТЬ PDF' : 'СГЕНЕРИРОВАТЬ EXCEL'}
                </button>
                <button onClick={() => setShowExportModal(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>ОТМЕНА</button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>
    )}


      {/* Password Modal */}
      {isPassModalOpen && (
        <ModalPortal>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel animate-scale-in" style={{ width: '320px', padding: '30px', textAlign: 'center', background: '#222' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Подтверждение доступа</h3>
              <p style={{ fontSize: '14px', color: 'var(--c-text-muted)', marginBottom: '20px' }}>Введите пароль Вашего аккаунта <b>{useAuthStore.getState().user?.username}</b></p>
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
        </ModalPortal>
      )}
    </div>
  );
};
