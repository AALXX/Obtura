'use client'
import React, { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ConfirmDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info'
    isLoading?: boolean
}

const variantStyles = {
    danger: {
        icon: 'bg-red-500/10 text-red-500',
        button: 'bg-red-500 hover:bg-red-600',
        border: 'border-red-500/20'
    },
    warning: {
        icon: 'bg-yellow-500/10 text-yellow-500',
        button: 'bg-yellow-500 hover:bg-yellow-600',
        border: 'border-yellow-500/20'
    },
    info: {
        icon: 'bg-blue-500/10 text-blue-500',
        button: 'bg-blue-500 hover:bg-blue-600',
        border: 'border-blue-500/20'
    }
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    isLoading = false
}) => {
    if (!isOpen) return null

    const styles = variantStyles[variant]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative z-50 mx-4 w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-[#1b1b1b] shadow-2xl">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                    <X size={16} />
                </button>

                <div className="p-6">
                    <div className="mb-5 flex items-start gap-4">
                        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${styles.icon}`}>
                            {variant === 'danger' && <X size={24} />}
                            {variant === 'warning' && <span className="text-xl">!</span>}
                            {variant === 'info' && <span className="text-xl">i</span>}
                        </div>
                        <div className="flex-1 pt-1">
                            <h3 className="text-lg font-semibold text-white">{title}</h3>
                        </div>
                    </div>
                    
                    <p className="mb-6 text-sm text-zinc-400">{message}</p>
                    
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white ${styles.button} disabled:opacity-50`}
                        >
                            {isLoading ? (
                                <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Processing...
                                </>
                            ) : (
                                confirmText
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConfirmDialog
