'use client'

import { cn } from '@/lib/utils'
import { RESUME_STEPS, type ResumeStep } from '@/hooks/use-resume-form'
import { Check } from 'lucide-react'

interface StepIndicatorProps {
  currentStep: number
  onStepClick: (step: number) => void
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center">
        {RESUME_STEPS.map((step, index) => {
          const isDone = index < currentStep
          const isCurrent = index === currentStep

          return (
            <li
              key={step.id}
              className={cn('relative flex-1', index < RESUME_STEPS.length - 1 && 'pr-8 sm:pr-20')}
            >
              {index < RESUME_STEPS.length - 1 && (
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div
                    className={cn(
                      'h-0.5 w-full',
                      isDone ? 'bg-blue-600' : 'bg-gray-200'
                    )}
                  />
                </div>
              )}

              <button
                onClick={() => isDone && onStepClick(index)}
                disabled={!isDone && !isCurrent}
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                  isDone && 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer',
                  isCurrent && 'border-2 border-blue-600 bg-white text-blue-600',
                  !isDone && !isCurrent && 'border-2 border-gray-200 bg-white text-gray-400'
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : <span>{index + 1}</span>}
                <span className="sr-only">{step.label}</span>
              </button>

              <p
                className={cn(
                  'absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs',
                  isCurrent ? 'font-semibold text-blue-600' : 'text-gray-400'
                )}
              >
                {step.label}
              </p>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
