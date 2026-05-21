import { useState, useEffect } from 'react';
import { Calculator, Info, CheckCircle, AlertTriangle } from 'lucide-react';
import { getLetterFromTable1, getAQLPlanWithArrows } from '../utils/aql';

export const AqlCalculator = () => {
  const [lotSize, setLotSize] = useState<number | ''>(1000);
  const [level, setLevel] = useState<string>('ii');
  const [aql, setAql] = useState<string>('1.0');
  
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    calculate();
  }, [lotSize, level, aql]);

  const calculate = () => {
    if (!lotSize || lotSize < 2) {
      setResult(null);
      return;
    }

    const letter = getLetterFromTable1(Number(lotSize), level.toUpperCase());
    const plan = getAQLPlanWithArrows(letter, aql);

    if (!plan) {
      setResult(null);
      return;
    }

    setResult({
      letter: plan.letter,
      sampleSize: plan.size,
      ac: plan.ac,
      re: plan.re
    });
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--c-accent)', padding: '12px', borderRadius: '12px', color: '#000' }}>
          <Calculator size={28} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--c-text-primary)' }}>Калькулятор AQL</h1>
          <p style={{ margin: 0, color: 'var(--c-text-secondary)', fontSize: '0.9rem' }}>ISO 2859-1 (ГОСТ Р ИСО 2859-1-2007)</p>
        </div>
      </div>

      <div className="grid-mobile-1col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '30px' }}>
        {/* Inputs */}
        <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Размер партии (Lot Size)</label>
            <input 
              type="number" className="glass" value={lotSize} onChange={e => setLotSize(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: '100%', padding: '12px', fontSize: '1.1rem', color: 'var(--c-accent)', fontWeight: 'bold', border: '1px solid var(--c-border)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Уровень контроля (Level)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {['i', 'ii', 'iii'].map(l => (
                <button 
                  key={l} onClick={() => setLevel(l)}
                  style={{ 
                    padding: '10px', borderRadius: '6px', border: '1px solid var(--c-border)', cursor: 'pointer',
                    background: level === l ? 'var(--c-accent)' : 'transparent',
                    color: level === l ? '#000' : 'var(--c-text-primary)',
                    fontWeight: 'bold', textTransform: 'uppercase'
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--c-text-muted)', fontStyle: 'italic' }}>
              * II - Основной уровень
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--c-text-muted)', marginBottom: '8px' }}>Уровень AQL (Acceptance Quality Limit)</label>
            <select 
              className="glass" value={aql} onChange={e => setAql(e.target.value)}
              style={{ width: '100%', padding: '12px', background: 'var(--c-bg-surface)', color: 'var(--c-text-primary)', fontSize: '1rem' }}
            >
              {['0.065', '0.1', '0.15', '0.25', '0.4', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5'].map(v => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {result ? (
            <div className="glass-panel" style={{ padding: '30px', border: '1px solid var(--c-accent)', boxShadow: '0 0 30px rgba(0,255,136,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h3 style={{ margin: 0 }}>Результат расчета</h3>
                <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--c-accent)' }}>{result.letter}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--c-border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--c-text-muted)', marginBottom: '5px' }}>Объем выборки</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--c-accent)' }}>{result.sampleSize}</div>
                  <div style={{ fontSize: '11px', color: 'var(--c-text-muted)' }}>шт. для проверки</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(0,255,136,0.05)', borderRadius: '8px', border: '1px solid var(--c-success)' }}>
                    <span style={{ color: 'var(--c-success)', fontWeight: 'bold' }}>Ac (Приемочное)</span>
                    <span style={{ fontWeight: 'bold' }}>{result.ac}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,71,87,0.05)', borderRadius: '8px', border: '1px solid var(--c-danger)' }}>
                    <span style={{ color: 'var(--c-danger)', fontWeight: 'bold' }}>Re (Браковочное)</span>
                    <span style={{ fontWeight: 'bold' }}>{result.re}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderLeft: '3px solid var(--c-accent)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Info size={16} color="var(--c-accent)" style={{ marginTop: '2' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--c-text-secondary)', lineHeight: '1.5' }}>
                    При обнаружении <b>{result.ac}</b> и менее дефектов — партия <b>принимается</b>.<br />
                    При обнаружении <b>{result.re}</b> и более дефектов — партия <b>бракуется</b>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', opacity: 0.5 }}>
              <Calculator size={48} />
              <span>Введите корректный размер партии</span>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--c-text-primary)' }}>Быстрые подсказки:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <CheckCircle size={14} color="var(--c-success)" />
                <span><b>Level II:</b> Стандартный уровень для большинства проверок.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <AlertTriangle size={14} color="var(--c-warning)" />
                <span><b>AQL 1.0:</b> Рекомендуемый уровень для критических дефектов.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <AlertTriangle size={14} color="var(--c-warning)" />
                <span><b>AQL 2.5 / 4.0:</b> Рекомендуемый уровень для незначительных дефектов.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--c-text-muted)', textAlign: 'center' }}>
        Данный расчет произведен по стандарту <b>Single Sampling Plans for Normal Inspection</b>.
      </div>
    </div>
  );
};
