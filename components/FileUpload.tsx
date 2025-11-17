import React, { useState, useCallback } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [disabled, onFileSelect]);

  const baseClasses = "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-300";
  const inactiveClasses = "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700";
  const activeClasses = "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-500";
  const disabledClasses = "bg-slate-200 dark:bg-slate-800 border-slate-400 cursor-not-allowed";

  const getDynamicClasses = () => {
    if (disabled) return disabledClasses;
    if (isDragging) return activeClasses;
    return inactiveClasses;
  };
  
  return (
    <div className="flex items-center justify-center w-full">
      <label
        htmlFor="dropzone-file"
        className={`${baseClasses} ${getDynamicClasses()}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className={`w-10 h-10 mb-3 ${disabled ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400'}`} />
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Clique para fazer upload</span> ou arraste e solte
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">XML ou PDF (MAX. 10MB)</p>
        </div>
        <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".xml,.pdf" disabled={disabled} />
      </label>
    </div>
  );
};
