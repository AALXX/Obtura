'use client'
import React, { ReactNode } from 'react'

interface IDialogCanvasProps {
    closeDialog: () => void
    children: ReactNode
}

const DialogCanvas = (props: IDialogCanvasProps) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={props.closeDialog}></div>

            <div className="relative z-50 mx-auto h-[90vh] w-[95%] max-w-7xl overflow-hidden rounded border border-neutral-800 bg-[#1b1b1b] shadow-2xl sm:w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 2xl:w-1/2">
                <button className="absolute top-4 right-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded text-gray-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none sm:h-10 sm:w-10" onClick={props.closeDialog} aria-label="Close">
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>

                <div className="h-full overflow-y-auto p-4 sm:p-6 md:p-8">
                    <div className="flex h-full">{props.children}</div>
                </div>
            </div>
        </div>
    )
}

export default DialogCanvas
