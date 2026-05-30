import { useState, useEffect, useRef } from 'react';
import { DsmTable } from '../../components/ui/DsmTable';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { exportToExcel } from '../../utils/excel';
import { formatDate } from '../../utils/date';
import { api } from '../../utils/api';
import { translateToEnglish } from '../../utils/translator';
import { Search, Plus, Trash2, Settings, Printer } from 'lucide-react';

export const ComponentsCheck = () => {
  const { user } = useAuthStore();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { 
    fetchLogs, fetchAllLogs, saveLog, deleteLog, activeLot, 
    componentsMaster, fetchComponentsMaster,
    tvModels, fetchTvModels,
    showToast, showConfirm 
  } = useDataStore();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Print Modal & Warehouse List State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [arrivedQty, setArrivedQty] = useState<number | ''>('');
  const [aqlLevel, setAqlLevel] = useState<string>('ii');

  // Master Data
  const [selectedSupplier, setSelectedSupplier] = useState<number | ''>('');
  const [availableArticles, setAvailableArticles] = useState<any[]>([]);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [scanBuffer, setScanBuffer] = useState('');
  const [articleId, setArticleId] = useState<number | ''>('');
  const [toCheck, setToCheck] = useState<number | ''>('');
  const [checked, setChecked] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [isWarning, setIsWarning] = useState(false);

  const handleScan = (val: string) => {
    const trimmedVal = val.trim();
    setScanBuffer(trimmedVal);
    if (!trimmedVal) return;

    // Find components whose article is contained within the scanned barcode
    // Added strictness: ignore matches shorter than 4 chars unless exact
    const matches = componentsMaster.filter(c => {
      const art = c.article.toLowerCase();
      const bcode = trimmedVal.toLowerCase();
      if (art.length < 4) return bcode === art;
      return bcode.includes(art);
    });

    if (matches.length > 0) {
      const found = matches.sort((a, b) => b.article.length - a.article.length)[0];
      
      const isAlreadyChecked = records.some(r => r.article.toLowerCase() === found.article.toLowerCase());
      if (isAlreadyChecked) {
        showToast(`Компонент ${found.article} уже проверен!`, 'warning');
        setScanBuffer('');
        setArticleId('');
        return;
      }

      setArticleId(found.id);
      showToast(`Выбрано: ${found.article}`, 'success');
      setTimeout(() => {
        document.getElementById('toCheckInput')?.focus();
      }, 100);
    } else {
      // Clear selection if not found
      setArticleId('');
    }
  };

  const handleScanKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmedVal = scanBuffer.trim();
      if (!trimmedVal) return;

      const matches = componentsMaster.filter(c => {
        const art = c.article.toLowerCase();
        const bcode = trimmedVal.toLowerCase();
        if (art.length < 4) return bcode === art;
        return bcode.includes(art);
      });

      if (matches.length > 0) {
        const found = matches.sort((a, b) => b.article.length - a.article.length)[0];
        const isAlreadyChecked = records.some(r => r.article.toLowerCase() === found.article.toLowerCase());
        if (isAlreadyChecked) {
          showToast(`Компонент ${found.article} уже проверен!`, 'warning');
          setScanBuffer('');
          setArticleId('');
          return;
        }
      } else {
        showToast(`Артикул не найден в списке: ${trimmedVal}`, 'error');
      }
    }
  };

  useEffect(() => {
    loadData();
    fetchTvModels();
    if (activeLot?.tv_model_id) {
      fetchComponentsMaster(activeLot.tv_model_id);
    } else {
      // If no lot or no model linked, clear the list or fetch none
      fetchComponentsMaster(-1); // Assuming -1 returns nothing
    }
  }, [activeLot?.id, activeLot?.tv_model_id]);

  useEffect(() => {
    // Initial focus
    scanInputRef.current?.focus();
  }, []);

  const activeModel = tvModels.find(m => m.id === activeLot?.tv_model_id);
  const tvModelName = activeModel ? activeModel.name : '—';

  const totalRequired = componentsMaster.length;
  const verifiedCount = componentsMaster.filter(c => 
    records.some(r => r.article.toLowerCase() === c.article.toLowerCase())
  ).length;
  const remainingCount = Math.max(0, totalRequired - verifiedCount);

  const getAqlSampleSize = (lotSize: number, level: string = 'ii'): number => {
    if (!lotSize || lotSize < 2) return lotSize || 0;

    const CODE_LETTERS = [
      { min: 2, max: 8, levels: { s1: 'A', s2: 'A', s3: 'A', s4: 'A', i: 'A', ii: 'A', iii: 'B' } },
      { min: 9, max: 15, levels: { s1: 'A', s2: 'A', s3: 'A', s4: 'A', i: 'A', ii: 'B', iii: 'C' } },
      { min: 16, max: 25, levels: { s1: 'A', s2: 'A', s3: 'B', s4: 'B', i: 'B', ii: 'C', iii: 'D' } },
      { min: 26, max: 50, levels: { s1: 'A', s2: 'B', s3: 'B', s4: 'C', i: 'C', ii: 'D', iii: 'E' } },
      { min: 51, max: 90, levels: { s1: 'B', s2: 'B', s3: 'C', s4: 'C', i: 'C', ii: 'E', iii: 'F' } },
      { min: 91, max: 150, levels: { s1: 'B', s2: 'C', s3: 'C', s4: 'D', i: 'D', ii: 'F', iii: 'G' } },
      { min: 151, max: 280, levels: { s1: 'B', s2: 'C', s3: 'D', s4: 'E', i: 'E', ii: 'G', iii: 'H' } },
      { min: 281, max: 500, levels: { s1: 'B', s2: 'C', s3: 'D', s4: 'E', i: 'F', ii: 'H', iii: 'J' } },
      { min: 501, max: 1200, levels: { s1: 'C', s2: 'C', s3: 'E', s4: 'F', i: 'G', ii: 'J', iii: 'K' } },
      { min: 1201, max: 3200, levels: { s1: 'C', s2: 'D', s3: 'E', s4: 'G', i: 'H', ii: 'K', iii: 'L' } },
      { min: 3201, max: 10000, levels: { s1: 'C', s2: 'D', s3: 'F', s4: 'H', i: 'J', ii: 'L', iii: 'M' } },
      { min: 10001, max: 35000, levels: { s1: 'C', s2: 'D', s3: 'G', s4: 'J', i: 'K', ii: 'M', iii: 'N' } },
      { min: 35001, max: 150000, levels: { s1: 'D', s2: 'E', s3: 'G', s4: 'K', i: 'L', ii: 'N', iii: 'P' } },
      { min: 150001, max: 500000, levels: { s1: 'D', s2: 'E', s3: 'H', s4: 'L', i: 'M', ii: 'P', iii: 'Q' } },
      { min: 500001, max: Infinity, levels: { s1: 'D', s2: 'E', s3: 'H', s4: 'M', i: 'N', ii: 'Q', iii: 'R' } },
    ];

    const SAMPLE_SIZES: Record<string, number> = {
      A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50, J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000
    };

    const range = CODE_LETTERS.find(r => lotSize >= r.min && lotSize <= r.max);
    if (!range) return lotSize;

    const letter = (range.levels as any)[level.toLowerCase()] || range.levels.ii;
    const sampleSize = SAMPLE_SIZES[letter];
    return Math.min(lotSize, sampleSize);
  };

  const handlePrint = () => {
    if (!activeLot || !arrivedQty) return;
    const aqlQty = getAqlSampleSize(Number(arrivedQty), aqlLevel);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Не удалось открыть окно печати. Пожалуйста, разрешите всплывающие окна для этого сайта.', 'error');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title> </title>
          <style>
            @page {
              size: auto;
              margin: 0mm;
            }
            body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #000; background: #fff; }
            .print-container { width: 100%; border-collapse: collapse; border: none; }
            .print-header-space { height: 20mm; border: none; }
            .print-footer-space { height: 20mm; border: none; }
            .print-content { padding: 0 15mm; border: none; }
            
            h2 { text-align: center; margin-bottom: 20px; font-size: 20px; }
            .info-table { width: 100%; margin-bottom: 25px; border-collapse: collapse; }
            .info-table td { padding: 6px 0; font-size: 14px; }
            .info-table td strong { color: #000; }
            .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .data-table th, .data-table td { border: 1px solid #000; padding: 8px 10px; text-align: left; font-size: 13px; color: #000; }
            .data-table th { background-color: #f5f5f5; font-weight: bold; font-size: 13px; }
          </style>
        </head>
        <body>
          <table class="print-container">
            <thead>
              <tr>
                <td class="print-header-space">&nbsp;</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="print-content">
                  <h2>СПЕЦИФИКАЦИЯ ДЛЯ ПРОВЕДЕНИЯ ВХОДНОГО КОНТРОЛЯ</h2>
                  <table class="info-table">
                    <tr>
                      <td style="width: 50%;"><strong>Лот:</strong> ${activeLot.name}</td>
                      <td style="width: 50%;"><strong>Модель ТВ:</strong> ${tvModelName}</td>
                    </tr>
                    <tr>
                      <td><strong>Количество прихода:</strong> ${arrivedQty} шт.</td>
                      <td><strong>Количество на проверку (AQL ${aqlLevel.toUpperCase()}):</strong> ${aqlQty} шт.</td>
                    </tr>
                    <tr>
                      <td colspan="2"><strong>Дата формирования:</strong> ${new Date().toLocaleDateString('ru-RU')}</td>
                    </tr>
                  </table>
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th style="width: 40px; text-align: center;">№</th>
                        <th style="width: 150px;">Артикул</th>
                        <th>Наименование</th>
                        <th style="width: 150px; text-align: center;">Кол-во на проверку</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${componentsMaster.length === 0 
                        ? '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">Нет зарегистрированных комплектующих для данной модели</td></tr>'
                        : componentsMaster.map((c, index) => `
                          <tr>
                            <td style="text-align: center;">${index + 1}</td>
                            <td style="font-weight: bold;">${c.article}</td>
                            <td>${c.name}</td>
                            <td style="text-align: center; font-weight: bold;">${aqlQty}</td>
                          </tr>
                        `).join('')
                      }
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="print-footer-space">&nbsp;</td>
              </tr>
            </tfoot>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setIsPrintModalOpen(false);
    setArrivedQty('');
  };

  const handlePrintMissing = () => {
    const missing = componentsMaster.filter(
      c => !records.some(r => r.article.toLowerCase() === c.article.toLowerCase())
    );

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Не удалось открыть окно печати. Пожалуйста, разрешите всплывающие окна.', 'error');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Недостающие комплектующие</title>
          <style>
            @page {
              size: auto;
              margin: 15mm;
            }
            body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #000; background: #fff; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 20px; }
            .subtitle { text-align: center; margin-bottom: 25px; font-size: 14px; color: #555; }
            .info-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
            .info-table td { padding: 6px 0; font-size: 13px; }
            .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .data-table th, .data-table td { border: 1px solid #000; padding: 8px 10px; text-align: left; font-size: 12px; }
            .data-table th { background-color: #f5f5f5; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>СПИСОК НЕДОСТАЮЩИХ КОМПЛЕКТУЮЩИХ</h2>
          <div class="subtitle">Требуется добрать на складе / проверить</div>
          <table class="info-table">
            <tr>
              <td style="width: 50%;"><strong>Лот:</strong> ${activeLot?.name || '—'}</td>
              <td style="width: 50%;"><strong>Модель ТВ:</strong> ${tvModelName}</td>
            </tr>
            <tr>
              <td><strong>Дата печати:</strong> ${new Date().toLocaleDateString('ru-RU')}</td>
              <td><strong>Всего не хватает:</strong> ${missing.length} поз.</td>
            </tr>
          </table>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">№</th>
                <th style="width: 150px;">Артикул</th>
                <th>Наименование</th>
                <th style="width: 100px; text-align: center;">Подпись</th>
              </tr>
            </thead>
            <tbody>
              ${missing.map((c, index) => `
                <tr>
                  <td style="text-align: center;">${index + 1}</td>
                  <td style="font-weight: bold;">${c.article}</td>
                  <td>${c.name}</td>
                  <td>&nbsp;</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };



  const loadData = async () => {
    setLoading(true);
    const logs = await fetchLogs('iqc_components');
    setRecords(logs.map(l => ({ id: l.id, ...l.data })));
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!articleId) return showToast('Выберите компонент', 'warning');
    const comp = componentsMaster.find(c => c.id === Number(articleId));
    if (!comp) return;

    const isAlreadyChecked = records.some(r => r.article.toLowerCase() === comp.article.toLowerCase());
    if (isAlreadyChecked) {
      showToast(`Компонент ${comp.article} уже проверен!`, 'warning');
      return;
    }

    let finalNote = note;
    if (note.trim()) {
      const en = await translateToEnglish(note.trim());
      if (en && en.toLowerCase() !== note.trim().toLowerCase()) {
        finalNote = `${note.trim()} / ${en}`;
      }
    }

    const data = { 
      article: comp.article, 
      name: comp.name,      toCheck, 
      checked, 
      note: finalNote, 
      isWarning,
      date
    };
    await saveLog('iqc_components', data, isWarning ? 'WARNING' : 'OK');
    setScanBuffer('');
    setArticleId('');
    setToCheck('');
    setChecked('');
    setNote('');
    setIsWarning(false);
    loadData();
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };
  const exportExcel = async () => {
    const logs = await fetchLogs('iqc_components');
    const records = logs.map(l => ({ id: l.id, ...l.data }));

    const exportData = records.map(r => ({
       'Date': formatDate(r.date),
       'Article': r.article,
       'Name': r.name,
       'To Check': r.toCheck,
       'Checked': r.checked,
       'Note': r.note,
       'Warning': r.isWarning ? 'Yes' : 'No'
    }));
    const lotName = activeLot?.name ? `_Lot_${activeLot.name}` : '';
    const fileName = `Components_Report${lotName}_${new Date().toISOString().split('T')[0]}`;
    exportToExcel(exportData, fileName, 'Components');
  };


  const columns = [
    { key: 'article', label: 'Артикул' },
    { key: 'name', label: 'Наименование' },
    { key: 'toCheck', label: 'На проверку' },
    { key: 'checked', label: 'Проверено' },
    { 
      key: 'note', 
      label: 'Примечание',
      render: (val: string, row: any) => (
        <span style={{ 
          backgroundColor: row.isWarning ? 'var(--c-warning)' : 'transparent',
          color: row.isWarning ? '#000' : 'inherit',
          padding: row.isWarning ? '2px 6px' : '0',
          borderRadius: '4px',
          fontWeight: row.isWarning ? 'bold' : 'normal'
        }}>
          {val}
        </span>
      )
    },
  ];

  const handleDelete = async (id: number) => {
    showConfirm('Удалить запись?', async () => {
      try {
        await deleteLog('iqc_components', id);
        showToast('Запись удалена');
        loadData();
      } catch (err) {
        showToast('Ошибка при удалении', 'error');
      }
    }, undefined, 'danger');
  };

  return (
    <div className="animate-fade-in responsive-flex-container" style={{ gap: '24px' }}>
      {user?.role !== 'Viewer' && (
        <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: 'var(--c-accent)' }}>Проверка комплектующих</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setIsPrintModalOpen(true); setAqlLevel('ii'); }} className="glass hover-scale" style={{ padding: '8px 15px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px', fontWeight: 'bold' }}>Список для склада</button>
              <button onClick={exportExcel} className="glass hover-scale" style={{ padding: '8px 15px', color: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '4px' }}>Выгрузить Excel</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '25px' }}>
            <div className="glass" style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--c-border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--c-text-muted)' }}>Прогресс проверки:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>{verifiedCount}</span>
              <span style={{ fontSize: '1.2rem', color: 'var(--c-text-muted)' }}>/</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--c-text-primary)' }}>{totalRequired}</span>
            </div>
            {remainingCount > 0 ? (
              <div 
                onClick={() => setIsMissingModalOpen(true)}
                style={{ 
                  padding: '10px 20px', 
                  borderRadius: '8px', 
                  background: 'rgba(239, 68, 68, 0.1)', 
                  border: '1px solid var(--c-danger)', 
                  color: 'var(--c-danger)', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease-in-out'
                }}
                className="hover-scale"
                title="Нажмите, чтобы увидеть отсутствующие компоненты"
              >
                <span>Не хватает:</span>
                <span style={{ fontSize: '1.2rem', textDecoration: 'underline' }}>{remainingCount}</span>
              </div>
            ) : (
              <div style={{ padding: '10px 20px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', fontWeight: 'bold' }}>
                Все компоненты проверены! 🎉
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', alignItems: 'end' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-accent)', fontWeight: 'bold' }}>СКАНИРОВАНИЕ АРТИКУЛА (Штрих-код)</label>
              <input 
                ref={scanInputRef}
                className="glass" 
                placeholder="Отсканируйте штрих-код..." 
                value={scanBuffer} 
                onChange={e => handleScan(e.target.value)}
                onKeyDown={handleScanKeyDown}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: 'var(--c-bg-surface-elevated)', 
                  color: articleId ? '#10b981' : 'var(--c-accent)', 
                  border: articleId ? '2px solid #10b981' : '1px solid var(--c-accent)', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease'
                }} 
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Информация о найденном компоненте</label>
              <div 
                className="glass" 
                style={{ 
                  width: '100%', 
                  padding: '11px 12px', 
                  background: articleId ? 'rgba(16, 185, 129, 0.15)' : 'var(--c-bg-surface-elevated)', 
                  color: articleId ? '#10b981' : 'var(--c-text-muted)', 
                  border: articleId ? '2px solid #10b981' : '1px solid var(--c-border)', 
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  height: '46px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.3s ease'
                }}
              >
                {articleId ? (
                  `${componentsMaster.find(c => c.id === articleId)?.article} — ${componentsMaster.find(c => c.id === articleId)?.name}`
                ) : (
                  'Ожидание сканирования...'
                )}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>На проверку</label>
              <input id="toCheckInput" className="glass" type="number" value={toCheck} onChange={e => setToCheck(Number(e.target.value))} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Проверено</label>
              <input className="glass" type="number" value={checked} onChange={e => setChecked(Number(e.target.value))} style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '37px' }}>
              <input type="checkbox" checked={isWarning} onChange={e => setIsWarning(e.target.checked)} id="warn" style={{ accentColor: 'var(--c-warning)' }} />
              <label htmlFor="warn" style={{ fontSize: '12px', cursor: 'pointer', color: isWarning ? 'var(--c-warning)' : 'var(--c-text-secondary)' }}>Предупреждение</label>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '5px', color: 'var(--c-text-muted)' }}>Примечание</label>
              <input className="glass" value={note} onChange={e => setNote(e.target.value)} placeholder="Примечание (Русский/Eng)..." style={{ width: '100%', padding: '8px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)' }} />
            </div>
            <button onClick={handleAdd} style={{ padding: '10px', background: 'var(--c-accent)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', height: '37px', cursor: 'pointer' }}>
              Добавить
            </button>
          </div>
        </div>
      )}

      <div className="responsive-flex-content table-mobile-responsive" style={{ flex: 1 }}>
        <DsmTable 
          title="История проверки комплектующих" 
          columns={columns} 
          data={records} 
          loading={loading}
          hideAdd
          hideExport
          onDelete={handleDelete}
        />
      </div>

      {isPrintModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '420px', padding: '30px', background: 'var(--c-bg-surface-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--c-accent)' }}>Список для склада</h3>
              <button onClick={() => { setIsPrintModalOpen(false); setArrivedQty(''); setAqlLevel('ii'); }} style={{ background: 'none', border: 'none', color: 'var(--c-text-primary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Текущий Лот</label>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--c-text-primary)' }}>{activeLot?.name || 'Лот не выбран'}</div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Модель ТВ</label>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--c-text-primary)' }}>{tvModelName}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Количество (сколько приехало)</label>
                <input 
                  type="number" 
                  className="glass" 
                  value={arrivedQty} 
                  onChange={e => setArrivedQty(e.target.value === '' ? '' : Number(e.target.value))} 
                  placeholder="Введите количество..."
                  style={{ width: '100%', padding: '12px', fontSize: '16px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', background: 'var(--c-bg-surface)' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Уровень контроля (AQL)</label>
                <select 
                  className="glass" 
                  value={aqlLevel} 
                  onChange={e => setAqlLevel(e.target.value)} 
                  style={{ width: '100%', padding: '10px', fontSize: '15px', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', background: 'var(--c-bg-surface)' }}
                >
                  <option value="ii">Уровень II (Стандартный)</option>
                  <option value="i">Уровень I (Облегченный)</option>
                  <option value="iii">Уровень III (Усиленный)</option>
                  <option value="s1">Специальный S-1</option>
                  <option value="s2">Специальный S-2</option>
                  <option value="s3">Специальный S-3</option>
                  <option value="s4">Специальный S-4</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Количество на проверку (AQL {aqlLevel.toUpperCase()})</label>
                <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--c-accent)' }}>
                  {arrivedQty ? getAqlSampleSize(Number(arrivedQty), aqlLevel) : 0} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--c-text-muted)' }}>шт.</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button 
                  onClick={handlePrint} 
                  disabled={!activeLot || !arrivedQty}
                  style={{ 
                    flex: 2, 
                    padding: '14px', 
                    background: 'var(--c-accent)', 
                    color: '#000', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontWeight: 'bold', 
                    cursor: (!activeLot || !arrivedQty) ? 'not-allowed' : 'pointer',
                    opacity: (!activeLot || !arrivedQty) ? 0.5 : 1
                  }}
                >
                  Печать
                </button>
                <button 
                  onClick={() => { setIsPrintModalOpen(false); setArrivedQty(''); setAqlLevel('ii'); }} 
                  style={{ flex: 1, padding: '14px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMissingModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '30px', background: 'var(--c-bg-surface-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--c-danger)' }}>Недостающие комплектующие ({remainingCount} поз.)</h3>
              <button onClick={() => setIsMissingModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--c-text-primary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: '20px', maxHeight: '50vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-secondary)', textAlign: 'left', fontSize: '0.85rem' }}>
                    <th style={{ padding: '8px' }}>Артикул</th>
                    <th style={{ padding: '8px' }}>Наименование</th>
                  </tr>
                </thead>
                <tbody>
                  {componentsMaster
                    .filter(c => !records.some(r => r.article.toLowerCase() === c.article.toLowerCase()))
                    .map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold', color: 'var(--c-accent)' }}>{c.article}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--c-text-secondary)' }}>{c.name}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handlePrintMissing}
                style={{ 
                  flex: 2, 
                  padding: '12px', 
                  background: 'var(--c-accent)', 
                  color: '#000', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer'
                }}
              >
                Печать недостающих
              </button>
              <button 
                onClick={() => setIsMissingModalOpen(false)} 
                style={{ flex: 1, padding: '12px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)', border: '1px solid var(--c-border)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

