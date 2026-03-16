'use client'

import React from 'react'
import { AlertCircle, Check, Trash2 } from 'lucide-react'
import { Alert } from '../Types/ProjectTypes'

interface AlertCardProps {
    alert: Alert
    handleResolve: (alertId: string) => void
    isResolving?: boolean
    handleDelete?: (alertId: string) => void
    isDeleting?: boolean
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, handleResolve, isResolving = false, handleDelete, isDeleting = false }) => {
    return (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <div className="flex items-center gap-3">
                <AlertCircle className="text-red-500" size={16} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{alert.message}</div>
                    <div className="text-xs text-zinc-400">{new Date(alert.timestamp).toLocaleString()}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-500' : alert.severity === 'high' ? 'bg-orange-500/10 text-orange-500' : alert.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}>{alert.severity}</span>
                <div className="flex items-center gap-2">
                    <button onClick={() => handleResolve(alert.id)} disabled={isResolving} className="flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50" title="Mark as solved">
                        <Check size={14} />
                        {isResolving ? 'Solving...' : 'Solved'}
                    </button>
                    {handleDelete && (
                        <button
                            onClick={(e) => {
                                // Require Shift+Click to prevent accidental deletion
                                if (!e.shiftKey) {
                                    alert('Hold Shift and click to delete this alert')
                                    return
                                }
                                handleDelete(alert.id)
                            }}
                            disabled={isDeleting}
                            className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Delete (Shift+Click)"
                        >
                            {isDeleting ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                            ) : (
                                <Trash2 size={14} />
                            )}
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AlertCard
