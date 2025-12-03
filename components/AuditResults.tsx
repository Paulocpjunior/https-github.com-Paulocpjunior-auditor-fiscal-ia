
import React, { useState, useMemo } from 'react';
import type { AuditResult, Anomaly, UserTaxRates, TaxRegime, AnalyzedNcm, TaxEntity, TaxValidation } from '../types';
import type { CompanyData } from '../services/cnpjService';
import { SimplesNacionalDetalhe } from './SimplesNacionalDetalhe';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { WarningIcon } from './icons/WarningIcon';
import { InfoIcon } from './icons/InfoIcon';
import { SparkleIcon } from './icons/SparkleIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { EyeIcon } from './icons/EyeIcon';

// Declare jsPDF global for the CDN script
declare global {
  interface Window {
    jspdf: any;
  }
}

interface AuditResultsProps {
  result: AuditResult;
  fileName: string;
  onReset: () => void;
  officialEmitterData?: CompanyData | null;
  officialTakerData?: CompanyData | null;
  onRefine: (rates: UserTaxRates) => void;
  isLoading?: boolean;
}

const getRiskColorClasses = (level: 'low' | 'medium' | 'high' | 'critical') => {
  switch (level) {
    case 'low': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-800';
    case 'critical': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

const getAnomalyIcon = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
        case 'error': return <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />;
        case 'warning': return <WarningIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />;
        case 'info': return <InfoIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />;
        default: return null;
    }
};

const EntityCard: React.FC<{ title: string, data: TaxEntity, officialData?: CompanyData | null }> = ({ title, data, officialData }) => (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center justify-between">
            {title}
            {officialData && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Validado API</span>}
        </h4>
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <div><span className="font-semibold block text-slate-900 dark:text-white">{data.name}</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span><strong className="text-slate-500">CNPJ:</strong> {data.cnpj}</span>
                {data.municipalRegistration && <span><strong className="text-slate-500">IM:</strong> {data.municipalRegistration}</span>}
                {data.stateRegistration && <span><strong className="text-slate-500">IE:</strong> {data.stateRegistration}</span>}
            </div>
            {data.address && (
                <div className="text-xs border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                    <strong className="text-slate-500 block mb-0.5">Endereço:</strong>
                    {data.address} {data.uf && `- ${data.uf}`}
                </div>
            )}
        </div>
    </div>
);

