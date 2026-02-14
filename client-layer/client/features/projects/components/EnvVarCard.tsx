import React, { useState } from 'react'
import { Lock, Copy, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

interface EnvVar {
    key: string
    value: string
    service: string
}

interface EnvVarsSectionProps {
    EnvVar: EnvVar
    id: number
    onUpdate: (field: 'key' | 'value', value: string) => void
    onDelete: () => void
}

const EnvVarsCard: React.FC<EnvVarsSectionProps> = ({ EnvVar, onUpdate, onDelete, id }) => {
    const [visibleVars, setVisibleVars] = useState<Record<number, boolean>>({})
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

    const toggleVisibility = (id: number): void => {
        setVisibleVars(prev => ({
            ...prev,
            [id]: !prev[id]
        }))
    }

    const handleCopy = async (value: string, key: string): Promise<void> => {
        try {
            await navigator.clipboard.writeText(value)
            setCopiedKey(key)
            setTimeout(() => setCopiedKey(null), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const maskValue = (value: string): string => {
        return '•'.repeat(Math.min(value.length, 20))
    }

    return (
        <div className="space-y-2">
            <div key={id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                <div className="flex flex-1 items-center gap-3">
                    <Lock className="text-zinc-500" size={16} />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <div className="font-mono text-sm font-medium">{EnvVar.key}</div>
                            {EnvVar.service && <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">{EnvVar.service}</span>}
                        </div>
                        <div className="font-mono text-xs text-zinc-500">{visibleVars[id] ? EnvVar.value : maskValue(EnvVar.value)}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => toggleVisibility(id)} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white" title={visibleVars[id] ? 'Hide value' : 'Show value'}>
                        {visibleVars[id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button onClick={() => handleCopy(EnvVar.value, EnvVar.key)} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white" title="Copy value">
                        {copiedKey === EnvVar.key ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                    <button onClick={onDelete} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-red-500" title="Delete variable">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EnvVarsCard
