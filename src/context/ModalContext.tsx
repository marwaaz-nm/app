'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, HelpCircle, Info } from 'lucide-react';

interface ModalConfig {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  alertType?: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ModalContextProps {
  showAlert: (title: string, message: string, alertType?: 'success' | 'error' | 'info' | 'warning') => Promise<void>;
  showConfirm: (title: string, message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextProps | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ModalConfig>({
    isOpen: false,
    type: 'alert',
    alertType: 'success',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel'
  });

  const showAlert = (
    title: string, 
    message: string, 
    alertType: 'success' | 'error' | 'info' | 'warning' = 'success'
  ): Promise<void> => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        type: 'alert',
        alertType,
        title,
        message,
        confirmText: 'Hagaag',
        onConfirm: () => {
          resolve();
        }
      });
    });
  };

  const showConfirm = (
    title: string, 
    message: string, 
    confirmText = 'Haa', 
    cancelText = 'Maya'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        onConfirm: () => {
          resolve(true);
        },
        onCancel: () => {
          resolve(false);
        }
      });
    });
  };

  const handleConfirm = () => {
    setConfig(prev => ({ ...prev, isOpen: false }));
    if (config.onConfirm) config.onConfirm();
  };

  const handleCancel = () => {
    setConfig(prev => ({ ...prev, isOpen: false }));
    if (config.onCancel) config.onCancel();
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {config.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-2xl p-6 space-y-6 text-center animate-in zoom-in-95 duration-200">
            {/* Header Icon */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full shadow-inner transition-all">
              {config.type === 'confirm' ? (
                <div className="bg-teal-50 text-teal-600 p-3.5 rounded-full border border-teal-100/50">
                  <HelpCircle className="h-7 w-7" />
                </div>
              ) : config.alertType === 'error' ? (
                <div className="bg-rose-50 text-rose-600 p-3.5 rounded-full border border-rose-100/50">
                  <AlertCircle className="h-7 w-7" />
                </div>
              ) : config.alertType === 'warning' ? (
                <div className="bg-amber-50 text-amber-600 p-3.5 rounded-full border border-amber-100/50">
                  <AlertCircle className="h-7 w-7" />
                </div>
              ) : config.alertType === 'info' ? (
                <div className="bg-sky-50 text-sky-600 p-3.5 rounded-full border border-sky-100/50">
                  <Info className="h-7 w-7" />
                </div>
              ) : (
                <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full border border-emerald-100/50">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-slate-800 tracking-tight leading-tight">
                {config.title}
              </h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {config.message}
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-center">
              {config.type === 'confirm' ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs px-4 py-3 cursor-pointer shadow-sm border border-slate-200/60 transition-all active:scale-95 select-none"
                  >
                    {config.cancelText}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-white font-extrabold text-xs px-4 py-3 cursor-pointer shadow-md transition-all active:scale-95 select-none"
                  >
                    {config.confirmText}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConfirm}
                  className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-white font-extrabold text-xs px-4 py-3 cursor-pointer shadow-md transition-all active:scale-95 select-none"
                >
                  {config.confirmText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
