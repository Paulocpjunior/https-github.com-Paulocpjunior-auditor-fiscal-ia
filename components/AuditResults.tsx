
import React, { useState, useMemo, useCallback } from 'react';
import type { AuditResult, Anomaly, UserTaxRates, TaxRegime } from '../types';
import type { CompanyData } from '../services/cnpjService';
import { getCnaeDetails } from '../services/geminiService';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { WarningIcon } from './icons/WarningIcon';
import { InfoIcon } from './icons/InfoIcon';
import { SparkleIcon } from './icons/SparkleIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ShareIcon } from './icons/ShareIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { EyeIcon } from './icons/EyeIcon';

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
    case 'low':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-800';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300 border-slate-200';
  }
};

const getRiskProgressColor = (score: number) => {
    if (score < 30) return 'bg-green-500';
    if (score < 60) return 'bg-yellow-500';
    if (score < 85) return 'bg-orange-500';
    return 'bg-red-600';
};

const getAnomalyIcon = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
        case 'error': return <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />;
        case 'warning': return <WarningIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />;
        case 'info': return <InfoIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />;
        default: return null;
    }
}

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
                        anomaly.severity === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800' :
                        'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                     }`}>
                        {anomaly.severity}
                     </span>
                     <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                        Cód: {anomaly.code}
                     </span>
                     {anomaly.field && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                            Campo: {anomaly.field}
                        </span>
                     )}
                </div>

                {anomaly.legalBasis && (
                    <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                        <span className="font-bold">Base Legal:</span> {anomaly.legalBasis}
                    </div>
                )}

                {(anomaly.expected || anomaly.found) && (
                    <div className="mt-2 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-700">
                         {anomaly.expected && <p><span className="font-bold text-slate-500">Esperado:</span> <span className="text-slate-700 dark:text-slate-300">{anomaly.expected}</span></p>}
                         {anomaly.found && <p><span className="font-bold text-slate-500">Encontrado:</span> <span className="font-mono text-red-600 dark:text-red-400">{anomaly.found}</span></p>}
                    </div>
                )}
            </div>
        </div>
    </div>
);

