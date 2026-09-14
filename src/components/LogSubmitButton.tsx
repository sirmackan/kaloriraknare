import React from 'react';
import { Check } from 'lucide-react';

interface LogSubmitButtonProps {
  destination: string;
  disabled: boolean;
  id: string;
  isEditing: boolean;
  isSubmitting: boolean;
}

export const LogSubmitButton: React.FC<LogSubmitButtonProps> = ({
  destination,
  disabled,
  id,
  isEditing,
  isSubmitting,
}) => (
  <button
    id={id}
    type="submit"
    disabled={disabled}
    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-50 text-slate-950 text-sm font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
  >
    {isSubmitting ? (
      <>
        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
        <span>{isEditing ? 'Sparar ändring...' : `Loggar i ${destination}...`}</span>
      </>
    ) : (
      <>
        <Check className="w-4 h-4 stroke-[3]" />
        <span>{isEditing ? 'Spara ändring' : `Logga i ${destination}`}</span>
      </>
    )}
  </button>
);