const TaxValidationTable: React.FC<{ validations: TaxValidation[] }> = ({ validations }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
            <thead className="text-xs text-slate-700 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-200">
                <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Imposto</th>
                    <th className="px-4 py-3 text-right">Base Calc.</th>
                    <th className="px-4 py-3 text-right">Alíquota</th>
                    <th className="px-4 py-3 text-right">Valor Doc.</th>
                    <th className="px-4 py-3 text-right">Calculado (IA)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 rounded-tr-lg">Obs</th>
                </tr>
            </thead>
            <tbody>
                {validations.map((v, idx) => (
                    <tr key={idx} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{v.name}</td>
                        <td className="px-4 py-3 text-right font-mono">{v.baseFound ? `R$ ${v.baseFound.toFixed(2)}` : '-'}</td>
                        <td className="px-4 py-3 text-right font-mono">{v.rateFound ? `${v.rateFound}%` : '-'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-slate-100">{v.valueFound ? `R$ ${v.valueFound.toFixed(2)}` : '-'}</td>
                        <td className="px-4 py-3 text-right font-mono">{v.valueCalculated ? `R$ ${v.valueCalculated.toFixed(2)}` : '-'}</td>
                        <td className="px-4 py-3 text-center">
                            {v.status === 'ok' && <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">OK</span>}
                            {v.status === 'divergent' && <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-red-900 dark:text-red-300">Erro</span>}
                            {v.status === 'warning' && <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-yellow-900 dark:text-yellow-300">!</span>}
                            {v.status === 'info' && <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">Info</span>}
                        </td>
                        <td className="px-4 py-3 text-xs italic">{v.comment}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const AnomalyItem: React.FC<{ anomaly: Anomaly }> = ({ anomaly }) => (
    <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start space-x-3">
            <div className="mt-1">{getAnomalyIcon(anomaly.type)}</div>
            <div className="flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">{anomaly.message}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                     <span className={`px-2 py-0.5 rounded-full font-medium uppercase tracking-wide border ${
                        anomaly.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' :
                        anomaly.severity === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                     }`}>
                        {anomaly.severity}
                     </span>
                     {anomaly.legalBasis && (
                        <span className="px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800">
                           ⚖️ {anomaly.legalBasis}
                        </span>
                     )}
                </div>
            </div>
        </div>
    </div>
);

const NcmItem: React.FC<{ ncm: AnalyzedNcm }> = ({ ncm }) => {
    const isError = ncm.status === 'invalid' || ncm.status === 'divergent';
    return (
        <div className={`p-4 rounded-lg border ${isError ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="font-mono font-bold text-lg text-slate-700 dark:text-slate-200">{ncm.code}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                    ncm.status === 'valid' ? 'bg-green-100 text-green-700' : 
                    ncm.status === 'unknown' ? 'bg-yellow-100 text-yellow-700' : 
                    'bg-red-100 text-red-700'
                }`}>{ncm.status}</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-2">
                <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase">Descrição no Doc</span>
                    <p className="text-slate-800 dark:text-slate-300">{ncm.descriptionInDocument || 'Não encontrada'}</p>
                </div>
                <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase">Descrição Oficial (API)</span>
                    <p className="text-slate-800 dark:text-slate-300 italic">{ncm.officialDescription || 'Consulta indisponível'}</p>
                </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                <strong>Análise:</strong> {ncm.analysis}
            </div>
        </div>
    );
};

export const AuditResults: React.FC<AuditResultsProps> = ({ result, fileName, onReset, officialEmitterData, officialTakerData, onRefine, isLoading }) => {
  const [filters, setFilters] = useState({ type: 'all', severity: 'all' });
  const [showTaxInputs, setShowTaxInputs] = useState(false);
  const [taxRates, setTaxRates] = useState<UserTaxRates>({});

  const handleRefineClick = () => onRefine(taxRates);
  const handleTaxRateChange = (field: keyof UserTaxRates, value: string | number) => {
      setTaxRates(prev => ({ ...prev, [field]: value }));
  };
  const handleRegimeChange = (field: 'providerRegime' | 'takerRegime', value: string) => {
      setTaxRates(prev => ({ ...prev, [field]: value as TaxRegime }));
  };

  const filteredAnomalies = useMemo(() => {
    return result.anomalies.filter(anomaly => {
        const typeMatch = filters.type === 'all' || anomaly.type === filters.type;
        const severityMatch = filters.severity === 'all' || anomaly.severity === filters.severity;
        return typeMatch && severityMatch;
    });
  }, [result.anomalies, filters]);

  const handleExport = () => {
    if (!window.jspdf) {
        alert("Erro: Biblioteca PDF não carregada.");
        return;
    }

    const doc = new window.jspdf.jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Helper for centering text
    const centerText = (text: string, y: number, size = 12) => {
        doc.setFontSize(size);
        const textWidth = doc.getStringUnitWidth(text) * size / doc.internal.scaleFactor;
        const x = (pageWidth - textWidth) / 2;
        doc.text(text, x, y);
    };

    // Header
    doc.setFont("helvetica", "bold");
    centerText("Relatório de Auditoria Fiscal - Auditor Fiscal AI", 15, 16);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Arquivo: ${fileName}`, 14, 25);
    doc.text(`Data da Análise: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Prestador: ${result.provider.name}`, 14, 35);
    
    // Risk Section
    doc.setDrawColor(200);
    doc.line(14, 40, pageWidth - 14, 40);
    
    doc.setFont("helvetica", "bold");
    doc.text(`Risco Calculado: ${result.riskScore}/100 (${result.riskLevel.toUpperCase()})`, 14, 48);
    
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(result.summary, pageWidth - 28);
    doc.text(summaryLines, 14, 55);

    let finalY = 55 + (summaryLines.length * 5);

    // Entities Section (New)
    doc.setFont("helvetica", "bold");
    doc.text("Dados das Partes", 14, finalY);
    finalY += 5;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`PRESTADOR: ${result.provider.name} | CNPJ: ${result.provider.cnpj}`, 14, finalY);
    finalY += 5;
    doc.text(`TOMADOR: ${result.taker.name} | CNPJ: ${result.taker.cnpj}`, 14, finalY);
    finalY += 10;
    
    // Tax Validation Table (New)
    if(result.taxValidations && result.taxValidations.length > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Conferência de Impostos (Exemplificação)", 14, finalY);
        finalY += 2;
        
        const taxData = result.taxValidations.map(t => [
            t.name,
            t.rateFound ? `${t.rateFound}%` : '-',
            t.valueFound ? `R$ ${t.valueFound}` : '-',
            t.valueCalculated ? `R$ ${t.valueCalculated}` : '-',
            t.status.toUpperCase(),
            t.comment || ''
        ]);
        
        doc.autoTable({
            startY: finalY,
            head: [['Imposto', 'Aliq.', 'Valor Doc', 'Calc. IA', 'Status', 'Obs']],
            body: taxData,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [71, 85, 105] },
            columnStyles: { 5: { cellWidth: 50 } }
        });
        finalY = doc.lastAutoTable.finalY + 10;
    }

    // Anomalies Table
    if (result.anomalies.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Anomalias e Inconsistências", 14, finalY);
        finalY += 2;

        const tableData = result.anomalies.map(a => [
            a.severity.toUpperCase(),
            a.type,
            a.message,
            a.legalBasis || '-'
        ]);

        doc.autoTable({
            startY: finalY,
            head: [['Gravidade', 'Tipo', 'Mensagem', 'Base Legal']],
            body: tableData,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] }, // Indigo
            columnStyles: {
                0: { fontStyle: 'bold' },
                2: { cellWidth: 80 }
            },
            didParseCell: function(data: any) {
                if (data.section === 'body' && data.column.index === 0) {
                    const sev = data.cell.raw;
                    if (sev === 'CRITICAL') data.cell.styles.textColor = [220, 38, 38];
                    else if (sev === 'HIGH') data.cell.styles.textColor = [234, 88, 12];
                }
            }
        });
        
        finalY = doc.lastAutoTable.finalY + 10;
    }

    doc.save(`auditoria_${fileName.split('.')[0]}.pdf`);
  };
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between pb-6 border-b border-slate-200 dark:border-slate-700">
         <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SparkleIcon className="text-indigo-500 w-6 h-6" /> Resultado: {result.riskLevel.toUpperCase()}
         </h2>
         <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-1 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-600">
                <DownloadIcon className="w-4 h-4"/> Exportar PDF
            </button>
            <button onClick={onReset} className="px-3 py-2 text-sm bg-indigo-50 text-indigo-600 rounded">Novo</button>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
         <div className={`p-5 rounded-lg border ${getRiskColorClasses(result.riskLevel)}`}>
            <span className="text-2xl font-bold">{result.riskScore}/100</span>
            <p className="text-sm">Nível de Risco</p>
         </div>
         <div className="md:col-span-2 p-5 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <h4 className="font-bold text-sm text-slate-500 uppercase mb-2">Resumo Executivo</h4>
            <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{result.summary}</p>
         </div>
      </div>

      {/* New Entity Data Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
         <EntityCard title="Dados do Prestador (Emitente)" data={result.provider} officialData={officialEmitterData} />
         <EntityCard title="Dados do Tomador (Destinatário)" data={result.taker} officialData={officialTakerData} />
      </div>

      {/* New Tax Validation Section */}
      {result.taxValidations && result.taxValidations.length > 0 && (
        <div className="mb-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                 <h3 className="text-sm font-bold uppercase text-slate-700 dark:text-slate-200 flex items-center">
                    <SparkleIcon className="w-4 h-4 mr-2 text-green-600"/>
                    Auditoria de Impostos (Exemplificação)
                 </h3>
                 <p className="text-xs text-slate-500 mt-1">Conferência matemática entre Base de Cálculo, Alíquota e Valor Destacado.</p>
            </div>
            <TaxValidationTable validations={result.taxValidations} />
        </div>
      )}

      {/* Refinement Section */}
      <div className="mb-8 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-slate-50 dark:bg-slate-800/50">
        <button onClick={() => setShowTaxInputs(!showTaxInputs)} className="w-full flex justify-between p-4 font-bold text-indigo-700 dark:text-indigo-400">
           <span>Refinar Análise (Comparativo)</span>
           <ChevronDownIcon className={`w-5 h-5 transition-transform ${showTaxInputs ? 'rotate-180' : ''}`} />
        </button>
        
        {showTaxInputs && (
            <div className="p-5 border-t border-indigo-100 dark:border-indigo-900 animate-slide-down">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Regime Prestador</label>
                        <select className="w-full p-2 rounded border" onChange={(e) => handleRegimeChange('providerRegime', e.target.value)}>
                           <option value="">Selecione...</option>
                           <option value="Simples Nacional">Simples Nacional</option>
                           <option value="Lucro Presumido">Lucro Presumido</option>
                           <option value="Lucro Real">Lucro Real</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Regime Tomador</label>
                         <select className="w-full p-2 rounded border" onChange={(e) => handleRegimeChange('takerRegime', e.target.value)}>
                           <option value="">Selecione...</option>
                           <option value="Lucro Real">Lucro Real</option>
                           <option value="Lucro Presumido">Lucro Presumido</option>
                        </select>
                    </div>
                </div>

                <SimplesNacionalDetalhe 
                    userRates={taxRates} 
                    detectedRates={result.detectedRates}
                    onChange={handleTaxRateChange} 
                />

                <div className="mt-4 text-right">
                    <button onClick={handleRefineClick} disabled={isLoading} className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700 disabled:opacity-50">
                        {isLoading ? 'Calculando...' : 'Recalcular Análise'}
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Anomalies List */}
      <div className="mb-8">
          <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800 dark:text-white">
             <WarningIcon className="w-5 h-5 mr-2 text-orange-500"/>
             Anomalias Detectadas
          </h3>
          <div className="space-y-4">
            {filteredAnomalies.length > 0 ? (
                filteredAnomalies.map((anom, i) => <AnomalyItem key={i} anomaly={anom} />)
            ) : (
                <div className="p-8 text-center text-green-600 bg-green-50 rounded-lg">
                    <CheckCircleIcon className="w-12 h-12 mx-auto mb-2" />
                    <p>Nenhuma anomalia encontrada com os filtros atuais.</p>
                </div>
            )}
          </div>
      </div>

      {/* NCM Analysis Section (New) */}
      {result.analyzedNcms && result.analyzedNcms.length > 0 && (
          <div className="mb-8">
             <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800 dark:text-white">
                 <EyeIcon className="w-5 h-5 mr-2 text-indigo-500"/>
                 Análise Detalhada de NCM
             </h3>
             <div className="grid grid-cols-1 gap-4">
                 {result.analyzedNcms.map((ncm, i) => (
                     <NcmItem key={i} ncm={ncm} />
                 ))}
             </div>
          </div>
      )}

    </div>
  );
};
