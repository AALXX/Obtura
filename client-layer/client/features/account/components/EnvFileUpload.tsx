import React, { useState } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react'

interface EnvFileUploadProps {
    onClose: () => void
    onUpload: (data: { envLocation: string; envFile: File }) => void
}

const EnvFileUpload: React.FC<EnvFileUploadProps> = ({ onClose, onUpload }) => {
    const [envFile, setEnvFile] = useState<File | null>(null)
    const [accessToken, setAccessToken] = useState('')
    const [projectId, setProjectId] = useState('')
    const [envLocation, setEnvLocation] = useState('')
    const [dragActive, setDragActive] = useState(false)
    const [error, setError] = useState('')

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        setError('')

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0]
            if (file.name.endsWith('.env') || file.type === 'text/plain') {
                setEnvFile(file)
            } else {
                setError('Please upload a .env file')
            }
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError('')
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            if (file.name.endsWith('.env') || file.type === 'text/plain') {
                setEnvFile(file)
            } else {
                setError('Please upload a .env file')
            }
        }
    }

    const handleSubmit = () => {
        if (!envFile) {
            setError('Please select a .env file')
            return
        }

        if (!envLocation) {
            setError('Environment Location is required')
            return
        }

        onUpload({ envLocation, envFile })
    }

    return (
        <div className="flex w-full flex-col">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Upload Environment File</h2>
                <p className="mt-1 text-sm text-zinc-400">Upload your .env file and configure deployment settings</p>
            </div>

            <div className="space-y-5">
                {/* File Upload Area */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-300">Environment File</label>
                    <div className={`relative rounded-lg border-2 border-dashed transition-colors ${dragActive ? 'border-orange-500 bg-orange-500/5' : envFile ? 'border-green-500 bg-green-500/5' : 'bg-bg-[#1b1b1b]/50 border-zinc-700'}`} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
                        <input type="file" id="envFile" accept=".env,text/plain" onChange={handleFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                        <div className="flex flex-col items-center justify-center px-6 py-8">
                            {envFile ? (
                                <>
                                    <CheckCircle2 className="mb-3 text-green-500" size={40} />
                                    <div className="mb-2 flex items-center gap-2">
                                        <FileText className="text-green-500" size={18} />
                                        <span className="text-sm font-medium text-white">{envFile.name}</span>
                                    </div>
                                    <p className="text-xs text-zinc-400">{(envFile.size / 1024).toFixed(2)} KB</p>
                                    <button
                                        onClick={e => {
                                            e.preventDefault()
                                            setEnvFile(null)
                                        }}
                                        className="mt-3 text-xs text-orange-500 hover:text-orange-400"
                                    >
                                        Remove file
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Upload className="mb-3 text-zinc-500" size={40} />
                                    <p className="mb-1 text-sm font-medium text-white">
                                        Drop your .env file here or <span className="text-orange-500">browse</span>
                                    </p>
                                    <p className="text-xs text-zinc-400">Supports .env files</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    <label htmlFor="envLocation" className="mb-2 block text-sm font-medium text-zinc-300">
                        Environment File Location <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        id="envLocation"
                        value={envLocation}
                        onChange={e => setEnvLocation(e.target.value)}
                        placeholder="/client"
                        className="bg-bg-[#1b1b1b] w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                    />
                    <p className="mt-1.5 text-xs text-zinc-400">Specify the path where environment variables should be applied</p>
                </div>

                {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-500/10 p-3">
                        <AlertCircle className="text-red-500" size={18} />
                        <span className="text-sm text-red-400">{error}</span>
                    </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4">
                    <button onClick={onClose} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                        <Upload size={16} />
                        Upload & Configure
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EnvFileUpload
