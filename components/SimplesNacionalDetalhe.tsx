
import React from 'react';
import type { UserTaxRates, DetectedRates } from '../types';

interface SimplesNacionalDetalheProps {
  userRates: UserTaxRates;
  detectedRates?: DetectedRates;
  onChange: (field: keyof UserTaxRates, value: string | number) => void;
}

export const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ 
  userRates, 
  detectedRates, 
  onChange 
}) => {
  
  const handleRateChange = (field: keyof UserTaxRates, val: string) => {
      const numVal = val === '' ? undefined : parseFloat(val);
      onChange(field, numVal !== undefined ? numVal : '');
  };

  const formatCurrency = (val: number | undefined) => {
      if (!val) return '';
      return val;
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mt-4">
      <h4 className="text-sm font-bold uppercase mb-4 text-indigo-600 dark:text-indigo-400 border-b pb-2 border-slate-100 dark:border-slate-800">
        Detalhamento Tributário & Simples Nacional
      </h4>

      {/* Dados do Simples Nacional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
         <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anexo do Simples</label>
            <select 
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                value={userRates.anexo || ''}
                onChange={(e) => onChange('anexo', e.target.value)}
            >
                <option value="">Selecione (Opcional)</option>
                <option value="I">Anexo I - Comércio</option>
                <option value="II">Anexo II - Indústria</option>
                <option value="III">Anexo III - Serviços (Geral)</option>
                <option value="IV">Anexo IV - Serviços (Limpeza/Advocacia/Obras)</option>
                <option value="V">Anexo V - Serviços (Tecnologia/Jornalismo)</option>
            </select>
         </div>
         <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Receita Bruta 12 Meses (R$)</label>
            <input 
                type="number"
                placeholder="Ex: 180000.00"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formatCurrency(userRates.revenue12Mo)}
                onChange={(e) => handleRateChange('revenue12Mo', e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">Usado para cálculo da alíquota efetiva.</p>
         </div>
      </div>

      <h5 className="text-xs font-bold text-slate-500 uppercase mb-3">Conferência de Alíquotas (%)</h5>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {['icms', 'iss', 'pis', 'cofins', 'ipi'].map((tax) => {
            const field = tax as keyof UserTaxRates;
            const detectedVal = detectedRates?.[tax as keyof DetectedRates];
            
            return (
                <div key={tax} className="relative p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{tax}</label>
                    <div className="mb-2 text-xs flex justify-between items-center text-slate-400">
                        <span>Doc:</span>
                        <span className={detectedVal ? "font-mono font-bold text-indigo-600 dark:text-indigo-400" : "italic"}>
                            {detectedVal !== undefined ? `${detectedVal}%` : '-'}
                        </span>
                    </div>
                    <input 
                        type="number" 
                        placeholder="Manual %"
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border-b border-slate-300 focus:border-indigo-500 outline-none"
                        value={userRates[field] || ''}
                        onChange={(e) => handleRateChange(field, e.target.value)}
                    />
                </div>
            );
        })}
      </div>
    </div>
  );
};
