import type { InputHTMLAttributes } from 'react';
import { isDecimalInput } from '../utils/decimal';

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function DecimalInput({ value, onValueChange, ...props }: DecimalInputProps) {
  return (
    <input
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-form-type="other"
      data-lpignore="true"
      data-1p-ignore="true"
      {...props}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => {
        if (isDecimalInput(event.target.value)) onValueChange(event.target.value);
      }}
    />
  );
}