const FilterButton: React.FC<{label: string; value: string; isActive: boolean; onClick: (value: string) => void}> = ({ label, value, isActive, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`px-3 py-1 text-xs rounded-full transition-all font-medium border ${
        isActive
            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md transform scale-105'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
    >
        {label}
    </button>
);

export const AuditResults: React.FC<AuditResultsProps> = ({ result, fileName, onReset, officialEmitterData, officialTakerData, onRefine, isLoading }) => {
  const [filters, setFilters] = useState<{ type: string; severity: string }>({ type: 'all', severity: 'all' });
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [copyStatus, setCopyStatus] = useState('Copiar para Área de Transferência');
  const [anomaliesCopyStatus, setAnomaliesCopyStatus] = useState('Compartilhar Anomalias');
  const [openSection, setOpenSection] = useState<'anomalies' | 'recommendations' | null>(
    result.anomalies.length > 0 ? 'anomalies' : (result.recommendations.length > 0 ? 'recommendations' : null)
  );
  
  // CNAE Validation State
  const [cnaeAnalysis, setCnaeAnalysis] = useState<string | null>(null);
  const [isAnalyzingCnae, setIsAnalyzingCnae] = useState(false);

  // Manual Tax Rate State
  const [taxRates, setTaxRates] = useState<UserTaxRates>({});
  const [showTaxInputs, setShowTaxInputs] = useState(false);

  // Reset CNAE state when opening a new company modal
  const handleOpenCompanyModal = (company: CompanyData) => {
    setSelectedCompany(company);
    setCnaeAnalysis(null);
    setIsAnalyzingCnae(false);
  };

  const handleAnalyzeCnae = async () => {
    if (!selectedCompany) return;
    setIsAnalyzingCnae(true);
    try {
        const analysis = await getCnaeDetails(selectedCompany.cnae_fiscal_descricao);
        setCnaeAnalysis(analysis);
    } catch (err) {
        setCnaeAnalysis("Erro ao validar CNAE. Tente novamente.");
    } finally {
        setIsAnalyzingCnae(false);
    }
  };

  const toggleSection = (section: 'anomalies' | 'recommendations') => {
    setOpenSection(prev => (prev === section ? null : section));
  };

  const handleTaxRateChange = (field: keyof UserTaxRates, value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setTaxRates(prev => ({ ...prev, [field]: numValue }));
  };

  const handleRegimeChange = (field: 'providerRegime' | 'takerRegime', value: string) => {
      setTaxRates(prev => ({ ...prev, [field]: value as TaxRegime }));
  };

  const handleRefineClick = () => {
    onRefine(taxRates);
  };

  const formatDate = useCallback((isoString: string | undefined) => {
    if (!isoString) return 'Data não informada';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString; 
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    } catch (e) {
        return isoString; 
    }
  }, []);

  const getShareableText = useCallback(() => {
    const padRight = (str: string, length: number): string => str.padEnd(length, ' ');
    const wordWrap = (text: string, maxWidth: number, indent: string): string => {
        if (!text) return '';
        const words = text.split(' ');
        let lines: string[] = [];
        let currentLine = '';
        words.forEach(word => {
            if (currentLine.length === 0) {
                currentLine = indent + word;
            } else if ((currentLine + ' ' + word).length > maxWidth) {
                lines.push(currentLine);
                currentLine = indent + word;
            } else {
                currentLine += ' ' + word;
            }
        });
        lines.push(currentLine);
        return lines.join('\n');
    };
    let content = `AUDITORIA FISCAL AI - ${fileName}\n\n`;
    content += `Risco: ${result.riskLevel.toUpperCase()} (${result.riskScore}/100)\n\n`;
    content += `RESUMO:\n${wordWrap(result.summary, 70, '')}\n\n`;
    content += `ANOMALIAS (${result.anomalies.length}):\n`;
    result.anomalies.forEach((a, i) => content += `${i+1}. ${a.message} [${a.severity}]\n`);
    return content;
  }, [result, fileName]);
    
  const filteredAnomalies = useMemo(() => {
    return result.anomalies.filter(anomaly => {
        const typeMatch = filters.type === 'all' || anomaly.type === filters.type;
        const severityMatch = filters.severity === 'all' || anomaly.severity === filters.severity;
        return typeMatch && severityMatch;
    });
  }, [result.anomalies, filters]);
  
  const handleExport = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    let currentY = 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor('#2c3e50');
    doc.text('Relatório de Auditoria Fiscal AI', 105, currentY, { align: 'center' });
    currentY += 12;

    // ... (Export logic maintained)
    doc.setFontSize(10);
    doc.setTextColor('#34495e');
    doc.setFont('helvetica', 'normal');
    
    doc.text(`Arquivo: ${fileName}`, 14, currentY);
    currentY += 6;
    doc.text(`Empresa: ${result.companyName || 'Não informado'}`, 14, currentY);
    currentY += 6;
    doc.text(`Data Documento: ${formatDate(result.documentDate)}`, 14, currentY);
    currentY += 6;
    
    let riskColor = '#2c3e50';
    if (result.riskLevel === 'high' || result.riskLevel === 'critical') riskColor = '#c0392b';
    if (result.riskLevel === 'medium') riskColor = '#d35400';
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(riskColor);
    doc.text(`Risco: ${result.riskLevel.toUpperCase()} (Pontuação: ${result.riskScore}/100)`, 14, currentY);
    currentY += 10;

    doc.setTextColor('#2c3e50');
    doc.setFontSize(14);
    doc.text('Sumário Executivo', 14, currentY);
    doc.setLineWidth(0.5);
    doc.line(14, currentY + 2, 196, currentY + 2);
    currentY += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#34495e');
    const summaryLines = doc.splitTextToSize(result.summary, 180);
    doc.text(summaryLines, 14, currentY);
    currentY += (summaryLines.length * 5) + 8;

    // ... (Existing NCM table logic)
    if (result.analyzedNcms && result.analyzedNcms.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor('#2c3e50');
        doc.text('Análise de Códigos NCM (BrasilAPI)', 14, currentY);
        doc.line(14, currentY + 2, 196, currentY + 2);
        currentY += 4;

        const ncmColumns = ["NCM", "Descrição Doc.", "Descrição Oficial", "Status", "Análise"];
        const ncmRows = result.analyzedNcms.map(ncm => [
            ncm.code,
            ncm.descriptionInDocument || '-',
            ncm.officialDescription || 'N/A',
            ncm.status.toUpperCase(),
            ncm.analysis
        ]);

        (doc as any).autoTable({
            startY: currentY + 2,
            head: [ncmColumns],
            body: ncmRows,
            theme: 'striped',
            headStyles: { fillColor: '#8e44ad', textColor: '#ffffff' },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 15 },
                1: { cellWidth: 35 },
                2: { cellWidth: 40 },
                3: { cellWidth: 15 },
                4: { cellWidth: 'auto' }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- ANOMALIES TABLE ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#2c3e50');
    doc.text('Anomalias Identificadas', 14, currentY);
    doc.line(14, currentY + 2, 196, currentY + 2);
    currentY += 4;

    if (result.anomalies.length > 0) {
        // Added "Base Legal" to columns
        const anomColumns = ["Gravidade", "Tipo", "Mensagem", "Base Legal", "Campo", "Valor"];
        const anomRows = result.anomalies.map(a => [
            a.severity.toUpperCase(),
            a.type.toUpperCase(),
            a.message,
            a.legalBasis || '-', // Include legal basis data
            a.field || '-',
            a.found || '-'
        ]);

        (doc as any).autoTable({
            startY: currentY + 2,
            head: [anomColumns],
            body: anomRows,
            theme: 'grid',
            headStyles: { fillColor: '#c0392b', textColor: '#ffffff' },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 15 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 25 }, // Base Legal Column Width
                4: { cellWidth: 20 },
                5: { cellWidth: 20 }
            },
            didParseCell: (data: any) => {
                // Formatting for Severity
                if (data.section === 'body' && data.column.index === 0) {
                    const text = data.cell.text[0];
                    if (text === 'CRITICAL') data.cell.styles.textColor = '#c0392b';
                    else if (text === 'HIGH') data.cell.styles.textColor = '#d35400';
                    else if (text === 'MEDIUM') data.cell.styles.textColor = '#f39c12';
                    else data.cell.styles.textColor = '#27ae60';
                }
                // Formatting for Legal Basis Link Look
                if (data.section === 'body' && data.column.index === 3) {
                    const text = data.cell.text[0];
                    if (text && text !== '-') {
                        data.cell.styles.textColor = '#0000EE'; // Link Blue
                        data.cell.styles.fontStyle = 'underline'; // Looks like a link
                    }
                }
            },
            // Hook to make the text a clickable link
            didDrawCell: (data: any) => {
                if (data.section === 'body' && data.column.index === 3) {
                   const text = data.cell.text[0];
                   if (text && text !== '-') {
                       // Create a Google Search link for the legal basis
                       const url = `https://www.google.com/search?q=${encodeURIComponent(text + " legislação tributária")}`;
                       doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
                   }
                }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text("Nenhuma anomalia crítica detectada.", 14, currentY + 6);
        currentY += 15;
    }

    if (currentY > 250) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#2c3e50');
    doc.text('Recomendações', 14, currentY);
    doc.line(14, currentY + 2, 196, currentY + 2);
    currentY += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#34495e');

    if (result.recommendations.length > 0) {
        result.recommendations.forEach(rec => {
             if (currentY > 275) {
                doc.addPage();
                currentY = 20;
            }
            const lines = doc.splitTextToSize(`• ${rec}`, 180);
            doc.text(lines, 14, currentY);
            currentY += (lines.length * 5) + 2;
        });
    } else {
        doc.text("Sem recomendações específicas.", 14, currentY);
    }
    
    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor('#95a5a6');
        doc.text(`Página ${i} de ${pageCount} - Gerado por Auditor Fiscal AI`, 105, 290, { align: 'center' });
    }

    const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    doc.save(`auditoria_detalhada_${safeFileName}.pdf`);
  };
    
  const handleShare = async () => {
    const shareData = {
      title: `Resultado da Auditoria: ${fileName}`,
      text: getShareableText(),
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Share failed:", err);
        if (err instanceof Error && err.name === 'AbortError') {
            return;
        }
        setShowShareModal(true);
      }
    } else {
      setShowShareModal(true);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(getShareableText()).then(() => {
      setCopyStatus('Copiado!');
      setTimeout(() => setCopyStatus('Copiar para Área de Transferência'), 2000);
    }, () => {
      setCopyStatus('Falha ao copiar');
    });
  };

  const handleCopyAnomalies = () => {
    if (filteredAnomalies.length === 0) return;
    let content = `--- ANOMALIAS ENCONTRADAS (${fileName}) ---\n\n`;
    filteredAnomalies.forEach((anom, idx) => {
         content += `[#${idx + 1}] ${anom.message}\n`;
         content += `   Gravidade: ${anom.severity.toUpperCase()} | Tipo: ${anom.type}\n`;
         content += '\n';
    });
    navigator.clipboard.writeText(content).then(() => {
        setAnomaliesCopyStatus('Copiado!');
        setTimeout(() => setAnomaliesCopyStatus('Compartilhar Anomalias'), 2000);
    });
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Resultado da Auditoria: ${fileName}`)}&body=${encodeURIComponent(getShareableText())}`;

  const handleFilterChange = (filterType: 'type' | 'severity', value: string) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const typeFilters = { all: 'Todos', error: 'Erros', warning: 'Avisos', info: 'Infos' };
  const severityFilters = { all: 'Todas', critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };
  
  const regimeOptions: TaxRegime[] = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'Isento/Imune'];

  return (
    <>
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SparkleIcon className="text-indigo-500 w-6 h-6" /> Resultado da Auditoria
            </h2>
            
            {result.companyName && (
              <div className="mt-2 space-y-1">
                 <div className="flex items-center flex-wrap gap-2">
                    <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 truncate">{result.companyName}</p>
                    {officialEmitterData && (
                    <button 
                        onClick={() => handleOpenCompanyModal(officialEmitterData)}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-indigo-500 rounded-full hover:bg-indigo-600 transition-colors"
                        title="Ver dados oficiais da Receita Federal"
                    >
                        <EyeIcon className="w-3 h-3" />
                        Ver Oficial
                    </button>
                    )}
                 </div>
                 <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4">
                    <span><strong>Arquivo:</strong> {fileName}</span>
                    {result.documentDate && <span><strong>Data:</strong> {formatDate(result.documentDate)}</span>}
                 </div>
              </div>
            )}
        </div>

        <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <button
              onClick={handleShare}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors flex items-center gap-2 shadow-sm"
            >
              <ShareIcon className="w-4 h-4" />
              Compartilhar
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md transition-colors flex items-center gap-2 shadow-sm"
            >
              <DownloadIcon className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={onReset}
              className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/50 rounded-md transition-colors"
            >
              Novo
            </button>
        </div>
      </div>

      {/* Taker Info Banner (if exists) */}
      {(result.takerName || result.takerCnpj) && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 flex justify-between items-center">
             <div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Tomador do Serviço</span>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {result.takerName || "Nome não identificado"} 
                    {result.takerCnpj && <span className="ml-2 font-mono text-slate-500 dark:text-slate-400">({result.takerCnpj})</span>}
                </div>
             </div>
             {officialTakerData && (
                <button 
                  onClick={() => handleOpenCompanyModal(officialTakerData)}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium"
                >
                  Ver Detalhes Cadastrais
                </button>
             )}
          </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
        {/* Risk Card */}
        <div className={`p-5 rounded-lg border ${getRiskColorClasses(result.riskLevel)} shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start mb-2">
             <h3 className="font-semibold text-sm uppercase tracking-wide opacity-80">Risco Identificado</h3>
             <span className="text-2xl font-bold capitalize">{result.riskLevel}</span>
          </div>
          
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-3 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${getRiskProgressColor(result.riskScore)} transition-all duration-1000 ease-out`} 
                    style={{ width: `${result.riskScore}%` }}
                ></div>
            </div>
            <span className="font-mono font-bold text-xl">{result.riskScore}</span>
          </div>
          <p className="text-xs mt-1 opacity-70">Pontuação de 0 (Seguro) a 100 (Crítico)</p>
        </div>

        {/* Summary Card */}
        <div className="md:col-span-2 p-5 rounded-lg bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                <InfoIcon className="w-4 h-4 text-indigo-500"/> Análise Executiva
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{result.summary}</p>
          </div>
        </div>
      </div>
      
      {/* --- Refinement Section (Visual Enhanced) --- */}
      <div className={`mb-8 rounded-xl border transition-all duration-300 ${showTaxInputs 
          ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-800 shadow-lg ring-1 ring-indigo-500/20' 
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
      }`}>
        <button 
          onClick={() => setShowTaxInputs(!showTaxInputs)}
          className="w-full flex justify-between items-center p-4 text-sm font-medium text-slate-700 dark:text-slate-200"
        >
           <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg ${showTaxInputs ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-indigo-500 shadow-sm'}`}>
                <SparkleIcon className="w-5 h-5" /> 
             </div>
             <div className="text-left">
                <p className="font-bold text-base">Refinar Análise Tributária</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    Informe o Regime Tributário para validação precisa de créditos (PIS/COFINS) e retenções.
                </p>
             </div>
           </div>
           <div className={`p-1.5 rounded-full ${showTaxInputs ? 'bg-indigo-50 text-indigo-600' : 'bg-transparent text-slate-400'}`}>
                <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${showTaxInputs ? 'rotate-180' : ''}`} />
           </div>
        </button>
        
        {showTaxInputs && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 animate-fade-in-down bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/80">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Prestador */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                             <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                             <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">EMISSOR / PRESTADOR</h4>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                                Regime Tributário
                            </label>
                            <select
                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                value={taxRates.providerRegime || ''}
                                onChange={(e) => handleRegimeChange('providerRegime', e.target.value)}
                            >
                                <option value="">-- Selecione --</option>
                                {regimeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">Ex: Simples Nacional não destaca IPI e tem restrição de créditos.</p>
                        </div>
                    </div>

                    {/* Right Column: Tomador */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                             <span className="w-2 h-2 rounded-full bg-green-500"></span>
                             <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">TOMADOR / CLIENTE</h4>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                                Regime Tributário
                            </label>
                            <select
                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                value={taxRates.takerRegime || ''}
                                onChange={(e) => handleRegimeChange('takerRegime', e.target.value)}
                            >
                                <option value="">-- Selecione --</option>
                                {regimeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                             <p className="text-[10px] text-slate-400 mt-1">Ex: Lucro Real pode aproveitar créditos de PIS/COFINS.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                     <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Conferência de Alíquotas (%)</h4>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {['icms', 'iss', 'pis', 'cofins'].map((tax) => (
                            <div key={tax} className="relative">
                                <label className="absolute -top-2 left-2 px-1 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase">
                                    {tax}
                                </label>
                                <input 
                                    type="number" step="0.01" 
                                    className="w-full px-3 py-2 text-sm bg-transparent border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    value={taxRates[tax as keyof UserTaxRates] || ''}
                                    onChange={(e) => handleTaxRateChange(tax as keyof UserTaxRates, e.target.value)}
                                />
                            </div>
                        ))}
                     </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleRefineClick}
                        disabled={isLoading}
                        className={`px-8 py-3 text-sm font-bold text-white rounded-lg transition-all shadow-md flex items-center gap-2
                            ${isLoading 
                                ? 'bg-indigo-400 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5'
                            }`}
                    >
                        {isLoading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Processando Análise...
                            </>
                        ) : (
                            <>
                                <SparkleIcon className="w-5 h-5" />
                                Atualizar Análise
                            </>
                        )}
                    </button>
                </div>
            </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {/* Accordion for Anomalies */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('anomalies')}
            className="w-full flex justify-between items-center p-5 bg-slate-50/50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
            aria-expanded={openSection === 'anomalies'}
          >
            <div className="flex items-center gap-3">
                 <div className="p-1.5 bg-red-100 text-red-600 rounded-lg dark:bg-red-900/30 dark:text-red-400">
                    <XCircleIcon className="w-6 h-6"/> 
                 </div>
                 <div className="text-left">
                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Anomalias Encontradas</h3>
                     <p className="text-xs text-slate-500">{result.anomalies.length} pontos de atenção identificados</p>
                 </div>
            </div>
            <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openSection === 'anomalies' ? 'rotate-180' : ''}`} />
          </button>
          
          {openSection === 'anomalies' && (
            <div className="p-5 border-t border-slate-200 dark:border-slate-700 animate-fade-in-down bg-slate-50/30 dark:bg-slate-900/10">
                {result.anomalies.length > 0 ? (
                    <>
                        <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 uppercase">Filtrar:</span>
                                {Object.entries(severityFilters).map(([value, label]) => (
                                    <FilterButton key={value} label={label} value={value} isActive={filters.severity === value} onClick={(v) => handleFilterChange('severity', v)} />
                                ))}
                            </div>
                            <div className="flex-1 text-right">
                                <button
                                    onClick={handleCopyAnomalies}
                                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/30 rounded inline-flex items-center gap-1 transition-colors"
                                >
                                    <ShareIcon className="w-3 h-3" />
                                    {anomaliesCopyStatus}
                                </button>
                            </div>
                        </div>
                        
                        {filteredAnomalies.length > 0 ? (
                            <div className="grid gap-4">
                                {filteredAnomalies.map((anomaly, index) => <AnomalyItem key={index} anomaly={anomaly} />)}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-500">
                                <WarningIcon className="w-8 h-8 mx-auto mb-2 text-slate-300"/>
                                <p>Nenhuma anomalia corresponde aos filtros selecionados.</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-green-600">
                        <CheckCircleIcon className="w-12 h-12 mb-3 opacity-80"/>
                        <p className="font-semibold">Documento em conformidade!</p>
                        <p className="text-sm opacity-70">Nenhuma anomalia crítica foi detectada.</p>
                    </div>
                )}
            </div>
          )}
        </div>
        
        {/* Accordion for Recommendations */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
             <button
                onClick={() => toggleSection('recommendations')}
                className="w-full flex justify-between items-center p-5 bg-slate-50/50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                aria-expanded={openSection === 'recommendations'}
            >
                <div className="flex items-center gap-3">
                     <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg dark:bg-indigo-900/30 dark:text-indigo-400">
                        <SparkleIcon className="w-6 h-6"/> 
                     </div>
                     <div className="text-left">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Recomendações da IA</h3>
                        <p className="text-xs text-slate-500">{result.recommendations.length} sugestões de correção</p>
                     </div>
                </div>
                 <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openSection === 'recommendations' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'recommendations' && (
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 animate-fade-in-down">
                    {result.recommendations.length > 0 ? (
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5">
                            <ul className="space-y-4">
                            {result.recommendations.map((rec, index) => (
                                <li key={index} className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                                    <span className="leading-relaxed">{rec}</span>
                                </li>
                            ))}
                            </ul>
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 py-4 italic">Nenhuma recomendação adicional necessária.</p>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
    {/* ... (Company Details Modal and Share Modal remain unchanged) ... */}
    {selectedCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setSelectedCompany(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Detalhes Oficiais da Empresa</h3>
                    <button onClick={() => setSelectedCompany(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Razão Social</p>
                            <p className="text-base text-slate-900 dark:text-slate-200 font-medium">{selectedCompany.razao_social}</p>
                        </div>
                        {selectedCompany.nome_fantasia && (
                          <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome Fantasia</p>
                              <p className="text-base text-slate-900 dark:text-slate-200">{selectedCompany.nome_fantasia}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CNPJ</p>
                                <p className="text-base font-mono text-slate-900 dark:text-slate-200">{selectedCompany.cnpj}</p>
                            </div>
                             <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Situação Cadastral</p>
                                <p className={`text-base font-bold ${selectedCompany.situacao_cadastral === 'ATIVA' ? 'text-green-600' : 'text-red-600'}`}>
                                  {selectedCompany.situacao_cadastral}
                                </p>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-end mb-1">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Atividade Principal (CNAE)</p>
                            </div>
                            <p className="text-sm text-slate-900 dark:text-slate-200 mb-2">{selectedCompany.cnae_fiscal_descricao}</p>
                            
                            <button 
                                onClick={handleAnalyzeCnae}
                                disabled={isAnalyzingCnae}
                                className="w-full text-xs px-3 py-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors flex items-center justify-center gap-1.5 font-medium"
                            >
                                {isAnalyzingCnae ? (
                                    <>
                                        <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                        Consultando Tributação e Simples Nacional...
                                    </>
                                ) : (
                                    <>
                                        <SparkleIcon className="w-3 h-3" />
                                        Validar CNAE e Detalhar Tributos (Simples Nacional)
                                    </>
                                )}
                            </button>

                            {cnaeAnalysis && (
                                <div className="mt-3 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-md border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed animate-fade-in shadow-inner max-h-60 overflow-y-auto">
                                    <h4 className="font-bold mb-2 text-indigo-600 dark:text-indigo-400">Análise Tributária Oficial:</h4>
                                    {cnaeAnalysis}
                                </div>
                            )}
                        </div>
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Endereço</p>
                            <p className="text-sm text-slate-900 dark:text-slate-200">
                                {selectedCompany.logradouro}, {selectedCompany.numero} {selectedCompany.bairro && `- ${selectedCompany.bairro}`}
                            </p>
                            <p className="text-sm text-slate-900 dark:text-slate-200">
                                {selectedCompany.municipio} - {selectedCompany.uf}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-right flex-shrink-0">
                    <button onClick={() => setSelectedCompany(null)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )}

    {showShareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowShareModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Compartilhar Resultado</h3>
                </div>
                <div className="p-5 space-y-3">
                    <a href={mailtoHref} className="block w-full text-center px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">
                        Compartilhar por E-mail
                    </a>
                    <button onClick={handleCopyToClipboard} className="w-full px-4 py-2 font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 rounded-md transition-colors">
                        {copyStatus}
                    </button>
                </div>
                 <div className="p-4 border-t border-slate-200 dark:border-slate-700 text-right">
                    <button onClick={() => setShowShareModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-indigo-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};
